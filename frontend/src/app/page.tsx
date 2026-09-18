'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function HomePage() {
  const { user, loading, isCustomer } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/login')
    else if (isCustomer) router.replace('/portal')
    else router.replace('/dashboard')
  }, [user, loading, isCustomer, router])

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
      Redirecting…
    </div>
  )
}
