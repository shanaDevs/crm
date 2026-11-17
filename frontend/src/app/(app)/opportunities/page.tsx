'use client'

import Link from 'next/link'
import { FormEvent, use, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { GripVertical, NotebookPen, Phone } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { CallDialMode, Company, Contact, DialOptions, Opportunity, OpportunityStage, Product } from '@/lib/types'
import { fullName } from '@/lib/format'
import { useCallDesk } from '@/components/CallDeskProvider'
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
import { OpportunityStageManager } from '@/components/OpportunityStageManager'

const emptyForm = (companyId = '') => ({
  title: '',
  companyId,
  productId: '',
  stageCode: 'NEW',
  value: '',
  currency: 'LKR',
  expectedCloseDate: '',
  notes: '',
})

function companyArea(company?: Company | null) {
  if (!company) return ''
  return [company.city, company.state, company.country].filter(Boolean).join(', ')
}

function contactPhones(contact: Contact) {
  const phones: { label: string; value: string }[] = []
  if (contact.mobile?.trim()) phones.push({ label: `${contact.firstName} mobile`, value: contact.mobile.trim() })
  if (contact.phone?.trim() && contact.phone.trim() !== contact.mobile?.trim()) {
    phones.push({ label: `${contact.firstName} phone`, value: contact.phone.trim() })
  }
  return phones
}

export default function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = use(searchParams)
  const presetCompanyId = typeof query.companyId === 'string' ? query.companyId : ''
  const { can } = useAuth()
  const canWrite = can('opportunities.write')
  const canCall = can('calls.write')
  const { startOutbound, refreshDialOptions, dialOptions } = useCallDesk()
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [stages, setStages] = useState<OpportunityStage[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [open, setOpen] = useState(Boolean(query.new))
  const [stageManagerOpen, setStageManagerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => emptyForm(presetCompanyId))
  const [search, setSearch] = useState('')
  const [area, setArea] = useState('')
  const [notesOpp, setNotesOpp] = useState<Opportunity | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [callOpp, setCallOpp] = useState<Opportunity | null>(null)
  const [callPhone, setCallPhone] = useState('')
  const [callContactId, setCallContactId] = useState('')
  const [callDialMode, setCallDialMode] = useState<CallDialMode>('PHONE')
  const [callBusy, setCallBusy] = useState(false)
  const [callOptions, setCallOptions] = useState<DialOptions | null>(dialOptions)

  function load(nextSearch = search, nextArea = area) {
    const params = new URLSearchParams()
    if (nextSearch.trim()) params.set('q', nextSearch.trim())
    if (nextArea.trim()) params.set('area', nextArea.trim())
    const qs = params.toString()
    return Promise.all([
      api<Opportunity[]>(`/api/opportunities${qs ? `?${qs}` : ''}`),
      api<OpportunityStage[]>('/api/opportunities/stages'),
      api<Company[]>('/api/customers').catch(() => [] as Company[]),
      api<Product[]>('/api/products').catch(() => [] as Product[]),
    ])
      .then(([opps, stg, comps, prods]) => {
        setOpportunities(opps)
        setStages(stg)
        setCompanies(comps)
        setProducts(prods)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load opportunities'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onCompleted = () => {
      void load()
    }
    window.addEventListener('crm:call-completed', onCompleted)
    return () => window.removeEventListener('crm:call-completed', onCompleted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, area])

  const areas = useMemo(() => {
    const set = new Set<string>()
    for (const opp of opportunities) {
      const city = opp.company?.city?.trim()
      const state = opp.company?.state?.trim()
      if (city) set.add(city)
      if (state) set.add(state)
    }
    for (const c of companies) {
      if (c.city?.trim()) set.add(c.city.trim())
      if (c.state?.trim()) set.add(c.state.trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [opportunities, companies])

  const byStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>()
    for (const stage of stages) map.set(stage.code, [])
    for (const opp of opportunities) {
      if (presetCompanyId && (opp.companyId || opp.company?.id) !== presetCompanyId) continue
      const code = opp.stage?.code || 'NEW'
      if (!map.has(code)) map.set(code, [])
      map.get(code)!.push(opp)
    }
    return map
  }, [opportunities, stages, presetCompanyId])

  const [activeId, setActiveId] = useState<string | null>(null)
  const activeOpp = activeId ? opportunities.find((o) => o.id === activeId) : undefined
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const availableModes = useMemo(() => {
    if (!callOptions) return ['PHONE'] as CallDialMode[]
    return (Object.keys(callOptions.modes) as CallDialMode[]).filter((m) => callOptions.modes[m].available)
  }, [callOptions])

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return
    const opp = opportunities.find((o) => o.id === active.id)
    const target = stages.find((s) => s.code === over.id)
    if (!opp || !target || (opp.stage?.code || 'NEW') === target.code) return

    const previous = opportunities
    setOpportunities((list) => list.map((o) => (o.id === opp.id ? { ...o, stage: target } : o)))
    api(`/api/opportunities/${opp.id}/stage`, { method: 'PATCH', body: { stageCode: target.code } })
      .then(() => load())
      .catch((err) => {
        setOpportunities(previous)
        setError(err instanceof ApiError ? err.message : 'Failed to update stage')
      })
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm(presetCompanyId))
    setFormError(null)
    setOpen(true)
  }

  function openEdit(opp: Opportunity) {
    setEditingId(opp.id)
    setForm({
      title: opp.title,
      companyId: opp.companyId || opp.company?.id || '',
      productId: opp.productId || opp.product?.id || '',
      stageCode: opp.stage?.code || 'NEW',
      value: opp.value != null ? String(opp.value) : '',
      currency: opp.currency || 'LKR',
      expectedCloseDate: opp.expectedCloseDate ? opp.expectedCloseDate.slice(0, 10) : '',
      notes: opp.notes || '',
    })
    setFormError(null)
    setOpen(true)
  }

  function openNotes(opp: Opportunity) {
    setNotesOpp(opp)
    setNotesDraft(opp.notes || '')
  }

  async function openCall(opp: Opportunity) {
    setError(null)
    setCallOpp(opp)
    const contacts = opp.company?.contacts || []
    const phoneChoices = contacts.flatMap((c) =>
      contactPhones(c).map((p) => ({ ...p, contactId: c.id })),
    )
    const first = phoneChoices[0]
    setCallPhone(first?.value || '')
    setCallContactId(first?.contactId || '')
    const opts = (await refreshDialOptions()) || dialOptions
    setCallOptions(opts)
    const modes = opts
      ? (Object.keys(opts.modes) as CallDialMode[]).filter((m) => opts.modes[m].available)
      : (['PHONE'] as CallDialMode[])
    setCallDialMode(modes[0] || 'PHONE')
  }

  async function onDelete(opp: Opportunity) {
    if (!window.confirm(`Delete opportunity "${opp.title}"?`)) return
    try {
      await api(`/api/opportunities/${opp.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete opportunity')
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const body = {
      title: form.title.trim(),
      companyId: form.companyId,
      productId: form.productId,
      stageCode: form.stageCode,
      value: form.value ? Number(form.value) : null,
      currency: form.currency.trim() || 'LKR',
      expectedCloseDate: form.expectedCloseDate ? new Date(`${form.expectedCloseDate}T00:00:00`).toISOString() : null,
      notes: form.notes.trim() || null,
    }
    try {
      if (editingId) await api(`/api/opportunities/${editingId}`, { method: 'PATCH', body })
      else await api('/api/opportunities', { method: 'POST', body })
      setOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save opportunity')
    } finally {
      setSaving(false)
    }
  }

  async function onSaveNotes(e: FormEvent) {
    e.preventDefault()
    if (!notesOpp) return
    setNotesSaving(true)
    try {
      await api(`/api/opportunities/${notesOpp.id}`, {
        method: 'PATCH',
        body: { notes: notesDraft.trim() || null },
      })
      setNotesOpp(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save notes')
    } finally {
      setNotesSaving(false)
    }
  }

  async function onStartCall(e: FormEvent) {
    e.preventDefault()
    if (!callOpp || !callPhone.trim()) return
    setCallBusy(true)
    setError(null)
    try {
      await startOutbound({
        phone: callPhone.trim(),
        dialMode: callDialMode,
        companyId: callOpp.companyId || callOpp.company?.id || null,
        contactId: callContactId || null,
        opportunityId: callOpp.id,
        notes: `Opportunity: ${callOpp.title}`,
      })
      setCallOpp(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start call')
    } finally {
      setCallBusy(false)
    }
  }

  const callPhoneChoices = useMemo(() => {
    if (!callOpp?.company?.contacts) return [] as { label: string; value: string; contactId: string }[]
    return callOpp.company.contacts.flatMap((c) =>
      contactPhones(c).map((p) => ({ ...p, contactId: c.id })),
    )
  }, [callOpp])

  return (
    <div>
      <PageHeader
        title="Opportunities"
        description={
          (presetCompanyId
            ? `Pipeline for ${companies.find((c) => c.id === presetCompanyId)?.name || 'this customer'}.`
            : 'Pipeline by stage.') + (canWrite ? ' Drag a card to another column to change its stage.' : '')
        }
        actions={
          <>
            {presetCompanyId ? (
              <Link href="/opportunities">
                <Button variant="secondary">Show all customers</Button>
              </Link>
            ) : null}
            {canWrite ? (
              <>
                <Button variant="secondary" onClick={() => setStageManagerOpen(true)}>
                  Manage stages
                </Button>
                <Button onClick={openCreate}>New opportunity</Button>
              </>
            ) : null}
          </>
        }
      />
      <ErrorBanner message={error} />

      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setLoading(true)
          void load()
        }}
      >
        <Field label="Search" className="min-w-56 flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, customer, product, address…"
          />
        </Field>
        <Field label="Area" className="min-w-40">
          <Select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {search || area ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSearch('')
              setArea('')
              setLoading(true)
              void load('', '')
            }}
          >
            Clear
          </Button>
        ) : null}
      </form>

      {loading ? (
        <LoadingState />
      ) : stages.length === 0 ? (
        <EmptyState title="No stages configured" />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex gap-4 overflow-x-auto pb-2">
            {stages.map((stage) => {
              const items = byStage.get(stage.code) || []
              return (
                <StageColumn key={stage.id} stage={stage} count={items.length}>
                  {items.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-[var(--muted)]">
                      {canWrite ? 'Drop here' : 'Empty'}
                    </p>
                  ) : (
                    items.map((opp) => (
                      <DraggableCard key={opp.id} id={opp.id} disabled={!canWrite}>
                        <OpportunityCard
                          opp={opp}
                          draggable={canWrite}
                          actions={
                            <div
                              className="mt-2 flex flex-wrap gap-2"
                              onPointerDown={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              {canCall ? (
                                <Button size="sm" variant="secondary" onClick={() => void openCall(opp)}>
                                  <Phone className="mr-1 h-3.5 w-3.5" />
                                  Call
                                </Button>
                              ) : null}
                              {canWrite ? (
                                <>
                                  <Button size="sm" variant="secondary" onClick={() => openNotes(opp)}>
                                    <NotebookPen className="mr-1 h-3.5 w-3.5" />
                                    Notes
                                  </Button>
                                  <Button size="sm" variant="secondary" onClick={() => openEdit(opp)}>
                                    Edit
                                  </Button>
                                  <Button size="sm" variant="danger" onClick={() => void onDelete(opp)}>
                                    Delete
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          }
                        />
                      </DraggableCard>
                    ))
                  )}
                </StageColumn>
              )
            })}
          </div>
          <DragOverlay>
            {activeOpp ? (
              <div className="w-66 rotate-2 cursor-grabbing shadow-xl">
                <OpportunityCard opp={activeOpp} draggable />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Modal open={open} title={editingId ? 'Edit opportunity' : 'New opportunity'} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-3">
          <ErrorBanner message={formError} />
          <Field label="Title">
            <Input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </Field>
          <Field label="Customer">
            <Select required value={form.companyId} onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}>
              <option value="">Select</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {companyArea(c) ? ` · ${companyArea(c)}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Product">
            <Select required value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}>
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
          <div className="grid grid-cols-3 gap-3">
            <Field label="Currency">
              <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
            </Field>
            <Field label="Value" className="col-span-2">
              <Input
                type="number"
                min="0"
                step="any"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Expected close date">
            <Input
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => setForm((f) => ({ ...f, expectedCloseDate: e.target.value }))}
            />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create'}
          </Button>
        </form>
      </Modal>

      <Modal open={Boolean(notesOpp)} title={`Notes · ${notesOpp?.title || ''}`} onClose={() => setNotesOpp(null)}>
        <form onSubmit={onSaveNotes} className="space-y-3">
          <Field label="Opportunity notes">
            <Textarea rows={6} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={notesSaving}>
            {notesSaving ? 'Saving…' : 'Save notes'}
          </Button>
        </form>
      </Modal>

      <Modal open={Boolean(callOpp)} title={`Call · ${callOpp?.title || ''}`} onClose={() => setCallOpp(null)}>
        <form onSubmit={onStartCall} className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            {callOpp?.company?.name || 'Customer'}
            {companyArea(callOpp?.company) ? ` · ${companyArea(callOpp?.company)}` : ''}
          </p>
          {callPhoneChoices.length > 0 ? (
            <Field label="Contact number">
              <Select
                value={`${callContactId}::${callPhone}`}
                onChange={(e) => {
                  const [contactId, ...rest] = e.target.value.split('::')
                  setCallContactId(contactId)
                  setCallPhone(rest.join('::'))
                }}
              >
                {callPhoneChoices.map((p) => (
                  <option key={`${p.contactId}-${p.value}`} value={`${p.contactId}::${p.value}`}>
                    {p.label}: {p.value}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Phone number">
              <Input
                required
                value={callPhone}
                onChange={(e) => {
                  setCallPhone(e.target.value)
                  setCallContactId('')
                }}
                placeholder="0771234567"
              />
            </Field>
          )}
          <Field label="Dial mode">
            <Select value={callDialMode} onChange={(e) => setCallDialMode(e.target.value as CallDialMode)}>
              {availableModes.map((m) => (
                <option key={m} value={m}>
                  {callOptions?.modes[m]?.label || m}
                </option>
              ))}
            </Select>
          </Field>
          {callDialMode === 'PHONE' ? (
            <p className="text-xs text-[var(--muted)]">
              Opens your phone dialer. When you finish, complete the call panel so it is saved in CRM. The first call
              on a New opportunity moves it to 1st Call.
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={callBusy || !callPhone.trim()}>
            {callBusy ? 'Connecting…' : 'Start call'}
          </Button>
        </form>
      </Modal>

      <OpportunityStageManager
        open={stageManagerOpen}
        onClose={() => setStageManagerOpen(false)}
        stages={stages}
        onUpdated={load}
      />
    </div>
  )
}

function StageColumn({ stage, count, children }: { stage: OpportunityStage; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.code })
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl border transition-colors ${
        isOver ? 'border-[var(--primary)] bg-blue-50' : 'border-[var(--border)] bg-slate-50/80'
      }`}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3">
        <p className="text-sm font-semibold">{stage.name}</p>
        <span className="rounded-md bg-white px-2 py-0.5 text-xs text-[var(--muted)]">{count}</span>
      </div>
      <div className="min-h-24 flex-1 space-y-2 p-3">{children}</div>
    </div>
  )
}

function DraggableCard({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`touch-manipulation select-none [-webkit-touch-callout:none] ${isDragging ? 'opacity-40' : ''} ${
        disabled ? '' : 'cursor-grab'
      }`}
    >
      {children}
    </div>
  )
}

function OpportunityCard({
  opp,
  draggable,
  actions,
}: {
  opp: Opportunity
  draggable: boolean
  actions?: React.ReactNode
}) {
  const area = companyArea(opp.company)
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white p-3 shadow-sm">
      <div className="flex items-start gap-1.5">
        {draggable ? <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{opp.title}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {opp.company ? (
              <Link href={`/customers/${opp.company.id}`} draggable={false} className="hover:text-[var(--primary)]">
                {opp.company.name}
              </Link>
            ) : null}{' '}
            · {opp.product?.name}
          </p>
          {area ? <p className="mt-1 text-xs text-[var(--muted)]">{area}</p> : null}
          <p className="mt-1 text-xs text-[var(--muted)]">
            {opp.value != null ? `${opp.currency || 'LKR'} ${Number(opp.value).toLocaleString()}` : 'No value'} ·{' '}
            {fullName(opp.owner)}
          </p>
          {opp.notes ? (
            <p className="mt-1 line-clamp-2 text-xs text-slate-600" title={opp.notes}>
              {opp.notes}
            </p>
          ) : null}
          {actions}
        </div>
      </div>
    </div>
  )
}
