'use client'

import { FormEvent, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Company, Product, Requirement } from '@/lib/types'
import { statusLabel } from '@/lib/format'
import { Button, ErrorBanner, Field, Input, Modal, Select, Textarea } from '@/components/ui'

function initialForm(requirement?: Requirement | null, presetCompanyId = '') {
  return {
    title: requirement?.title || '',
    description: requirement?.description || '',
    companyId: requirement?.companyId || requirement?.company?.id || presetCompanyId,
    productId: requirement?.productId || requirement?.product?.id || '',
    priority: requirement?.priority || 'MEDIUM',
    businessProblem: requirement?.businessProblem || '',
    expectedResult: requirement?.expectedResult || '',
    acceptanceCriteria: requirement?.acceptanceCriteria || '',
    requestedDeliveryDate: requirement?.requestedDeliveryDate?.slice(0, 10) || '',
  }
}

/** Create (no `requirement`) or edit a requirement. Mount it only while open so the form resets each time. */
export function RequirementFormModal({
  requirement,
  presetCompanyId,
  onClose,
  onSaved,
}: {
  requirement?: Requirement | null
  presetCompanyId?: string
  onClose: () => void
  onSaved: (saved: Requirement) => void
}) {
  const { user, isCustomer } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState(() => initialForm(requirement, presetCompanyId || user?.companyId || ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Product[]>('/api/products')
      .then((list) => setProducts(list.filter((p) => p.isActive !== false || p.id === form.productId)))
      .catch(() => undefined)
    if (!isCustomer && !requirement) {
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
      priority: form.priority,
      businessProblem: form.businessProblem.trim() || null,
      expectedResult: form.expectedResult.trim() || null,
      acceptanceCriteria: form.acceptanceCriteria.trim() || null,
      requestedDeliveryDate: form.requestedDeliveryDate
        ? new Date(`${form.requestedDeliveryDate}T00:00:00`).toISOString()
        : null,
    }
    try {
      const saved = requirement
        ? await api<Requirement>(`/api/requirements/${requirement.id}`, { method: 'PATCH', body })
        : await api<Requirement>('/api/requirements', {
            method: 'POST',
            body: { ...body, companyId: form.companyId || user?.companyId },
          })
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save requirement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title={requirement ? 'Edit requirement' : 'New requirement'} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ErrorBanner message={error} />
        </div>
        <Field label="Title" className="sm:col-span-2">
          <Input required value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea required value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        {!isCustomer && !requirement ? (
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
        <Field label="Priority">
          <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
              <option key={p} value={p}>
                {statusLabel(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Requested delivery date">
          <Input
            type="date"
            value={form.requestedDeliveryDate}
            onChange={(e) => set('requestedDeliveryDate', e.target.value)}
          />
        </Field>
        <Field label="Business problem" className="sm:col-span-2">
          <Textarea value={form.businessProblem} onChange={(e) => set('businessProblem', e.target.value)} />
        </Field>
        <Field label="Expected result" className="sm:col-span-2">
          <Textarea value={form.expectedResult} onChange={(e) => set('expectedResult', e.target.value)} />
        </Field>
        <Field label="Acceptance criteria" className="sm:col-span-2">
          <Textarea value={form.acceptanceCriteria} onChange={(e) => set('acceptanceCriteria', e.target.value)} />
        </Field>
        <Button type="submit" className="sm:col-span-2" disabled={saving}>
          {saving ? 'Saving…' : requirement ? 'Save changes' : 'Submit'}
        </Button>
      </form>
    </Modal>
  )
}

export const CUSTOMER_EDITABLE_REQUIREMENT = ['SUBMITTED', 'NEEDS_CLARIFICATION']
