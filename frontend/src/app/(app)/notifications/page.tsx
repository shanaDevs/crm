'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { NotificationItem } from '@/lib/types'
import { formatDateTime, relativeTime } from '@/lib/format'
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  cn,
} from '@/components/ui'

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [prefs, setPrefs] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [list, preferences] = await Promise.all([
        api<NotificationItem[]>('/api/notifications'),
        api<Record<string, unknown> | null>('/api/notifications/preferences'),
      ])
      setItems(list)
      setPrefs(preferences)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function markAllRead() {
    await api('/api/notifications/read-all', { method: 'POST' })
    await load()
  }

  async function markRead(id: string) {
    await api(`/api/notifications/${id}/read`, { method: 'PATCH' })
    await load()
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="In-app alerts and preference overview."
        actions={
          <Button variant="secondary" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
        }
      />
      <ErrorBanner message={error} />
      {prefs ? (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-white p-4 text-sm text-[var(--muted)]">
          Preferences: in-app {String(prefs.inAppEnabled ?? true)} · push {String(prefs.pushEnabled ?? true)} · email{' '}
          {String(prefs.emailEnabled ?? false)}
        </div>
      ) : null}
      {!items.length ? (
        <EmptyState title="No notifications" />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                'rounded-xl border px-4 py-3',
                item.isRead ? 'border-[var(--border)] bg-white' : 'border-teal-200 bg-teal-50/40'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.title}</p>
                  {item.body ? <p className="mt-1 text-sm text-[var(--muted)]">{item.body}</p> : null}
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {formatDateTime(item.createdAt)} · {relativeTime(item.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {item.linkUrl ? (
                    <Link href={item.linkUrl} className="text-sm font-medium text-[var(--primary)]">
                      Open
                    </Link>
                  ) : null}
                  {!item.isRead ? (
                    <Button size="sm" variant="ghost" onClick={() => void markRead(item.id)}>
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
