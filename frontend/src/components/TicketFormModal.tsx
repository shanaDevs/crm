'use client'

import { FormEvent, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Company, Product, Ticket } from '@/lib/types'
import { statusLabel } from '@/lib/format'
import { Button, ErrorBanner, Field, Input, Modal, Select, Textarea } from '@/components/ui'

function initialForm(ticket?: Ticket | null, presetCompanyId = '') {
  return {
    title: ticket?.title || '',
    description: ticket?.description || '',
    companyId: ticket?.companyId || ticket?.company?.id || presetCompanyId,
    productId: ticket?.productId || ticket?.product?.id || '',
    type: ticket?.type || 'SUPPORT',
    priority: ticket?.priority || 'MEDIUM',
    dueDate: ticket?.dueDate?.slice(0, 10) || '',
  }
}

/** Create (no `ticket`) or edit a ticket. Mount it only while open so the form resets each time. */
export function TicketFormModal({
  ticket,
  presetCompanyId,
  onClose,
  onSaved,
}: {
  ticket?: Ticket | null
  presetCompanyId?: string
  onClose: () => void
  onSaved: (saved: Ticket) => void
}) {
  const { user, isCustomer } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState(() => initialForm(ticket, presetCompanyId || user?.companyId || ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Product[]>('/api/products')
      .then((list) => setProducts(list.filter((p) => p.isActive !== false || p.id === form.productId)))
      .catch(() => undefined)
    if (!isCustomer && !ticket) {
      api<Company[]>('/api/customers')
        .then(setCompanies)
        .catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const body = {
      title: form.title.trim(),
      description: form.description.trim(),
      productId: form.productId,
      type: form.type,
      priority: form.priority,
      dueDate: form.dueDate ? new Date(`${form.dueDate}T00:00:00`).toISOString() : null,
    }
    try {
      const saved = ticket
        ? await api<Ticket>(`/api/tickets/${ticket.id}`, { method: 'PATCH', body })
        : await api<Ticket>('/api/tickets', {
            method: 'POST',
            body: { ...body, companyId: form.companyId || user?.companyId },
          })
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save ticket')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title={ticket ? `Edit ${ticket.ticketNumber}` : 'New ticket'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Title">
          <Input required value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea required value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        {!isCustomer && !ticket ? (
          <Field label="Customer">
            <Select required value={form.companyId} onChange={(e) => set('companyId', e.target.value)}>
              <option value="">Select</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Product">
          <Select required value={form.productId} onChange={(e) => set('productId', e.target.value)}>
            <option value="">Select</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
              {['BUG', 'SUPPORT', 'TASK', 'CHANGE_REQUEST'].map((t) => (
                <option key={t} value={t}>
                  {statusLabel(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                <option key={p} value={p}>
                  {statusLabel(p)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Due date">
          <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? 'Saving…' : ticket ? 'Save changes' : 'Create ticket'}
        </Button>
      </form>
    </Modal>
  )
}
