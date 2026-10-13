'use client'

import { FormEvent, use, useEffect, useRef, useState } from 'react'
import { LocateFixed, MapPin, Search } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Company, Visit } from '@/lib/types'
import { formatDateTime, fullName, fromDatetimeLocalValue, toDatetimeLocalValue } from '@/lib/format'
import { LocationPicker, mapsLink, type LatLng } from '@/components/LocationPicker'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui'

type SearchResult = { address: string; lat: number; lng: number }

const emptyForm = (companyId = '') => ({
  companyId,
  contactId: '',
  visitedAt: toDatetimeLocalValue(),
  location: '',
  notes: '',
  nextAction: '',
  saveAsCompanyAddress: false,
})

export default function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = use(searchParams)
  const presetCompanyId = typeof query.companyId === 'string' ? query.companyId : ''
  const { can } = useAuth()
  const canWrite = can('visits.write')
  const [visits, setVisits] = useState<Visit[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(Boolean(query.new))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => emptyForm(presetCompanyId))
  const [coords, setCoords] = useState<LatLng | null>(null)
  /** True once the user types the address; map moves then only suggest an address instead of overwriting it. */
  const addressTypedRef = useRef(false)
  const [suggestedAddress, setSuggestedAddress] = useState<string | null>(null)
  const [geoStatus, setGeoStatus] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])

  function load() {
    return Promise.all([api<Visit[]>('/api/visits'), api<Company[]>('/api/customers')])
      .then(([v, c]) => {
        setVisits(v)
        setCompanies(c)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load visits'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
  }, [])

  const selectedCompany = companies.find((c) => c.id === form.companyId)

  function resetForm() {
    setForm(emptyForm(presetCompanyId))
    setEditingId(null)
    setCoords(null)
    addressTypedRef.current = false
    setSuggestedAddress(null)
    setGeoStatus(null)
    setSearchResults([])
  }

  function openEdit(visit: Visit) {
    resetForm()
    setEditingId(visit.id)
    setForm({
      companyId: visit.companyId || visit.company?.id || '',
      contactId: visit.contactId || '',
      visitedAt: toDatetimeLocalValue(visit.visitedAt),
      location: visit.location || '',
      notes: visit.notes || '',
      nextAction: visit.nextAction || '',
      saveAsCompanyAddress: false,
    })
    if (visit.latitude != null && visit.longitude != null) setCoords({ lat: visit.latitude, lng: visit.longitude })
    addressTypedRef.current = Boolean(visit.location)
    setOpen(true)
  }

  async function onDelete(visit: Visit) {
    if (!window.confirm(`Delete the visit to ${visit.company?.name} on ${formatDateTime(visit.visitedAt)}?`)) return
    setError(null)
    try {
      await api(`/api/visits/${visit.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete visit')
    }
  }

  async function pinMoved(pos: LatLng) {
    setCoords(pos)
    setSearchResults([])
    setGeoStatus('Looking up address…')
    try {
      const { address } = await api<{ address: string | null }>(`/api/geo/reverse?lat=${pos.lat}&lng=${pos.lng}`)
      setGeoStatus(address ? null : 'No address found for this point; type one below.')
      if (!address) return
      if (addressTypedRef.current) {
        setSuggestedAddress(address)
      } else {
        setForm((f) => ({ ...f, location: address }))
        setSuggestedAddress(null)
      }
    } catch (err) {
      setGeoStatus(err instanceof ApiError ? `Address lookup failed: ${err.message}` : 'Address lookup failed')
    }
  }

  function locateMe() {
    if (!('geolocation' in navigator)) {
      setGeoStatus('This browser cannot share its location.')
      return
    }
    setGeoStatus('Getting your current location…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        addressTypedRef.current = false
        void pinMoved({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      (err) =>
        setGeoStatus(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was blocked. Allow location for this site in the browser, or click the map.'
            : 'Could not get your location. Click the map or type the address instead.'
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )
  }

  async function findTypedAddress() {
    const q = form.location.trim()
    if (q.length < 3) return
    setGeoStatus('Searching…')
    try {
      const results = await api<SearchResult[]>(`/api/geo/search?q=${encodeURIComponent(q)}`)
      setSearchResults(results)
      setGeoStatus(results.length ? null : 'No matches found. Click the map to place the pin instead.')
      if (results.length === 1) {
        setCoords({ lat: results[0].lat, lng: results[0].lng })
        setSearchResults([])
      }
    } catch (err) {
      setGeoStatus(err instanceof ApiError ? err.message : 'Address search failed')
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api(editingId ? `/api/visits/${editingId}` : '/api/visits', {
        method: editingId ? 'PATCH' : 'POST',
        body: {
          companyId: form.companyId,
          contactId: form.contactId || null,
          visitedAt: fromDatetimeLocalValue(form.visitedAt),
          location: form.location || null,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          saveAsCompanyAddress: form.saveAsCompanyAddress && Boolean(form.location.trim()),
          notes: form.notes || null,
          nextAction: form.nextAction || null,
        },
      })
      setOpen(false)
      resetForm()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save visit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Visits"
        description="Field visits and next actions."
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                resetForm()
                setOpen(true)
              }}
            >
              Log visit
            </Button>
          ) : undefined
        }
      />
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : visits.length === 0 ? (
        <EmptyState title="No visits yet" description="Log your first customer visit." />
      ) : (
        <div className="space-y-3">
          {visits.map((visit) => (
            <Card key={visit.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{visit.company?.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {formatDateTime(visit.visitedAt)}
                    {visit.location ? ` · ${visit.location}` : ''}
                  </p>
                  {visit.latitude != null && visit.longitude != null ? (
                    <a
                      href={mapsLink(visit.latitude, visit.longitude)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
                    >
                      <MapPin size={14} /> View on map
                    </a>
                  ) : null}
                  <p className="mt-2 text-sm">{visit.notes || 'No notes'}</p>
                  {visit.nextAction ? (
                    <p className="mt-1 text-sm text-teal-800">Next: {visit.nextAction}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2 text-right text-sm text-[var(--muted)]">
                  <p>{fullName(visit.contact)}</p>
                  <p>by {fullName(visit.createdBy)}</p>
                  {canWrite ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(visit)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void onDelete(visit)}>
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} title={editingId ? 'Edit visit' : 'Log visit'} onClose={() => setOpen(false)} wide>
        <form onSubmit={onCreate} className="space-y-3">
          <ErrorBanner message={error} />
          <Field label="Company">
            <Select
              required
              value={form.companyId}
              onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value, contactId: '' }))}
            >
              <option value="">Select company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact">
            <Select value={form.contactId} onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))}>
              <option value="">Optional</option>
              {selectedCompany?.contacts?.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {fullName(contact)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Visited at">
            <Input
              type="datetime-local"
              required
              value={form.visitedAt}
              onChange={(e) => setForm((f) => ({ ...f, visitedAt: e.target.value }))}
            />
          </Field>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Location</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={locateMe}>
                  <LocateFixed size={14} /> Use my current location
                </Button>
                {coords ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setCoords(null)}>
                    Remove pin
                  </Button>
                ) : null}
              </div>
            </div>
            <LocationPicker value={coords} onChange={(pos) => void pinMoved(pos)} />
            <p className="mt-1 text-xs text-[var(--muted)]">
              {geoStatus ||
                (coords
                  ? `Pin at ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}. Drag it or click the map to adjust.`
                  : 'Tap “Use my current location”, or click the map to drop a pin. Optional.')}
            </p>
          </div>
          <Field label="Address">
            <div className="flex gap-2">
              <Input
                value={form.location}
                placeholder="Filled from the map, or type an address"
                onChange={(e) => {
                  addressTypedRef.current = e.target.value.trim().length > 0
                  setSuggestedAddress(null)
                  setForm((f) => ({ ...f, location: e.target.value }))
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => void findTypedAddress()}
                disabled={form.location.trim().length < 3}
                title="Find this address on the map"
              >
                <Search size={14} /> Find
              </Button>
            </div>
            {suggestedAddress ? (
              <button
                type="button"
                className="mt-1 text-left text-xs text-[var(--primary)] hover:underline"
                onClick={() => {
                  setForm((f) => ({ ...f, location: suggestedAddress }))
                  addressTypedRef.current = false
                  setSuggestedAddress(null)
                }}
              >
                Use map address instead: {suggestedAddress}
              </button>
            ) : null}
            {searchResults.length > 1 ? (
              <ul className="mt-2 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] text-sm">
                {searchResults.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-[var(--gold-soft)]"
                      onClick={() => {
                        setCoords({ lat: r.lat, lng: r.lng })
                        setSearchResults([])
                      }}
                    >
                      {r.address}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {can('customers.write') && form.companyId ? (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={form.saveAsCompanyAddress}
                  onChange={(e) => setForm((f) => ({ ...f, saveAsCompanyAddress: e.target.checked }))}
                />
                Also save this as {selectedCompany?.name || 'the customer'}&rsquo;s address
              </label>
            ) : null}
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <Field label="Next action">
            <Input value={form.nextAction} onChange={(e) => setForm((f) => ({ ...f, nextAction: e.target.value }))} />
          </Field>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Save visit'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
