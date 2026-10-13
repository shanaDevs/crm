'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, ApiError, getApiBaseUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { BusinessCard, Company, Contact } from '@/lib/types'
import { formatDateTime, fullName, statusLabel } from '@/lib/format'
import { LevelBadge, LevelSelect, useCustomerLevels } from '@/components/levels'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  statusTone,
} from '@/components/ui'

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { can } = useAuth()
  const { levels } = useCustomerLevels()
  const [company, setCompany] = useState<Company | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [contactModal, setContactModal] = useState<{ contact: Contact | null } | null>(null)

  function load(id: string) {
    return api<Company>(`/api/customers/${id}`)
      .then(setCompany)
      .catch((err) => setError(err.message || 'Failed to load customer'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (params.id) void load(params.id)
  }, [params.id])

  async function deleteContact(contact: Contact) {
    if (!company || !window.confirm(`Remove contact ${fullName(contact)}?`)) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/customers/${company.id}/contacts/${contact.id}`, { method: 'DELETE' })
      await load(company.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove contact')
    } finally {
      setBusy(false)
    }
  }

  async function changeLevel(levelId: string | null) {
    if (!company) return
    setBusy(true)
    try {
      await api(`/api/customers/${company.id}`, { method: 'PATCH', body: { levelId } })
      setCompany({ ...company, levelId, level: levels.find((l) => l.id === levelId) || null })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update level')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!company) return
    const ok = window.confirm(
      `Delete "${company.name}"?\n\nThis also deletes its contacts, visits, follow-ups, opportunities, requirements and tickets. This cannot be undone.`
    )
    if (!ok) return
    setBusy(true)
    try {
      await api(`/api/customers/${company.id}`, { method: 'DELETE' })
      router.push('/customers')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete customer')
      setBusy(false)
    }
  }

  if (loading) return <LoadingState />
  if (!company) return <ErrorBanner message={error} />

  const addLink = (path: string, permission: string, label: string) =>
    can(permission) ? (
      <Link href={`${path}?new=1&companyId=${company.id}`}>
        <Button size="sm" variant="secondary">
          {label}
        </Button>
      </Link>
    ) : undefined

  return (
    <div>
      <PageHeader
        title={company.name}
        description={[company.city, company.country, company.businessCategory].filter(Boolean).join(' · ') || 'Customer profile'}
        actions={
          <>
            <LevelBadge level={company.level} />
            <Badge tone={statusTone(company.leadStatus)}>{statusLabel(company.leadStatus)}</Badge>
            {can('customers.write') ? (
              <Link href={`/customers/${company.id}/edit`}>
                <Button size="sm" variant="secondary">
                  Edit
                </Button>
              </Link>
            ) : null}
            {can('customers.delete') ? (
              <Button size="sm" variant="danger" onClick={onDelete} disabled={busy}>
                Delete
              </Button>
            ) : null}
          </>
        }
      />
      <ErrorBanner message={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Overview" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Level</dt>
              <dd className="mt-1">
                {can('customers.write') ? (
                  <LevelSelect levels={levels} value={company.level?.id} onChange={changeLevel} disabled={busy} />
                ) : (
                  <LevelBadge level={company.level} />
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Website</dt>
              <dd>{company.website || '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Assigned officer</dt>
              <dd>{fullName(company.assignedOfficer)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Lead source</dt>
              <dd>{company.leadSource || '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Notes</dt>
              <dd className="whitespace-pre-wrap">{company.notes || '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Contacts"
          className="lg:col-span-2"
          action={
            can('customers.write') ? (
              <Button size="sm" variant="secondary" onClick={() => setContactModal({ contact: null })}>
                Add contact
              </Button>
            ) : undefined
          }
        >
          {!company.contacts?.length ? (
            <EmptyState title="No contacts" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {company.contacts.map((contact) => (
                <li key={contact.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium">
                      {fullName(contact)}
                      {contact.isPrimary ? <span className="ml-2 text-xs text-[var(--primary)]">Primary</span> : null}
                    </p>
                    <p className="text-sm text-[var(--muted)]">{contact.jobTitle || '—'}</p>
                  </div>
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="text-sm text-[var(--muted)]">
                      <p>{contact.email || '—'}</p>
                      <p>{contact.mobile || contact.phone || '—'}</p>
                    </div>
                    {can('customers.write') ? (
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setContactModal({ contact })}>
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void deleteContact(contact)} disabled={busy}>
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {contactModal ? (
          <ContactModal
            companyId={company.id}
            contact={contactModal.contact}
            onClose={() => setContactModal(null)}
            onSaved={() => {
              setContactModal(null)
              void load(company.id)
            }}
          />
        ) : null}

        <Card title="Visits" className="lg:col-span-3" action={addLink('/visits', 'visits.write', 'Log visit')}>
          {!company.visits?.length ? (
            <EmptyState title="No visits yet" />
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {company.visits.slice(0, 8).map((visit) => (
                <li key={visit.id} className="flex flex-wrap justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <span>
                    {formatDateTime(visit.visitedAt)}
                    {visit.location ? <span className="text-[var(--muted)]"> · {visit.location}</span> : null}
                  </span>
                  <span className="text-[var(--muted)]">{visit.notes || ''}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/visits" className="mt-3 inline-block text-sm text-[var(--primary)]">
            Open visits →
          </Link>
        </Card>

        <Card title="Business card" className="lg:col-span-3">
          {!company.businessCards?.length ? (
            <EmptyState title="No business card scanned" description="Cards scanned from the Scan Card page appear here." />
          ) : (
            <div className="space-y-4">
              {company.businessCards.map((card) => (
                <BusinessCardView key={card.id} card={card} />
              ))}
            </div>
          )}
        </Card>

        <Card title="Follow-ups" action={addLink('/follow-ups', 'followups.write', 'Schedule')}>
          {!company.followUps?.length ? (
            <EmptyState title="No follow-ups" />
          ) : (
            <ul className="space-y-3 text-sm">
              {company.followUps.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <p className="font-medium">
                    {item.activityType} · {statusLabel(item.status)}
                  </p>
                  <p className="text-[var(--muted)]">{formatDateTime(item.scheduledAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/follow-ups?companyId=${company.id}`} className="mt-3 inline-block text-sm text-[var(--primary)]">
            Open follow-ups →
          </Link>
        </Card>

        <Card title="Opportunities" action={addLink('/opportunities', 'opportunities.write', 'Add')}>
          {!company.opportunities?.length ? (
            <EmptyState title="No opportunities" />
          ) : (
            <ul className="space-y-3 text-sm">
              {company.opportunities.map((opp) => (
                <li key={opp.id}>
                  <p className="font-medium">{opp.title}</p>
                  <p className="text-[var(--muted)]">
                    {opp.product?.name} · {opp.stage?.name || '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tickets & requirements">
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-medium">Tickets</p>
                {addLink('/tickets', 'tickets.write', 'New ticket')}
              </div>
              {!company.tickets?.length ? (
                <p className="text-[var(--muted)]">None</p>
              ) : (
                company.tickets.slice(0, 5).map((ticket) => (
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="mb-1 block hover:text-[var(--primary)]">
                    {ticket.ticketNumber}: {ticket.title}
                  </Link>
                ))
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-medium">Requirements</p>
                {addLink('/requirements', 'requirements.write', 'New requirement')}
              </div>
              {!company.requirements?.length ? (
                <p className="text-[var(--muted)]">None</p>
              ) : (
                company.requirements.slice(0, 5).map((req) => (
                  <Link key={req.id} href={`/requirements/${req.id}`} className="mb-1 block hover:text-[var(--primary)]">
                    {req.title}
                  </Link>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function ContactModal({
  companyId,
  contact,
  onClose,
  onSaved,
}: {
  companyId: string
  contact: Contact | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : '',
    jobTitle: contact?.jobTitle || '',
    email: contact?.email || '',
    mobile: contact?.mobile || '',
    phone: contact?.phone || '',
    isPrimary: Boolean(contact?.isPrimary),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const [firstName, ...rest] = form.name.trim().split(/\s+/)
    setSaving(true)
    setError(null)
    const body = {
      firstName,
      lastName: rest.join(' '),
      jobTitle: form.jobTitle.trim() || null,
      email: form.email.trim() || null,
      mobile: form.mobile.trim() || null,
      phone: form.phone.trim() || null,
      isPrimary: form.isPrimary,
    }
    try {
      await api(contact ? `/api/customers/${companyId}/contacts/${contact.id}` : `/api/customers/${companyId}/contacts`, {
        method: contact ? 'PATCH' : 'POST',
        body,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save contact')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title={contact ? 'Edit contact' : 'Add contact'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Name">
          <Input required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Job title">
          <Input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile">
            <Input value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--primary)]"
            checked={form.isPrimary}
            disabled={Boolean(contact?.isPrimary)}
            onChange={(e) => set('isPrimary', e.target.checked)}
          />
          Primary contact
        </label>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? 'Saving…' : contact ? 'Save changes' : 'Add contact'}
        </Button>
      </form>
    </Modal>
  )
}

function useSignedUrl(key?: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!key) return
    api<{ url: string }>(`/api/files/signed-url?key=${encodeURIComponent(key)}`)
      .then(({ url: signed }) => setUrl(signed.startsWith('/') ? `${getApiBaseUrl()}${signed}` : signed))
      .catch(() => setFailed(true))
  }, [key])

  return { url, failed }
}

function CardImage({ imageKey, label }: { imageKey: string; label: string }) {
  const { url, failed } = useSignedUrl(imageKey)
  return (
    <figure className="min-w-0 flex-1">
      <figcaption className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</figcaption>
      {failed ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
          Image not available
        </div>
      ) : !url ? (
        <div className="h-48 animate-pulse rounded-lg bg-neutral-100" />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${label} of business card`} className="max-h-72 w-full rounded-lg border border-[var(--border)] bg-neutral-50 object-contain" />
        </a>
      )}
    </figure>
  )
}

function BusinessCardView({ card }: { card: BusinessCard }) {
  return (
    <div>
      <p className="mb-2 text-xs text-[var(--muted)]">Scanned {formatDateTime(card.createdAt)}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <CardImage imageKey={card.frontImageKey} label="Front" />
        {card.backImageKey ? <CardImage imageKey={card.backImageKey} label="Back" /> : null}
      </div>
    </div>
  )
}
