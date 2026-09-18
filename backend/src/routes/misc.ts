import { Router } from 'express'
import { RoleCode } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import { getVapidPublicKey } from '../services/notifications'
import { param, asJson } from '../lib/http'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  const items = await prisma.notification.findMany({
    where: { userId: req.user!.id, channel: 'IN_APP' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return res.json(items)
})

router.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  })
  return res.json({ ok: true })
})

router.patch('/:id/read', async (req, res) => {
  const n = await prisma.notification.updateMany({
    where: { id: param(req, 'id'), userId: req.user!.id },
    data: { isRead: true },
  })
  return res.json({ updated: n.count })
})

router.get('/preferences', async (req, res) => {
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId: req.user!.id } })
  return res.json(prefs)
})

router.put('/preferences', async (req, res) => {
  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: req.user!.id },
    create: {
      userId: req.user!.id,
      inAppEnabled: req.body.inAppEnabled ?? true,
      pushEnabled: req.body.pushEnabled ?? true,
      emailEnabled: req.body.emailEnabled ?? false,
      quietHoursStart: req.body.quietHoursStart,
      quietHoursEnd: req.body.quietHoursEnd,
    },
    update: {
      inAppEnabled: req.body.inAppEnabled,
      pushEnabled: req.body.pushEnabled,
      emailEnabled: req.body.emailEnabled,
      quietHoursStart: req.body.quietHoursStart,
      quietHoursEnd: req.body.quietHoursEnd,
    },
  })
  return res.json(prefs)
})

router.get('/push/vapid-public-key', (_req, res) => {
  return res.json({ publicKey: getVapidPublicKey() })
})

router.post('/push/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body as { endpoint: string; keys: { p256dh: string; auth: string } }
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' })
  }
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: req.user!.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    update: {
      userId: req.user!.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  })
  return res.json(sub)
})

const dashboardRouter = Router()
dashboardRouter.use(requireAuth)

dashboardRouter.get('/', requirePermission('dashboard.read'), async (req, res) => {
  const now = new Date()
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setUTCHours(23, 59, 59, 999)

  const assigneeFilter =
    req.user?.roleCode === RoleCode.MARKETING_OFFICER || req.user?.roleCode === RoleCode.DEVELOPER
      ? { assigneeId: req.user.id }
      : {}

  const [todayCalls, overdue, newLeads, myRequirements, myTickets, unread] = await Promise.all([
    prisma.followUp.findMany({
      where: {
        ...assigneeFilter,
        scheduledAt: { gte: start, lte: end },
        status: { in: ['SCHEDULED', 'OVERDUE'] },
      },
      include: { company: true, contact: true },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    }),
    prisma.followUp.count({ where: { ...assigneeFilter, status: 'OVERDUE' } }),
    prisma.company.count({ where: { leadStatus: 'NEW' } }),
    prisma.requirement.findMany({
      where:
        req.user?.roleCode === RoleCode.DEVELOPER
          ? { assignments: { some: { userId: req.user.id, unassignedAt: null } } }
          : req.user?.roleCode === RoleCode.IT_MANAGER
            ? { status: { in: ['SUBMITTED', 'REVIEWED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS'] } }
            : {},
      include: { company: true, product: true },
      take: 10,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.ticket.findMany({
      where: {
        ...(req.user?.roleCode === RoleCode.DEVELOPER ? { assigneeId: req.user.id } : {}),
        status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_INTERNAL'] },
      },
      include: { company: true, product: true },
      take: 10,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.notification.count({ where: { userId: req.user!.id, isRead: false, channel: 'IN_APP' } }),
  ])

  return res.json({
    todayCalls,
    overdueCount: overdue,
    newLeadsCount: newLeads,
    myRequirements,
    myTickets,
    unreadNotifications: unread,
  })
})

const teamRouter = Router()
teamRouter.use(requireAuth)

teamRouter.get('/', requirePermission('team.read'), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: { code: { not: RoleCode.CUSTOMER } } },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      isActive: true,
      timezone: true,
      role: true,
      _count: {
        select: {
          followUpsAssigned: true,
          ticketsAssigned: true,
          requirementAssignments: true,
        },
      },
    },
    orderBy: { firstName: 'asc' },
  })
  return res.json(users)
})

