import type { z } from 'zod'
import { prisma } from '../lib/prisma'
import { hasPermission, type AuthUser } from '../lib/auth'
import { scheduleReminder } from './reminders'
import { notifyUser } from './notifications'
import { followUpPlanSchema, type followUpCreateSchema } from '../validators/schemas'

export type FollowUpInput = z.infer<typeof followUpCreateSchema>
export type FollowUpPlan = z.infer<typeof followUpPlanSchema>

type PlanResult = { ok: true; value: FollowUpPlan | null } | { ok: false; status: 400 | 403; error: string }

/** Validates an optional follow-up sent along with a new customer, before anything is saved. */
export function parseFollowUpPlan(raw: unknown, user: AuthUser): PlanResult {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (!hasPermission(user, 'followups.write')) {
    return { ok: false, status: 403, error: 'You do not have permission to schedule follow-ups' }
  }
  const parsed = followUpPlanSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, status: 400, error: `Follow-up: ${issue?.message || 'invalid details'}` }
  }
  return { ok: true, value: parsed.data }
}

export async function createFollowUp(data: FollowUpInput, createdById: string) {
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
      smsCustomer: data.smsCustomer,
      smsAssignee: data.smsAssignee,
      assigneeId: data.assigneeId,
      createdById,
    },
  })

  await prisma.activityHistory.create({
    data: {
      followUpId: followUp.id,
      changedById: createdById,
      changeType: 'created',
      toValue: { scheduledAt: followUp.scheduledAt, status: followUp.status },
    },
  })

  await scheduleReminder(followUp.id, followUp.scheduledAt, followUp.reminderMinutes)

  if (data.assigneeId !== createdById) {
    await notifyUser({
      userId: data.assigneeId,
      title: 'New activity assigned',
      body: `You have been assigned a ${data.activityType.toLowerCase()}.`,
      linkUrl: `/follow-ups/${followUp.id}`,
    })
  }

  return followUp
}
