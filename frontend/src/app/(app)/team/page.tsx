'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { ManagedUser, PermissionInfo, PermissionOverride, Role, TeamMember } from '@/lib/types'
import { fullName } from '@/lib/format'
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

type Workload = {
  id: string
  name: string
  role: string
  openTickets: number
  activeRequirements: number
}

type UserDraft = {
  id?: string
  email: string
  firstName: string
  lastName: string
  phone: string
  password: string
  roleId: string
  isActive: boolean
  /** Effective permissions shown in the picker; overrides are the diff from the role. */
  permissions: string[]
}

type TeamData = {
  members: TeamMember[]
  workload: Workload[]
  roles: Role[]
  permissions: PermissionInfo[]
}

async function fetchTeamData(includeAccess: boolean): Promise<TeamData> {
  const [members, workload, roles, permissions] = await Promise.all([
    api<TeamMember[]>('/api/team'),
    api<Workload[]>('/api/team/workload'),
    includeAccess ? api<Role[]>('/api/roles') : Promise.resolve([]),
    includeAccess ? api<PermissionInfo[]>('/api/roles/permissions') : Promise.resolve([]),
  ])
  return { members, workload, roles, permissions }
}

function applyOverrides(rolePermissions: string[], overrides: PermissionOverride[]) {
  const set = new Set(rolePermissions)
  for (const o of overrides) {
    if (o.granted) set.add(o.code)
    else set.delete(o.code)
  }
  return Array.from(set)
}

function diffOverrides(rolePermissions: string[], effective: string[]): PermissionOverride[] {
  const role = new Set(rolePermissions)
  const eff = new Set(effective)
  const out: PermissionOverride[] = []
  for (const code of eff) if (!role.has(code)) out.push({ code, granted: true })
  for (const code of role) if (!eff.has(code)) out.push({ code, granted: false })
  return out
}

