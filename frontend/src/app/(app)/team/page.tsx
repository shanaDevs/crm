'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { TeamMember } from '@/lib/types'
import { fullName } from '@/lib/format'
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
} from '@/components/ui'

type Workload = {
  id: string
  name: string
  role: string
  openTickets: number
  activeRequirements: number
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [workload, setWorkload] = useState<Workload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api<TeamMember[]>('/api/team'), api<Workload[]>('/api/team/workload')])
      .then(([m, w]) => {
        setMembers(m)
        setWorkload(w)
      })
      .catch((err) => setError(err.message || 'Failed to load team'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />

  return (
    <div>
      <PageHeader title="Team" description="Staff directory and delivery workload." />
      <ErrorBanner message={error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Members">
          {!members.length ? (
            <EmptyState title="No team members" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {members.map((member) => (
                <li key={member.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium">{fullName(member)}</p>
                    <p className="text-sm text-[var(--muted)]">{member.email}</p>
                  </div>
                  <div className="text-right">
                    <Badge tone={member.isActive ? 'teal' : 'slate'}>{member.role.name}</Badge>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {member._count
                        ? `${member._count.followUpsAssigned} FU · ${member._count.ticketsAssigned} tix`
                        : ''}
                    </p>
                  </div>
                </li>
              ))}
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
    </div>
  )
}
