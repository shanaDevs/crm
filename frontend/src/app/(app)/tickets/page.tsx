'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Ticket } from '@/lib/types'
import { statusLabel } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { TicketFormModal } from '@/components/TicketFormModal'
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

export default function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = use(searchParams)
  const presetCompanyId = typeof query.companyId === 'string' ? query.companyId : ''
  const { isCustomer, can } = useAuth()
  const canWrite = can('tickets.write')
  const canManage = can('tickets.manage')
  const [items, setItems] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ ticket: Ticket | null } | null>(query.new ? { ticket: null } : null)

  function load() {
    return api<Ticket[]>('/api/tickets')
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tickets'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
  }, [])

  const canEdit = (ticket: Ticket) => canWrite && (!isCustomer || ticket.status === 'OPEN')

  async function onDelete(ticket: Ticket) {
    if (!window.confirm(`Delete ticket ${ticket.ticketNumber}: "${ticket.title}"?`)) return
    setError(null)
    try {
      await api(`/api/tickets/${ticket.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete ticket')
    }
  }

  const visible = presetCompanyId ? items.filter((t) => (t.companyId || t.company?.id) === presetCompanyId) : items

  return (
    <div>
      <PageHeader
        title="Tickets"
        description={isCustomer ? 'Support and change requests for your company.' : 'Bugs, support, and delivery tickets.'}
        actions={
          <>
            {presetCompanyId ? (
              <Link href="/tickets">
                <Button variant="secondary">Show all customers</Button>
              </Link>
            ) : null}
            {canWrite ? <Button onClick={() => setModal({ ticket: null })}>New ticket</Button> : null}
          </>
        }
      />
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : visible.length === 0 ? (
        <EmptyState title="No tickets" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-slate-50 text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Ticket</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Priority</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visible.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <Link href={`/tickets/${ticket.id}`} className="font-medium hover:text-[var(--primary)]">
                      {ticket.ticketNumber}: {ticket.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">{ticket.company?.name}</td>
                  <td className="hidden px-4 py-3 text-[var(--muted)] lg:table-cell">{statusLabel(ticket.type)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(ticket.status)}>{statusLabel(ticket.status)}</Badge>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Badge tone={priorityTone(ticket.priority)}>{statusLabel(ticket.priority)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={`/tickets/${ticket.id}`}>
                        <Button size="sm" variant="secondary">
                          View
                        </Button>
                      </Link>
                      {canEdit(ticket) ? (
                        <Button size="sm" variant="secondary" onClick={() => setModal({ ticket })}>
                          Edit
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button size="sm" variant="danger" onClick={() => void onDelete(ticket)}>
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
        <TicketFormModal
          ticket={modal.ticket}
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