export default function TeamPage() {
  const { user: me, can, isAdmin, refresh } = useAuth()
  const canEdit = can('team.write')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [workload, setWorkload] = useState<Workload[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<PermissionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<UserDraft | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const apply = useCallback((data: TeamData) => {
    setMembers(data.members)
    setWorkload(data.workload)
    setRoles(data.roles)
    setPermissions(data.permissions)
  }, [])

  const load = useCallback(
    () =>
      fetchTeamData(canEdit)
        .then(apply)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load team')),
    [canEdit, apply]
  )

  useEffect(() => {
    fetchTeamData(canEdit)
      .then(apply)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load team'))
      .finally(() => setLoading(false))
  }, [canEdit, apply])

  const grantable = useMemo(() => new Set(permissions.filter((p) => p.grantable).map((p) => p.code)), [permissions])

  /** Roles this user may hand out: never the portal role, and (for non-admins) nothing above their own access. */
  const assignableRoles = useMemo(
    () =>
      roles.filter(
        (r) =>
          r.code !== 'CUSTOMER' &&
          (isAdmin || (r.code !== 'CRM_ADMIN' && r.permissions.every((code) => grantable.has(code))))
      ),
    [roles, isAdmin, grantable]
  )

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const draftRole = draft ? roleById.get(draft.roleId) : undefined
  const draftIsAdminRole = draftRole?.code === 'CRM_ADMIN'

  function openNew() {
    const role = assignableRoles.find((r) => r.name === 'Marketing Officer') || assignableRoles[0]
    setFormError(null)
    setDraft({
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      password: '',
      roleId: role?.id || '',
      isActive: true,
      permissions: role?.permissions || [],
    })
  }

  async function openEdit(member: TeamMember) {
    setFormError(null)
    try {
      const u = await api<ManagedUser>(`/api/team/${member.id}`)
      setDraft({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone || '',
        password: '',
        roleId: u.role.id,
        isActive: u.isActive,
        permissions: applyOverrides(u.rolePermissions, u.overrides),
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load user')
    }
  }

  function changeRole(roleId: string) {
    if (!draft) return
    const prevRole = roleById.get(draft.roleId)
    const nextRole = roleById.get(roleId)
    // Keep the user-specific tweaks when switching roles.
    const overrides = prevRole ? diffOverrides(prevRole.permissions, draft.permissions) : []
    setDraft({ ...draft, roleId, permissions: applyOverrides(nextRole?.permissions || [], overrides) })
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!draft || !draftRole) return
    setSaving(true)
    setFormError(null)
    const isSelf = draft.id === me?.id
    const overrides = draftIsAdminRole ? [] : diffOverrides(draftRole.permissions, draft.permissions)
    try {
      if (draft.id) {
        await api(`/api/team/${draft.id}`, {
          method: 'PATCH',
          body: {
            firstName: draft.firstName,
            lastName: draft.lastName,
            phone: draft.phone,
            password: draft.password || undefined,
            ...(isSelf ? {} : { roleId: draft.roleId, isActive: draft.isActive, overrides }),
          },
        })
      } else {
        await api('/api/team', {
          method: 'POST',
          body: {
            email: draft.email,
            firstName: draft.firstName,
            lastName: draft.lastName,
            phone: draft.phone || undefined,
            password: draft.password,
            roleId: draft.roleId,
            overrides,
          },
        })
      }
      setDraft(null)
      await load()
      if (isSelf) await refresh()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save user')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />

  const editingSelf = Boolean(draft?.id && draft.id === me?.id)

  return (
    <div>
      <PageHeader
        title="Team"
        description="Staff directory, roles and delivery workload."
        actions={canEdit ? <Button onClick={openNew}>Add user</Button> : undefined}
      />
      <ErrorBanner message={error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Members">
          {!members.length ? (
            <EmptyState title="No team members" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {members.map((member) => {
                const lockedAdmin = member.role.code === 'CRM_ADMIN' && !isAdmin
                return (
                  <li key={member.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {fullName(member)}
                        {!member.isActive ? <span className="ml-2 text-xs text-red-700">Inactive</span> : null}
                      </p>
                      <p className="truncate text-sm text-[var(--muted)]">{member.email}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={member.isActive ? 'teal' : 'slate'}>{member.role.name}</Badge>
                      <p className="text-xs text-[var(--muted)]">
                        {member._count
                          ? `${member._count.followUpsAssigned} FU · ${member._count.ticketsAssigned} tix`
                          : ''}
                      </p>
                      {canEdit && !lockedAdmin ? (
                        <Button size="sm" variant="secondary" onClick={() => openEdit(member)}>
                          Edit
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        <Card title="Workload">
          {!workload.length ? (
            <EmptyState title="No workload data" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {workload.map((row) => (
                <li key={row.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-[var(--muted)]">{row.role.replaceAll('_', ' ')}</p>
                  </div>
                  <p className="text-sm text-[var(--muted)]">
                    {row.openTickets} tickets · {row.activeRequirements} requirements
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Edit user: ${draft.firstName} ${draft.lastName}`.trim() : 'Add user'}
        wide
      >
        {draft ? (
          <form onSubmit={onSave} className="space-y-4">
            <ErrorBanner message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name">
                <Input value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} required />
              </Field>
              <Field label="Last name">
                <Input value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  disabled={Boolean(draft.id)}
                  required
                />
              </Field>
              <Field label="Phone">
                <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </Field>
              <Field label={draft.id ? 'New password (leave blank to keep)' : 'Password'}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                  required={!draft.id}
                  placeholder="At least 8 characters"
                />
              </Field>
              <Field label="Role">
                <Select value={draft.roleId} onChange={(e) => changeRole(e.target.value)} disabled={editingSelf} required>
                  {draftRole && !assignableRoles.some((r) => r.id === draftRole.id) ? (
                    <option value={draftRole.id}>{draftRole.name}</option>
                  ) : null}
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {draft.id ? (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--primary)]"
                    checked={draft.isActive}
                    disabled={editingSelf}
                    onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                  />
                  Active (unticking signs the user out and blocks login)
                </label>
              ) : null}
            </div>

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Permissions for this user</p>
              <p className="mb-3 text-xs text-[var(--muted)]">
                {draftIsAdminRole
                  ? 'CRM Admin always has every permission.'
                  : editingSelf
                    ? "You can't change your own permissions."
                    : `Starts from the “${draftRole?.name || 'role'}” role. Tick or untick to give this user extra access or take some away, without changing the role.`}
              </p>
              {!draftIsAdminRole ? (
                <PermissionPicker
                  permissions={permissions}
                  value={draft.permissions}
                  baseline={draftRole?.permissions}
                  onChange={(codes) => setDraft({ ...draft, permissions: codes })}
                  disabled={editingSelf}
                />
              ) : null}
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : draft.id ? 'Save user' : 'Create user'}
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
