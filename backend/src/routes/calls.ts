import { Router } from 'express'
import multer from 'multer'
import {
  CallDialMode,
  CallDirection,
  CallOutcome,
  CallSessionStatus,
  Prisma,
} from '@prisma/client'
import { z } from 'zod'
import { requireAuth, requirePermission } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { param } from '../lib/http'
import { normalizePhone } from '../services/sms'
import { uploadPrivateFile } from '../services/storage'
import {
  assertDialModeAvailable,
  callSessionInclude,
  findCompanyByPhone,
  getCallingSettings,
  getDialOptions,
  resolveContactPhone,
  saveCallingSettings,
  type CallingSettings,
} from '../services/calling'
import { createTwilioVoiceToken, twilioWebhookBaseUrl, validateTwilioSignature } from '../services/twilioVoice'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
const router = Router()

const dialModeSchema = z.enum(['PHONE', 'SIP_GATEWAY', 'TWILIO'])
const outcomeSchema = z.enum([
  'CONNECTED',
  'NO_ANSWER',
  'BUSY',
  'WRONG_NUMBER',
  'INTERESTED',
  'NOT_INTERESTED',
  'REQUESTED_ANOTHER_CALL',
  'DEMO_BOOKED',
  'MEETING_BOOKED',
])

const outboundSchema = z.object({
  companyId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  phone: z.string().min(3),
  dialMode: dialModeSchema,
  followUpId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  queue: z.boolean().optional(),
})

const inboundSchema = z.object({
  phone: z.string().min(3),
  companyId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  dialMode: dialModeSchema.optional(),
  notes: z.string().optional().nullable(),
})

const completeSchema = z.object({
  outcome: outcomeSchema,
  notes: z.string().optional().nullable(),
  durationSec: z.number().int().min(0).optional().nullable(),
  followUpId: z.string().optional().nullable(),
})

const callingSettingsSchema = z.object({
  phoneDialer: z.object({ enabled: z.boolean() }),
  sipGateway: z.object({
    enabled: z.boolean(),
    wsUrl: z.string(),
    sipDomain: z.string(),
    stun: z.string(),
  }),
  twilio: z.object({
    enabled: z.boolean(),
    fromNumber: z.string(),
  }),
})

async function loadSession(id: string) {
  return prisma.callSession.findUnique({ where: { id }, include: callSessionInclude })
}

/** Public webhooks before auth middleware. */
export const callsWebhookRouter = Router()

