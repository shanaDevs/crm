import { CallDialMode, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { normalizePhone } from './sms'

export type CallingSettings = {
  phoneDialer: { enabled: boolean }
  sipGateway: { enabled: boolean; wsUrl: string; sipDomain: string; stun: string }
  twilio: { enabled: boolean; fromNumber: string }
}

export const DEFAULT_CALLING_SETTINGS: CallingSettings = {
  phoneDialer: { enabled: true },
  sipGateway: { enabled: false, wsUrl: '', sipDomain: '', stun: '' },
  twilio: { enabled: false, fromNumber: '' },
}

export const callSessionInclude = {
  company: { select: { id: true, name: true } },
  contact: {
    select: { id: true, firstName: true, lastName: true, mobile: true, phone: true, email: true },
  },
  assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.CallSessionInclude

export async function getCallingSettings(): Promise<CallingSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'calling' } })
  if (!row || typeof row.value !== 'object' || row.value === null || Array.isArray(row.value)) {
    return structuredClone(DEFAULT_CALLING_SETTINGS)
  }
  const raw = row.value as Record<string, unknown>
  const phone = (raw.phoneDialer || {}) as Record<string, unknown>
  const sip = (raw.sipGateway || {}) as Record<string, unknown>
  const twilio = (raw.twilio || {}) as Record<string, unknown>
  return {
    phoneDialer: { enabled: phone.enabled !== false },
    sipGateway: {
      enabled: Boolean(sip.enabled),
      wsUrl: typeof sip.wsUrl === 'string' ? sip.wsUrl : '',
      sipDomain: typeof sip.sipDomain === 'string' ? sip.sipDomain : '',
      stun: typeof sip.stun === 'string' ? sip.stun : '',
    },
    twilio: {
      enabled: Boolean(twilio.enabled),
      fromNumber: typeof twilio.fromNumber === 'string' ? twilio.fromNumber : '',
    },
  }
}

export async function saveCallingSettings(next: CallingSettings) {
  return prisma.systemSetting.upsert({
    where: { key: 'calling' },
    create: { key: 'calling', value: next },
    update: { value: next },
  })
}

export function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_API_KEY?.trim() &&
      process.env.TWILIO_API_SECRET?.trim() &&
      process.env.TWILIO_TWIML_APP_SID?.trim()
  )
}

export function sipConfigured(settings?: CallingSettings) {
  const wsUrl = (settings?.sipGateway.wsUrl || process.env.SIP_GATEWAY_WS_URL || '').trim()
  return Boolean(
    process.env.SIP_GATEWAY_USER?.trim() && process.env.SIP_GATEWAY_PASSWORD?.trim() && wsUrl
  )
}

export async function getDialOptions() {
  const settings = await getCallingSettings()
  const phoneOk = settings.phoneDialer.enabled
  const sipOk = settings.sipGateway.enabled && sipConfigured(settings)
  const twilioOk = settings.twilio.enabled && twilioConfigured()
  return {
    settings,
    modes: {
      PHONE: {
        enabled: phoneOk,
        configured: true,
        available: phoneOk,
        label: 'Phone / SIM dialer',
      },
      SIP_GATEWAY: {
        enabled: settings.sipGateway.enabled,
        configured: sipConfigured(settings),
        available: sipOk,
        label: 'SIM / SIP gateway',
      },
      TWILIO: {
        enabled: settings.twilio.enabled,
        configured: twilioConfigured(),
        available: twilioOk,
        label: 'Twilio Voice',
      },
    },
    status: {
      twilioSecrets: twilioConfigured(),
      sipSecrets: Boolean(process.env.SIP_GATEWAY_USER?.trim() && process.env.SIP_GATEWAY_PASSWORD?.trim()),
    },
  }
}

export function assertDialModeAvailable(
  mode: CallDialMode,
  options: Awaited<ReturnType<typeof getDialOptions>>
) {
  const entry = options.modes[mode]
  if (!entry?.available) {
    return `Dial mode ${mode} is not enabled or not configured`
  }
  return null
}

export function resolveContactPhone(mobile?: string | null, phone?: string | null) {
  return normalizePhone(mobile) || normalizePhone(phone)
}

export async function findCompanyByPhone(e164: string) {
  const digits = e164.replace(/\D/g, '')
  const contacts = await prisma.contact.findMany({
    where: {
      OR: [{ mobile: { contains: digits.slice(-9) } }, { phone: { contains: digits.slice(-9) } }],
    },
    include: { company: { select: { id: true, name: true } } },
    take: 20,
  })
  for (const c of contacts) {
    const matched = resolveContactPhone(c.mobile, c.phone)
    if (matched === e164) {
      return { companyId: c.companyId, contactId: c.id, company: c.company }
    }
  }
  return null
}
