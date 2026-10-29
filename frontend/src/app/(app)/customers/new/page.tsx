'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Select, Textarea } from '@/components/ui'
import { LevelSelect, useCustomerLevels } from '@/components/levels'
import { LeadSourceSelect } from '@/components/leadSources'
import { FollowUpScheduler, emptyFollowUpPlan, followUpPlanPayload } from '@/components/FollowUpScheduler'
import {
  OpportunityFormSection,
  emptyOpportunityPlan,
  opportunityPlanPayload,
} from '@/components/OpportunityFormSection'

export default function NewCustomerPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { levels } = useCustomerLevels()
  const [followUp, setFollowUp] = useState(emptyFollowUpPlan)
  const [opportunity, setOpportunity] = useState(emptyOpportunityPlan)
  const [form, setForm] = useState({
    levelId: null as string | null,
    name: '',
    website: '',
    businessCategory: '',
    addressLine1: '',
    city: '',
    country: '',
    leadSource: 'MANUAL',
    notes: '',
    firstName: '',
    lastName: '',
    jobTitle: '',
    email: '',
    mobile: '',
    phone: '',
  })

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const company = await api<{ id: string }>('/api/customers', {
        method: 'POST',
        body: {
          name: form.name,
          website: form.website || null,
          businessCategory: form.businessCategory || null,
          addressLine1: form.addressLine1 || null,
          city: form.city || null,
          country: form.country || null,
          leadSource: form.leadSource || null,
          levelId: form.levelId,
          notes: form.notes || null,
          contact: {
            firstName: form.firstName,
            lastName: form.lastName,
            jobTitle: form.jobTitle || null,
            email: form.email || null,
            mobile: form.mobile || null,
            phone: form.phone || null,
            isPrimary: true,
          },
          opportunity: opportunityPlanPayload(opportunity),
          followUp: followUpPlanPayload(followUp, form.mobile || form.phone),
        },
      })
      router.push(`/customers/${company.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="New customer" description="Create a company and primary contact." />
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
            <Field label="First name">
              <Input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
            </Field>
            <Field label="Last name">
              <Input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
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
        <OpportunityFormSection
          value={opportunity}
          onChange={setOpportunity}
          companyName={form.name}
        />
        <FollowUpScheduler
          value={followUp}
          onChange={setFollowUp}
          customerMobile={form.mobile || form.phone}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Create customer'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