callsWebhookRouter.post('/twilio', async (req, res) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || ''
  const signature = req.header('X-Twilio-Signature') || undefined
  const base = twilioWebhookBaseUrl()
  const url = base ? `${base}/api/calls/webhooks/twilio` : `${req.protocol}://${req.get('host')}${req.originalUrl}`
  const params: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.body || {})) {
    if (typeof v === 'string') params[k] = v
  }
  if (authToken && !validateTwilioSignature(authToken, signature, url, params)) {
    return res.status(403).type('text/xml').send('<Response></Response>')
  }

  const callSid = typeof req.body?.CallSid === 'string' ? req.body.CallSid : ''
  const from = normalizePhone(typeof req.body?.From === 'string' ? req.body.From : '') || ''
  const to = normalizePhone(typeof req.body?.To === 'string' ? req.body.To : '') || ''
  const callStatus = typeof req.body?.CallStatus === 'string' ? req.body.CallStatus : ''
  const direction = typeof req.body?.Direction === 'string' ? req.body.Direction : ''
  const recordingUrl = typeof req.body?.RecordingUrl === 'string' ? req.body.RecordingUrl : ''
  const recordingSid = typeof req.body?.RecordingSid === 'string' ? req.body.RecordingSid : ''
  const dialCallStatus = typeof req.body?.DialCallStatus === 'string' ? req.body.DialCallStatus : ''

  // Recording callback
  if (recordingUrl && callSid) {
    let session = await prisma.callSession.findFirst({ where: { providerCallSid: callSid } })
    if (!session) {
      session = await prisma.callSession.findFirst({
        where: { providerMeta: { path: ['parentCallSid'], equals: callSid } },
      })
    }
    if (session && !session.recordingKey) {
      try {
        const mediaUrl = `${recordingUrl}.mp3`
        const resp = await fetch(mediaUrl, {
          headers: {
            Authorization:
              'Basic ' +
              Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          },
        })
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer())
          const uploaded = await uploadPrivateFile(buf, `${callSid}.mp3`, 'audio/mpeg', 'call-recordings')
          await prisma.callSession.update({
            where: { id: session.id },
            data: {
              recordingKey: uploaded.key,
              providerMeta: {
                ...((session.providerMeta as object) || {}),
                recordingSid,
                recordingUrl,
              },
            },
          })
        }
      } catch (err) {
        console.error('Twilio recording ingest failed', err)
      }
    }
    return res.status(200).type('text/xml').send('<Response></Response>')
  }

  // Status callback (skip when this request is the inbound TwiML fetch with no CallStatus progress)
  if (callSid && callStatus && !recordingUrl) {
    const session = await prisma.callSession.findFirst({ where: { providerCallSid: callSid } })
    if (session) {
      const terminal = ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(callStatus)
      const duration = Number(req.body?.CallDuration || req.body?.DialCallDuration || 0)
      await prisma.callSession.update({
        where: { id: session.id },
        data: {
          status: terminal
            ? callStatus === 'completed'
              ? CallSessionStatus.COMPLETED
              : callStatus === 'no-answer' || callStatus === 'busy'
                ? CallSessionStatus.MISSED
                : CallSessionStatus.FAILED
            : callStatus === 'in-progress' || callStatus === 'answered'
              ? CallSessionStatus.IN_PROGRESS
              : callStatus === 'ringing'
                ? CallSessionStatus.RINGING
                : session.status,
          endedAt: terminal ? new Date() : session.endedAt,
          durationSec: terminal && duration > 0 ? duration : session.durationSec,
          providerMeta: {
            ...((session.providerMeta as object) || {}),
            callStatus,
            dialCallStatus,
          },
        },
      })
    }
  }

  const baseUrl = twilioWebhookBaseUrl()
  const statusCb = baseUrl
    ? ` statusCallback="${baseUrl}/api/calls/webhooks/twilio" statusCallbackEvent="initiated ringing answered completed"`
    : ''
  const recordCb = baseUrl ? ` recordingStatusCallback="${baseUrl}/api/calls/webhooks/twilio"` : ''
  const settings = await getCallingSettings()
  const callerId = settings.twilio.fromNumber || to || ''

  // Outbound from browser Twilio Device (TwiML App voice URL)
  const toParam = typeof req.body?.To === 'string' ? req.body.To : ''
  const fromClient = typeof req.body?.From === 'string' && req.body.From.startsWith('client:')
  if (fromClient && toParam && !recordingUrl) {
    const dest = normalizePhone(toParam) || toParam
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : ''
    if (sessionId && callSid) {
      await prisma.callSession.updateMany({
        where: { id: sessionId },
        data: { providerCallSid: callSid, status: CallSessionStatus.RINGING },
      })
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" answerOnBridge="true" record="record-from-answer-dual"${statusCb}${recordCb}>
    <Number>${dest}</Number>
  </Dial>
</Response>`
    return res.status(200).type('text/xml').send(xml)
  }

  // Inbound voice webhook — enqueue and ring browser clients
  const isInboundVoice =
    (direction === 'inbound' || req.body?.Direction === 'inbound') && !recordingUrl && callSid
  if (isInboundVoice && callStatus !== 'completed') {
    let session = await prisma.callSession.findFirst({ where: { providerCallSid: callSid } })
    if (!session && from) {
      const match = await findCompanyByPhone(from)
      session = await prisma.callSession.create({
        data: {
          direction: CallDirection.INBOUND,
          status: CallSessionStatus.QUEUED,
          dialMode: CallDialMode.TWILIO,
          phoneE164: from,
          companyId: match?.companyId,
          contactId: match?.contactId,
          providerCallSid: callSid,
          providerMeta: { to, from, twilio: true },
        },
      })
    }
    void session
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we connect you to an agent.</Say>
  <Dial timeout="45" answerOnBridge="true" record="record-from-answer-dual"${statusCb}${recordCb}>
    <Client>agent-queue</Client>
  </Dial>
  <Say voice="alice">Sorry, no agents are available. Goodbye.</Say>
</Response>`
    return res.status(200).type('text/xml').send(xml)
  }

  return res.status(200).type('text/xml').send('<Response></Response>')
})

