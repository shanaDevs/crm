'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Company, Opportunity, OpportunityStage, Product } from '@/lib/types'
import { fullName } from '@/lib/format'
import {
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
} from '@/components/ui'

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [stages, setStages] = useState<OpportunityStage[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    companyId: '',
    productId: '',
    stageCode: 'NEW',
    value: '',
    notes: '',
  })

  async function load() {
    setLoading(true)
    try {
      const [opps, stg, comps, prods] = await Promise.all([
        api<Opportunity[]>('/api/opportunities'),
        api<OpportunityStage[]>('/api/opportunities/stages'),
        api<Company[]>('/api/customers'),
        api<Product[]>('/api/products'),
      ])
      setOpportunities(opps)
      setStages(stg)
      setCompanies(comps)
      setProducts(prods)
      if (stg[0] && !form.stageCode) setForm((f) => ({ ...f, stageCode: stg[0].code }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load opportunities')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const byStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>()
    for (const stage of stages) map.set(stage.code, [])
    for (const opp of opportunities) {
      const code = opp.stage?.code || 'NEW'
      if (!map.has(code)) map.set(code, [])
      map.get(code)!.push(opp)
    }
    return map
  }, [opportunities, stages])

  async function moveStage(id: string, stageCode: string) {
    try {
      await api(`/api/opportunities/${id}/stage`, { method: 'PATCH', body: { stageCode } })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update stage')
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/api/opportunities', {
        method: 'POST',
        body: {
          title: form.title,
          companyId: form.companyId,
          productId: form.productId,
          stageCode: form.stageCode,
          value: form.value ? Number(form.value) : null,
          notes: form.notes || null,
        },
      })
      setOpen(false)
      setForm({ title: '', companyId: '', productId: '', stageCode: stages[0]?.code || 'NEW', value: '', notes: '' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create opportunity')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Opportunities"
        description="Pipeline by stage."
        actions={<Button onClick={() => setOpen(true)}>New opportunity</Button>}
      />
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : stages.length === 0 ? (
        <EmptyState title="No stages configured" />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const items = byStage.get(stage.code) || []
            return (
              <div
                key={stage.id}
                className="w-72 shrink-0 rounded-xl border border-[var(--border)] bg-slate-50/80"
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3">
                  <p className="text-sm font-semibold">{stage.name}</p>
                  <span className="rounded-md bg-white px-2 py-0.5 text-xs text-[var(--muted)]">{items.length}</span>
                </div>
                <div className="space-y-2 p-3">
                  {items.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-[var(--muted)]">Empty</p>
                  ) : (
                    items.map((opp) => (
                      <div key={opp.id} className="rounded-lg border border-[var(--border)] bg-white p-3 shadow-sm">
                        <p className="text-sm font-semibold">{opp.title}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {opp.company?.name} · {opp.product?.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {opp.value != null ? `${opp.currency || 'USD'} ${opp.value}` : 'No value'} ·{' '}
                          {fullName(opp.owner)}
                        </p>
                        <Select
                          className="mt-2 h-8 text-xs"
                          value={opp.stage?.code || stage.code}
                          onChange={(e) => void moveStage(opp.id, e.target.value)}
                        >
                          {stages.map((s) => (
                            <option key={s.id} value={s.code}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={open} title="New opportunity" onClose={() => setOpen(false)}>
        <form onSubmit={onCreate} className="space-y-3">
          <Field label="Title">
            <Input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </Field>
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
          <Field label="Stage">
            <Select value={form.stageCode} onChange={(e) => setForm((f) => ({ ...f, stageCode: e.target.value }))}>
              {stages.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Value">
            <Input
              type="number"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Create'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
