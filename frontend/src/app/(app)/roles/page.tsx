'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { PermissionInfo, Role, RoleCode } from '@/lib/types'
import { PermissionPicker } from '@/components/permissions'
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
  Select,
} from '@/components/ui'

const BASE_TYPES: Array<{ code: RoleCode; label: string; hint: string }> = [
  { code: 'MARKETING_OFFICER', label: 'Sales / field staff', hint: 'Dashboard shows only their own follow-ups' },
  { code: 'IT_MANAGER', label: 'Manager', hint: 'Sees the team-wide delivery queue' },
  { code: 'DEVELOPER', label: 'Delivery / developer', hint: 'Sees only work assigned to them' },
]

function fetchRolesAndPermissions() {
  return Promise.all([api<Role[]>('/api/roles'), api<PermissionInfo[]>('/api/roles/permissions')])
}

type Draft = {
  id?: string
  name: string
  description: string
  baseCode: RoleCode
  permissions: string[]
  isSystem: boolean
}

export default function RolesPage() {
  const { can, refresh } = useAuth()
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<PermissionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(
    () =>
      fetchRolesAndPermissions()
        .then(([r, p]) => {
          setRoles(r)
          setPermissions(p)
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load roles'))
        .finally(() => setLoading(false)),
    []
  )

  useEffect(() => {
    fetchRolesAndPermissions()
      .then(([r, p]) => {
        setRoles(r)
        setPermissions(p)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load roles'))
      .finally(() => setLoading(false))
  }, [])

  function openNew() {
    setFormError(null)
    setDraft({ name: '', description: '', baseCode: 'MARKETING_OFFICER', permissions: ['dashboard.read', 'notifications.read'], isSystem: false })
  }

  function openEdit(role: Role) {
    setFormError(null)
    setDraft({
      id: role.id,
      name: role.name,
      description: role.description || '',
      baseCode: role.code,
      permissions: role.permissions,
      isSystem: role.isSystem,
    })
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    setSaving(true)
    setFormError(null)
    try {
      const body = {
        name: draft.isSystem ? undefined : draft.name,
        description: draft.description,
        baseCode: draft.isSystem ? undefined : draft.baseCode,
        permissions: draft.permissions,
      }
      if (draft.id) await api(`/api/roles/${draft.id}`, { method: 'PATCH', body })
      else await api('/api/roles', { method: 'POST', body })
      setDraft(null)
      await Promise.all([load(), refresh()])
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save role')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(role: Role) {
    if (!window.confirm(`Delete the role "${role.name}"?`)) return
    try {
      await api(`/api/roles/${role.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete role')
    }
  }

  if (!can('roles.manage')) {
    return <EmptyState title="No access" description="You need the “Create roles and edit role permissions” permission." />
  }
  if (loading) return <LoadingState />

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        description="Create roles and choose what each role can do. You can also fine-tune a single user from the Team page."
        actions={<Button onClick={openNew}>New role</Button>}
      />
      <ErrorBanner message={error} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => {
          const isAdminRole = role.code === 'CRM_ADMIN'
          return (
            <Card
              key={role.id}
              title={role.name}
              action={role.isSystem ? <Badge>Built-in</Badge> : <Badge tone="teal">Custom</Badge>}
            >
              <p className="min-h-10 text-sm text-[var(--muted)]">{role.description || '—'}</p>
              <p className="mt-3 text-sm">
                {isAdminRole ? 'All permissions' : `${role.permissions.length} permissions`} ·{' '}
                {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {isAdminRole ? (
                  <p className="text-xs text-[var(--muted)]">Super admin always has full access.</p>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => openEdit(role)}>
                    Edit permissions
                  </Button>
                )}
                {!role.isSystem ? (
                  <Button size="sm" variant="ghost" onClick={() => onDelete(role)} disabled={role.userCount > 0}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </Card>
          )
        })}
      </div>

      <Modal open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? `Edit role: ${draft.name}` : 'New role'} wide>
        {draft ? (
          <form onSubmit={onSave} className="space-y-4">
            <ErrorBanner message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role name">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  disabled={draft.isSystem}
                  required
                />
              </Field>
              <Field label="Access type">
                <Select
                  value={draft.baseCode}
                  onChange={(e) => setDraft({ ...draft, baseCode: e.target.value as RoleCode })}
                  disabled={draft.isSystem}
                >
                  {BASE_TYPES.some((t) => t.code === draft.baseCode) ? null : (
                    <option value={draft.baseCode}>{draft.baseCode === 'CUSTOMER' ? 'Customer portal' : draft.baseCode}</option>
                  )}
                  {BASE_TYPES.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {BASE_TYPES.find((t) => t.code === draft.baseCode)?.hint || 'Built-in access type'}
                </p>
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Field>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Permissions</p>
              <PermissionPicker
                permissions={permissions}
                value={draft.permissions}
                onChange={(codes) => setDraft({ ...draft, permissions: codes })}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : draft.id ? 'Save role' : 'Create role'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