callsWebhookRouter.post('/sip', async (req, res) => {
  const secret = process.env.SIP_GATEWAY_WEBHOOK_SECRET?.trim()
  const provided = req.header('X-Sip-Webhook-Secret') || req.body?.secret
  if (secret && provided !== secret) return res.status(403).json({ error: 'Forbidden' })

  const event = typeof req.body?.event === 'string' ? req.body.event : 'inbound'
  const phone = normalizePhone(typeof req.body?.from === 'string' ? req.body.from : req.body?.phone)
  const callId = typeof req.body?.callId === 'string' ? req.body.callId : undefined

  if (event === 'inbound' && phone) {
    const match = await findCompanyByPhone(phone)
    const session = await prisma.callSession.create({
      data: {
        direction: CallDirection.INBOUND,
        status: CallSessionStatus.QUEUED,
        dialMode: CallDialMode.SIP_GATEWAY,
        phoneE164: phone,
        companyId: match?.companyId,
        contactId: match?.contactId,
        providerCallSid: callId,
        providerMeta: { source: 'sip-webhook', raw: req.body },
      },
      include: callSessionInclude,
    })
    return res.status(201).json(session)
  }

  if (event === 'hangup' && callId) {
    const session = await prisma.callSession.findFirst({ where: { providerCallSid: callId } })
    if (session && session.status !== CallSessionStatus.COMPLETED) {
      const duration = Number(req.body?.durationSec || 0)
      await prisma.callSession.update({
        where: { id: session.id },
        data: {
          status: CallSessionStatus.COMPLETED,
          endedAt: new Date(),
          durationSec: duration || session.durationSec,
        },
      })
    }
    return res.json({ ok: true })
  }

  return res.json({ ok: true })
})

router.use(requireAuth)

router.get('/dial-options', requirePermission('calls.read'), async (_req, res) => {
  return res.json(await getDialOptions())
})

router.get('/settings', requireAuth, async (req, res) => {
  if (!req.user?.permissions.includes('settings.read') && !req.user?.permissions.includes('calls.read') && req.user?.roleCode !== 'CRM_ADMIN') {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const options = await getDialOptions()
  return res.json(options)
})

router.put('/settings', requirePermission('settings.write'), async (req, res) => {
  const parsed = callingSettingsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  await saveCallingSettings(parsed.data as CallingSettings)
  return res.json(await getDialOptions())
})

router.get('/leads', requirePermission('calls.read'), async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const where: Prisma.CompanyWhereInput = {
    contacts: {
      some: {
        OR: [{ mobile: { not: null } }, { phone: { not: null } }],
      },
    },
  }
  if (q) {
    where.AND = [
      {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { contacts: { some: { mobile: { contains: q } } } },
          { contacts: { some: { phone: { contains: q } } } },
          { contacts: { some: { firstName: { contains: q, mode: 'insensitive' } } } },
          { contacts: { some: { lastName: { contains: q, mode: 'insensitive' } } } },
          { contacts: { some: { email: { contains: q, mode: 'insensitive' } } } },
        ],
      },
    ]
  }

  const companies = await prisma.company.findMany({
    where,
    take: 100,
    orderBy: { updatedAt: 'desc' },
    include: {
      contacts: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          mobile: true,
          phone: true,
          email: true,
          isPrimary: true,
          jobTitle: true,
        },
      },
      level: { select: { id: true, name: true, color: true } },
      assignedOfficer: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  const leads = companies.flatMap((company) =>
    company.contacts
      .map((contact) => {
        const phoneE164 = resolveContactPhone(contact.mobile, contact.phone)
        if (!phoneE164) return null
        return {
          companyId: company.id,
          companyName: company.name,
          leadStatus: company.leadStatus,
          level: company.level,
          assignedOfficer: company.assignedOfficer,
          contact,
          phoneE164,
        }
      })
      .filter(Boolean)
  )

  return res.json(leads)
})

router.get('/queue', requirePermission('calls.read'), async (_req, res) => {
  const items = await prisma.callSession.findMany({
    where: { status: CallSessionStatus.QUEUED },
    orderBy: [{ direction: 'asc' }, { queuedAt: 'asc' }],
    include: callSessionInclude,
  })
  // Inbound first
  items.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'INBOUND' ? -1 : 1
    return a.queuedAt.getTime() - b.queuedAt.getTime()
  })
  return res.json(items)
})

router.get('/', requirePermission('calls.read'), async (req, res) => {
  const mine = req.query.mine === '1' || req.query.mine === 'true'
  const status = typeof req.query.status === 'string' ? req.query.status : ''
  const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : ''
  const where: Prisma.CallSessionWhereInput = {}
  if (mine) where.assigneeId = req.user!.id
  if (status && Object.values(CallSessionStatus).includes(status as CallSessionStatus)) {
    where.status = status as CallSessionStatus
  }
  if (companyId) where.companyId = companyId

  const items = await prisma.callSession.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: callSessionInclude,
  })
  return res.json(items)
})

