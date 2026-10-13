'use client'

import type { PermissionInfo } from '@/lib/types'
import { cn } from '@/components/ui'

/**
 * Grouped permission checkboxes. Permissions the current user can't grant are shown locked.
 * When `baseline` is given (the role's permissions), differences are marked as user-specific.
 */
export function PermissionPicker({
  permissions,
  value,
  onChange,
  baseline,
  disabled,
}: {
  permissions: PermissionInfo[]
  value: string[]
  onChange: (codes: string[]) => void
  baseline?: string[]
  disabled?: boolean
}) {
  const selected = new Set(value)
  const groups = permissions.reduce<Record<string, PermissionInfo[]>>((acc, p) => {
    ;(acc[p.group] ||= []).push(p)
    return acc
  }, {})

  function toggle(code: string, on: boolean) {
    const next = new Set(selected)
    if (on) next.add(code)
    else next.delete(code)
    onChange(Array.from(next))
  }

  function setGroup(items: PermissionInfo[], on: boolean) {
    const next = new Set(selected)
    for (const p of items) {
      if (!p.grantable) continue
      if (on) next.add(p.code)
      else next.delete(p.code)
    }
    onChange(Array.from(next))
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(groups).map(([group, items]) => {
        const editable = items.filter((p) => p.grantable)
        const allOn = editable.length > 0 && editable.every((p) => selected.has(p.code))
        return (
          <fieldset key={group} className="rounded-lg border border-[var(--border)] p-3">
            <legend className="flex w-full items-center justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              <span>{group}</span>
              {editable.length > 1 && !disabled ? (
                <button
                  type="button"
                  className="text-[11px] font-medium normal-case text-[var(--primary)] hover:underline"
                  onClick={() => setGroup(items, !allOn)}
                >
                  {allOn ? 'Clear' : 'Select all'}
                </button>
              ) : null}
            </legend>
            <ul className="mt-1 space-y-1.5">
              {items.map((p) => {
                const checked = selected.has(p.code)
                const differsFromRole = baseline ? checked !== baseline.includes(p.code) : false
                const locked = disabled || !p.grantable
                return (
                  <li key={p.code}>
                    <label
                      className={cn('flex items-start gap-2 text-sm', locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}
                      title={!p.grantable ? "You can't grant a permission you don't have" : p.code}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                        checked={checked}
                        disabled={locked}
                        onChange={(e) => toggle(p.code, e.target.checked)}
                      />
                      <span className="flex-1">
                        {p.name}
                        {differsFromRole ? (
                          <span className={cn('ml-2 text-[11px] font-medium', checked ? 'text-emerald-700' : 'text-red-700')}>
                            {checked ? 'added for this user' : 'removed for this user'}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        )
      })}
    </div>
  )
}
