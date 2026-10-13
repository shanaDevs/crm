import { Router } from 'express'
import { Prisma, RoleCode } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { effectivePermissions, hashPassword } from '../lib/auth'
import { requireAuth, requirePermission } from '../middleware/auth'
import { param } from '../lib/http'
import {
  CUSTOM_ROLE_BASE_CODES,
  PERMISSION_CATALOG,
  grantablePermissions,
  isAdmin,
  mergeRequestedPermissions,
} from '../services/rbac'

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

const rolesRouter = Router()
rolesRouter.use(requireAuth)

const roleInclude = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude

type RoleWithPerms = Prisma.RoleGetPayload<{ include: typeof roleInclude }>

function serializeRole(role: RoleWithPerms) {
  return {
    id: role.id,
    name: role.name,
    code: role.code,
    description: role.description,
    isSystem: role.isSystem,
    userCount: role._count.users,
    permissions: role.permissions.map((rp) => rp.permission.code),
  }
}

rolesRouter.get('/permissions', requirePermission('roles.manage', 'team.read', 'team.write'), async (req, res) => {
  const grantable = grantablePermissions(req.user!)
  return res.json(PERMISSION_CATALOG.map((p) => ({ ...p, grantable: grantable.has(p.code) })))
})

rolesRouter.get('/', requirePermission('roles.manage', 'team.read', 'team.write'), async (_req, res) => {
  const roles = await prisma.role.findMany({ include: roleInclude, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] })
  return res.json(roles.map(serializeRole))
})

const roleCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional().nullable(),
  baseCode: z.enum(CUSTOM_ROLE_BASE_CODES as [RoleCode, ...RoleCode[]]),
  permissions: z.array(z.string()).default([]),
})

rolesRouter.post('/', requirePermission('roles.manage'), async (req, res) => {
  const parsed = roleCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid role details', details: parsed.error.flatten() })
  const { name, description, baseCode, permissions } = parsed.data

  if (await prisma.role.findUnique({ where: { name } })) {
    return res.status(409).json({ error: 'A role with this name already exists' })
  }

  const codes = mergeRequestedPermissions(req.user!, [], permissions)
  const permRows = await prisma.permission.findMany({ where: { code: { in: codes } } })
  const role = await prisma.role.create({
    data: {
      name,
      description: description || null,
      code: baseCode,
      isSystem: false,
      permissions: { create: permRows.map((p) => ({ permissionId: p.id })) },
    },
    include: roleInclude,
  })
  await audit(req.user!.id, 'role.create', 'Role', role.id, { name, permissions: codes })
  return res.status(201).json(serializeRole(role))
})

const roleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(200).optional().nullable(),
  baseCode: z.enum(CUSTOM_ROLE_BASE_CODES as [RoleCode, ...RoleCode[]]).optional(),
  permissions: z.array(z.string()).optional(),
})

rolesRouter.patch('/:id', requirePermission('roles.manage'), async (req, res) => {
  const parsed = roleUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid role details', details: parsed.error.flatten() })
  const role = await prisma.role.findUnique({ where: { id: param(req, 'id') }, include: roleInclude })
  if (!role) return res.status(404).json({ error: 'Role not found' })
  if (role.code === RoleCode.CRM_ADMIN) {
    return res.status(403).json({ error: 'The CRM Admin role always has every permission and cannot be edited' })
  }

  const { name, description, baseCode, permissions } = parsed.data
  if (role.isSystem && ((name && name !== role.name) || (baseCode && baseCode !== role.code))) {
    return res.status(400).json({ error: 'Built-in roles cannot be renamed or change access type' })
  }
  if (name && name !== role.name && (await prisma.role.findUnique({ where: { name } }))) {
    return res.status(409).json({ error: 'A role with this name already exists' })
  }

  let finalCodes: string[] | undefined
  if (permissions) {
    const current = role.permissions.map((rp) => rp.permission.code)
    finalCodes = mergeRequestedPermissions(req.user!, current, permissions)
    const permRows = await prisma.permission.findMany({ where: { code: { in: finalCodes } } })
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({ data: permRows.map((p) => ({ roleId: role.id, permissionId: p.id })) }),
    ])
  }

  const updated = await prisma.role.update({
    where: { id: role.id },
    data: {
      name: role.isSystem ? undefined : name,
      description: description === undefined ? undefined : description || null,
      code: role.isSystem ? undefined : baseCode,
    },
    include: roleInclude,
  })
  await audit(req.user!.id, 'role.update', 'Role', role.id, { name, permissions: finalCodes })
  return res.json(serializeRole(updated))
})

