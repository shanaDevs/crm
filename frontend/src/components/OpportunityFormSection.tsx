'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { OpportunityStage, Product } from '@/lib/types'
import { Card, Field, Input, Select, Textarea } from '@/components/ui'

const DEFAULT_STAGES = [
  { code: 'NEW', name: 'New' },
  { code: 'CONTACTED', name: 'Contacted' },
  { code: 'QUALIFIED', name: 'Qualified' },
  { code: 'DEMO_SCHEDULED', name: 'Demo Scheduled' },
  { code: 'PROPOSAL_SENT', name: 'Proposal Sent' },
  { code: 'NEGOTIATION', name: 'Negotiation' },
  { code: 'WON', name: 'Won' },
  { code: 'LOST', name: 'Lost' },
]

export type OpportunityPlanForm = {
  enabled: boolean
  title: string
  productId: string
  stageCode: string
  value: string
  currency: string
  expectedCloseDate: string
  notes: string
}

export function emptyOpportunityPlan(): OpportunityPlanForm {
  return {
    enabled: false,
    title: '',
    productId: '',
    stageCode: 'NEW',
    value: '',
    currency: 'LKR',
    expectedCloseDate: '',
    notes: '',
  }
}

/** Request body payload for the optional opportunity, or undefined when not enabled. */
export function opportunityPlanPayload(plan: OpportunityPlanForm) {
  if (!plan.enabled || !plan.productId || !plan.title.trim()) return undefined
  return {
    title: plan.title.trim(),
    productId: plan.productId,
    stageCode: plan.stageCode || 'NEW',
    value: plan.value.trim() ? Number(plan.value) : null,
    currency: plan.currency.trim() || 'LKR',
    expectedCloseDate: plan.expectedCloseDate ? new Date(plan.expectedCloseDate).toISOString() : null,
    notes: plan.notes.trim() || null,
  }
}

export function OpportunityFormSection({
  value,
  onChange,
  companyName = '',
}: {
  value: OpportunityPlanForm
  onChange: (next: OpportunityPlanForm) => void
  companyName?: string
}) {
  const { can } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [stages, setStages] = useState<Array<{ code: string; name: string }>>(DEFAULT_STAGES)
  const [isTitleTouched, setIsTitleTouched] = useState(false)

  const canWrite = can('opportunities.write') || can('customers.write')

  useEffect(() => {
    api<Product[]>('/api/products')
      .then((data) => setProducts(data.filter((p) => p.isActive !== false)))
      .catch(() => {})

    api<OpportunityStage[]>('/api/opportunities/stages')
      .then((data) => {
        if (data && data.length > 0) {
          setStages(data.map((s) => ({ code: s.code, name: s.name })))
        }
      })
      .catch(() => {})
  }, [])

  if (!canWrite) return null

  const update = <K extends keyof OpportunityPlanForm>(key: K, v: OpportunityPlanForm[K]) => {
    onChange({ ...value, [key]: v })
  }

  function handleProductChange(productId: string) {
    const selectedProd = products.find((p) => p.id === productId)
    let newTitle = value.title
    if (!isTitleTouched || !value.title.trim()) {
      const cName = companyName.trim() || 'Deal'
      newTitle = selectedProd ? `${cName} - ${selectedProd.name}` : cName
    }
    onChange({
      ...value,
      productId,
      title: newTitle,
    })
  }

  return (
    <Card title="Opportunity">
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--primary)]"
          checked={value.enabled}
          onChange={(e) => {
            const enabled = e.target.checked
            let title = value.title
            if (enabled && !title.trim()) {
              const selectedProd = products.find((p) => p.id === value.productId)
              const cName = companyName.trim() || 'Deal'
              title = selectedProd ? `${cName} - ${selectedProd.name}` : `${cName} - Opportunity`
            }
            onChange({ ...value, enabled, title })
          }}
        />
        <span>Create an opportunity for this customer</span>
      </label>

      {value.enabled ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Product">
            <Select
              required={value.enabled}
              value={value.productId}
              onChange={(e) => handleProductChange(e.target.value)}
            >
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Opportunity title">
            <Input
              required={value.enabled}
              placeholder="e.g. Acme Corp - POS System"
              value={value.title}
              onChange={(e) => {
                setIsTitleTouched(true)
                update('title', e.target.value)
              }}
            />
          </Field>

          <Field label="Pipeline stage">
            <Select value={value.stageCode} onChange={(e) => update('stageCode', e.target.value)}>
              {stages.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Currency">
              <Input
                placeholder="LKR"
                value={value.currency}
                onChange={(e) => update('currency', e.target.value)}
              />
            </Field>
            <Field label="Estimated value" className="col-span-2">
              <Input
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={value.value}
                onChange={(e) => update('value', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Expected close date">
            <Input
              type="date"
              value={value.expectedCloseDate}
              onChange={(e) => update('expectedCloseDate', e.target.value)}
            />
          </Field>

          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              placeholder="Details about customer expectations, budget, or sales process..."
              value={value.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </Field>
        </div>
      ) : null}
    </Card>
  )
}
