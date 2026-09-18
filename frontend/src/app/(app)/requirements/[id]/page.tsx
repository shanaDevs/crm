'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import type { Requirement, TeamMember } from '@/lib/types'
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

const STATUSES = [
  'SUBMITTED',
  'NEEDS_CLARIFICATION',
  'REVIEWED',
  'APPROVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'QA',
  'CUSTOMER_REVIEW',
  'COMPLETED',
  'REJECTED',
  'ON_HOLD',
  'CANCELLED',
]

export default function RequirementDetailPage() {
  const params = useParams<{ id: string }>()
  const { canManage, isCustomer } = useAuth()
  const [item, setItem] = useState<Requirement | null>(null)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [status, setStatus] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [visibility, setVisibility] = useState('INTERNAL')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!params.id) return
    setLoading(true)
    try {
      const req = await api<Requirement>(`/api/requirements/${params.id}`)
      setItem(req)
      setStatus(req.status)
      setAssigneeIds(req.assignments?.filter((a) => !a.unassignedAt).map((a) => a.userId) || [])
      if (canManage) {
        const users = await api<TeamMember[]>('/api/team').catch(() => [] as TeamMember[])
        setTeam(users.filter((u) => u.role.code === 'DEVELOPER' || u.role.code === 'IT_MANAGER'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requirement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  async function updateStatus() {
    if (!item) return
    setSaving(true)
    try {
      await api(`/api/requirements/${item.id}/status`, { method: 'PATCH', body: { status } })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update status')
    } finally {
      setSaving(false)
    }
  }

  async function assign() {
    if (!item || !assigneeIds.length) return
    setSaving(true)
    try {
      await api(`/api/requirements/${item.id}/assign`, {
        method: 'POST',
        body: { developerIds: assigneeIds },
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign')
    } finally {
      setSaving(false)
    }
  }

  async function addComment(e: FormEvent) {
    e.preventDefault()
    if (!item || !comment.trim()) return
    setSaving(true)
    try {
      await api(`/api/requirements/${item.id}/comments`, {
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
  if (error && !item) return <ErrorBanner message={error} />
  if (!item) return null

  return (
    <div>
      <PageHeader
        title={item.title}
        description={`${item.company?.name || ''} · ${item.product?.name || ''}`}
        actions={
          <div className="flex gap-2">
            <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
            <Badge tone={priorityTone(item.priority)}>{statusLabel(item.priority)}</Badge>
          </div>
        }
      />
      <ErrorBanner message={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <p className="whitespace-pre-wrap text-sm">{item.description}</p>
          {item.businessProblem ? (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-[var(--muted)]">Business problem</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{item.businessProblem}</p>
            </div>
          ) : null}
          {item.expectedResult ? (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-[var(--muted)]">Expected result</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{item.expectedResult}</p>
            </div>
          ) : null}
        </Card>

        <Card title="Assignments">
          {item.assignments?.filter((a) => !a.unassignedAt).length ? (
            <ul className="space-y-2 text-sm">
              {item.assignments
                .filter((a) => !a.unassignedAt)
                .map((a) => (
                  <li key={a.id}>{fullName(a.user)}</li>
                ))}
            </ul>
          ) : (
            <EmptyState title="Unassigned" />
          )}
          {canManage ? (
            <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
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
              <Field label="Assign developers">
                <Select
                  multiple
                  className="h-28"
                  value={assigneeIds}
                  onChange={(e) =>
                    setAssigneeIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                  }
                >
                  {team.map((member) => (
                    <option key={member.id} value={member.id}>
                      {fullName(member)} ({member.role.name})
                    </option>
                  ))}
                </Select>
              </Field>
              <Button size="sm" variant="secondary" onClick={() => void assign()} disabled={saving}>
                Save assignment
              </Button>
            </div>
          ) : null}
        </Card>

        <Card title="Comments" className="lg:col-span-3">
          {!item.comments?.length ? (
            <EmptyState title="No comments yet" />
          ) : (
            <ul className="mb-4 space-y-3">
              {item.comments.map((c) => (
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
