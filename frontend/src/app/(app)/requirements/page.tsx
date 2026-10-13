'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Requirement } from '@/lib/types'
import { statusLabel } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { CUSTOMER_EDITABLE_REQUIREMENT, RequirementFormModal } from '@/components/RequirementFormModal'
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  priorityTone,
  statusTone,
} from '@/components/ui'

export default function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = use(searchParams)
  const presetCompanyId = typeof query.companyId === 'string' ? query.companyId : ''
  const { isCustomer, can } = useAuth()
  const canWrite = can('requirements.write')
  const canManage = can('requirements.manage')
  const [items, setItems] = useState<Requirement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ requirement: Requirement | null } | null>(query.new ? { requirement: null } : null)

  function load() {
    return api<Requirement[]>('/api/requirements')
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load requirements'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
  }, [])

  const canEdit = (item: Requirement) =>
    canWrite && (!isCustomer || CUSTOMER_EDITABLE_REQUIREMENT.includes(item.status))

  async function onDelete(item: Requirement) {
    if (!window.confirm(`Delete requirement "${item.title}"? Its comments and tasks are deleted too.`)) return
    setError(null)
    try {
      await api(`/api/requirements/${item.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete requirement')
    }
  }

  const visible = presetCompanyId ? items.filter((i) => (i.companyId || i.company?.id) === presetCompanyId) : items

  return (
    <div>
      <PageHeader
        title="Requirements"
        description={isCustomer ? 'Submit and track requests for your company.' : 'Customer requirements and delivery status.'}
        actions={
          <>
            {presetCompanyId ? (
              <Link href="/requirements">
                <Button variant="secondary">Show all customers</Button>
              </Link>
            ) : null}
            {canWrite ? <Button onClick={() => setModal({ requirement: null })}>New requirement</Button> : null}
          </>
        }
      />
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : visible.length === 0 ? (
        <EmptyState title="No requirements" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-slate-50 text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Product</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Priority</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visible.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <Link href={`/requirements/${item.id}`} className="font-medium hover:text-[var(--primary)]">
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">{item.company?.name}</td>
                  <td className="hidden px-4 py-3 text-[var(--muted)] lg:table-cell">{item.product?.name}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Badge tone={priorityTone(item.priority)}>{statusLabel(item.priority)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={`/requirements/${item.id}`}>
                        <Button size="sm" variant="secondary">
                          View
                        </Button>
                      </Link>
                      {canEdit(item) ? (
                        <Button size="sm" variant="secondary" onClick={() => setModal({ requirement: item })}>
                          Edit
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button size="sm" variant="danger" onClick={() => void onDelete(item)}>
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal ? (
        <RequirementFormModal
          requirement={modal.requirement}
          presetCompanyId={presetCompanyId}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            void load()
          }}
        />
      ) : null}
    </div>
  )
}
