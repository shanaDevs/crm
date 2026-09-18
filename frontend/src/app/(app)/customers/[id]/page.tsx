'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import type { Company } from '@/lib/types'
import { formatDateTime, fullName, statusLabel } from '@/lib/format'
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  statusTone,
} from '@/components/ui'

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>()
  const [company, setCompany] = useState<Company | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!params.id) return
    api<Company>(`/api/customers/${params.id}`)
      .then(setCompany)
      .catch((err) => setError(err.message || 'Failed to load customer'))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <LoadingState />
  if (error) return <ErrorBanner message={error} />
  if (!company) return null

  return (
    <div>
      <PageHeader
        title={company.name}
        description={[company.city, company.country, company.businessCategory].filter(Boolean).join(' · ') || 'Customer profile'}
        actions={<Badge tone={statusTone(company.leadStatus)}>{statusLabel(company.leadStatus)}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Overview" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Website</dt>
              <dd>{company.website || '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Assigned officer</dt>
              <dd>{fullName(company.assignedOfficer)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Lead source</dt>
              <dd>{company.leadSource || '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Notes</dt>
              <dd className="whitespace-pre-wrap">{company.notes || '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Contacts" className="lg:col-span-2">
          {!company.contacts?.length ? (
            <EmptyState title="No contacts" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {company.contacts.map((contact) => (
                <li key={contact.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium">
                      {fullName(contact)}
                      {contact.isPrimary ? <span className="ml-2 text-xs text-[var(--primary)]">Primary</span> : null}
                    </p>
                    <p className="text-sm text-[var(--muted)]">{contact.jobTitle || '—'}</p>
                  </div>
                  <div className="text-sm text-[var(--muted)]">
                    <p>{contact.email || '—'}</p>
                    <p>{contact.mobile || contact.phone || '—'}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Follow-ups">
          {!company.followUps?.length ? (
            <EmptyState title="No follow-ups" />
          ) : (
            <ul className="space-y-3 text-sm">
              {company.followUps.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <p className="font-medium">
                    {item.activityType} · {statusLabel(item.status)}
                  </p>
                  <p className="text-[var(--muted)]">{formatDateTime(item.scheduledAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/follow-ups" className="mt-3 inline-block text-sm text-[var(--primary)]">
            Open follow-ups →
          </Link>
        </Card>

        <Card title="Opportunities">
          {!company.opportunities?.length ? (
            <EmptyState title="No opportunities" />
          ) : (
            <ul className="space-y-3 text-sm">
              {company.opportunities.map((opp) => (
                <li key={opp.id}>
                  <p className="font-medium">{opp.title}</p>
                  <p className="text-[var(--muted)]">
                    {opp.product?.name} · {opp.stage?.name || '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tickets & requirements">
          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-2 font-medium">Tickets</p>
              {!company.tickets?.length ? (
                <p className="text-[var(--muted)]">None</p>
              ) : (
                company.tickets.slice(0, 5).map((ticket) => (
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="mb-1 block hover:text-[var(--primary)]">
                    {ticket.ticketNumber}: {ticket.title}
                  </Link>
                ))
              )}
            </div>
            <div>
              <p className="mb-2 font-medium">Requirements</p>
              {!company.requirements?.length ? (
                <p className="text-[var(--muted)]">None</p>
              ) : (
                company.requirements.slice(0, 5).map((req) => (
                  <Link key={req.id} href={`/requirements/${req.id}`} className="mb-1 block hover:text-[var(--primary)]">
                    {req.title}
                  </Link>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
