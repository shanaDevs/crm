import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns'

export function fullName(person?: { firstName?: string; lastName?: string } | null) {
  if (!person) return '—'
  return `${person.firstName || ''} ${person.lastName || ''}`.trim() || '—'
}

export function formatDate(value?: string | null, pattern = 'MMM d, yyyy') {
  if (!value) return '—'
  const date = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(date)) return '—'
  return format(date, pattern)
}

export function formatDateTime(value?: string | null) {
  return formatDate(value, 'MMM d, yyyy · h:mm a')
}

export function relativeTime(value?: string | null) {
  if (!value) return ''
  const date = parseISO(value)
  if (!isValid(date)) return ''
  return formatDistanceToNow(date, { addSuffix: true })
}

export function statusLabel(value?: string) {
  if (!value) return '—'
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function toDatetimeLocalValue(value?: string | Date) {
  const d = value ? (typeof value === 'string' ? new Date(value) : value) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string) {
  return new Date(value).toISOString()
}
