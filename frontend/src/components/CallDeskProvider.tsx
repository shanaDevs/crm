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
import { Button, ErrorBanner, Field, Select, Textarea } from '@/components/ui'

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
  opportunityId?: string | null
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

type ActiveRecording = {
  recorder: MediaRecorder
  chunks: Blob[]
  stopTracks: () => void
}

const CallDeskContext = createContext<CallDeskContextValue | undefined>(undefined)

function pickRecorderMime() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

async function mixStreams(streams: MediaStream[]) {
  const tracks = streams.flatMap((s) => s.getAudioTracks()).filter((t) => t.readyState === 'live')
  if (tracks.length === 0) return null
  if (tracks.length === 1) return new MediaStream([tracks[0]])

  const audioCtx = new AudioContext()
  const dest = audioCtx.createMediaStreamDestination()
  for (const track of tracks) {
    const src = audioCtx.createMediaStreamSource(new MediaStream([track]))
    src.connect(dest)
  }
  return { stream: dest.stream, audioCtx }
}

export function CallDeskProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<CallSession | null>(null)
  const [dialOptions, setDialOptions] = useState<DialOptions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<CallOutcome>('CONNECTED')
  const [notes, setNotes] = useState('')
  const [completing, setCompleting] = useState(false)
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'uploading' | 'saved' | 'failed'>(
    'idle',
  )
  const twilioDeviceRef = useRef<Device | null>(null)
  const twilioCallRef = useRef<TwilioCall | null>(null)
  const sipUaRef = useRef<InstanceType<typeof JsSIP.UA> | null>(null)
  const sipSessionRef = useRef<{ terminate: () => void; connection?: RTCPeerConnection } | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const recordingRef = useRef<ActiveRecording | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
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

  const stopRecordingTracks = useCallback(() => {
    recordingRef.current?.stopTracks()
    recordingRef.current = null
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined)
      audioCtxRef.current = null
    }
  }, [])

  const startRecordingFromStreams = useCallback(async (streams: MediaStream[]) => {
    if (recordingRef.current) return
    const mixed = await mixStreams(streams)
    if (!mixed) return

    let stream: MediaStream
    if (mixed instanceof MediaStream) {
      stream = mixed
    } else {
      stream = mixed.stream
      audioCtxRef.current = mixed.audioCtx
    }

    const mimeType = pickRecorderMime()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recordingRef.current = {
      recorder,
      chunks,
      stopTracks: () => {
        stream.getTracks().forEach((t) => t.stop())
      },
    }
    recorder.start(1000)
    setRecordingStatus('recording')
  }, [])

  const startMicRecording = useCallback(async () => {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      await startRecordingFromStreams([mic])
    } catch (err) {
      setRecordingStatus('failed')
      setError(err instanceof Error ? err.message : 'Microphone permission is required to record the call')
    }
  }, [startRecordingFromStreams])

  const finalizeRecordingUpload = useCallback(async () => {
    const current = recordingRef.current
    const sessionId = activeIdRef.current
    if (!current || !sessionId) {
      stopRecordingTracks()
      return null
    }

    setRecordingStatus('uploading')
    const blob: Blob | null = await new Promise((resolve) => {
      const { recorder, chunks } = current
      if (recorder.state === 'inactive') {
        resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null)
        return
      }
      recorder.onstop = () => {
        resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null)
      }
      try {
        recorder.stop()
      } catch {
        resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null)
      }
    })

    stopRecordingTracks()
    if (!blob || blob.size === 0) {
      setRecordingStatus('failed')
      return null
    }

    try {
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const file = new File([blob], `call-${sessionId}.${ext}`, { type: blob.type || 'audio/webm' })
      const body = new FormData()
      body.append('file', file)
      const updated = await api<CallSession>(`/api/calls/${sessionId}/recording`, { formData: body })
      setActive(updated)
      setRecordingStatus('saved')
      return updated
    } catch (err) {
      setRecordingStatus('failed')
      setError(err instanceof Error ? err.message : 'Recording upload failed')
      return null
    }
  }, [stopRecordingTracks])

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

  const markAnswered = useCallback(async (providerCallSid?: string | null) => {
    const sessionId = activeIdRef.current
    if (!sessionId) return null
    try {
      const updated = await api<CallSession>(`/api/calls/${sessionId}/answered`, {
        method: 'POST',
        body: providerCallSid ? { providerCallSid } : {},
      })
      setActive(updated)
      if (!startedAtRef.current) startedAtRef.current = Date.now()
      return updated
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update call status')
      return null
    }
  }, [])

  const connectPhone = useCallback(
    async (session: CallSession) => {
      window.location.href = `tel:${session.phoneE164}`
      const updated = await api<CallSession>(`/api/calls/${session.id}/start`, { method: 'POST' })
      setActive(updated)
      setActiveId(updated.id)
      activeIdRef.current = updated.id
      // Native dialer can't report answer events; treat dial+mic as in progress.
      void markAnswered()
      void startMicRecording()
    },
    [markAnswered, startMicRecording],
  )

  const connectTwilio = useCallback(
    async (session: CallSession) => {
      const tokenRes = await api<{ token: string; identity: string; fromNumber: string | null }>(
        '/api/calls/token/twilio',
        { method: 'POST' },
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
      activeIdRef.current = updated.id

      const beginTwilioRec = () => {
        const local = typeof call.getLocalStream === 'function' ? call.getLocalStream() : null
        const remote = typeof call.getRemoteStream === 'function' ? call.getRemoteStream() : null
        const streams = [local, remote].filter(Boolean) as MediaStream[]
        if (streams.length) void startRecordingFromStreams(streams)
        else void startMicRecording()
      }

      const onAnswered = () => {
        void markAnswered(call.parameters.CallSid)
        beginTwilioRec()
      }

      call.on('ringing', () => {
        setActive((prev) => (prev ? { ...prev, status: 'RINGING' } : prev))
      })
      call.on('accept', onAnswered)
      call.on('disconnect', () => {
        twilioCallRef.current = null
        setActive((prev) => (prev && prev.status === 'IN_PROGRESS' ? { ...prev, status: 'IN_PROGRESS' } : prev))
      })
      call.on('cancel', () => {
        setActive((prev) => (prev ? { ...prev, status: 'CANCELLED' } : prev))
      })
      call.on('reject', () => {
        setActive((prev) => (prev ? { ...prev, status: 'MISSED' } : prev))
      })
    },
    [markAnswered, startMicRecording, startRecordingFromStreams],
  )

  const connectSip = useCallback(
    async (session: CallSession) => {
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
      activeIdRef.current = updated.id

      const beginSipRec = () => {
        const pc = rtcSession.connection as RTCPeerConnection | undefined
        if (!pc) {
          void startMicRecording()
          return
        }
        const streams: MediaStream[] = []
        const local = new MediaStream(pc.getSenders().map((s) => s.track).filter(Boolean) as MediaStreamTrack[])
        const remote = new MediaStream(pc.getReceivers().map((r) => r.track).filter(Boolean) as MediaStreamTrack[])
        if (local.getAudioTracks().length) streams.push(local)
        if (remote.getAudioTracks().length) streams.push(remote)
        if (streams.length) void startRecordingFromStreams(streams)
        else void startMicRecording()
      }

      const onAnswered = () => {
        void markAnswered()
        beginSipRec()
      }

      rtcSession.on('progress', () => {
        setActive((prev) => (prev ? { ...prev, status: 'RINGING' } : prev))
      })
      rtcSession.on('peerconnection', beginSipRec)
      rtcSession.on('accepted', onAnswered)
      rtcSession.on('confirmed', onAnswered)
      rtcSession.on('ended', () => {
        setActive((prev) => (prev ? { ...prev, status: prev.status === 'RINGING' ? 'MISSED' : prev.status } : prev))
      })
      rtcSession.on('failed', () => {
        setActive((prev) => (prev ? { ...prev, status: 'FAILED' } : prev))
      })
    },
    [markAnswered, startMicRecording, startRecordingFromStreams],
  )

  const beginDial = useCallback(
    async (session: CallSession) => {
      clearProviders()
      stopRecordingTracks()
      setError(null)
      setRecordingStatus('idle')
      setOutcome('CONNECTED')
      setNotes(session.notes || '')
      activeIdRef.current = session.id
      startedAtRef.current = null
      if (session.dialMode === 'PHONE') await connectPhone(session)
      else if (session.dialMode === 'TWILIO') await connectTwilio(session)
      else if (session.dialMode === 'SIP_GATEWAY') await connectSip(session)
      else throw new Error('Unknown dial mode')
    },
    [clearProviders, connectPhone, connectSip, connectTwilio, stopRecordingTracks],
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
          opportunityId: input.opportunityId,
          notes: input.notes,
          queue: false,
        },
      })
      await beginDial(session)
      return session
    },
    [beginDial],
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
    [beginDial],
  )

  const hangup = useCallback(async () => {
    clearProviders()
    await finalizeRecordingUpload()
  }, [clearProviders, finalizeRecordingUpload])

  const completeActive = useCallback(
    async (selectedOutcome: CallOutcome, selectedNotes: string) => {
      if (!active) return
      setCompleting(true)
      try {
        clearProviders()
        await finalizeRecordingUpload()
        const durationSec =
          startedAtRef.current != null ? Math.round((Date.now() - startedAtRef.current) / 1000) : undefined
        const opportunityId = active.opportunityId
        await api(`/api/calls/${active.id}/complete`, {
          method: 'POST',
          body: { outcome: selectedOutcome, notes: selectedNotes || null, durationSec },
        })
        setActive(null)
        setActiveId(null)
        activeIdRef.current = null
        startedAtRef.current = null
        setRecordingStatus('idle')
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('crm:call-completed', {
              detail: { opportunityId: opportunityId || null },
            }),
          )
        }
      } finally {
        setCompleting(false)
      }
    },
    [active, clearProviders, finalizeRecordingUpload],
  )

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
    ],
  )

  const recordingLabel =
    recordingStatus === 'recording'
      ? 'Recording…'
      : recordingStatus === 'uploading'
        ? 'Uploading recording…'
        : recordingStatus === 'saved' || active?.recordingKey
          ? 'Recording saved to CRM'
          : recordingStatus === 'failed'
            ? 'Recording failed'
            : 'Recording will start automatically'

  const statusLabel =
    active?.status === 'RINGING'
      ? 'Ringing…'
      : active?.status === 'IN_PROGRESS'
        ? 'In progress (answered)'
        : active?.status === 'MISSED'
          ? 'No answer / missed'
          : active?.status === 'FAILED'
            ? 'Call failed'
            : active?.status === 'CANCELLED'
              ? 'Cancelled'
              : active?.status || ''

  return (
    <CallDeskContext.Provider value={value}>
      {children}
      {active ? (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border border-[var(--border)] bg-white p-4 shadow-2xl md:left-auto">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                {active.direction} · {active.dialMode.replace('_', ' ')} · {statusLabel}
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
          <p
            className={`mb-2 text-xs ${
              recordingStatus === 'failed'
                ? 'text-red-600'
                : recordingStatus === 'saved' || active.recordingKey
                  ? 'text-emerald-700'
                  : 'text-[var(--muted)]'
            }`}
          >
            {recordingLabel}
          </p>
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
          <Button
            className="mt-3 w-full"
            disabled={completing || recordingStatus === 'uploading'}
            onClick={() =>
              void completeActive(outcome, notes).catch((err) =>
                setError(err instanceof Error ? err.message : 'Failed to complete call'),
              )
            }
          >
            {completing || recordingStatus === 'uploading' ? 'Saving…' : 'Complete & save to CRM'}
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
