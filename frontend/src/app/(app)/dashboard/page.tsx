'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { DashboardData } from '@/lib/types'
import { formatDateTime, fullName, statusLabel } from '@/lib/format'
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  StatCard,
  statusTone,
} from '@/components/ui'

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<DashboardData>('/api/dashboard')
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />
  if (error) return <ErrorBanner message={error} />
  if (!data) return null

  return (
    <div>
      <PageHeader title="Dashboard" description="Today’s calls, overdue work, and assigned items." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today’s calls" value={data.todayCalls.length} />
        <StatCard label="Overdue" value={data.overdueCount} hint="Follow-ups past due" />
        <StatCard label="New leads" value={data.newLeadsCount} />
        <StatCard label="Unread" value={data.unreadNotifications} hint="Notifications" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Today’s follow-ups">
          {data.todayCalls.length === 0 ? (
            <EmptyState title="No calls scheduled today" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {data.todayCalls.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium">{item.company?.name || 'Company'}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {item.activityType} · {fullName(item.contact)} · {formatDateTime(item.scheduledAt)}
                    </p>
                  </div>
                  <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
          <Link href="/follow-ups" className="mt-3 inline-block text-sm font-medium text-[var(--primary)]">
            View follow-ups →
          </Link>
        </Card>

        <Card title="Assigned requirements">
          {data.myRequirements.length === 0 ? (
            <EmptyState title="No assigned requirements" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {data.myRequirements.map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <Link href={`/requirements/${item.id}`} className="font-medium hover:text-[var(--primary)]">
                    {item.title}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">
                    {item.company?.name} · {item.product?.name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Open tickets" className="lg:col-span-2">
          {data.myTickets.length === 0 ? (
            <EmptyState title="No open tickets" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">Ticket</th>
                    <th className="pb-2 pr-4 font-medium">Company</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.myTickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td className="py-3 pr-4">
                        <Link href={`/tickets/${ticket.id}`} className="font-medium hover:text-[var(--primary)]">
                          {ticket.ticketNumber}: {ticket.title}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-[var(--muted)]">{ticket.company?.name}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={statusTone(ticket.status)}>{statusLabel(ticket.status)}</Badge>
                      </td>
                      <td className="py-3">{statusLabel(ticket.priority)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
