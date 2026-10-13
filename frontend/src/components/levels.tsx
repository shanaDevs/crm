'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { CustomerLevel } from '@/lib/types'
import { Button, ErrorBanner, Input, Modal, Select } from '@/components/ui'

function fetchLevels() {
  return api<CustomerLevel[]>('/api/customer-levels').catch(() => [] as CustomerLevel[])
}

export function useCustomerLevels() {
  const [levels, setLevels] = useState<CustomerLevel[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(
    () =>
      fetchLevels().then((data) => {
        setLevels(data)
        setLoaded(true)
      }),
    []
  )

  useEffect(() => {
    fetchLevels().then((data) => {
      setLevels(data)
      setLoaded(true)
    })
  }, [])

  return { levels, loaded, reload }
}

export function LevelBadge({ level }: { level?: Pick<CustomerLevel, 'name' | 'color'> | null }) {
  if (!level) return <span className="text-xs text-[var(--muted)]">No level</span>
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${level.color}1f`, color: level.color }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: level.color }} />
      {level.name}
    </span>
  )
}

export function LevelSelect({
  levels,
  value,
  onChange,
  disabled,
  className,
}: {
  levels: CustomerLevel[]
  value: string | null | undefined
  onChange: (levelId: string | null) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className={className}
    >
      <option value="">No level</option>
      {levels.map((level) => (
        <option key={level.id} value={level.id}>
          {level.name}
        </option>
      ))}
    </Select>
  )
}

export function LevelsManager({
  open,
  onClose,
  levels,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  levels: CustomerLevel[]
  onChanged: () => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#c9a227')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  function onAdd(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      await api('/api/customer-levels', { method: 'POST', body: { name, color } })
      setName('')
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Customer levels">
      <ErrorBanner message={error} />
      <ul className="mb-4 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {levels.length === 0 ? <li className="px-3 py-3 text-sm text-[var(--muted)]">No levels yet</li> : null}
        {levels.map((level) => (
          <li key={level.id} className="flex items-center gap-2 px-3 py-2">
            <input
              type="color"
              value={level.color}
              disabled={busy}
              onChange={(e) =>
                void run(() => api(`/api/customer-levels/${level.id}`, { method: 'PATCH', body: { color: e.target.value } }))
              }
              className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-white"
              aria-label={`Colour for ${level.name}`}
            />
            <Input
              defaultValue={level.name}
              disabled={busy}
              onBlur={(e) => {
                const next = e.target.value.trim()
                if (next && next !== level.name) {
                  void run(() => api(`/api/customer-levels/${level.id}`, { method: 'PATCH', body: { name: next } }))
                }
              }}
            />
            <span className="shrink-0 text-xs text-[var(--muted)]">{level._count?.companies ?? 0} customers</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                const used = level._count?.companies ?? 0
                const msg = used
                  ? `Delete level "${level.name}"? ${used} customer(s) will be set to no level.`
                  : `Delete level "${level.name}"?`
                if (window.confirm(msg)) void run(() => api(`/api/customer-levels/${level.id}`, { method: 'DELETE' }))
              }}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd} className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-10 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-white"
          aria-label="New level colour"
        />
        <Input placeholder="New level name, e.g. Gold" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button type="submit" disabled={busy || !name.trim()}>
          Add
        </Button>
      </form>
    </Modal>
  )
}
