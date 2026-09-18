'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import type { CardScanResult, Company, Product } from '@/lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Textarea,
} from '@/components/ui'

type Step = 'capture' | 'review'

export default function ScanPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('capture')
  const [front, setFront] = useState<File | null>(null)
  const [back, setBack] = useState<File | null>(null)
  const [frontPreview, setFrontPreview] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scan, setScan] = useState<CardScanResult | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [linkCompanyId, setLinkCompanyId] = useState<string>('')
  const [form, setForm] = useState({
    companyName: '',
    website: '',
    addressLine1: '',
    businessCategory: '',
    notes: '',
    firstName: '',
    lastName: '',
    jobTitle: '',
    email: '',
    mobile: '',
    phone: '',
    linkedinUrl: '',
    twitterUrl: '',
  })

  useEffect(() => {
    api<Product[]>('/api/products').then(setProducts).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!front) {
      setFrontPreview(null)
      return
    }
    const url = URL.createObjectURL(front)
    setFrontPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [front])

  async function onScan(e: FormEvent) {
    e.preventDefault()
    if (!front) {
      setError('Front card image is required')
      return
    }
    setScanning(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('front', front)
      if (back) fd.append('back', back)
      const result = await api<CardScanResult>('/api/cards/scan', { method: 'POST', formData: fd })
      setScan(result)
      const x = result.extraction || {}
      setForm({
        companyName: x.companyName || '',
        website: x.website || '',
        addressLine1: x.address || '',
        businessCategory: '',
        notes: '',
        firstName: x.firstName || '',
        lastName: x.lastName || '',
        jobTitle: x.jobTitle || '',
        email: x.email || '',
        mobile: x.mobile || '',
        phone: x.phone || '',
        linkedinUrl: x.linkedinUrl || '',
        twitterUrl: x.twitterUrl || '',
      })
      setLinkCompanyId('')
      setStep('review')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function onConfirm(e: FormEvent) {
    e.preventDefault()
    if (!scan) return
    setSaving(true)
    setError(null)
    try {
      const result = await api<Company>('/api/cards/confirm', {
        method: 'POST',
        body: {
          cardId: scan.cardId,
          linkCompanyId: linkCompanyId || undefined,
          interestedProductIds: selectedProducts,
          company: {
            name: form.companyName,
            website: form.website || undefined,
            businessCategory: form.businessCategory || undefined,
            addressLine1: form.addressLine1 || undefined,
            leadSource: 'BUSINESS_CARD',
            notes: form.notes || undefined,
          },
          contact: {
            firstName: form.firstName,
            lastName: form.lastName,
            jobTitle: form.jobTitle || undefined,
            email: form.email || undefined,
            mobile: form.mobile || undefined,
            phone: form.phone || undefined,
            website: form.website || undefined,
            linkedinUrl: form.linkedinUrl || undefined,
            twitterUrl: form.twitterUrl || undefined,
          },
        },
      })
      router.push(`/customers/${result.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to confirm card')
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div>
      <PageHeader
        title="Scan business card"
        description="Capture front (and optional back), review AI extraction, then create or link a customer."
      />
      <ErrorBanner message={error} />

      {step === 'capture' ? (
        <form onSubmit={onScan} className="mx-auto max-w-xl space-y-4">
          <Card title="Card images">
            <div className="space-y-4">
              <Field label="Front (required)">
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setFront(e.target.files?.[0] || null)}
                  required
                />
              </Field>
              {frontPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frontPreview} alt="Front preview" className="max-h-56 w-full rounded-lg object-contain bg-slate-100" />
              ) : null}
              <Field label="Back (optional)">
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setBack(e.target.files?.[0] || null)}
                />
              </Field>
            </div>
          </Card>
          <Button type="submit" className="w-full sm:w-auto" disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan & extract'}
          </Button>
        </form>
      ) : (
        <form onSubmit={onConfirm} className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="teal">Mode: {scan?.mode || 'ai'}</Badge>
            <Button type="button" variant="secondary" size="sm" onClick={() => setStep('capture')}>
              Rescan
            </Button>
          </div>

          {scan?.duplicates?.length ? (
            <Card title="Possible duplicates">
              <ul className="space-y-2">
                {scan.duplicates.map((dup) => (
                  <li key={dup.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
                    <div>
                      <p className="font-medium">{dup.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {dup.contacts?.[0]?.email || dup.contacts?.[0]?.mobile || 'Existing company'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={linkCompanyId === dup.id ? 'primary' : 'secondary'}
                      onClick={() => setLinkCompanyId(linkCompanyId === dup.id ? '' : dup.id)}
                    >
                      {linkCompanyId === dup.id ? 'Selected' : 'Link instead'}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState title="No duplicates detected" description="You can create a new customer from this card." />
          )}

          <Card title="Company">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name">
                <Input required value={form.companyName} onChange={(e) => update('companyName', e.target.value)} />
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={(e) => update('website', e.target.value)} />
              </Field>
              <Field label="Address">
                <Input value={form.addressLine1} onChange={(e) => update('addressLine1', e.target.value)} />
              </Field>
              <Field label="Category">
                <Input value={form.businessCategory} onChange={(e) => update('businessCategory', e.target.value)} />
              </Field>
              <Field label="Notes" className="sm:col-span-2">
                <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="Contact">
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

          <Card title="Interested products">
            <div className="flex flex-wrap gap-2">
              {products.map((product) => {
                const active = selectedProducts.includes(product.id)
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() =>
                      setSelectedProducts((prev) =>
                        active ? prev.filter((id) => id !== product.id) : [...prev, product.id]
                      )
                    }
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      active
                        ? 'border-[var(--primary)] bg-teal-50 text-teal-900'
                        : 'border-[var(--border)] bg-white text-[var(--foreground)]'
                    }`}
                  >
                    {product.name}
                  </button>
                )
              })}
            </div>
          </Card>

          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : linkCompanyId ? 'Link to selected company' : 'Create customer'}
          </Button>
        </form>
      )}
    </div>
  )
}