teamRouter.get('/workload', requirePermission('team.read'), async (_req, res) => {
  const developers = await prisma.user.findMany({
    where: { role: { code: { in: [RoleCode.DEVELOPER, RoleCode.IT_MANAGER] } }, isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      ticketsAssigned: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } },
      requirementAssignments: {
        where: { unassignedAt: null, requirement: { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'QA'] } } },
        select: { id: true },
      },
    },
  })
  return res.json(
    developers.map((d) => ({
      id: d.id,
      name: `${d.firstName} ${d.lastName}`,
      role: d.role.code,
      openTickets: d.ticketsAssigned.length,
      activeRequirements: d.requirementAssignments.length,
    }))
  )
})

const settingsRouter = Router()
settingsRouter.use(requireAuth)

settingsRouter.get('/', requirePermission('settings.read'), async (_req, res) => {
  const settings = await prisma.systemSetting.findMany()
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  return res.json(map)
})

settingsRouter.put('/:key', requirePermission('settings.write'), async (req, res) => {
  const key = param(req, 'key')
  const value = asJson(req.body.value) ?? {}
  const setting = await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
  return res.json(setting)
})

settingsRouter.post('/test-spaces', requirePermission('settings.write'), async (_req, res) => {
  const { testSpacesConnection } = await import('../services/storage')
  return res.json(await testSpacesConnection())
})

settingsRouter.get('/ai-status', requirePermission('settings.read'), async (_req, res) => {
  const provider = (process.env.AI_PROVIDER || 'mock').toLowerCase()
  const hasKey = Boolean(process.env.AI_API_KEY?.trim())
  return res.json({
    provider,
    model: process.env.AI_MODEL || (provider === 'gemini' ? 'gemini-3.6-flash' : null),
    configured: provider !== 'mock' && hasKey,
    live: provider === 'gemini' && hasKey,
  })
})

settingsRouter.post('/test-ai', requirePermission('settings.write'), async (_req, res) => {
  const provider = (process.env.AI_PROVIDER || 'mock').toLowerCase()
  const apiKey = process.env.AI_API_KEY?.trim()
  if (provider !== 'gemini' || !apiKey) {
    return res.json({ ok: false, message: 'Set AI_PROVIDER=gemini and AI_API_KEY in backend/.env' })
  }
  const model = process.env.AI_MODEL || 'gemini-3.6-flash'
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    const prompt = 'Reply with JSON only: {"ok":true}'
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    })
    const json = (await response.json()) as { error?: { message?: string }; candidates?: unknown[] }
    if (!response.ok) {
      return res.json({ ok: false, message: json.error?.message || 'Gemini request failed', model })
    }
    return res.json({ ok: true, message: 'Gemini connected', model, provider: 'gemini' })
  } catch (err) {
    return res.json({
      ok: false,
      message: err instanceof Error ? err.message : 'Gemini connection failed',
      model,
    })
  }
})

const filesRouter = Router()
filesRouter.use(requireAuth)

filesRouter.get('/signed-url', requirePermission('files.read'), async (req, res) => {
  const key = String(req.query.key || '')
  if (!key) return res.status(400).json({ error: 'key required' })
  const { getSignedDownloadUrl } = await import('../services/storage')
  try {
    const url = await getSignedDownloadUrl(key)
    return res.json({ url })
  } catch {
    return res.status(404).json({ error: 'File not found' })
  }
})

filesRouter.get('/local', requirePermission('files.read'), async (req, res) => {
  const { getLocalFile } = await import('../services/storage')
  const key = decodeURIComponent(String(req.query.key || ''))
  if (!key) return res.status(400).json({ error: 'key required' })
  const file = getLocalFile(key)
  if (!file) return res.status(404).json({ error: 'Not found' })
  res.setHeader('Content-Type', file.mimeType)
  res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`)
  return res.send(file.buffer)
})

export { router as notificationsRouter, dashboardRouter, teamRouter, settingsRouter, filesRouter }
