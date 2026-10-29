'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Company } from '@/lib/types'
import { LevelSelect, useCustomerLevels } from '@/components/levels'
import { LeadSourceSelect } from '@/components/leadSources'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui'

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING', 'CONVERTED', 'LOST'] as const

const emptyForm = {
  name: '',
  website: '',
  businessCategory: '',
  addressLine1: '',
  city: '',
  country: '',
  leadSource: '',
  leadStatus: 'NEW',
  levelId: '' as string | null,
  notes: '',
  contactName: '',
  jobTitle: '',
  email: '',
  mobile: '',
  phone: '',
}

export default function EditCustomerPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { can } = useAuth()
  const { levels } = useCustomerLevels()
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.id) return
    api<Company>(`/api/customers/${params.id}`)
      .then((c) => {
        const primary = c.contacts?.find((x) => x.isPrimary) || c.contacts?.[0]
        setForm({
          name: c.name,
          website: c.website || '',
          businessCategory: c.businessCategory || '',
          addressLine1: c.addressLine1 || '',
          city: c.city || '',
          country: c.country || '',
          leadSource: c.leadSource || '',
          leadStatus: c.leadStatus || 'NEW',
          levelId: c.level?.id || null,
          notes: c.notes || '',
          contactName: [primary?.firstName, primary?.lastName].filter(Boolean).join(' '),
          jobTitle: primary?.jobTitle || '',
          email: primary?.email || '',
          mobile: primary?.mobile || '',
          phone: primary?.phone || '',
        })
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load customer'))
      .finally(() => setLoading(false))
  }, [params.id])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const [firstName = '', ...rest] = form.contactName.trim().split(/\s+/)
    try {
      await api(`/api/customers/${params.id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          website: form.website || null,
          businessCategory: form.businessCategory || null,
          addressLine1: form.addressLine1 || null,
          city: form.city || null,
          country: form.country || null,
          leadSource: form.leadSource || null,
          leadStatus: form.leadStatus,
          levelId: form.levelId || null,
          notes: form.notes || null,
          primaryContact: {
            firstName,
            lastName: rest.join(' '),
            jobTitle: form.jobTitle || null,
            email: form.email || null,
            mobile: form.mobile || null,
            phone: form.phone || null,
          },
        },
      })
      router.push(`/customers/${params.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save customer')
    } finally {
      setSaving(false)
    }
  }

  if (!can('customers.write')) {
    return <EmptyState title="No access" description="You need permission to edit customers." />
  }
  if (loading) return <LoadingState />

  return (
    <div>
      <PageHeader title={`Edit ${form.name || 'customer'}`} description="Update company details, level and primary contact." />
      <ErrorBanner message={error} />
      <form onSubmit={onSubmit} className="space-y-4">
        <Card title="Company">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <Input required value={form.name} onChange={(e) => update('name', e.target.value)} />
            </Field>
            <Field label="Level">
              <LevelSelect levels={levels} value={form.levelId} onChange={(id) => update('levelId', id)} />
            </Field>
            <Field label="Lead status">
              <Select value={form.leadStatus} onChange={(e) => update('leadStatus', e.target.value)}>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Website">
              <Input value={form.website} onChange={(e) => update('website', e.target.value)} />
            </Field>
            <Field label="Category">
              <Input value={form.businessCategory} onChange={(e) => update('businessCategory', e.target.value)} />
            </Field>
            <Field label="Lead source">
              <LeadSourceSelect
                value={form.leadSource}
                onChange={(value) => update('leadSource', value)}
              />
            </Field>
            <Field label="Address">
              <Input value={form.addressLine1} onChange={(e) => update('addressLine1', e.target.value)} />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
            </Field>
            <Field label="Country">
              <Input value={form.country} onChange={(e) => update('country', e.target.value)} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} />
            </Field>
          </div>
        </Card>
        <Card title="Primary contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={form.contactName} onChange={(e) => update('contactName', e.target.value)} />
            </Field>
            <Field label="Job title">
              <Input value={form.jobTitle} onChange={(e) => update('jobTitle', e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
            </Field>
            <Field label="Mobile">
              <Input value={form.mobile} onChange={(e) => update('mobile', e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} />
            </Field>
          </div>
        </Card>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