rolesRouter.delete('/:id', requirePermission('roles.manage'), async (req, res) => {
  const role = await prisma.role.findUnique({ where: { id: param(req, 'id') }, include: roleInclude })
  if (!role) return res.status(404).json({ error: 'Role not found' })
  if (role.isSystem) return res.status(400).json({ error: 'Built-in roles cannot be deleted' })
  if (role._count.users > 0) {
    return res.status(400).json({ error: 'Move the users in this role to another role before deleting it' })
  }
  await prisma.role.delete({ where: { id: role.id } })
  await audit(req.user!.id, 'role.delete', 'Role', role.id, { name: role.name })
  return res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Users (mounted on /api/team next to the existing team routes)
// ---------------------------------------------------------------------------

const usersRouter = Router()
usersRouter.use(requireAuth)

const userInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
  permissionOverrides: { include: { permission: true } },
} satisfies Prisma.UserInclude

type UserWithAccess = Prisma.UserGetPayload<{ include: typeof userInclude }>

function serializeUser(user: UserWithAccess) {
  const rolePermissions = user.role.permissions.map((rp) => rp.permission.code)
  const overrides = user.permissionOverrides.map((o) => ({ code: o.permission.code, granted: o.granted }))
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    timezone: user.timezone,
    isActive: user.isActive,
    role: { id: user.role.id, code: user.role.code, name: user.role.name, isSystem: user.role.isSystem },
    rolePermissions,
    overrides,
    permissions: user.role.code === RoleCode.CRM_ADMIN ? PERMISSION_CATALOG.map((p) => p.code) : effectivePermissions(rolePermissions, overrides),
  }
}

const overrideSchema = z.array(z.object({ code: z.string(), granted: z.boolean() }))

const userCreateSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().default(''),
  phone: z.string().trim().optional().nullable(),
  timezone: z.string().trim().optional(),
  roleId: z.string().min(1),
  overrides: overrideSchema.optional(),
})

const userUpdateSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional().nullable(),
  timezone: z.string().trim().optional(),
  roleId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional().or(z.literal('')),
  overrides: overrideSchema.optional(),
})

/** Rejects roles the actor may not hand out (admin, portal, or roles with permissions above the actor's). */
type RoleWithPermissionCodes = Prisma.RoleGetPayload<{ include: { permissions: { include: { permission: true } } } }>
type RoleCheck = { role: RoleWithPermissionCodes } | { error: string; status: 400 | 403 | 404 }

async function checkAssignableRole(roleId: string, actor: NonNullable<Express.Request['user']>): Promise<RoleCheck> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: { include: { permission: true } } },
  })
  if (!role) return { error: 'Role not found', status: 404 }
  if (role.code === RoleCode.CUSTOMER) {
    return { error: 'Customer portal logins are created from the customer page', status: 400 }
  }
  if (!isAdmin(actor)) {
    if (role.code === RoleCode.CRM_ADMIN) return { error: 'Only a CRM Admin can assign the CRM Admin role', status: 403 }
    const grantable = grantablePermissions(actor)
    const missing = role.permissions.map((rp) => rp.permission.code).filter((c) => !grantable.has(c))
    if (missing.length) {
      return { error: `You can't assign a role with permissions you don't have (${missing.join(', ')})`, status: 403 }
    }
  }
  return { role }
}

async function replaceOverrides(
  actor: NonNullable<Express.Request['user']>,
  userId: string,
  rolePermissions: string[],
  requested: Array<{ code: string; granted: boolean }>
) {
  const grantable = grantablePermissions(actor)
  const existing = await prisma.userPermission.findMany({ where: { userId }, include: { permission: true } })
  const permRows = await prisma.permission.findMany()
  const idByCode = new Map(permRows.map((p) => [p.code, p.id]))

  const keep = existing.filter((o) => !grantable.has(o.permission.code))
  const next = new Map<string, boolean>()
  for (const o of requested) {
    if (!grantable.has(o.code) || !idByCode.has(o.code)) continue
    // Overrides that match the role default are redundant.
    if (o.granted === rolePermissions.includes(o.code)) continue
    next.set(o.code, o.granted)
  }

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId, id: { notIn: keep.map((o) => o.id) } } }),
    prisma.userPermission.createMany({
      data: Array.from(next.entries()).map(([code, granted]) => ({ userId, permissionId: idByCode.get(code)!, granted })),
    }),
  ])
}

usersRouter.get('/:id', requirePermission('team.read', 'team.write'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: param(req, 'id') }, include: userInclude })
  if (!user || user.role.code === RoleCode.CUSTOMER) return res.status(404).json({ error: 'User not found' })
  return res.json(serializeUser(user))
})

