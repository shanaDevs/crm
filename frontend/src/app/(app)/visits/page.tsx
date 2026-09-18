'use client'

import { FormEvent, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Company, Visit } from '@/lib/types'
import { formatDateTime, fullName, fromDatetimeLocalValue, toDatetimeLocalValue } from '@/lib/format'
import {
  Button,
  Card,
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

export default function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    companyId: '',
    contactId: '',
    visitedAt: toDatetimeLocalValue(),
    location: '',
    notes: '',
    nextAction: '',
  })

  async function load() {
    setLoading(true)
    try {
      const [v, c] = await Promise.all([api<Visit[]>('/api/visits'), api<Company[]>('/api/customers')])
      setVisits(v)
      setCompanies(c)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load visits')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const selectedCompany = companies.find((c) => c.id === form.companyId)

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api('/api/visits', {
        method: 'POST',
        body: {
          companyId: form.companyId,
          contactId: form.contactId || null,
          visitedAt: fromDatetimeLocalValue(form.visitedAt),
          location: form.location || null,
          notes: form.notes || null,
          nextAction: form.nextAction || null,
        },
      })
      setOpen(false)
      setForm({
        companyId: '',
        contactId: '',
        visitedAt: toDatetimeLocalValue(),
        location: '',
        notes: '',
        nextAction: '',
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create visit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Visits"
        description="Field visits and next actions."
        actions={<Button onClick={() => setOpen(true)}>Log visit</Button>}
      />
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : visits.length === 0 ? (
        <EmptyState title="No visits yet" description="Log your first customer visit." />
      ) : (
        <div className="space-y-3">
          {visits.map((visit) => (
            <Card key={visit.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{visit.company?.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {formatDateTime(visit.visitedAt)}
                    {visit.location ? ` · ${visit.location}` : ''}
                  </p>
                  <p className="mt-2 text-sm">{visit.notes || 'No notes'}</p>
                  {visit.nextAction ? (
                    <p className="mt-1 text-sm text-teal-800">Next: {visit.nextAction}</p>
                  ) : null}
                </div>
                <div className="text-right text-sm text-[var(--muted)]">
                  <p>{fullName(visit.contact)}</p>
                  <p>by {fullName(visit.createdBy)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} title="Log visit" onClose={() => setOpen(false)}>
        <form onSubmit={onCreate} className="space-y-3">
          <Field label="Company">
            <Select
              required
              value={form.companyId}
              onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value, contactId: '' }))}
            >
              <option value="">Select company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact">
            <Select value={form.contactId} onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))}>
              <option value="">Optional</option>
              {selectedCompany?.contacts?.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {fullName(contact)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Visited at">
            <Input
              type="datetime-local"
              required
              value={form.visitedAt}
              onChange={(e) => setForm((f) => ({ ...f, visitedAt: e.target.value }))}
            />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <Field label="Next action">
            <Input value={form.nextAction} onChange={(e) => setForm((f) => ({ ...f, nextAction: e.target.value }))} />
          </Field>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Save visit'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
