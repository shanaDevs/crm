import { Router } from 'express'
import { ActivityStatus, RoleCode } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import { scheduleReminder } from '../services/reminders'
import { callLogSchema, followUpCreateSchema } from '../validators/schemas'
import { notifyUser } from '../services/notifications'
import { param, asJson } from '../lib/http'

const router = Router()
router.use(requireAuth)

router.get('/', requirePermission('followups.read'), async (req, res) => {
  const view = String(req.query.view || 'upcoming')
  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const where: Record<string, unknown> = {}
  if (req.user?.roleCode === RoleCode.CUSTOMER) {
    where.companyId = req.user.companyId || '__none__'
  } else if (req.query.assigneeId) {
    where.assigneeId = String(req.query.assigneeId)
  } else if (req.user?.roleCode === RoleCode.MARKETING_OFFICER) {
    where.assigneeId = req.user.id
  }

  if (view === 'today') {
    where.scheduledAt = { gte: startOfDay, lte: endOfDay }
    where.status = { in: [ActivityStatus.SCHEDULED, ActivityStatus.OVERDUE] }
  } else if (view === 'upcoming') {
    where.scheduledAt = { gt: endOfDay }
    where.status = ActivityStatus.SCHEDULED
  } else if (view === 'overdue') {
    where.status = ActivityStatus.OVERDUE
  } else if (view === 'completed') {
    where.status = ActivityStatus.COMPLETED
  }

  const items = await prisma.followUp.findMany({
    where,
    include: {
      company: true,
      contact: true,
      product: true,
      assignee: { select: { id: true, firstName: true, lastName: true } },
      callLogs: { orderBy: { loggedAt: 'desc' }, take: 3 },
    },
    orderBy: { scheduledAt: view === 'completed' ? 'desc' : 'asc' },
    take: 200,
  })
  return res.json(items)
})

router.post('/', requirePermission('followups.write'), async (req, res) => {
  const parsed = followUpCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const data = parsed.data

  const followUp = await prisma.followUp.create({
    data: {
      companyId: data.companyId,
      contactId: data.contactId,
      productId: data.productId,
      visitId: data.visitId,
      activityType: data.activityType,
      purpose: data.purpose,
      customPurpose: data.customPurpose,
      scheduledAt: new Date(data.scheduledAt),
      timezone: data.timezone,
      reminderMinutes: data.reminderMinutes,
      priority: data.priority,
      notes: data.notes,
      assigneeId: data.assigneeId,
      createdById: req.user!.id,
    },
  })

  await prisma.activityHistory.create({
    data: {
      followUpId: followUp.id,
      changedById: req.user!.id,
      changeType: 'created',
      toValue: { scheduledAt: followUp.scheduledAt, status: followUp.status },
    },
  })

  await scheduleReminder(followUp.id, followUp.scheduledAt, followUp.reminderMinutes)

  if (data.assigneeId !== req.user!.id) {
    await notifyUser({
      userId: data.assigneeId,
      title: 'New activity assigned',
      body: `You have been assigned a ${data.activityType.toLowerCase()}.`,
      linkUrl: `/follow-ups/${followUp.id}`,
    })
  }

  return res.status(201).json(followUp)
})

router.get('/:id', requirePermission('followups.read'), async (req, res) => {
  const item = await prisma.followUp.findUnique({
    where: { id: param(req, 'id') },
    include: {
      company: true,
      contact: true,
      product: true,
      assignee: true,
      createdBy: true,
      callLogs: { include: { loggedBy: true }, orderBy: { loggedAt: 'desc' } },
      history: { orderBy: { createdAt: 'desc' }, include: { changedBy: true } },
      childFollowUps: true,
      parentFollowUp: true,
    },
  })
  if (!item) return res.status(404).json({ error: 'Not found' })
  return res.json(item)
})

router.post('/:id/reschedule', requirePermission('followups.write'), async (req, res) => {
  const original = await prisma.followUp.findUnique({ where: { id: param(req, 'id') } })
  if (!original) return res.status(404).json({ error: 'Not found' })

  const scheduledAt = new Date(req.body.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime())) {
    return res.status(400).json({ error: 'Invalid scheduledAt' })
  }

  await prisma.followUp.update({
    where: { id: original.id },
    data: { status: ActivityStatus.RESCHEDULED },
  })

  const next = await prisma.followUp.create({
    data: {
      companyId: original.companyId,
      contactId: original.contactId,
      productId: original.productId,
      visitId: original.visitId,
      activityType: original.activityType,
      purpose: original.purpose,
      customPurpose: original.customPurpose,
      scheduledAt,
      timezone: req.body.timezone || original.timezone,
      reminderMinutes: req.body.reminderMinutes ?? original.reminderMinutes,
      priority: original.priority,
      notes: req.body.notes || original.notes,
      assigneeId: req.body.assigneeId || original.assigneeId,
      createdById: req.user!.id,
      parentFollowUpId: original.id,
    },
  })

  await prisma.activityHistory.create({
    data: {
      followUpId: original.id,
      changedById: req.user!.id,
      changeType: 'rescheduled',
      fromValue: { scheduledAt: original.scheduledAt },
      toValue: { scheduledAt: next.scheduledAt, newFollowUpId: next.id },
    },
  })

  await scheduleReminder(next.id, next.scheduledAt, next.reminderMinutes)
  return res.status(201).json(next)
})

router.post('/:id/log-call', requirePermission('followups.write'), async (req, res) => {
  const parsed = callLogSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const followUp = await prisma.followUp.findUnique({ where: { id: param(req, 'id') } })
  if (!followUp) return res.status(404).json({ error: 'Not found' })

  const log = await prisma.callLog.create({
    data: {
      followUpId: followUp.id,
      outcome: parsed.data.outcome,
      notes: parsed.data.notes,
      durationSec: parsed.data.durationSec,
      loggedById: req.user!.id,
    },
  })

  await prisma.followUp.update({
    where: { id: followUp.id },
    data: { status: ActivityStatus.COMPLETED },
  })

  await prisma.activityHistory.create({
    data: {
      followUpId: followUp.id,
      changedById: req.user!.id,
      changeType: 'call_logged',
      toValue: { outcome: parsed.data.outcome },
      note: parsed.data.notes,
    },
  })

  let nextFollowUp = null
  if (parsed.data.scheduleNext) {
    const n = parsed.data.scheduleNext
    nextFollowUp = await prisma.followUp.create({
      data: {
        companyId: n.companyId,
        contactId: n.contactId,
        productId: n.productId,
        activityType: n.activityType,
        purpose: n.purpose,
        customPurpose: n.customPurpose,
        scheduledAt: new Date(n.scheduledAt),
        timezone: n.timezone,
        reminderMinutes: n.reminderMinutes,
        priority: n.priority,
        notes: n.notes,
        assigneeId: n.assigneeId,
        createdById: req.user!.id,
        parentFollowUpId: followUp.id,
      },
    })
    await scheduleReminder(nextFollowUp.id, nextFollowUp.scheduledAt, nextFollowUp.reminderMinutes)
  }

  return res.json({ log, nextFollowUp })
})

export default router
