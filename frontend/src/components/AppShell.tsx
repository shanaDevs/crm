'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  Bell,
  Briefcase,
  Building2,
  Camera,
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  Ticket,
  Users,
  X,
  CalendarClock,
  MapPin,
  DoorOpen,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { fullName } from '@/lib/format'

type NavItem = {
  href: string
  label: string
  icon: ReactNode
  roles?: Array<'CRM_ADMIN' | 'IT_MANAGER' | 'MARKETING_OFFICER' | 'DEVELOPER' | 'CUSTOMER'>
}

const NAV: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'IT_MANAGER', 'MARKETING_OFFICER', 'DEVELOPER'],
  },
  {
    href: '/customers',
    label: 'Customers',
    icon: <Building2 size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'IT_MANAGER', 'MARKETING_OFFICER'],
  },
  {
    href: '/scan',
    label: 'Scan Card',
    icon: <Camera size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'MARKETING_OFFICER'],
  },
  {
    href: '/visits',
    label: 'Visits',
    icon: <MapPin size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'MARKETING_OFFICER'],
  },
  {
    href: '/follow-ups',
    label: 'Follow-ups',
    icon: <CalendarClock size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'IT_MANAGER', 'MARKETING_OFFICER'],
  },
  {
    href: '/products',
    label: 'Products',
    icon: <Package size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'IT_MANAGER', 'MARKETING_OFFICER', 'DEVELOPER', 'CUSTOMER'],
  },
  {
    href: '/opportunities',
    label: 'Opportunities',
    icon: <Briefcase size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'IT_MANAGER', 'MARKETING_OFFICER'],
  },
  {
    href: '/requirements',
    label: 'Requirements',
    icon: <ClipboardList size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'IT_MANAGER', 'MARKETING_OFFICER', 'DEVELOPER', 'CUSTOMER'],
  },
  {
    href: '/tickets',
    label: 'Tickets',
    icon: <Ticket size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'IT_MANAGER', 'MARKETING_OFFICER', 'DEVELOPER', 'CUSTOMER'],
  },
  {
    href: '/team',
    label: 'Team',
    icon: <Users size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'IT_MANAGER'],
  },
  {
    href: '/notifications',
    label: 'Notifications',
    icon: <Bell size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'IT_MANAGER', 'MARKETING_OFFICER', 'DEVELOPER', 'CUSTOMER'],
  },
  {
    href: '/reports',
    label: 'Reports',
    icon: <BarChart3 size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'IT_MANAGER'],
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: <Settings size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN'],
  },
  {
    href: '/portal',
    label: 'Customer Portal',
    icon: <DoorOpen size={18} strokeWidth={2} />,
    roles: ['CRM_ADMIN', 'CUSTOMER'],
  },
]

function SidebarPanel({
  items,
  pathname,
  home,
  userName,
  roleLabel,
  onSignOut,
  onClose,
  showClose,
}: {
  items: NavItem[]
  pathname: string
  home: string
  userName: string
  roleLabel: string
  onSignOut: () => void
  onClose?: () => void
  showClose?: boolean
}) {
  const initial = userName.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="crm-sidebar flex h-full min-h-0 w-full flex-col bg-black text-white">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-neutral-800 px-4 py-4 sm:px-5">
        <Link href={home} className="min-w-0" onClick={onClose}>
          <p className="text-lg font-semibold tracking-tight text-[#c9a227]">CRM Tool</p>
          <p className="mt-0.5 text-xs text-neutral-400">Sales & delivery workspace</p>
        </Link>
        {showClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white hover:bg-white/10"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        ) : null}
      </div>

      <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3" aria-label="Main">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  data-active={active ? 'true' : 'false'}
                  className="crm-nav-link flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
                >
                  <span
                    className="crm-nav-icon inline-flex shrink-0"
                    style={{ color: active ? '#0a0a0a' : '#c9a227' }}
                  >
                    {item.icon}
                  </span>
                  <span
                    className="crm-nav-label min-w-0 flex-1 truncate"
                    style={{
                      color: active ? '#0a0a0a' : '#ffffff',
                      WebkitTextFillColor: active ? '#0a0a0a' : '#ffffff',
                    }}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-neutral-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#c9a227] text-sm font-semibold text-black">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            <p className="truncate text-xs text-neutral-400">{roleLabel}</p>
          </div>
        </div>
        <button
          type="button"
          className="mt-3 inline-flex min-h-10 w-full items-center justify-start gap-2 rounded-lg px-3 text-sm font-medium text-white hover:bg-white/10"
          onClick={onSignOut}
        >
          <LogOut size={16} style={{ color: '#c9a227' }} />
          Sign out
        </button>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) setOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted)]">
        Checking session…
      </div>
    )
  }

  const role = user.roleCode
  const items = NAV.filter((item) => !item.roles || item.roles.includes(role))
  const home = role === 'CUSTOMER' ? '/portal' : '/dashboard'
  const userName = fullName(user)
  const roleLabel = user.roleCode.replaceAll('_', ' ')

  async function signOut() {
    setOpen(false)
    await logout()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Desktop / large tablet sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-neutral-900 lg:block">
        <SidebarPanel
          items={items}
          pathname={pathname}
          home={home}
          userName={userName}
          roleLabel={roleLabel}
          onSignOut={signOut}
        />
      </aside>

      {/* Mobile / tablet drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/65"
            onClick={() => setOpen(false)}
            aria-label="Close menu overlay"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-black shadow-2xl">
            <SidebarPanel
              items={items}
              pathname={pathname}
              home={home}
              userName={userName}
              roleLabel={roleLabel}
              onSignOut={signOut}
              onClose={() => setOpen(false)}
              showClose
            />
          </aside>
        </div>
      ) : null}

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)]/95 px-3 backdrop-blur sm:px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--foreground)]"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu size={20} />
          </button>
          <p className="truncate font-semibold text-[var(--foreground)]">
            <span className="text-[#c9a227]">CRM</span> Tool
          </p>
        </header>
        <main className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
