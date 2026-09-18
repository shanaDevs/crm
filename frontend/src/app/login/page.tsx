'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { Button, ErrorBanner, Field, Input } from '@/components/ui'

export default function LoginPage() {
  const { login, user, loading, isCustomer } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('admin@crmtool.local')
  const [password, setPassword] = useState('Password123!')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      router.replace(isCustomer ? '/portal' : '/dashboard')
    }
  }, [user, loading, isCustomer, router])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const loggedIn = await login(email.trim(), password)
      router.replace(loggedIn.roleCode === 'CUSTOMER' ? '/portal' : '/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0a] px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(201,162,39,0.22),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(201,162,39,0.08),_transparent_40%)]" />
      <div className="relative w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#121212] p-8 shadow-2xl shadow-black/40">
        <div className="mb-8">
          <p className="text-2xl font-semibold tracking-tight text-[var(--primary)]">CRM Tool</p>
          <p className="mt-2 text-sm text-neutral-400">Sign in to manage customers, follow-ups, and delivery work.</p>
        </div>
        <ErrorBanner message={error} />
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-[#333] bg-[#1a1a1a] text-white placeholder:text-neutral-500 focus:border-[var(--primary)]"
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-[#333] bg-[#1a1a1a] text-white placeholder:text-neutral-500 focus:border-[var(--primary)]"
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <div className="mt-6 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3 text-xs text-neutral-400">
          Demo: admin@crmtool.local · manager@crmtool.local · marketing@crmtool.local · dev@crmtool.local
          <br />
          Password: Password123!
        </div>
      </div>
    </div>
  )
}