router.post('/token/twilio', requirePermission('calls.write'), async (req, res) => {
  const options = await getDialOptions()
  if (!options.modes.TWILIO.available) {
    return res.status(400).json({ error: 'Twilio dial mode is not enabled or configured' })
  }
  const identity = `agent-${req.user!.id}`
  const result = createTwilioVoiceToken(identity)
  if ('error' in result) return res.status(400).json(result)
  const settings = await getCallingSettings()
  return res.json({
    ...result,
    fromNumber: settings.twilio.fromNumber || null,
    queueIdentity: 'agent-queue',
  })
})

router.get('/token/sip', requirePermission('calls.write'), async (_req, res) => {
  const options = await getDialOptions()
  if (!options.modes.SIP_GATEWAY.available) {
    return res.status(400).json({ error: 'SIP gateway dial mode is not enabled or configured' })
  }
  const settings = options.settings
  return res.json({
    wsUrl: settings.sipGateway.wsUrl || process.env.SIP_GATEWAY_WS_URL || '',
    sipDomain: settings.sipGateway.sipDomain || '',
    stun: settings.sipGateway.stun || '',
    username: process.env.SIP_GATEWAY_USER,
    password: process.env.SIP_GATEWAY_PASSWORD,
  })
})

router.get('/:id', requirePermission('calls.read'), async (req, res) => {
  const session = await loadSession(param(req, 'id'))
  if (!session) return res.status(404).json({ error: 'Not found' })
  return res.json(session)
})

router.post('/outbound', requirePermission('calls.write'), async (req, res) => {
  const parsed = outboundSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const phoneE164 = normalizePhone(parsed.data.phone)
  if (!phoneE164) return res.status(400).json({ error: 'Enter a valid phone number' })

  const options = await getDialOptions()
  const modeErr = assertDialModeAvailable(parsed.data.dialMode as CallDialMode, options)
  if (modeErr) return res.status(400).json({ error: modeErr })

  let companyId = parsed.data.companyId || null
  let contactId = parsed.data.contactId || null
  if (contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } })
    if (!contact) return res.status(400).json({ error: 'Contact not found' })
    companyId = contact.companyId
  } else if (companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) return res.status(400).json({ error: 'Customer not found' })
  }

  const queue = parsed.data.queue === true
  const session = await prisma.callSession.create({
    data: {
      direction: CallDirection.OUTBOUND,
      status: queue ? CallSessionStatus.QUEUED : CallSessionStatus.RINGING,
      dialMode: parsed.data.dialMode as CallDialMode,
      phoneE164,
      companyId,
      contactId,
      followUpId: parsed.data.followUpId || null,
      notes: parsed.data.notes || null,
      createdById: req.user!.id,
      assigneeId: queue ? null : req.user!.id,
      claimedAt: queue ? null : new Date(),
      startedAt: queue ? null : new Date(),
    },
    include: callSessionInclude,
  })
  return res.status(201).json(session)
})

router.post('/inbound', requirePermission('calls.write'), async (req, res) => {
  const parsed = inboundSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const phoneE164 = normalizePhone(parsed.data.phone)
  if (!phoneE164) return res.status(400).json({ error: 'Enter a valid phone number' })

  const options = await getDialOptions()
  const dialMode = (parsed.data.dialMode || 'PHONE') as CallDialMode
  if (parsed.data.dialMode) {
    const modeErr = assertDialModeAvailable(dialMode, options)
    if (modeErr) return res.status(400).json({ error: modeErr })
  }

  let companyId = parsed.data.companyId || null
  let contactId = parsed.data.contactId || null
  if (!companyId && !contactId) {
    const match = await findCompanyByPhone(phoneE164)
    companyId = match?.companyId || null
    contactId = match?.contactId || null
  }

  const session = await prisma.callSession.create({
    data: {
      direction: CallDirection.INBOUND,
      status: CallSessionStatus.QUEUED,
      dialMode,
      phoneE164,
      companyId,
      contactId,
      notes: parsed.data.notes || null,
      createdById: req.user!.id,
    },
    include: callSessionInclude,
  })
  return res.status(201).json(session)
})

