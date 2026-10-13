import { PrismaClient, RoleCode } from '@prisma/client'
import type { AuthUser } from '../lib/auth'

export const PERMISSION_CATALOG = [
  { code: 'dashboard.read', name: 'View dashboard', group: 'Dashboard' },
  { code: 'customers.read', name: 'View customers', group: 'Customers' },
  { code: 'customers.write', name: 'Create/update customers', group: 'Customers' },
  { code: 'customers.delete', name: 'Delete customers', group: 'Customers' },
  { code: 'levels.manage', name: 'Manage customer levels', group: 'Customers' },
  { code: 'visits.read', name: 'View visits', group: 'Visits' },
  { code: 'visits.write', name: 'Record visits', group: 'Visits' },
  { code: 'followups.read', name: 'View follow-ups', group: 'Follow-ups' },
  { code: 'followups.write', name: 'Manage follow-ups', group: 'Follow-ups' },
  { code: 'products.read', name: 'View products', group: 'Products' },
  { code: 'products.write', name: 'Manage products', group: 'Products' },
  { code: 'opportunities.read', name: 'View opportunities', group: 'Opportunities' },
  { code: 'opportunities.write', name: 'Manage opportunities', group: 'Opportunities' },
  { code: 'requirements.read', name: 'View requirements', group: 'Requirements' },
  { code: 'requirements.write', name: 'Submit requirements', group: 'Requirements' },
  { code: 'requirements.manage', name: 'Approve/assign requirements', group: 'Requirements' },
  { code: 'tickets.read', name: 'View tickets', group: 'Tickets' },
  { code: 'tickets.write', name: 'Create/update tickets', group: 'Tickets' },
  { code: 'tickets.manage', name: 'Assign tickets', group: 'Tickets' },
  { code: 'team.read', name: 'View team', group: 'Team & access' },
  { code: 'team.write', name: 'Add/edit users and their permissions', group: 'Team & access' },
  { code: 'roles.manage', name: 'Create roles and edit role permissions', group: 'Team & access' },
  { code: 'settings.read', name: 'View settings', group: 'Settings' },
  { code: 'settings.write', name: 'Change settings', group: 'Settings' },
  { code: 'reports.read', name: 'View reports', group: 'Reports' },
  { code: 'files.read', name: 'Download files', group: 'Files' },
  { code: 'notifications.read', name: 'View notifications', group: 'Notifications' },
] as const

const ALL_CODES = PERMISSION_CATALOG.map((p) => p.code as string)

/** Base access types a custom role may use. CRM_ADMIN bypasses all checks; CUSTOMER is portal-only. */
export const CUSTOM_ROLE_BASE_CODES: RoleCode[] = [
  RoleCode.IT_MANAGER,
  RoleCode.MARKETING_OFFICER,
  RoleCode.DEVELOPER,
]

