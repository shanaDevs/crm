import { ReminderJobStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { notifyUser } from './notifications'

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
          company: true,
          contact: true,
          assignee: true,
        },
      },
    },
  })

  for (const job of due) {
    try {
      await prisma.reminderJob.update({
        where: { id: job.id },
        data: { status: ReminderJobStatus.PROCESSING },
      })

      const label = job.followUp.contact
        ? `${job.followUp.contact.firstName} ${job.followUp.contact.lastName}`
        : job.followUp.company.name

      await notifyUser({
        userId: job.followUp.assigneeId,
        title: 'Upcoming activity reminder',
        body: `${job.followUp.activityType} with ${label} is scheduled soon.`,
        linkUrl: `/follow-ups/${job.followUp.id}`,
        meta: { followUpId: job.followUp.id, reminderJobId: job.id },
      })

      await prisma.reminderJob.update({
        where: { id: job.id },
        data: { status: ReminderJobStatus.SENT },
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