router.post('/queue/pick-next', requirePermission('calls.write'), async (req, res) => {
  const next = await prisma.callSession.findFirst({
    where: { status: CallSessionStatus.QUEUED },
    orderBy: [{ direction: 'asc' }, { queuedAt: 'asc' }],
  })
  if (!next) return res.status(404).json({ error: 'Queue is empty' })

  // Prefer inbound: re-query inbound first
  const inbound = await prisma.callSession.findFirst({
    where: { status: CallSessionStatus.QUEUED, direction: CallDirection.INBOUND },
    orderBy: { queuedAt: 'asc' },
  })
  const target = inbound || next

  const updated = await prisma.callSession.update({
    where: { id: target.id },
    data: {
      assigneeId: req.user!.id,
      claimedAt: new Date(),
      status: CallSessionStatus.RINGING,
      startedAt: new Date(),
    },
    include: callSessionInclude,
  })
  return res.json(updated)
})

router.post('/:id/claim', requirePermission('calls.write'), async (req, res) => {
  const id = param(req, 'id')
  const existing = await prisma.callSession.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  if (existing.status !== CallSessionStatus.QUEUED) {
    return res.status(400).json({ error: 'Call is not in the queue' })
  }
  if (existing.assigneeId && existing.assigneeId !== req.user!.id && !req.user!.permissions.includes('calls.manage') && req.user!.roleCode !== 'CRM_ADMIN') {
    return res.status(403).json({ error: 'Already claimed' })
  }
  const updated = await prisma.callSession.update({
    where: { id },
    data: {
      assigneeId: req.user!.id,
      claimedAt: new Date(),
      status: CallSessionStatus.RINGING,
      startedAt: existing.startedAt || new Date(),
    },
    include: callSessionInclude,
  })
  return res.json(updated)
})

router.post('/:id/start', requirePermission('calls.write'), async (req, res) => {
  const id = param(req, 'id')
  const existing = await prisma.callSession.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const providerCallSid = typeof req.body?.providerCallSid === 'string' ? req.body.providerCallSid : undefined
  const updated = await prisma.callSession.update({
    where: { id },
    data: {
      status: CallSessionStatus.IN_PROGRESS,
      startedAt: existing.startedAt || new Date(),
      assigneeId: existing.assigneeId || req.user!.id,
      providerCallSid: providerCallSid || existing.providerCallSid,
    },
    include: callSessionInclude,
  })
  return res.json(updated)
})

router.post('/:id/complete', requirePermission('calls.write'), async (req, res) => {
  const parsed = completeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const id = param(req, 'id')
  const existing = await prisma.callSession.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const endedAt = new Date()
  let durationSec = parsed.data.durationSec ?? existing.durationSec ?? null
  if (durationSec == null && existing.startedAt) {
    durationSec = Math.max(0, Math.round((endedAt.getTime() - existing.startedAt.getTime()) / 1000))
  }

  const updated = await prisma.callSession.update({
    where: { id },
    data: {
      status: CallSessionStatus.COMPLETED,
      outcome: parsed.data.outcome as CallOutcome,
      notes: parsed.data.notes ?? existing.notes,
      durationSec,
      endedAt,
      followUpId: parsed.data.followUpId ?? existing.followUpId,
      assigneeId: existing.assigneeId || req.user!.id,
    },
    include: callSessionInclude,
  })
  return res.json(updated)
})

router.post('/:id/cancel', requirePermission('calls.write'), async (req, res) => {
  const id = param(req, 'id')
  const existing = await prisma.callSession.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = await prisma.callSession.update({
    where: { id },
    data: {
      status: CallSessionStatus.CANCELLED,
      endedAt: new Date(),
      notes: typeof req.body?.notes === 'string' ? req.body.notes : existing.notes,
    },
    include: callSessionInclude,
  })
  return res.json(updated)
})

router.post(
  '/:id/recording',
  requirePermission('calls.write'),
  upload.single('file'),
  async (req, res) => {
    const id = param(req, 'id')
    const existing = await prisma.callSession.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (!req.file) return res.status(400).json({ error: 'Recording file required' })
    const uploaded = await uploadPrivateFile(
      req.file.buffer,
      req.file.originalname || `call-${id}.webm`,
      req.file.mimetype || 'audio/webm',
      'call-recordings'
    )
    const updated = await prisma.callSession.update({
      where: { id },
      data: { recordingKey: uploaded.key },
      include: callSessionInclude,
    })
    return res.json(updated)
  }
)

export default router