export const SYSTEM_ROLES: Array<{ name: string; code: RoleCode; description: string; permissions: string[] }> = [
  {
    name: 'CRM Admin',
    code: RoleCode.CRM_ADMIN,
    description: 'Super admin with full access',
    permissions: ALL_CODES,
  },
  {
    name: 'Sales Executive',
    code: RoleCode.MARKETING_OFFICER,
    description: 'Main sales executive; manages customers, users, roles and permissions',
    permissions: [
      'dashboard.read',
      'customers.read',
      'customers.write',
      'customers.delete',
      'levels.manage',
      'visits.read',
      'visits.write',
      'followups.read',
      'followups.write',
      'products.read',
      'opportunities.read',
      'opportunities.write',
      'requirements.read',
      'requirements.write',
      'tickets.read',
      'tickets.write',
      'team.read',
      'team.write',
      'roles.manage',
      'reports.read',
      'files.read',
      'notifications.read',
    ],
  },
  {
    name: 'IT Manager',
    code: RoleCode.IT_MANAGER,
    description: 'Delivery and requirements management',
    permissions: [
      'dashboard.read',
      'customers.read',
      'products.read',
      'opportunities.read',
      'requirements.read',
      'requirements.write',
      'requirements.manage',
      'tickets.read',
      'tickets.write',
      'tickets.manage',
      'team.read',
      'reports.read',
      'files.read',
      'notifications.read',
      'followups.read',
    ],
  },
  {
    name: 'Marketing Officer',
    code: RoleCode.MARKETING_OFFICER,
    description: 'Field sales and follow-ups',
    permissions: [
      'dashboard.read',
      'customers.read',
      'customers.write',
      'visits.read',
      'visits.write',
      'followups.read',
      'followups.write',
      'products.read',
      'opportunities.read',
      'opportunities.write',
      'requirements.read',
      'requirements.write',
      'tickets.read',
      'tickets.write',
      'files.read',
      'notifications.read',
      'reports.read',
    ],
  },
  {
    name: 'Developer',
    code: RoleCode.DEVELOPER,
    description: 'Works on requirements and tickets',
    permissions: [
      'dashboard.read',
      'requirements.read',
      'requirements.write',
      'tickets.read',
      'tickets.write',
      'products.read',
      'files.read',
      'notifications.read',
    ],
  },
  {
    name: 'Customer',
    code: RoleCode.CUSTOMER,
    description: 'Customer portal access',
    permissions: [
      'dashboard.read',
      'customers.read',
      'requirements.read',
      'requirements.write',
      'tickets.read',
      'tickets.write',
      'files.read',
      'notifications.read',
    ],
  },
]

const DEFAULT_LEVELS = [
  { name: 'Hot', color: '#dc2626', sortOrder: 1 },
  { name: 'Warm', color: '#d97706', sortOrder: 2 },
  { name: 'Cold', color: '#2563eb', sortOrder: 3 },
]

/**
 * Idempotent: creates missing permissions, system roles and default levels.
 * Existing role permissions are only touched for CRM Admin (always everything),
 * so edits made in the UI survive restarts.
 */
export async function ensureRbacDefaults(prisma: PrismaClient) {
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, name: p.name, description: p.name },
      update: { name: p.name, description: p.name },
    })
  }
  const permissions = await prisma.permission.findMany()
  const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]))

  for (const def of SYSTEM_ROLES) {
    let role = await prisma.role.findUnique({ where: { name: def.name } })
    const isNew = !role
    if (!role) {
      role = await prisma.role.create({
        data: { name: def.name, code: def.code, description: def.description, isSystem: true },
      })
    } else if (!role.isSystem || !role.description) {
      role = await prisma.role.update({
        where: { id: role.id },
        data: { isSystem: true, description: role.description || def.description },
      })
    }

    if (isNew || def.code === RoleCode.CRM_ADMIN) {
      const ids = def.permissions.map((c) => permIdByCode.get(c)).filter((id): id is string => Boolean(id))
      await prisma.rolePermission.createMany({
        data: ids.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      })
    }
  }

  if ((await prisma.customerLevel.count()) === 0) {
    await prisma.customerLevel.createMany({ data: DEFAULT_LEVELS, skipDuplicates: true })
  }
}

export function isAdmin(user: AuthUser) {
  return user.roleCode === RoleCode.CRM_ADMIN
}

/** Permissions the actor may hand out: admins can grant anything, others only what they hold. */
export function grantablePermissions(actor: AuthUser): Set<string> {
  return new Set(isAdmin(actor) ? ALL_CODES : actor.permissions)
}

/**
 * Applies a requested permission set while leaving permissions the actor cannot grant untouched,
 * so a non-admin can't add or strip permissions above their own level.
 */
export function mergeRequestedPermissions(actor: AuthUser, current: string[], requested: string[]) {
  const grantable = grantablePermissions(actor)
  const kept = current.filter((c) => !grantable.has(c))
  const applied = requested.filter((c) => grantable.has(c) && ALL_CODES.includes(c))
  return Array.from(new Set([...kept, ...applied]))
}
