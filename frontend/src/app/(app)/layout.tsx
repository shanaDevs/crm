'use client'

import { AppShell } from '@/components/AppShell'
import { CallDeskProvider } from '@/components/CallDeskProvider'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <CallDeskProvider>
      <AppShell>{children}</AppShell>
    </CallDeskProvider>
  )
}
