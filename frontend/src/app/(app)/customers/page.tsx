'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Company } from '@/lib/types'
import { fullName, statusLabel } from '@/lib/format'
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  LoadingState,
  PageHeader,
  statusTone,
} from '@/components/ui'

export default function CustomersPage() {
  const [items, setItems] = useState<Company[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true)
      api<Company[]>(`/api/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        .then(setItems)
        .catch((err) => setError(err.message || 'Failed to load customers'))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(handle)
  }, [q])

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Companies and primary contacts."
        actions={
          <Link href="/customers/new">
            <Button>New customer</Button>
          </Link>
        }
      />
      <div className="mb-4">
        <Input
          placeholder="Search by name, email, or mobile…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title="No customers found" description="Create a customer or scan a business card." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-slate-50 text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Primary contact</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Officer</th>
                <th className="px-4 py-3 font-medium">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {items.map((company) => {
                const primary = company.contacts?.find((c) => c.isPrimary) || company.contacts?.[0]
                return (
                  <tr key={company.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${company.id}`} className="font-medium hover:text-[var(--primary)]">
                        {company.name}
                      </Link>
                      <p className="text-xs text-[var(--muted)]">{company.city || company.businessCategory || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{fullName(primary)}</p>
                      <p className="text-xs text-[var(--muted)]">{primary?.email || primary?.mobile || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(company.leadStatus)}>{statusLabel(company.leadStatus)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{fullName(company.assignedOfficer)}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {company._count
                        ? `${company._count.followUps} FU · ${company._count.opportunities} opp · ${company._count.tickets} tix`
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
