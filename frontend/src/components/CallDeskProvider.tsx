'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Device, Call as TwilioCall } from '@twilio/voice-sdk'
import JsSIP from 'jssip'
import { api } from '@/lib/api'
import type { CallDialMode, CallOutcome, CallSession, DialOptions } from '@/lib/types'
import { Button, ErrorBanner, Field, Input, Select, Textarea } from '@/components/ui'

const OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: 'CONNECTED', label: 'Connected' },
  { value: 'NO_ANSWER', label: 'No answer' },
  { value: 'BUSY', label: 'Busy' },
  { value: 'WRONG_NUMBER', label: 'Wrong number' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'NOT_INTERESTED', label: 'Not interested' },
  { value: 'REQUESTED_ANOTHER_CALL', label: 'Requested another call' },
  { value: 'DEMO_BOOKED', label: 'Demo booked' },
  { value: 'MEETING_BOOKED', label: 'Meeting booked' },
]

type StartOutboundInput = {
  phone: string
  dialMode: CallDialMode
  companyId?: string | null
  contactId?: string | null
  notes?: string | null
}

type CallDeskContextValue = {
  active: CallSession | null
  dialOptions: DialOptions | null
  refreshDialOptions: () => Promise<DialOptions | null>
  startOutbound: (input: StartOutboundInput) => Promise<CallSession>
  claimAndOpen: (session: CallSession) => Promise<CallSession>
  hangup: () => Promise<void>
  completeActive: (outcome: CallOutcome, notes: string) => Promise<void>
  error: string | null
  clearError: () => void
}

const CallDeskContext = createContext<CallDeskContextValue | undefined>(undefined)

