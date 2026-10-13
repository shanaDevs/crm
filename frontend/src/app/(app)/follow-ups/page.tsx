'use client'

import Link from 'next/link'
import { FormEvent, use, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Company, FollowUp, TeamMember } from '@/lib/types'
import { formatDateTime, fullName, fromDatetimeLocalValue, statusLabel, toDatetimeLocalValue } from '@/lib/format'
import { ACTIVITY_TYPES, PURPOSES, REMINDERS } from '@/components/FollowUpScheduler'
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
  { id: 'all', label: 'All' },
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

type Draft = {
  companyId: string
  contactId: string
  assigneeId: string
  scheduledAt: string
  activityType: string
  purpose: string
  priority: string
  reminderMinutes: number
  status: string
  notes: string
  smsCustomer: boolean
  smsAssignee: boolean
}

function emptyDraft(companyId = '', assigneeId = ''): Draft {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(10, 0, 0, 0)
  return {
    companyId,
    contactId: '',
    assigneeId,
    scheduledAt: toDatetimeLocalValue(tomorrow),
    activityType: 'CALL',
    purpose: 'INTRODUCTION',
    priority: 'MEDIUM',
    reminderMinutes: 60,
    status: 'SCHEDULED',
    notes: '',
    smsCustomer: true,
    smsAssignee: true,
  }
}

function draftFrom(item: FollowUp): Draft {
  return {
    companyId: item.companyId || item.company?.id || '',
    contactId: item.contactId || '',
    assigneeId: item.assigneeId || item.assignee?.id || '',
    scheduledAt: toDatetimeLocalValue(item.scheduledAt),
    activityType: item.activityType,
    purpose: item.purpose,
    priority: item.priority,
    reminderMinutes: item.reminderMinutes ?? 15,
    status: item.status === 'OVERDUE' ? 'SCHEDULED' : item.status,
    notes: item.notes || '',
    smsCustomer: Boolean(item.smsCustomer),
    smsAssignee: Boolean(item.smsAssignee),
  }
}

