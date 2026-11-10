'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fullName } from '@/lib/format'
import type { CallDialMode, CallLead, CallSession, DialOptions } from '@/lib/types'
import { OUTCOMES, useCallDesk } from '@/components/CallDeskProvider'
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui'

type Tab = 'queue' | 'leads' | 'history'

export default function CallsPage() {
  const { can } = useAuth()
  const canWrite = can('calls.write')
  const { startOutbound, claimAndOpen, refreshDialOptions, dialOptions, active } = useCallDesk()
  const [tab, setTab] = useState<Tab>('queue')
  const [queue, setQueue] = useState<CallSession[]>([])
  const [leads, setLeads] = useState<CallLead[]>([])
  const [history, setHistory] = useState<CallSession[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialOpen, setDialOpen] = useState(false)
  const [inboundOpen, setInboundOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<CallLead | null>(null)
  const [dialMode, setDialMode] = useState<CallDialMode>('PHONE')
  const [inboundPhone, setInboundPhone] = useState('')
  const [inboundNotes, setInboundNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [options, setOptions] = useState<DialOptions | null>(dialOptions)

  const availableModes = useMemo(() => {
    if (!options) return [] as CallDialMode[]
    return (Object.keys(options.modes) as CallDialMode[]).filter((m) => options.modes[m].available)
  }, [options])

  function loadAll() {
    return Promise.all([
      api<CallSession[]>('/api/calls/queue'),
      api<CallLead[]>(`/api/calls/leads${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`),
      api<CallSession[]>('/api/calls'),
      refreshDialOptions(),
    ])
      .then(([queueItems, leadItems, historyItems, opts]) => {
        setQueue(queueItems)
        setLeads(leadItems)
        setHistory(historyItems)
        if (opts) {
          setOptions(opts)
          const modes = (Object.keys(opts.modes) as CallDialMode[]).filter((m) => opts.modes[m].available)
          if (modes.length && !modes.includes(dialMode)) setDialMode(modes[0])
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load calling desk'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void loadAll()
    const id = window.setInterval(() => {
      if (tab === 'queue') {
        api<CallSession[]>('/api/calls/queue')
          .then(setQueue)
          .catch(() => undefined)
      }
    }, 8000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onPickNext() {
    setBusy(true)
    setError(null)
    try {
      const session = await api<CallSession>('/api/calls/queue/pick-next', { method: 'POST' })
      await claimAndOpen(session)
      await loadAll()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to pick next call')
    } finally {
      setBusy(false)
    }
  }

  function openDial(lead: CallLead) {
    setSelectedLead(lead)
    setDialOpen(true)
  }

  async function submitDial(e: FormEvent) {
    e.preventDefault()
    if (!selectedLead) return
    setBusy(true)
    setError(null)
    try {
      await startOutbound({
        phone: selectedLead.phoneE164,
        dialMode,
        companyId: selectedLead.companyId,
        contactId: selectedLead.contact.id,
      })
      setDialOpen(false)
      await loadAll()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start call')
    } finally {
      setBusy(false)
    }
  }

  async function submitInbound(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/api/calls/inbound', {
        method: 'POST',
        body: {
          phone: inboundPhone,
          notes: inboundNotes || null,
          dialMode: availableModes[0] || 'PHONE',
        },
      })
      setInboundOpen(false)
      setInboundPhone('')
      setInboundNotes('')
      setTab('queue')
      await loadAll()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to queue inbound call')
    } finally {
      setBusy(false)
    }
  }

  async function playRecording(key: string) {
    try {
      const { url } = await api<{ url: string }>(`/api/files/signed-url?key=${encodeURIComponent(key)}`)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to open recording')
    }
  }

  if (!can('calls.read')) {
    return <EmptyState title="No access" description="You need the calling permission to open this desk." />
  }

  return (
    <div className={active ? 'pb-48' : undefined}>
      <PageHeader
        title="Calling"
        description="Lead queue, dial with Phone / SIP gateway / Twilio, and track every call in the CRM."
        actions={
          <>
            {canWrite ? (
              <Button variant="secondary" onClick={() => setInboundOpen(true)}>
                Log inbound
              </Button>
            ) : null}
            {canWrite ? (
              <Button disabled={busy || queue.length === 0} onClick={() => void onPickNext()}>
                Pick next
              </Button>
            ) : null}
          </>
        }
      />
      <ErrorBanner message={error} />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['queue', `Queue (${queue.length})`],
            ['leads', `Leads (${leads.length})`],
            ['history', 'History'],
          ] as const
        ).map(([id, label]) => (
          <Button key={id} size="sm" variant={tab === id ? 'primary' : 'secondary'} onClick={() => setTab(id)}>
            {label}
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={() => void loadAll()}>
          Refresh
        </Button>
      </div>

      {options ? (
        <p className="mb-4 text-xs text-[var(--muted)]">
          Dial modes:{' '}
          {(Object.keys(options.modes) as CallDialMode[])
            .map((m) => `${options.modes[m].label}${options.modes[m].available ? '' : ' (off)'}`)
            .join(' · ')}
          . Toggle them in Settings.
        </p>
      ) : null}

      {loading ? (
        <LoadingState />
      ) : tab === 'queue' ? (
        queue.length === 0 ? (
          <EmptyState title="Queue is empty" description="Inbound and queued outbound calls appear here." />
        ) : (
          <div className="space-y-2">
            {queue.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white p-4"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {item.direction} · {item.phoneE164}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {item.company ? (
                      <Link href={`/customers/${item.company.id}`} className="hover:text-[var(--primary)]">
                        {item.company.name}
                      </Link>
                    ) : (
                      'Unknown company'
                    )}
                    {item.contact ? ` · ${item.contact.firstName} ${item.contact.lastName}` : ''}
                    {` · ${item.dialMode}`}
                  </p>
                </div>
                {canWrite ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void claimAndOpen(item)
                        .then(() => loadAll())
                        .catch((err) => setError(err instanceof Error ? err.message : 'Claim failed'))
                    }
                  >
                    Claim &amp; call
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : tab === 'leads' ? (
        <div>
          <form
            className="mb-4 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setLoading(true)
              void loadAll()
            }}
          >
            <Input
              className="max-w-sm"
              placeholder="Search company, contact, phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          {leads.length === 0 ? (
            <EmptyState title="No dialable leads" description="Customers need a mobile or phone number on a contact." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-slate-50 text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Contact</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Level</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={`${lead.companyId}-${lead.contact.id}`} className="border-b border-[var(--border)]">
                      <td className="px-3 py-2">
                        <Link href={`/customers/${lead.companyId}`} className="font-medium hover:text-[var(--primary)]">
                          {lead.companyName}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {lead.contact.firstName} {lead.contact.lastName}
                        {lead.contact.jobTitle ? (
                          <span className="block text-xs text-[var(--muted)]">{lead.contact.jobTitle}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{lead.phoneE164}</td>
                      <td className="px-3 py-2 text-xs">{lead.level?.name || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {canWrite ? (
                          <Button size="sm" onClick={() => openDial(lead)}>
                            Call
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : history.length === 0 ? (
        <EmptyState title="No calls yet" description="Completed and in-progress sessions show up here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-slate-50 text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Recording</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]">
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">
                    {new Date(item.createdAt).toLocaleString()}
                    {item.durationSec != null ? (
                      <span className="block">{Math.round(item.durationSec / 60)}m {item.durationSec % 60}s</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {item.company ? (
                      <Link href={`/customers/${item.company.id}`} className="hover:text-[var(--primary)]">
                        {item.company.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{item.phoneE164}</td>
                  <td className="px-3 py-2 text-xs">
                    {item.direction}
                    <span className="block text-[var(--muted)]">{item.dialMode}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{item.status}</td>
                  <td className="px-3 py-2 text-xs">
                    {OUTCOMES.find((o) => o.value === item.outcome)?.label || item.outcome || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{fullName(item.assignee)}</td>
                  <td className="px-3 py-2">
                    {item.recordingKey ? (
                      <Button size="sm" variant="secondary" onClick={() => void playRecording(item.recordingKey!)}>
                        Play
                      </Button>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={dialOpen} title="Place call" onClose={() => setDialOpen(false)}>
        <form onSubmit={submitDial} className="space-y-3">
          <p className="text-sm">
            {selectedLead?.companyName} · {selectedLead?.contact.firstName} {selectedLead?.contact.lastName}
          </p>
          <p className="font-mono text-sm">{selectedLead?.phoneE164}</p>
          <Field label="Dial mode">
            <Select value={dialMode} onChange={(e) => setDialMode(e.target.value as CallDialMode)} required>
              {availableModes.length === 0 ? <option value="PHONE">Phone dialer</option> : null}
              {availableModes.map((m) => (
                <option key={m} value={m}>
                  {options?.modes[m].label || m}
                </option>
              ))}
            </Select>
          </Field>
          {dialMode === 'PHONE' ? (
            <p className="text-xs text-[var(--muted)]">
              Opens your phone dialer so you can call on your own SIM. Complete the outcome when finished.
            </p>
          ) : null}
          {dialMode === 'TWILIO' ? (
            <p className="text-xs text-[var(--muted)]">Uses Twilio Voice in the browser. Requires Twilio keys in Settings.</p>
          ) : null}
          {dialMode === 'SIP_GATEWAY' ? (
            <p className="text-xs text-[var(--muted)]">
              Uses your SIP / SIM gateway softphone. Requires gateway WebSocket URL and credentials.
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy || availableModes.length === 0}>
            {busy ? 'Connecting…' : 'Start call'}
          </Button>
        </form>
      </Modal>

      <Modal open={inboundOpen} title="Log inbound call" onClose={() => setInboundOpen(false)}>
        <form onSubmit={submitInbound} className="space-y-3">
          <p className="text-xs text-[var(--muted)]">
            Adds a call to the queue for an agent to pick up (used when the customer called your phone/SIM).
          </p>
          <Field label="Caller number">
            <Input required value={inboundPhone} onChange={(e) => setInboundPhone(e.target.value)} placeholder="0771234567" />
          </Field>
          <Field label="Notes">
            <Textarea value={inboundNotes} onChange={(e) => setInboundNotes(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Saving…' : 'Add to queue'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