export function CallDeskProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<CallSession | null>(null)
  const [dialOptions, setDialOptions] = useState<DialOptions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<CallOutcome>('CONNECTED')
  const [notes, setNotes] = useState('')
  const [completing, setCompleting] = useState(false)
  const twilioDeviceRef = useRef<Device | null>(null)
  const twilioCallRef = useRef<TwilioCall | null>(null)
  const sipUaRef = useRef<InstanceType<typeof JsSIP.UA> | null>(null)
  const sipSessionRef = useRef<{ terminate: () => void } | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const refreshDialOptions = useCallback(async () => {
    try {
      const opts = await api<DialOptions>('/api/calls/dial-options')
      setDialOptions(opts)
      return opts
    } catch {
      return null
    }
  }, [])

  const clearProviders = useCallback(() => {
    try {
      twilioCallRef.current?.disconnect()
    } catch {
      /* ignore */
    }
    twilioCallRef.current = null
    try {
      twilioDeviceRef.current?.destroy()
    } catch {
      /* ignore */
    }
    twilioDeviceRef.current = null
    try {
      sipSessionRef.current?.terminate()
    } catch {
      /* ignore */
    }
    sipSessionRef.current = null
    try {
      sipUaRef.current?.stop()
    } catch {
      /* ignore */
    }
    sipUaRef.current = null
  }, [])

  const connectPhone = useCallback(async (session: CallSession) => {
    window.location.href = `tel:${session.phoneE164}`
    const updated = await api<CallSession>(`/api/calls/${session.id}/start`, { method: 'POST' })
    setActive(updated)
    setActiveId(updated.id)
    startedAtRef.current = Date.now()
  }, [])

  const connectTwilio = useCallback(async (session: CallSession) => {
    const tokenRes = await api<{ token: string; identity: string; fromNumber: string | null }>(
      '/api/calls/token/twilio',
      { method: 'POST' }
    )
    const device = new Device(tokenRes.token, { logLevel: 1 })
    await device.register()
    twilioDeviceRef.current = device
    const call = await device.connect({
      params: { To: session.phoneE164, sessionId: session.id },
    })
    twilioCallRef.current = call
    const updated = await api<CallSession>(`/api/calls/${session.id}/start`, {
      method: 'POST',
      body: { providerCallSid: call.parameters.CallSid },
    })
    setActive(updated)
    setActiveId(updated.id)
    startedAtRef.current = Date.now()
    call.on('disconnect', () => {
      twilioCallRef.current = null
    })
  }, [])

  const connectSip = useCallback(async (session: CallSession) => {
    const cfg = await api<{
      wsUrl: string
      sipDomain: string
      stun: string
      username: string
      password: string
    }>('/api/calls/token/sip')
    if (!cfg.wsUrl || !cfg.username) throw new Error('SIP gateway is not fully configured')

    const socket = new JsSIP.WebSocketInterface(cfg.wsUrl)
    const uri = cfg.sipDomain.includes('@')
      ? cfg.sipDomain
      : `sip:${cfg.username}@${cfg.sipDomain || new URL(cfg.wsUrl).hostname}`
    const ua = new JsSIP.UA({
      sockets: [socket],
      uri,
      password: cfg.password,
      session_timers: false,
    })
    sipUaRef.current = ua

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('SIP registration timed out')), 15000)
      ua.on('registered', () => {
        clearTimeout(t)
        resolve()
      })
      ua.on('registrationFailed', (e: { cause?: string }) => {
        clearTimeout(t)
        reject(new Error(e.cause || 'SIP registration failed'))
      })
      ua.start()
    })

    const target = session.phoneE164.startsWith('sip:')
      ? session.phoneE164
      : `sip:${session.phoneE164.replace(/^\+/, '')}@${cfg.sipDomain || new URL(cfg.wsUrl).hostname}`

    const rtcSession = ua.call(target, {
      mediaConstraints: { audio: true, video: false },
      pcConfig: cfg.stun ? { iceServers: [{ urls: cfg.stun }] } : undefined,
    })
    sipSessionRef.current = rtcSession
    const updated = await api<CallSession>(`/api/calls/${session.id}/start`, { method: 'POST' })
    setActive(updated)
    setActiveId(updated.id)
    startedAtRef.current = Date.now()
  }, [])

  const beginDial = useCallback(
    async (session: CallSession) => {
      clearProviders()
      setError(null)
      setOutcome('CONNECTED')
      setNotes(session.notes || '')
      if (session.dialMode === 'PHONE') await connectPhone(session)
      else if (session.dialMode === 'TWILIO') await connectTwilio(session)
      else if (session.dialMode === 'SIP_GATEWAY') await connectSip(session)
      else throw new Error('Unknown dial mode')
    },
    [clearProviders, connectPhone, connectSip, connectTwilio]
  )

  const startOutbound = useCallback(
    async (input: StartOutboundInput) => {
      const session = await api<CallSession>('/api/calls/outbound', {
        method: 'POST',
        body: {
          phone: input.phone,
          dialMode: input.dialMode,
          companyId: input.companyId,
          contactId: input.contactId,
          notes: input.notes,
          queue: false,
        },
      })
      await beginDial(session)
      return session
    },
    [beginDial]
  )

  const claimAndOpen = useCallback(
    async (session: CallSession) => {
      const claimed =
        session.status === 'QUEUED'
          ? await api<CallSession>(`/api/calls/${session.id}/claim`, { method: 'POST' })
          : session
      await beginDial(claimed)
      return claimed
    },
    [beginDial]
  )

  const hangup = useCallback(async () => {
    clearProviders()
  }, [clearProviders])

  const completeActive = useCallback(
    async (selectedOutcome: CallOutcome, selectedNotes: string) => {
      if (!active) return
      setCompleting(true)
      try {
        clearProviders()
        const durationSec =
          startedAtRef.current != null ? Math.round((Date.now() - startedAtRef.current) / 1000) : undefined
        await api(`/api/calls/${active.id}/complete`, {
          method: 'POST',
          body: { outcome: selectedOutcome, notes: selectedNotes || null, durationSec },
        })
        setActive(null)
        setActiveId(null)
        startedAtRef.current = null
      } finally {
        setCompleting(false)
      }
    },
    [active, clearProviders]
  )

  async function uploadRecording(file: File) {
    if (!activeId) return
    const body = new FormData()
    body.append('file', file)
    const updated = await api<CallSession>(`/api/calls/${activeId}/recording`, { formData: body })
    setActive(updated)
  }

  const value = useMemo<CallDeskContextValue>(
    () => ({
      active,
      dialOptions,
      refreshDialOptions,
      startOutbound,
      claimAndOpen,
      hangup,
      completeActive,
      error,
      clearError: () => setError(null),
    }),
    [
      active,
      dialOptions,
      refreshDialOptions,
      startOutbound,
      claimAndOpen,
      hangup,
      completeActive,
      error,
    ]
  )

  return (
    <CallDeskContext.Provider value={value}>
      {children}
      {active ? (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border border-[var(--border)] bg-white p-4 shadow-2xl md:left-auto">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                {active.direction} · {active.dialMode.replace('_', ' ')} · {active.status}
              </p>
              <p className="text-sm font-semibold">
                {active.company?.name || 'Unknown company'}{' '}
                <span className="font-normal text-[var(--muted)]">{active.phoneE164}</span>
              </p>
              {active.contact ? (
                <p className="text-xs text-[var(--muted)]">
                  {active.contact.firstName} {active.contact.lastName}
                </p>
              ) : null}
            </div>
            <Button size="sm" variant="danger" onClick={() => void hangup()}>
              Hang up
            </Button>
          </div>
          <ErrorBanner message={error} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Outcome">
              <Select value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome)}>
                {OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          <Field label="Upload recording (optional)">
            <Input
              type="file"
              accept="audio/*,.mp3,.wav,.webm,.m4a"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  void uploadRecording(file).catch((err) =>
                    setError(err instanceof Error ? err.message : 'Recording upload failed')
                  )
                }
              }}
            />
          </Field>
          {active.recordingKey ? (
            <p className="text-xs text-emerald-700">Recording attached.</p>
          ) : null}
          <Button
            className="mt-3 w-full"
            disabled={completing}
            onClick={() =>
              void completeActive(outcome, notes).catch((err) =>
                setError(err instanceof Error ? err.message : 'Failed to complete call')
              )
            }
          >
            {completing ? 'Saving…' : 'Complete & save to CRM'}
          </Button>
        </div>
      ) : null}
    </CallDeskContext.Provider>
  )
}

export function useCallDesk() {
  const ctx = useContext(CallDeskContext)
  if (!ctx) throw new Error('useCallDesk must be used within CallDeskProvider')
  return ctx
}

export { OUTCOMES }
