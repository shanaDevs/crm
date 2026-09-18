import webpush from 'web-push'
import nodemailer from 'nodemailer'
import { NotificationChannel, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

const vapidPublic = process.env.VAPID_PUBLIC_KEY
const vapidPrivate = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@crmtool.local'

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
}

function mailer() {
  if (!process.env.SMTP_HOST) return null
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
}

function inQuietHours(start?: string | null, end?: string | null) {
  if (!start || !end) return false
  const now = new Date()
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const s = sh * 60 + sm
  const e = eh * 60 + em
  if (s <= e) return minutes >= s && minutes < e
  return minutes >= s || minutes < e
}

export async function notifyUser(params: {
  userId: string
  title: string
  body: string
  linkUrl?: string
  meta?: Prisma.InputJsonValue
}) {
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId: params.userId } })
  const quiet = inQuietHours(prefs?.quietHoursStart, prefs?.quietHoursEnd)

  if (!prefs || prefs.inAppEnabled) {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        title: params.title,
        body: params.body,
        channel: NotificationChannel.IN_APP,
        linkUrl: params.linkUrl,
        meta: params.meta ?? undefined,
      },
    })
  }

  if (quiet) return

  if (prefs?.pushEnabled !== false && vapidPublic && vapidPrivate) {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: params.userId } })
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: params.title, body: params.body, url: params.linkUrl })
        )
        await prisma.notification.create({
          data: {
            userId: params.userId,
            title: params.title,
            body: params.body,
            channel: NotificationChannel.PUSH,
            linkUrl: params.linkUrl,
          },
        })
      } catch {
        // stale subscription — ignore for now
      }
    }
  }

  if (prefs?.emailEnabled) {
    const transport = mailer()
    const user = await prisma.user.findUnique({ where: { id: params.userId } })
    if (transport && user) {
      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM || 'noreply@crmtool.local',
          to: user.email,
          subject: params.title,
          text: params.body,
        })
        await prisma.notification.create({
          data: {
            userId: params.userId,
            title: params.title,
            body: params.body,
            channel: NotificationChannel.EMAIL,
            linkUrl: params.linkUrl,
          },
        })
      } catch {
        // email failure is non-fatal
      }
    }
  }
}

export function getVapidPublicKey() {
  return vapidPublic || null
}