usersRouter.post('/', requirePermission('team.write'), async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid user details', details: parsed.error.flatten() })
  const data = parsed.data
  const actor = req.user!

  const roleCheck = await checkAssignableRole(data.roleId, actor)
  if ('error' in roleCheck) return res.status(roleCheck.status).json({ error: roleCheck.error })

  const email = data.email.toLowerCase()
  if (await prisma.user.findUnique({ where: { email } })) {
    return res.status(409).json({ error: 'A user with this email already exists' })
  }

  const created = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(data.password),
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      timezone: data.timezone || actor.timezone || 'UTC',
      roleId: roleCheck.role.id,
      notificationPreference: { create: {} },
    },
  })
  if (data.overrides?.length) {
    await replaceOverrides(
      actor,
      created.id,
      roleCheck.role.permissions.map((rp) => rp.permission.code),
      data.overrides
    )
  }
  await audit(actor.id, 'user.create', 'User', created.id, { email, roleId: roleCheck.role.id })
  const full = await prisma.user.findUniqueOrThrow({ where: { id: created.id }, include: userInclude })
  return res.status(201).json(serializeUser(full))
})

usersRouter.patch('/:id', requirePermission('team.write'), async (req, res) => {
  const parsed = userUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid user details', details: parsed.error.flatten() })
  const data = parsed.data
  const actor = req.user!

  const target = await prisma.user.findUnique({ where: { id: param(req, 'id') }, include: userInclude })
  if (!target || target.role.code === RoleCode.CUSTOMER) return res.status(404).json({ error: 'User not found' })
  if (!isAdmin(actor) && target.role.code === RoleCode.CRM_ADMIN) {
    return res.status(403).json({ error: 'Only a CRM Admin can edit a CRM Admin user' })
  }
  const isSelf = target.id === actor.id
  if (isSelf && (data.isActive === false || data.roleId || data.overrides)) {
    return res.status(400).json({ error: "You can't change your own role, permissions or active status" })
  }

  let rolePermissions = target.role.permissions.map((rp) => rp.permission.code)
  let roleId: string | undefined
  if (data.roleId && data.roleId !== target.roleId) {
    const roleCheck = await checkAssignableRole(data.roleId, actor)
    if ('error' in roleCheck) return res.status(roleCheck.status).json({ error: roleCheck.error })
    roleId = roleCheck.role.id
    rolePermissions = roleCheck.role.permissions.map((rp) => rp.permission.code)
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone === undefined ? undefined : data.phone || null,
      timezone: data.timezone,
      isActive: data.isActive,
      roleId,
      passwordHash: data.password ? await hashPassword(data.password) : undefined,
    },
  })
  if (data.password || data.isActive === false) {
    await prisma.session.deleteMany({ where: { userId: target.id } })
  }
  if (data.overrides) {
    await replaceOverrides(actor, target.id, rolePermissions, data.overrides)
  }
  await audit(actor.id, 'user.update', 'User', target.id, {
    roleId,
    isActive: data.isActive,
    passwordChanged: Boolean(data.password),
    overrides: data.overrides,
  })
  const full = await prisma.user.findUniqueOrThrow({ where: { id: target.id }, include: userInclude })
  return res.json(serializeUser(full))
})

// ---------------------------------------------------------------------------
// Customer levels
// ---------------------------------------------------------------------------

const levelsRouter = Router()
levelsRouter.use(requireAuth)

const levelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value like #c9a227').optional(),
  sortOrder: z.number().int().optional(),
})

levelsRouter.get('/', requirePermission('customers.read'), async (_req, res) => {
  const levels = await prisma.customerLevel.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { companies: true } } },
  })
  return res.json(levels)
})

levelsRouter.post('/', requirePermission('levels.manage'), async (req, res) => {
  const parsed = levelSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid level' })
  if (await prisma.customerLevel.findUnique({ where: { name: parsed.data.name } })) {
    return res.status(409).json({ error: 'A level with this name already exists' })
  }
  const max = await prisma.customerLevel.aggregate({ _max: { sortOrder: true } })
  const level = await prisma.customerLevel.create({
    data: {
      name: parsed.data.name,
      color: parsed.data.color,
      sortOrder: parsed.data.sortOrder ?? (max._max.sortOrder ?? 0) + 1,
    },
  })
  return res.status(201).json(level)
})

levelsRouter.patch('/:id', requirePermission('levels.manage'), async (req, res) => {
  const parsed = levelSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid level' })
  const id = param(req, 'id')
  if (parsed.data.name) {
    const clash = await prisma.customerLevel.findUnique({ where: { name: parsed.data.name } })
    if (clash && clash.id !== id) return res.status(409).json({ error: 'A level with this name already exists' })
  }
  const level = await prisma.customerLevel.update({ where: { id }, data: parsed.data })
  return res.json(level)
})

levelsRouter.delete('/:id', requirePermission('levels.manage'), async (req, res) => {
  await prisma.customerLevel.delete({ where: { id: param(req, 'id') } })
  return res.json({ ok: true })
})

async function audit(userId: string, action: string, entityType: string, entityId: string, meta: unknown) {
  await prisma.auditLog.create({
    data: { userId, action, entityType, entityId, meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined },
  })
}

export { rolesRouter, usersRouter, levelsRouter }
