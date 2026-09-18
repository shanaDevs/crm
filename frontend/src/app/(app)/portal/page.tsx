'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Requirement, Ticket } from '@/lib/types'
import { useAuth } from '@/lib/auth'
import { statusLabel } from '@/lib/format'
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  statusTone,
} from '@/components/ui'

export default function PortalPage() {
  const { user, isCustomer } = useAuth()
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api<Requirement[]>('/api/requirements').catch(() => [] as Requirement[]),
      api<Ticket[]>('/api/tickets').catch(() => [] as Ticket[]),
    ])
      .then(([reqs, tix]) => {
        setRequirements(reqs)
        setTickets(tix)
      })
      .catch((err) => setError(err.message || 'Failed to load portal'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />

  return (
    <div>
      <PageHeader
        title="Customer portal"
        description={
          isCustomer
            ? `Welcome${user ? `, ${user.firstName}` : ''}. Track requirements and tickets for your company.`
            : 'Staff preview of the customer-facing portal views.'
        }
      />
      <ErrorBanner message={error} />

      <div className="mb-6 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 text-sm text-teal-900">
        Use this space to submit requirements, open support tickets, and follow progress. Internal notes stay hidden from
        customers.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Your requirements"
          action={
            <Link href="/requirements" className="text-sm font-medium text-[var(--primary)]">
              View all
            </Link>
          }
        >
          {!requirements.length ? (
            <EmptyState title="No requirements yet" description="Submit a request from Requirements." />
          ) : (
            <ul className="space-y-3">
              {requirements.slice(0, 6).map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3">
                  <Link href={`/requirements/${item.id}`} className="font-medium hover:text-[var(--primary)]">
                    {item.title}
                  </Link>
                  <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Your tickets"
          action={
            <Link href="/tickets" className="text-sm font-medium text-[var(--primary)]">
              View all
            </Link>
          }
        >
          {!tickets.length ? (
            <EmptyState title="No tickets yet" description="Open a ticket from Tickets." />
          ) : (
            <ul className="space-y-3">
              {tickets.slice(0, 6).map((ticket) => (
                <li key={ticket.id} className="flex items-start justify-between gap-3">
                  <Link href={`/tickets/${ticket.id}`} className="font-medium hover:text-[var(--primary)]">
                    {ticket.ticketNumber}: {ticket.title}
                  </Link>
                  <Badge tone={statusTone(ticket.status)}>{statusLabel(ticket.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
