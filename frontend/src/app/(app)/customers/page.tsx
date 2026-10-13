'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Company } from '@/lib/types'
import { fullName, statusLabel } from '@/lib/format'
import { LevelSelect, LevelsManager, useCustomerLevels } from '@/components/levels'
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  LoadingState,
  PageHeader,
  Select,
  statusTone,
} from '@/components/ui'

export default function CustomersPage() {
  const { can } = useAuth()
  const canWrite = can('customers.write')
  const canDelete = can('customers.delete')
  const canManageLevels = can('levels.manage')
  const { levels, reload: reloadLevels } = useCustomerLevels()
  const [items, setItems] = useState<Company[]>([])
  const [q, setQ] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [levelsOpen, setLevelsOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (levelFilter) params.set('levelId', levelFilter)
    const qs = params.toString()
    try {
      setItems(await api<Company[]>(`/api/customers${qs ? `?${qs}` : ''}`))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load customers')
    } finally {
      setLoading(false)
    }
  }, [q, levelFilter])

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true)
      void load()
    }, 200)
    return () => clearTimeout(handle)
  }, [load])

  async function setLevel(company: Company, levelId: string | null) {
    setBusyId(company.id)
    try {
      await api(`/api/customers/${company.id}`, { method: 'PATCH', body: { levelId } })
      const level = levels.find((l) => l.id === levelId) || null
      setItems((prev) => prev.map((c) => (c.id === company.id ? { ...c, levelId, level } : c)))
      void reloadLevels()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update level')
    } finally {
      setBusyId(null)
    }
  }

  async function onDelete(company: Company) {
    const ok = window.confirm(
      `Delete "${company.name}"?\n\nThis also deletes its contacts, visits, follow-ups, opportunities, requirements and tickets. This cannot be undone.`
    )
    if (!ok) return
    setBusyId(company.id)
    try {
      await api(`/api/customers/${company.id}`, { method: 'DELETE' })
      setItems((prev) => prev.filter((c) => c.id !== company.id))
      void reloadLevels()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete customer')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Companies and primary contacts."
        actions={
          <>
            {canManageLevels ? (
              <Button variant="secondary" onClick={() => setLevelsOpen(true)}>
                Manage levels
              </Button>
            ) : null}
            {canWrite ? (
              <Link href="/customers/new">
                <Button>New customer</Button>
              </Link>
            ) : null}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Search by name, email, or mobile…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="sm:w-48">
          <option value="">All levels</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
          <option value="none">No level</option>
        </Select>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title="No customers found" description="Create a customer or scan a business card." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-slate-50 text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Primary contact</th>
                <th className="px-4 py-3 font-medium">Level</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium xl:table-cell">Officer</th>
                <th className="hidden px-4 py-3 font-medium xl:table-cell">Activity</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {items.map((company) => {
                const primary = company.contacts?.find((c) => c.isPrimary) || company.contacts?.[0]
                const busy = busyId === company.id
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
                      {canWrite ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: company.level?.color || 'transparent', border: company.level ? 'none' : '1px solid #d4d4d4' }}
                          />
                          <LevelSelect
                            levels={levels}
                            value={company.levelId ?? company.level?.id}
                            onChange={(levelId) => void setLevel(company, levelId)}
                            disabled={busy}
                            className="h-8 min-w-28 text-xs"
                          />
                        </div>
                      ) : company.level ? (
                        <Badge>{company.level.name}</Badge>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(company.leadStatus)}>{statusLabel(company.leadStatus)}</Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-[var(--muted)] xl:table-cell">{fullName(company.assignedOfficer)}</td>
                    <td className="hidden px-4 py-3 text-[var(--muted)] xl:table-cell">
                      {company._count
                        ? `${company._count.followUps} FU · ${company._count.opportunities} opp · ${company._count.tickets} tix`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/customers/${company.id}`}>
                          <Button size="sm" variant="secondary">
                            View
                          </Button>
                        </Link>
                        {canWrite ? (
                          <Link href={`/customers/${company.id}/edit`}>
                            <Button size="sm" variant="secondary">
                              Edit
                            </Button>
                          </Link>
                        ) : null}
                        {canDelete ? (
                          <Button size="sm" variant="danger" onClick={() => onDelete(company)} disabled={busy}>
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <LevelsManager
        open={levelsOpen}
        onClose={() => setLevelsOpen(false)}
        levels={levels}
        onChanged={async () => {
          await reloadLevels()
          await load()
        }}
      />
    </div>
  )
}
