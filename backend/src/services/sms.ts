import { prisma } from '../lib/prisma'

export type SmsResult = { ok: true; to: string; providerRef?: string } | { ok: false; to: string | null; error: string }

function config() {
  return {
    provider: (process.env.SMS_PROVIDER || '').trim().toLowerCase(),
    baseUrl: (process.env.SMSLENZ_BASE_URL || 'https://smslenz.lk').replace(/\/+$/, ''),
    userId: process.env.SMSLENZ_USER_ID?.trim() || '',
    apiKey: process.env.SMSLENZ_API_KEY?.trim() || '',
    senderId: process.env.SMSLENZ_SENDER_ID?.trim() || '',
    timeoutMs:
      Number(process.env.SMSLENZ_CONNECTION_TIMEOUT_MS || 30_000) + Number(process.env.SMSLENZ_READ_TIMEOUT_MS || 30_000),
    countryCode: (process.env.SMS_DEFAULT_COUNTRY_CODE || '94').replace(/\D/g, ''),
  }
}

export function smsStatus() {
  const c = config()
  return {
    provider: c.provider || null,
    senderId: c.senderId || null,
    configured: c.provider === 'smslenz' && Boolean(c.userId && c.apiKey && c.senderId),
  }
}

/** Checks credentials and credit without sending a message. */
export async function smsAccountStatus(): Promise<{ ok: true; status: string; balance: string } | { ok: false; error: string }> {
  const c = config()
  if (!smsStatus().configured) return { ok: false, error: 'SMS is not configured' }
  try {
    const response = await fetch(`${c.baseUrl}/api/account-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ user_id: c.userId, api_key: c.apiKey }),
      signal: AbortSignal.timeout(c.timeoutMs),
    })
    const body = (await response.json().catch(() => ({}))) as {
      success?: boolean
      message?: string
      data?: { status?: string; sms_credit_balance?: string }
    }
    if (!response.ok || body.success !== true) {
      return { ok: false, error: `smslenz ${response.status}: ${body.message || response.statusText}` }
    }
    return { ok: true, status: body.data?.status || 'unknown', balance: body.data?.sms_credit_balance || '?' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Account check failed' }
  }
}

/** Converts local formats (077 123 4567, 94771234567, 0094…) to E.164 (+94771234567). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const { countryCode } = config()
  const trimmed = raw.trim()
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else if (digits.startsWith('0')) {
    digits = countryCode + digits.slice(1)
  } else if (!digits.startsWith(countryCode) || digits.length <= 9) {
    digits = countryCode + digits
  }

  if (digits.length < 10 || digits.length > 15) return null
  return `+${digits}`
}

export async function sendSms(rawTo: string | null | undefined, message: string, followUpId?: string): Promise<SmsResult> {
  const to = normalizePhone(rawTo)
  const result = to ? await deliver(to, message) : { ok: false as const, to: null, error: `Invalid phone number: ${rawTo || '(none)'}` }

  await prisma.smsMessage
    .create({
      data: {
        followUpId,
        recipient: to || rawTo || '',
        body: message,
        status: result.ok ? 'SENT' : 'FAILED',
        providerRef: result.ok ? result.providerRef : undefined,
        error: result.ok ? undefined : result.error,
      },
    })
    .catch((err) => console.error('[sms] failed to log message', err))

  return result
}

async function deliver(to: string, message: string): Promise<SmsResult> {
  const c = config()
  if (c.provider !== 'smslenz') return { ok: false, to, error: 'SMS is disabled (SMS_PROVIDER is not smslenz)' }
  if (!c.userId || !c.apiKey || !c.senderId) {
    return { ok: false, to, error: 'smslenz is not configured (SMSLENZ_USER_ID, SMSLENZ_API_KEY, SMSLENZ_SENDER_ID)' }
  }

  try {
    const response = await fetch(`${c.baseUrl}/api/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        user_id: c.userId,
        api_key: c.apiKey,
        sender_id: c.senderId,
        contact: to,
        message: message.slice(0, 1500),
      }),
      signal: AbortSignal.timeout(c.timeoutMs),
    })
    const text = await response.text()
    let body: { success?: boolean; message?: string; data?: { campaign_id?: number | string } } = {}
    try {
      body = JSON.parse(text)
    } catch {
      // non-JSON error page
    }
    if (!response.ok || body.success !== true) {
      const detail = body.message || text.slice(0, 200) || response.statusText
      return { ok: false, to, error: `smslenz ${response.status}: ${detail}` }
    }
    const ref = body.data?.campaign_id
    return { ok: true, to, providerRef: ref === undefined ? undefined : String(ref) }
  } catch (err) {
    return { ok: false, to, error: err instanceof Error ? err.message : 'SMS request failed' }
  }
}
