'use client'

import { FormEvent, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Product } from '@/lib/types'
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
  Textarea,
} from '@/components/ui'
import { useAuth } from '@/lib/auth'

export default function ProductsPage() {
  const { isAdmin, isManager } = useAuth()
  const canWrite = isAdmin || isManager
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', category: '' })

  async function load() {
    setLoading(true)
    try {
      setProducts(await api<Product[]>('/api/products'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/api/products', {
        method: 'POST',
        body: {
          name: form.name,
          description: form.description || null,
          category: form.category || null,
        },
      })
      setOpen(false)
      setForm({ name: '', description: '', category: '' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description="Product catalog used across opportunities, requirements, and tickets."
        actions={
          canWrite ? (
            <Button onClick={() => setOpen(true)}>Add product</Button>
          ) : undefined
        }
      />
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : products.length === 0 ? (
        <EmptyState title="No products" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{product.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{product.description || 'No description'}</p>
                </div>
                <Badge tone={product.isActive === false ? 'slate' : 'teal'}>
                  {product.isActive === false ? 'Inactive' : 'Active'}
                </Badge>
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                {product.category || 'Uncategorized'}
                {product._count
                  ? ` · ${product._count.opportunities} opp · ${product._count.requirements} req · ${product._count.tickets} tix`
                  : ''}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} title="New product" onClose={() => setOpen(false)}>
        <form onSubmit={onCreate} className="space-y-3">
          <Field label="Name">
            <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </Field>
          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Create product'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
