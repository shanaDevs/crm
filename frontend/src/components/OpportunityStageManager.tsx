'use client'

import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { OpportunityStage } from '@/lib/types'
import { Button, ErrorBanner, Field, Input, Modal, Select } from '@/components/ui'
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react'

export function OpportunityStageManager({
  open,
  onClose,
  stages,
  onUpdated,
}: {
  open: boolean
  onClose: () => void
  stages: OpportunityStage[]
  onUpdated: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'OPEN' | 'WON' | 'LOST'>('OPEN')
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<'OPEN' | 'WON' | 'LOST'>('OPEN')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setError(null)
    setAdding(true)
    try {
      await api('/api/opportunities/stages', {
        method: 'POST',
        body: {
          name: newName.trim(),
          isWon: newType === 'WON',
          isLost: newType === 'LOST',
        },
      })
      setNewName('')
      setNewType('OPEN')
      onUpdated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create stage')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(stage: OpportunityStage) {
    setEditingId(stage.id)
    setEditName(stage.name)
    setEditType(stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN')
    setError(null)
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setError(null)
    setSavingEdit(true)
    try {
      await api(`/api/opportunities/stages/${id}`, {
        method: 'PATCH',
        body: {
          name: editName.trim(),
          isWon: editType === 'WON',
          isLost: editType === 'LOST',
        },
      })
      setEditingId(null)
      onUpdated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update stage')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(stage: OpportunityStage) {
    if (stage._count?.opportunities && stage._count.opportunities > 0) {
      setError(`Cannot delete stage "${stage.name}" because it contains ${stage._count.opportunities} opportunities. Move them first.`)
      return
    }
    if (!confirm(`Are you sure you want to delete stage "${stage.name}"?`)) return
    setError(null)
    setDeletingId(stage.id)
    try {
      await api(`/api/opportunities/stages/${stage.id}`, { method: 'DELETE' })
      onUpdated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete stage')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal open={open} title="Manage Pipeline Stages" onClose={onClose}>
      <div className="space-y-4">
        <ErrorBanner message={error} />

        {/* Add new stage */}
        <div className="rounded-lg border border-[var(--border)] bg-slate-50/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">
            Add new stage option
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Stage name">
                <Input
                  placeholder="e.g. Under Review, Negotiation, Won"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleAdd(e)
                    }
                  }}
                />
              </Field>
            </div>
            <div className="w-full sm:w-36">
              <Field label="Outcome type">
                <Select value={newType} onChange={(e) => setNewType(e.target.value as any)}>
                  <option value="OPEN">In Progress</option>
                  <option value="WON">Won (Success)</option>
                  <option value="LOST">Lost (Closed)</option>
                </Select>
              </Field>
            </div>
            <Button
              type="button"
              disabled={adding || !newName.trim()}
              onClick={(e) => void handleAdd(e)}
              className="shrink-0"
            >
              <Plus className="mr-1 h-4 w-4" />
              {adding ? 'Adding…' : 'Add stage'}
            </Button>
          </div>
        </div>

        {/* List of existing stages */}
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Current stages ({stages.length})
          </p>
          {stages.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--muted)]">No stages found.</p>
          ) : (
            stages.map((stage) => {
              const isEditing = editingId === stage.id
              const oppCount = stage._count?.opportunities ?? 0

              if (isEditing) {
                return (
                  <div
                    key={stage.id}
                    className="flex flex-col gap-2 rounded-lg border border-[var(--primary)] bg-white p-3 shadow-sm sm:flex-row sm:items-center"
                  >
                    <div className="flex-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Stage name"
                      />
                    </div>
                    <div className="w-full sm:w-32">
                      <Select value={editType} onChange={(e) => setEditType(e.target.value as any)}>
                        <option value="OPEN">In Progress</option>
                        <option value="WON">Won</option>
                        <option value="LOST">Lost</option>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        disabled={savingEdit || !editName.trim()}
                        onClick={() => void saveEdit(stage.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={stage.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 transition hover:bg-slate-50/50"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-medium text-sm text-[var(--foreground)]">{stage.name}</span>
                    {stage.isWon ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                        Won
                      </span>
                    ) : stage.isLost ? (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
                        Lost
                      </span>
                    ) : (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                        In progress
                      </span>
                    )}
                    <span className="text-xs text-[var(--muted)]">
                      ({oppCount} {oppCount === 1 ? 'deal' : 'deals'})
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(stage)}
                      title="Edit stage"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={deletingId === stage.id || oppCount > 0}
                      onClick={() => void handleDelete(stage)}
                      title={oppCount > 0 ? 'Cannot delete stage with active opportunities' : 'Delete stage'}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  )
}
