'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { ErrorBanner, LoadingState, PageHeader, StatCard } from '@/components/ui'

type Summary = {
  companies: number
  opportunitiesWon: number
  opportunitiesLost: number
  completedFollowUps: number
  openTickets: number
  completedRequirements: number
  conversionRate: number
}

export default function ReportsPage() {
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<Summary>('/api/reports/summary')
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load reports'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />
  if (error) return <ErrorBanner message={error} />
  if (!data) return null

  return (
    <div>
      <PageHeader title="Reports" description="High-level CRM and delivery summary." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Companies" value={data.companies} />
        <StatCard label="Opportunities won" value={data.opportunitiesWon} />
        <StatCard label="Opportunities lost" value={data.opportunitiesLost} />
        <StatCard label="Conversion rate" value={`${data.conversionRate}%`} />
        <StatCard label="Completed follow-ups" value={data.completedFollowUps} />
        <StatCard label="Open tickets" value={data.openTickets} />
        <StatCard label="Completed requirements" value={data.completedRequirements} />
      </div>
    </div>
  )
}
