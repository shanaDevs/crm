'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Company, Product, Requirement } from '@/lib/types'
import { statusLabel } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Textarea,
  priorityTone,
  statusTone,
} from '@/components/ui'

export default function RequirementsPage() {
  const { user, isCustomer } = useAuth()
  const [items, setItems] = useState<Requirement[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    companyId: '',
    productId: '',
    priority: 'MEDIUM',
    businessProblem: '',
    expectedResult: '',
  })

  async function load() {
    setLoading(true)
    try {
      const [reqs, comps, prods] = await Promise.all([
        api<Requirement[]>('/api/requirements'),
        api<Company[]>('/api/customers').catch(() => [] as Company[]),
        api<Product[]>('/api/products'),
      ])
      setItems(reqs)
      setCompanies(comps)
      setProducts(prods)
      if (user?.companyId) setForm((f) => ({ ...f, companyId: user.companyId || '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requirements')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/api/requirements', {
        method: 'POST',
        body: {
          title: form.title,
          description: form.description,
          companyId: form.companyId || user?.companyId,
          productId: form.productId,
          priority: form.priority,
          businessProblem: form.businessProblem || null,
          expectedResult: form.expectedResult || null,
        },
      })
      setOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create requirement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Requirements"
        description={isCustomer ? 'Submit and track requests for your company.' : 'Customer requirements and delivery status.'}
        actions={<Button onClick={() => setOpen(true)}>New requirement</Button>}
      />
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title="No requirements" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-slate-50 text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <Link href={`/requirements/${item.id}`} className="font-medium hover:text-[var(--primary)]">
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">{item.company?.name}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{item.product?.name}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={priorityTone(item.priority)}>{statusLabel(item.priority)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} title="New requirement" onClose={() => setOpen(false)}>
        <form onSubmit={onCreate} className="space-y-3">
          <Field label="Title">
            <Input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </Field>
          <Field label="Description">
            <Textarea
              required
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          {!isCustomer ? (
            <Field label="Company">
              <Select
                required
                value={form.companyId}
                onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
              >
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
            <Select
              required
              value={form.productId}
              onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
            >
              <option value="">Select</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                <option key={p} value={p}>
                  {statusLabel(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Business problem">
            <Textarea
              value={form.businessProblem}
              onChange={(e) => setForm((f) => ({ ...f, businessProblem: e.target.value }))}
            />
          </Field>
          <Field label="Expected result">
            <Textarea
              value={form.expectedResult}
              onChange={(e) => setForm((f) => ({ ...f, expectedResult: e.target.value }))}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Submit'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
