'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { LeadSource } from '@/lib/types'
import { Button, ErrorBanner, Input, Modal, Select } from '@/components/ui'

const FALLBACK_SOURCES: LeadSource[] = [
  { id: 'default-1', name: 'Manual', sortOrder: 1 },
  { id: 'default-2', name: 'Business card', sortOrder: 2 },
  { id: 'default-3', name: 'Referral', sortOrder: 3 },
  { id: 'default-4', name: 'Website', sortOrder: 4 },
  { id: 'default-5', name: 'Event', sortOrder: 5 },
]

function fetchLeadSources() {
  return api<LeadSource[]>('/api/lead-sources').catch(() => FALLBACK_SOURCES)
}

export function useLeadSources() {
  const [sources, setSources] = useState<LeadSource[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(() => {
    return fetchLeadSources().then((data) => {
      setSources(data.length > 0 ? data : FALLBACK_SOURCES)
      setLoaded(true)
      return data
    })
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { sources, loaded, reload }
}

export function LeadSourceManager({
  open,
  onClose,
  sources,
  onChanged,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  sources: LeadSource[]
  onChanged: () => void | Promise<unknown>
  onSelect?: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

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

  function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) return

    void run(async () => {
      const created = await api<LeadSource>('/api/lead-sources', {
        method: 'POST',
        body: { name: trimmed },
      })
      setName('')
      if (onSelect && created?.name) {
        onSelect(created.name)
      }
    })
  }

  function startEditing(source: LeadSource) {
    setEditingId(source.id)
    setEditName(source.name)
    setError(null)
  }

  function cancelEditing() {
    setEditingId(null)
    setEditName('')
  }

  function saveEditing(source: LeadSource) {
    const trimmed = editName.trim()
    if (!trimmed) {
      setError('Lead source name cannot be empty')
      return
    }
    if (trimmed === source.name) {
      setEditingId(null)
      return
    }

    void run(async () => {
      const updated = await api<LeadSource>(`/api/lead-sources/${source.id}`, {
        method: 'PATCH',
        body: { name: trimmed },
      })
      setEditingId(null)
      if (onSelect && updated?.name) {
        onSelect(updated.name)
      }
    })
  }

  function deleteSource(source: LeadSource) {
    const msg = `Delete lead source "${source.name}"?`
    if (!window.confirm(msg)) return

    void run(async () => {
      await api(`/api/lead-sources/${source.id}`, { method: 'DELETE' })
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage Lead Sources">
      <ErrorBanner message={error} />

      {/* Add new lead source */}
      <div className="mb-4 flex items-center gap-2">
        <Input
          placeholder="New lead source (e.g. LinkedIn, Exhibition)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          disabled={busy}
        />
        <Button type="button" onClick={handleAdd} disabled={busy || !name.trim()}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {/* Existing lead sources list */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Existing Lead Sources</h4>
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)]">
          {sources.length === 0 ? (
            <li className="px-3 py-3 text-sm text-[var(--muted)]">No lead sources found</li>
          ) : null}
          {sources.map((source) => {
            const isEditing = editingId === source.id
            return (
              <li key={source.id} className="flex items-center justify-between gap-2 px-3 py-2">
                {isEditing ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={editName}
                      disabled={busy}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          saveEditing(source)
                        } else if (e.key === 'Escape') {
                          cancelEditing()
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={busy || !editName.trim()}
                      onClick={() => saveEditing(source)}
                      title="Save changes"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={cancelEditing}
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-medium text-[var(--foreground)]">{source.name}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => startEditing(source)}
                        title="Edit lead source name"
                      >
                        <Pencil className="h-3.5 w-3.5 text-[var(--muted)]" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => deleteSource(source)}
                        title="Delete lead source"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}

export function LeadSourceSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string | null | undefined
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  const { sources, reload } = useLeadSources()
  const [modalOpen, setModalOpen] = useState(false)

  // Map normalized string values (e.g. MANUAL -> Manual) if needed
  const normalizedValue = value || ''
  const hasExactMatch = sources.some(
    (s) => s.name === normalizedValue || s.name.toUpperCase() === normalizedValue.toUpperCase()
  )

  return (
    <div className="flex items-center gap-2">
      <Select
        value={normalizedValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={className || 'flex-1'}
      >
        {/* If the current value is not in the sources list (e.g. uppercase legacy MANUAL), keep it visible */}
        {normalizedValue && !hasExactMatch ? <option value={normalizedValue}>{normalizedValue}</option> : null}
        {sources.map((source) => {
          // If the passed value matches case-insensitively, align the option value
          const optionValue =
            normalizedValue.toUpperCase() === source.name.toUpperCase() ? normalizedValue : source.name
          return (
            <option key={source.id} value={optionValue}>
              {source.name}
            </option>
          )
        })}
      </Select>
      <Button
        type="button"
        variant="secondary"
        size="md"
        disabled={disabled}
        onClick={() => setModalOpen(true)}
        className="shrink-0 px-3"
        title="Add or edit lead sources"
        aria-label="Add or edit lead sources"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <LeadSourceManager
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        sources={sources}
        onChanged={reload}
        onSelect={(newSourceName) => {
          onChange(newSourceName)
        }}
      />
    </div>
  )
}
