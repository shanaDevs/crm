'use client'

import { FormEvent, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { FollowUp } from '@/lib/types'
import { formatDateTime, fullName, fromDatetimeLocalValue, statusLabel, toDatetimeLocalValue } from '@/lib/format'
import {
  Badge,
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
  cn,
  priorityTone,
  statusTone,
} from '@/components/ui'

const VIEWS = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
] as const

const OUTCOMES = [
  'CONNECTED',
  'NO_ANSWER',
  'BUSY',
  'WRONG_NUMBER',
  'INTERESTED',
  'NOT_INTERESTED',
  'REQUESTED_ANOTHER_CALL',
  'DEMO_BOOKED',
  'MEETING_BOOKED',
]

export default function FollowUpsPage() {
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('today')
  const [items, setItems] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<FollowUp | null>(null)
  const [mode, setMode] = useState<'call' | 'reschedule' | null>(null)
  const [outcome, setOutcome] = useState('CONNECTED')
  const [notes, setNotes] = useState('')
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocalValue())
  const [saving, setSaving] = useState(false)

  async function load(nextView = view) {
    setLoading(true)
    setError(null)
    try {
      const data = await api<FollowUp[]>(`/api/follow-ups?view=${nextView}`)
      setItems(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load follow-ups')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  async function submitCall(e: FormEvent) {
    e.preventDefault()
    if (!active) return
    setSaving(true)
    try {
      await api(`/api/follow-ups/${active.id}/log-call`, {
        method: 'POST',
        body: { outcome, notes: notes || null },
      })
      setMode(null)
      setActive(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to log call')
    } finally {
      setSaving(false)
    }
  }

  async function submitReschedule(e: FormEvent) {
    e.preventDefault()
    if (!active) return
    setSaving(true)
    try {
      await api(`/api/follow-ups/${active.id}/reschedule`, {
        method: 'POST',
        body: { scheduledAt: fromDatetimeLocalValue(scheduledAt), notes: notes || null },
      })
      setMode(null)
      setActive(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reschedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Follow-ups" description="Calls, demos, and scheduled activities." />
      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition',
              view === tab.id
                ? 'bg-[var(--primary)] text-white'
                : 'border border-[var(--border)] bg-white text-[var(--muted)] hover:text-[var(--foreground)]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title={`No ${view} follow-ups`} />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.company?.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {item.activityType} · {statusLabel(item.purpose)}
                    {item.contact ? ` · ${fullName(item.contact)}` : ''}
                  </p>
                  <p className="mt-1 text-sm">{formatDateTime(item.scheduledAt)}</p>
                  {item.notes ? <p className="mt-2 text-sm text-[var(--muted)]">{item.notes}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                    <Badge tone={priorityTone(item.priority)}>{statusLabel(item.priority)}</Badge>
                  </div>
                  <p className="text-xs text-[var(--muted)]">Assignee: {fullName(item.assignee)}</p>
                  {item.status !== 'COMPLETED' && item.status !== 'CANCELLED' ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setActive(item)
                          setOutcome('CONNECTED')
                          setNotes('')
                          setMode('call')
                        }}
                      >
                        Log call
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setActive(item)
                          setScheduledAt(toDatetimeLocalValue())
                          setNotes('')
                          setMode('reschedule')
                        }}
                      >
                        Reschedule
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={mode === 'call'} title="Log call" onClose={() => setMode(null)}>
        <form onSubmit={submitCall} className="space-y-3">
          <p className="text-sm text-[var(--muted)]">{active?.company?.name}</p>
          <Field label="Outcome">
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {statusLabel(o)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Save call log'}
          </Button>
        </form>
      </Modal>

      <Modal open={mode === 'reschedule'} title="Reschedule" onClose={() => setMode(null)}>
        <form onSubmit={submitReschedule} className="space-y-3">
          <Field label="New date & time">
            <Input type="datetime-local" required value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Reschedule'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
