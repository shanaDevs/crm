import { Router } from 'express'
import { CommentVisibility, RequirementStatus, RoleCode } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import { notifyUser } from '../services/notifications'
import { requirementCreateSchema } from '../validators/schemas'

const router = Router()
router.use(requireAuth)

router.get('/', requirePermission('requirements.read'), async (req, res) => {
  const where: Record<string, unknown> = {}
  if (req.user?.roleCode === RoleCode.CUSTOMER) {
    where.companyId = req.user.companyId || '__none__'
  } else if (req.user?.roleCode === RoleCode.DEVELOPER) {
    where.assignments = { some: { userId: req.user.id, unassignedAt: null } }
  }
  if (req.query.status) where.status = String(req.query.status)
  if (req.query.productId) where.productId = String(req.query.productId)

  const items = await prisma.requirement.findMany({
    where,
    include: {
      company: true,
      product: true,
      manager: { select: { id: true, firstName: true, lastName: true } },
      assignments: { where: { unassignedAt: null }, include: { user: { select: { id: true, firstName: true, lastName: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return res.json(items)
})

router.post('/', requirePermission('requirements.write'), async (req, res) => {
  const parsed = requirementCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  if (req.user?.roleCode === RoleCode.CUSTOMER && req.user.companyId !== parsed.data.companyId) {
    return res.status(403).json({ error: 'Customers may only submit for their company' })
  }

  const requirement = await prisma.requirement.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      companyId: parsed.data.companyId,
      contactId: parsed.data.contactId,
      productId: parsed.data.productId,
      businessProblem: parsed.data.businessProblem,
      expectedResult: parsed.data.expectedResult,
      category: parsed.data.category,
      priority: parsed.data.priority,
      acceptanceCriteria: parsed.data.acceptanceCriteria,
      requestedDeliveryDate: parsed.data.requestedDeliveryDate
        ? new Date(parsed.data.requestedDeliveryDate)
        : null,
    },
  })

  await prisma.requirementRevision.create({
    data: {
      requirementId: requirement.id,
      version: 1,
      snapshot: requirement,
      changeNote: 'Initial submission',
    },
  })

  return res.status(201).json(requirement)
})

router.get('/:id', requirePermission('requirements.read'), async (req, res) => {
  const item = await prisma.requirement.findUnique({
    where: { id: req.params.id },
    include: {
      company: true,
      contact: true,
      product: true,
      manager: true,
      assignments: { include: { user: true } },
      tasks: { include: { assignee: true } },
      revisions: { orderBy: { version: 'desc' } },
      comments: {
        include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!item) return res.status(404).json({ error: 'Not found' })

  if (req.user?.roleCode === RoleCode.CUSTOMER) {
    if (req.user.companyId !== item.companyId) return res.status(403).json({ error: 'Forbidden' })
    return res.json({
      ...item,
      comments: item.comments.filter((c) => c.visibility === CommentVisibility.CUSTOMER_VISIBLE),
    })
  }
  return res.json(item)
})

router.patch('/:id/status', requirePermission('requirements.manage'), async (req, res) => {
  const status = req.body.status as RequirementStatus
  if (!Object.values(RequirementStatus).includes(status)) {
    return res.status(400).json({ error: 'Invalid status' })
  }
  const existing = await prisma.requirement.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const updated = await prisma.requirement.update({
    where: { id: req.params.id },
    data: {
      status,
      managerId: req.body.managerId || existing.managerId || req.user!.id,
      estimateHours: req.body.estimateHours ?? existing.estimateHours,
      targetDeliveryDate: req.body.targetDeliveryDate
        ? new Date(req.body.targetDeliveryDate)
        : existing.targetDeliveryDate,
    },
  })

  const lastRev = await prisma.requirementRevision.findFirst({
    where: { requirementId: updated.id },
    orderBy: { version: 'desc' },
  })
  await prisma.requirementRevision.create({
    data: {
      requirementId: updated.id,
      version: (lastRev?.version || 0) + 1,
      snapshot: updated,
      changeNote: `Status → ${status}`,
    },
  })

  return res.json(updated)
})

router.post('/:id/assign', requirePermission('requirements.manage'), async (req, res) => {
  const developerIds: string[] = req.body.developerIds || []
  if (!developerIds.length) return res.status(400).json({ error: 'developerIds required' })

  const requirement = await prisma.requirement.findUnique({ where: { id: req.params.id } })
  if (!requirement) return res.status(404).json({ error: 'Not found' })

  await prisma.assignment.updateMany({
    where: { requirementId: requirement.id, unassignedAt: null },
    data: { unassignedAt: new Date() },
  })

  await prisma.assignment.createMany({
    data: developerIds.map((userId) => ({
      requirementId: requirement.id,
      userId,
      roleLabel: 'developer',
    })),
  })

  await prisma.requirement.update({
    where: { id: requirement.id },
    data: { status: RequirementStatus.ASSIGNED, managerId: req.user!.id },
  })

  for (const userId of developerIds) {
    await notifyUser({
      userId,
      title: 'Requirement assigned',
      body: `You were assigned to: ${requirement.title}`,
      linkUrl: `/requirements/${requirement.id}`,
    })
  }

  const full = await prisma.requirement.findUnique({
    where: { id: requirement.id },
    include: { assignments: { include: { user: true } } },
  })
  return res.json(full)
})

router.post('/:id/tasks', requirePermission('requirements.manage'), async (req, res) => {
  const task = await prisma.developmentTask.create({
    data: {
      requirementId: req.params.id,
      title: req.body.title,
      description: req.body.description,
      priority: req.body.priority || 'MEDIUM',
      assigneeId: req.body.assigneeId,
      estimateHours: req.body.estimateHours,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
    },
  })
  return res.status(201).json(task)
})

router.post('/:id/comments', requirePermission('requirements.write'), async (req, res) => {
  const visibility =
    req.user?.roleCode === RoleCode.CUSTOMER
      ? CommentVisibility.CUSTOMER_VISIBLE
      : (req.body.visibility as CommentVisibility) || CommentVisibility.INTERNAL

  if (req.user?.roleCode === RoleCode.CUSTOMER && visibility !== CommentVisibility.CUSTOMER_VISIBLE) {
    return res.status(403).json({ error: 'Customers cannot create internal notes' })
  }

  const comment = await prisma.comment.create({
    data: {
      requirementId: req.params.id,
      body: req.body.body,
      visibility,
      authorId: req.user!.id,
    },
  })
  return res.status(201).json(comment)
})

export default router
