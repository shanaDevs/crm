import twilio from 'twilio'
import { twilioConfigured } from './calling'

const { AccessToken } = twilio.jwt
const { VoiceGrant } = AccessToken

export function createTwilioVoiceToken(identity: string): { token: string; identity: string } | { error: string } {
  if (!twilioConfigured()) return { error: 'Twilio is not configured' }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim()
  const apiKey = process.env.TWILIO_API_KEY!.trim()
  const apiSecret = process.env.TWILIO_API_SECRET!.trim()
  const appSid = process.env.TWILIO_TWIML_APP_SID!.trim()

  const token = new AccessToken(accountSid, apiKey, apiSecret, { identity, ttl: 3600 })
  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: appSid,
      incomingAllow: true,
    })
  )
  return { token: token.toJwt(), identity }
}

export function validateTwilioSignature(
  authToken: string,
  signature: string | undefined,
  url: string,
  params: Record<string, string>
): boolean {
  if (!signature || !authToken) return false
  return twilio.validateRequest(authToken, signature, url, params)
}

export function twilioWebhookBaseUrl() {
  return (process.env.TWILIO_WEBHOOK_BASE_URL || '').replace(/\/+$/, '')
}