export default function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = use(searchParams)
  const presetCompanyId = typeof query.companyId === 'string' ? query.companyId : ''
  const { user, can } = useAuth()
  const canWrite = can('followups.write')

  const [view, setView] = useState<(typeof VIEWS)[number]['id']>(presetCompanyId ? 'all' : 'today')
  const [items, setItems] = useState<FollowUp[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [active, setActive] = useState<FollowUp | null>(null)
  const [mode, setMode] = useState<'call' | 'reschedule' | 'form' | null>(query.new ? 'form' : null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(presetCompanyId))
  const [outcome, setOutcome] = useState('CONNECTED')
  const [notes, setNotes] = useState('')
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocalValue())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function load(nextView = view) {
    return api<FollowUp[]>(`/api/follow-ups?view=${nextView}`)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load follow-ups'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  useEffect(() => {
    if (!canWrite) return
    api<Company[]>('/api/customers')
      .then(setCompanies)
      .catch(() => undefined)
    if (can('team.read')) {
      api<TeamMember[]>('/api/team')
        .then((members) => setTeam(members.filter((m) => m.isActive && m.role.code !== 'CUSTOMER')))
        .catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite])

  const visibleItems = presetCompanyId ? items.filter((i) => (i.companyId || i.company?.id) === presetCompanyId) : items
  const draftCompany = companies.find((c) => c.id === draft.companyId)
  const draftContact = draftCompany?.contacts?.find((c) => c.id === draft.contactId) || draftCompany?.contacts?.[0]
  const customerNumber = draftContact?.mobile || draftContact?.phone || ''

  function openCreate() {
    setEditingId(null)
    setDraft(emptyDraft(presetCompanyId, user?.id || ''))
    setFormError(null)
    setMode('form')
  }

  function openEdit(item: FollowUp) {
    setEditingId(item.id)
    setDraft(draftFrom(item))
    setFormError(null)
    setMode('form')
  }

  function closeModal() {
    setMode(null)
    setActive(null)
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const body = {
      contactId: draft.contactId || null,
      scheduledAt: fromDatetimeLocalValue(draft.scheduledAt),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      activityType: draft.activityType,
      purpose: draft.purpose,
      priority: draft.priority,
      reminderMinutes: draft.reminderMinutes,
      notes: draft.notes.trim() || null,
      assigneeId: draft.assigneeId || user?.id,
      smsCustomer: draft.smsCustomer && Boolean(customerNumber),
      smsAssignee: draft.smsAssignee,
    }
    try {
      if (editingId) {
        await api(`/api/follow-ups/${editingId}`, { method: 'PATCH', body: { ...body, status: draft.status } })
      } else {
        await api('/api/follow-ups', { method: 'POST', body: { ...body, companyId: draft.companyId } })
      }
      closeModal()
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save follow-up')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(item: FollowUp) {
    if (!window.confirm(`Delete this ${statusLabel(item.activityType).toLowerCase()} with ${item.company?.name}?`)) return
    setError(null)
    try {
      await api(`/api/follow-ups/${item.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete follow-up')
    }
  }

  async function submitCall(e: FormEvent) {
    e.preventDefault()
    if (!active) return
    setSaving(true)
    try {
      await api(`/api/follow-ups/${active.id}/log-call`, {
        method: 'POST',
        body: { outcome, notes: notes || null },
      })
      closeModal()
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
      closeModal()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reschedule')
    } finally {
      setSaving(false)
    }
  }

  const assigneeOptions = team.length
    ? team
    : user
      ? [{ id: user.id, firstName: user.firstName, lastName: user.lastName }]
      : []

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description={
          presetCompanyId
            ? `Calls, demos, and scheduled activities for ${companies.find((c) => c.id === presetCompanyId)?.name || 'this customer'}.`
            : 'Calls, demos, and scheduled activities.'
        }
        actions={
          <>
            {presetCompanyId ? (
              <Link href="/follow-ups">
                <Button variant="secondary">Show all customers</Button>
              </Link>
            ) : null}
            {canWrite ? <Button onClick={openCreate}>New follow-up</Button> : null}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setLoading(true)
              setView(tab.id)
            }}
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
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title={view === 'all' ? 'No follow-ups' : `No ${view} follow-ups`}
          description={canWrite ? 'Use “New follow-up” to schedule one.' : undefined}
        />
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item) => {
            const open = item.status !== 'COMPLETED' && item.status !== 'CANCELLED'
            return (
              <div key={item.id} className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {item.company ? (
                      <Link href={`/customers/${item.company.id}`} className="font-semibold hover:text-[var(--primary)]">
                        {item.company.name}
                      </Link>
                    ) : null}
                    <p className="text-sm text-[var(--muted)]">
                      {statusLabel(item.activityType)} · {statusLabel(item.purpose)}
                      {item.contact ? ` · ${fullName(item.contact)}` : ''}
                    </p>
                    <p className="mt-1 text-sm">{formatDateTime(item.scheduledAt)}</p>
                    {item.notes ? <p className="mt-2 text-sm text-[var(--muted)]">{item.notes}</p> : null}
                    {item.smsCustomer || item.smsAssignee ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        SMS reminder to{' '}
                        {[item.smsCustomer && 'customer', item.smsAssignee && 'assignee'].filter(Boolean).join(' and ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                      <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                      <Badge tone={priorityTone(item.priority)}>{statusLabel(item.priority)}</Badge>
                    </div>
                    <p className="text-xs text-[var(--muted)]">Assignee: {fullName(item.assignee)}</p>
                    {canWrite ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        {open ? (
                          <>
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
                          </>
                        ) : null}
                        <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void onDelete(item)}>
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={mode === 'form'} title={editingId ? 'Edit follow-up' : 'New follow-up'} onClose={closeModal} wide>
        <form onSubmit={submitForm} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ErrorBanner message={formError} />
          </div>
          <Field label="Customer" className="sm:col-span-2">
            <Select
              required
              disabled={Boolean(editingId)}
              value={draft.companyId}
              onChange={(e) => setDraft((d) => ({ ...d, companyId: e.target.value, contactId: '' }))}
            >
              <option value="">Select customer</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact">
            <Select value={draft.contactId} onChange={(e) => setDraft((d) => ({ ...d, contactId: e.target.value }))}>
              <option value="">{draftCompany?.contacts?.length ? 'Primary contact' : 'No contacts'}</option>
              {draftCompany?.contacts?.map((c) => (
                <option key={c.id} value={c.id}>
                  {fullName(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assigned to">
            <Select
              value={draft.assigneeId || user?.id || ''}
              onChange={(e) => setDraft((d) => ({ ...d, assigneeId: e.target.value }))}
            >
              {assigneeOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {fullName(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date & time">
            <Input
              type="datetime-local"
              required
              value={draft.scheduledAt}
              onChange={(e) => setDraft((d) => ({ ...d, scheduledAt: e.target.value }))}
            />
          </Field>
          <Field label="Activity">
            <Select value={draft.activityType} onChange={(e) => setDraft((d) => ({ ...d, activityType: e.target.value }))}>
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {statusLabel(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Purpose">
            <Select value={draft.purpose} onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}>
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {statusLabel(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}>
              {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                <option key={p} value={p}>
                  {statusLabel(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reminder">
            <Select
              value={draft.reminderMinutes}
              onChange={(e) => setDraft((d) => ({ ...d, reminderMinutes: Number(e.target.value) }))}
            >
              {REMINDERS.map((r) => (
                <option key={r.minutes} value={r.minutes}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          {editingId ? (
            <Field label="Status">
              <Select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
                {['SCHEDULED', 'COMPLETED', 'CANCELLED'].map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
          </Field>
          <div className="space-y-2 text-sm sm:col-span-2">
            <p className="font-medium">SMS reminder</p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={draft.smsCustomer && Boolean(customerNumber)}
                disabled={!customerNumber}
                onChange={(e) => setDraft((d) => ({ ...d, smsCustomer: e.target.checked }))}
              />
              Text the customer{customerNumber ? ` (${customerNumber})` : ' (no mobile number on file)'}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={draft.smsAssignee}
                onChange={(e) => setDraft((d) => ({ ...d, smsAssignee: e.target.checked }))}
              />
              Text the assigned staff member
            </label>
          </div>
          <Button type="submit" disabled={saving} className="sm:col-span-2">
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create follow-up'}
          </Button>
        </form>
      </Modal>

      <Modal open={mode === 'call'} title="Log call" onClose={closeModal}>
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

      <Modal open={mode === 'reschedule'} title="Reschedule" onClose={closeModal}>
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
