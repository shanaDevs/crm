'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import type { TeamMember, Ticket } from '@/lib/types'
import { formatDateTime, fullName, statusLabel } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
  priorityTone,
  statusTone,
} from '@/components/ui'

const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'RESOLVED', 'CLOSED', 'CANCELLED']

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>()
  const { canManage, isCustomer } = useAuth()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [status, setStatus] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [comment, setComment] = useState('')
  const [visibility, setVisibility] = useState('INTERNAL')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!params.id) return
    setLoading(true)
    try {
      const data = await api<Ticket>(`/api/tickets/${params.id}`)
      setTicket(data)
      setStatus(data.status)
      setAssigneeId(data.assignee?.id || '')
      if (canManage) {
        const users = await api<TeamMember[]>('/api/team').catch(() => [] as TeamMember[])
        setTeam(users)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  async function updateStatus() {
    if (!ticket) return
    setSaving(true)
    try {
      await api(`/api/tickets/${ticket.id}/status`, { method: 'PATCH', body: { status } })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update status')
    } finally {
      setSaving(false)
    }
  }

  async function assign() {
    if (!ticket) return
    setSaving(true)
    try {
      await api(`/api/tickets/${ticket.id}/assign`, { method: 'PATCH', body: { assigneeId } })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign')
    } finally {
      setSaving(false)
    }
  }

  async function addComment(e: FormEvent) {
    e.preventDefault()
    if (!ticket || !comment.trim()) return
    setSaving(true)
    try {
      await api(`/api/tickets/${ticket.id}/comments`, {
        method: 'POST',
        body: {
          body: comment,
          visibility: isCustomer ? 'CUSTOMER_VISIBLE' : visibility,
        },
      })
      setComment('')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add comment')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />
  if (error && !ticket) return <ErrorBanner message={error} />
  if (!ticket) return null

  return (
    <div>
      <PageHeader
        title={`${ticket.ticketNumber}: ${ticket.title}`}
        description={`${ticket.company?.name || ''} · ${ticket.product?.name || ''} · ${statusLabel(ticket.type)}`}
        actions={
          <div className="flex gap-2">
            <Badge tone={statusTone(ticket.status)}>{statusLabel(ticket.status)}</Badge>
            <Badge tone={priorityTone(ticket.priority)}>{statusLabel(ticket.priority)}</Badge>
          </div>
        }
      />
      <ErrorBanner message={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Description" className="lg:col-span-2">
          <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
          <p className="mt-4 text-xs text-[var(--muted)]">Assignee: {fullName(ticket.assignee)}</p>
        </Card>

        <Card title="Manage">
          <div className="space-y-3">
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button size="sm" onClick={() => void updateStatus()} disabled={saving}>
              Update status
            </Button>
            {canManage ? (
              <>
                <Field label="Assignee">
                  <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {team.map((member) => (
                      <option key={member.id} value={member.id}>
                        {fullName(member)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button size="sm" variant="secondary" onClick={() => void assign()} disabled={saving}>
                  Save assignee
                </Button>
              </>
            ) : null}
          </div>
        </Card>

        <Card title="Comments" className="lg:col-span-3">
          {!ticket.comments?.length ? (
            <EmptyState title="No comments yet" />
          ) : (
            <ul className="mb-4 space-y-3">
              {ticket.comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{fullName(c.author)}</span>
                    <Badge tone={c.visibility === 'INTERNAL' ? 'slate' : 'teal'}>
                      {statusLabel(c.visibility)}
                    </Badge>
                    <span className="text-xs text-[var(--muted)]">{formatDateTime(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addComment} className="space-y-3">
            <Field label="Add comment">
              <Textarea required value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
            {!isCustomer ? (
              <Field label="Visibility">
                <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                  <option value="INTERNAL">Internal</option>
                  <option value="CUSTOMER_VISIBLE">Customer visible</option>
                </Select>
              </Field>
            ) : null}
            <Button type="submit" disabled={saving}>
              Post comment
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
