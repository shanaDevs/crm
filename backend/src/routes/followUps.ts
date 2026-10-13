import { Router } from 'express'
import { ActivityStatus, RoleCode } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import { cancelReminders, scheduleReminder } from '../services/reminders'
import { callLogSchema, followUpCreateSchema, followUpUpdateSchema } from '../validators/schemas'
import { createFollowUp } from '../services/followUps'
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
  const followUp = await createFollowUp(parsed.data, req.user!.id)
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

router.patch('/:id', requirePermission('followups.write'), async (req, res) => {
  const parsed = followUpUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const { scheduledAt, status, ...data } = parsed.data
  const existing = await prisma.followUp.findUnique({ where: { id: param(req, 'id') } })
  if (!existing) return res.status(404).json({ error: 'Follow-up not found' })

  const nextScheduledAt = scheduledAt ? new Date(scheduledAt) : existing.scheduledAt
  let nextStatus: ActivityStatus = status ?? existing.status
  if (!status && existing.status === ActivityStatus.OVERDUE && nextScheduledAt > new Date()) {
    nextStatus = ActivityStatus.SCHEDULED
  }

  const updated = await prisma.followUp.update({
    where: { id: existing.id },
    data: { ...data, scheduledAt: nextScheduledAt, status: nextStatus },
  })

  await prisma.activityHistory.create({
    data: {
      followUpId: existing.id,
      changedById: req.user!.id,
      changeType: 'updated',
      fromValue: { scheduledAt: existing.scheduledAt, status: existing.status },
      toValue: { scheduledAt: updated.scheduledAt, status: updated.status },
    },
  })

  const isOpen = (s: ActivityStatus) => s === ActivityStatus.SCHEDULED || s === ActivityStatus.OVERDUE
  const timingChanged =
    updated.scheduledAt.getTime() !== existing.scheduledAt.getTime() ||
    updated.reminderMinutes !== existing.reminderMinutes ||
    isOpen(updated.status) !== isOpen(existing.status)
  if (!isOpen(updated.status)) {
    await cancelReminders(updated.id)
  } else if (timingChanged) {
    await scheduleReminder(updated.id, updated.scheduledAt, updated.reminderMinutes)
  }
  return res.json(updated)
})

router.delete('/:id', requirePermission('followups.write'), async (req, res) => {
  const id = param(req, 'id')
  const existing = await prisma.followUp.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Follow-up not found' })
  await prisma.$transaction([
    prisma.followUp.updateMany({ where: { parentFollowUpId: id }, data: { parentFollowUpId: null } }),
    prisma.followUp.delete({ where: { id } }),
  ])
  return res.json({ ok: true })
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
      smsCustomer: original.smsCustomer,
      smsAssignee: original.smsAssignee,
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
        smsCustomer: n.smsCustomer,
        smsAssignee: n.smsAssignee,
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
