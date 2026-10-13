import { ReminderJobStatus, type ActivityType, type Contact } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { notifyUser } from './notifications'
import { sendSms } from './sms'

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  CALL: 'call',
  VISIT: 'visit',
  DEMO: 'demo',
  MEETING: 'meeting',
  FOLLOW_UP: 'follow-up',
}

function formatWhen(date: Date, timeZone: string) {
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(date) + ' UTC'
  }
}

function contactNumber(contact: Pick<Contact, 'mobile' | 'phone'> | null | undefined) {
  return contact?.mobile?.trim() || contact?.phone?.trim() || null
}

type ReminderFollowUp = {
  id: string
  activityType: ActivityType
  scheduledAt: Date
  timezone: string
  smsCustomer: boolean
  smsAssignee: boolean
  contact: Contact | null
  company: { name: string; contacts: Contact[] }
  assignee: { firstName: string; lastName: string; phone: string | null }
}

/** Returns error messages for SMS that could not be sent; the in-app reminder has already gone out. */
async function sendReminderSms(followUp: ReminderFollowUp) {
  const errors: string[] = []
  if (!followUp.smsCustomer && !followUp.smsAssignee) return errors

  const activity = ACTIVITY_LABELS[followUp.activityType]
  const when = formatWhen(followUp.scheduledAt, followUp.timezone)
  const assigneeName = `${followUp.assignee.firstName} ${followUp.assignee.lastName}`.trim()
  const customerContact =
    (contactNumber(followUp.contact) ? followUp.contact : null) ??
    followUp.company.contacts.find((c) => contactNumber(c)) ??
    null
  const customerNumber = contactNumber(customerContact)

  if (followUp.smsCustomer) {
    const greeting = customerContact?.firstName?.trim() || followUp.company.name
    const result = await sendSms(
      customerNumber,
      `Hi ${greeting}, this is a reminder of your ${activity} with ${assigneeName} on ${when}. Thank you.`,
      followUp.id
    )
    if (!result.ok) errors.push(`Customer SMS: ${result.error}`)
  }

  if (followUp.smsAssignee) {
    const who = customerContact
      ? `${customerContact.firstName} ${customerContact.lastName}`.trim() + ` (${followUp.company.name})`
      : followUp.company.name
    const result = await sendSms(
      followUp.assignee.phone,
      `Reminder: ${activity} with ${who} on ${when}.${customerNumber ? ` Contact: ${customerNumber}` : ''}`,
      followUp.id
    )
    if (!result.ok) errors.push(`Staff SMS: ${result.error}`)
  }

  return errors
}

export function cancelReminders(followUpId: string) {
  return prisma.reminderJob.updateMany({
    where: { followUpId, status: ReminderJobStatus.PENDING },
    data: { status: ReminderJobStatus.CANCELLED },
  })
}

export async function scheduleReminder(followUpId: string, scheduledAt: Date, reminderMinutes: number) {
  const runAt = new Date(scheduledAt.getTime() - reminderMinutes * 60 * 1000)
  const dedupeKey = `followup:${followUpId}:${runAt.toISOString()}`

  // Cancel previous pending reminders for this follow-up
  await prisma.reminderJob.updateMany({
    where: { followUpId, status: ReminderJobStatus.PENDING },
    data: { status: ReminderJobStatus.CANCELLED },
  })

  return prisma.reminderJob.upsert({
    where: { dedupeKey },
    create: {
      followUpId,
      runAt,
      dedupeKey,
      status: ReminderJobStatus.PENDING,
    },
    update: {
      runAt,
      status: ReminderJobStatus.PENDING,
      attempts: 0,
      lastError: null,
    },
  })
}

export async function processDueReminders() {
  const now = new Date()
  const due = await prisma.reminderJob.findMany({
    where: {
      status: ReminderJobStatus.PENDING,
      runAt: { lte: now },
    },
    take: 50,
    include: {
      followUp: {
        include: {
          company: { include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } },
          contact: true,
          assignee: true,
        },
      },
    },
  })

  for (const job of due) {
    if (job.followUp.status !== 'SCHEDULED' && job.followUp.status !== 'OVERDUE') {
      await prisma.reminderJob.update({ where: { id: job.id }, data: { status: ReminderJobStatus.CANCELLED } })
      continue
    }
    try {
      await prisma.reminderJob.update({
        where: { id: job.id },
        data: { status: ReminderJobStatus.PROCESSING },
      })

      const label = job.followUp.contact
        ? `${job.followUp.contact.firstName} ${job.followUp.contact.lastName}`.trim()
        : job.followUp.company.name

      await notifyUser({
        userId: job.followUp.assigneeId,
        title: 'Upcoming activity reminder',
        body: `${job.followUp.activityType} with ${label} is scheduled soon.`,
        linkUrl: `/follow-ups/${job.followUp.id}`,
        meta: { followUpId: job.followUp.id, reminderJobId: job.id },
      })

      const smsErrors = await sendReminderSms(job.followUp)

      await prisma.reminderJob.update({
        where: { id: job.id },
        data: { status: ReminderJobStatus.SENT, lastError: smsErrors.length ? smsErrors.join('; ') : null },
      })
    } catch (err) {
      await prisma.reminderJob.update({
        where: { id: job.id },
        data: {
          status: ReminderJobStatus.FAILED,
          attempts: { increment: 1 },
          lastError: err instanceof Error ? err.message : 'Unknown error',
        },
      })
    }
  }

  // Mark overdue scheduled follow-ups
  await prisma.followUp.updateMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lt: now },
    },
    data: { status: 'OVERDUE' },
  })

  return due.length
}

export function startReminderLoop(intervalMs = 30_000) {
  const tick = async () => {
    try {
      await processDueReminders()
    } catch (err) {
      console.error('[reminder-worker]', err)
    }
  }
  void tick()
  return setInterval(tick, intervalMs)
}
