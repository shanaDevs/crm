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

const emptyForm = () => ({ name: '', description: '', category: '', isActive: true })

export default function ProductsPage() {
  const { can } = useAuth()
  const canWrite = can('products.write')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  function load() {
    return api<Product[]>('/api/products')
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load products'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setOpen(true)
  }

  function openEdit(product: Product) {
    setEditingId(product.id)
    setForm({
      name: product.name,
      description: product.description || '',
      category: product.category || '',
      isActive: product.isActive !== false,
    })
    setFormError(null)
    setOpen(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      isActive: form.isActive,
    }
    try {
      if (editingId) await api(`/api/products/${editingId}`, { method: 'PATCH', body })
      else await api('/api/products', { method: 'POST', body })
      setOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(product: Product) {
    if (!window.confirm(`Delete product "${product.name}"?`)) return
    setError(null)
    try {
      await api(`/api/products/${product.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete product')
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description="Product catalog used across opportunities, requirements, and tickets."
        actions={canWrite ? <Button onClick={openCreate}>Add product</Button> : undefined}
      />
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : products.length === 0 ? (
        <EmptyState title="No products" description={canWrite ? 'Use “Add product” to create one.' : undefined} />
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
              {canWrite ? (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(product)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void onDelete(product)}>
                    Delete
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} title={editingId ? 'Edit product' : 'New product'} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-3">
          <ErrorBanner message={formError} />
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create product'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
