'use client'

import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  LoadingState,
  PageHeader,
} from '@/components/ui'

export default function SettingsPage() {
  const { user, isAdmin } = useAuth()
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState('reminder.defaultMinutes')
  const [value, setValue] = useState('15')
  const [saving, setSaving] = useState(false)
  const [spacesResult, setSpacesResult] = useState<string | null>(null)
  const [aiStatus, setAiStatus] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState<string | null>(null)

  useEffect(() => {
    api<Record<string, unknown>>('/api/settings')
      .then(setSettings)
      .catch((err) => setError(err.message || 'Failed to load settings'))
      .finally(() => setLoading(false))

    api<{ provider: string; model: string | null; configured: boolean; live: boolean }>('/api/settings/ai-status')
      .then((s) =>
        setAiStatus(
          s.live
            ? `Gemini live · model ${s.model}`
            : `Provider: ${s.provider}${s.configured ? '' : ' (not configured)'}`
        )
      )
      .catch(() => setAiStatus(null))
  }, [])

  async function saveSetting() {
    setSaving(true)
    setError(null)
    try {
      let parsed: unknown = value
      try {
        parsed = JSON.parse(value)
      } catch {
        parsed = value
      }
      await api(`/api/settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: { value: parsed },
      })
      const refreshed = await api<Record<string, unknown>>('/api/settings')
      setSettings(refreshed)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save setting')
    } finally {
      setSaving(false)
    }
  }

  async function testSpaces() {
    setSpacesResult(null)
    try {
      const result = await api<Record<string, unknown>>('/api/settings/test-spaces', { method: 'POST' })
      setSpacesResult(JSON.stringify(result))
    } catch (err) {
      setSpacesResult(err instanceof Error ? err.message : 'Test failed')
    }
  }

  async function testAi() {
    setAiResult(null)
    try {
      const result = await api<{ ok: boolean; message: string; model?: string }>('/api/settings/test-ai', {
        method: 'POST',
      })
      setAiResult(`${result.ok ? 'OK' : 'Failed'}: ${result.message}${result.model ? ` (${result.model})` : ''}`)
    } catch (err) {
      setAiResult(err instanceof Error ? err.message : 'AI test failed')
    }
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <PageHeader title="Settings" description="System configuration and account overview." />
      <ErrorBanner message={error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your account">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Name</dt>
              <dd>
                {user?.firstName} {user?.lastName}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Role</dt>
              <dd>{user?.roleCode}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Timezone</dt>
              <dd>{user?.timezone}</dd>
            </div>
          </dl>
        </Card>

        <Card title="System settings">
          {!Object.keys(settings).length ? (
            <p className="text-sm text-[var(--muted)]">No settings stored yet.</p>
          ) : (
            <ul className="mb-4 space-y-2 text-sm">
              {Object.entries(settings).map(([k, v]) => (
                <li key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="font-medium">{k}</p>
                  <pre className="mt-1 overflow-x-auto text-xs text-[var(--muted)]">
                    {typeof v === 'string' ? v : JSON.stringify(v)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
          {isAdmin ? (
            <div className="space-y-3 border-t border-[var(--border)] pt-4">
              <Field label="Key">
                <Input value={key} onChange={(e) => setKey(e.target.value)} />
              </Field>
              <Field label="Value (JSON or string)">
                <Input value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void saveSetting()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save setting'}
                </Button>
                <Button variant="secondary" onClick={() => void testSpaces()}>
                  Test Spaces
                </Button>
                <Button variant="secondary" onClick={() => void testAi()}>
                  Test Gemini AI
                </Button>
              </div>
              {aiStatus ? <p className="text-xs text-[var(--muted)]">AI: {aiStatus}</p> : null}
              {aiResult ? <p className="text-xs text-[var(--muted)]">{aiResult}</p> : null}
              {spacesResult ? <p className="text-xs text-[var(--muted)]">{spacesResult}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Only admins can edit system settings.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
