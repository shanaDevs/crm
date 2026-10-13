'use client'

import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fromDatetimeLocalValue, statusLabel, toDatetimeLocalValue } from '@/lib/format'
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui'

export const ACTIVITY_TYPES = ['CALL', 'VISIT', 'MEETING', 'DEMO', 'FOLLOW_UP'] as const
export const PURPOSES = ['INTRODUCTION', 'QUOTATION', 'REQUIREMENTS', 'PAYMENT', 'SUPPORT'] as const
export const REMINDERS = [
  { minutes: 0, label: 'At the scheduled time' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
]

export type FollowUpPlanForm = {
  enabled: boolean
  scheduledAt: string
  activityType: (typeof ACTIVITY_TYPES)[number]
  purpose: (typeof PURPOSES)[number]
  reminderMinutes: number
  notes: string
  smsCustomer: boolean
  smsAssignee: boolean
}

export function emptyFollowUpPlan(): FollowUpPlanForm {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(10, 0, 0, 0)
  return {
    enabled: false,
    scheduledAt: toDatetimeLocalValue(tomorrow),
    activityType: 'CALL',
    purpose: 'INTRODUCTION',
    reminderMinutes: 60,
    notes: '',
    smsCustomer: true,
    smsAssignee: true,
  }
}

/** Request body for the `followUp` field, or undefined when no follow-up should be created. */
export function followUpPlanPayload(plan: FollowUpPlanForm, customerMobile: string) {
  if (!plan.enabled) return undefined
  return {
    scheduledAt: fromDatetimeLocalValue(plan.scheduledAt),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    activityType: plan.activityType,
    purpose: plan.purpose,
    reminderMinutes: plan.reminderMinutes,
    notes: plan.notes.trim() || null,
    smsCustomer: plan.smsCustomer && Boolean(customerMobile.trim()),
    smsAssignee: plan.smsAssignee,
  }
}

export function FollowUpScheduler({
  value,
  onChange,
  customerMobile,
}: {
  value: FollowUpPlanForm
  onChange: (next: FollowUpPlanForm) => void
  customerMobile: string
}) {
  const { user, can, refresh } = useAuth()
  const [phoneDraft, setPhoneDraft] = useState('')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  if (!can('followups.write')) return null

  const set = <K extends keyof FollowUpPlanForm>(key: K, v: FollowUpPlanForm[K]) => onChange({ ...value, [key]: v })
  const hasCustomerMobile = Boolean(customerMobile.trim())

  async function savePhone() {
    setPhoneSaving(true)
    setPhoneError(null)
    try {
      await api('/api/auth/me', { method: 'PATCH', body: { phone: phoneDraft } })
      await refresh()
    } catch (err) {
      setPhoneError(err instanceof ApiError ? err.message : 'Failed to save your number')
    } finally {
      setPhoneSaving(false)
    }
  }

  return (
    <Card title="Follow-up">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--primary)]"
          checked={value.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
        />
        Schedule a follow-up for this customer
      </label>

      {value.enabled ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Date & time">
            <Input
              type="datetime-local"
              required
              min={toDatetimeLocalValue()}
              value={value.scheduledAt}
              onChange={(e) => set('scheduledAt', e.target.value)}
            />
          </Field>
          <Field label="Activity">
            <Select
              value={value.activityType}
              onChange={(e) => set('activityType', e.target.value as FollowUpPlanForm['activityType'])}
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {statusLabel(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Purpose">
            <Select value={value.purpose} onChange={(e) => set('purpose', e.target.value as FollowUpPlanForm['purpose'])}>
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {statusLabel(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reminder">
            <Select value={value.reminderMinutes} onChange={(e) => set('reminderMinutes', Number(e.target.value))}>
              {REMINDERS.map((r) => (
                <option key={r.minutes} value={r.minutes}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={value.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>

          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm font-medium">SMS reminder</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                checked={value.smsCustomer && hasCustomerMobile}
                disabled={!hasCustomerMobile}
                onChange={(e) => set('smsCustomer', e.target.checked)}
              />
              <span>
                Text the customer{hasCustomerMobile ? ` (${customerMobile.trim()})` : ''}
                {!hasCustomerMobile ? (
                  <span className="block text-xs text-[var(--muted)]">Add the contact&rsquo;s mobile number to enable this.</span>
                ) : null}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                checked={value.smsAssignee}
                onChange={(e) => set('smsAssignee', e.target.checked)}
              />
              <span>Text me{user?.phone ? ` (${user.phone})` : ''}</span>
            </label>
            {value.smsAssignee && !user?.phone ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p>Your account has no mobile number, so you won&rsquo;t get the SMS. Add one:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Input
                    className="max-w-xs"
                    placeholder="e.g. 0771234567"
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={phoneSaving || !phoneDraft.trim()}
                    onClick={() => void savePhone()}
                  >
                    {phoneSaving ? 'Saving…' : 'Save my number'}
                  </Button>
                </div>
                {phoneError ? <p className="mt-1 text-xs text-red-700">{phoneError}</p> : null}
              </div>
            ) : null}
            <p className="text-xs text-[var(--muted)]">
              The reminder is sent{' '}
              {REMINDERS.find((r) => r.minutes === value.reminderMinutes)?.label.toLowerCase() || 'before the follow-up'}. You
              also get an in-app notification.
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
