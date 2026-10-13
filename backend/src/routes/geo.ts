import { Router } from 'express'
import { requireAuth, requirePermission } from '../middleware/auth'

/**
 * Address lookup via OpenStreetMap Nominatim. Its usage policy requires an identifying
 * User-Agent and at most one request per second, so calls are proxied and serialized here.
 */
const NOMINATIM_URL = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org'
const USER_AGENT = `crmtool/1.0${process.env.GEOCODER_EMAIL ? ` (${process.env.GEOCODER_EMAIL})` : ''}`
const MIN_INTERVAL_MS = 1100

let queue: Promise<unknown> = Promise.resolve()
let lastCallAt = 0
const cache = new Map<string, unknown>()

function nominatim<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${NOMINATIM_URL}${path}?${new URLSearchParams({ format: 'jsonv2', ...params })}`
  const cached = cache.get(url)
  if (cached) return Promise.resolve(cached as T)

  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCallAt = Date.now()
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } })
    if (!res.ok) throw new Error(`Geocoder returned ${res.status}`)
    const json = (await res.json()) as T
    if (cache.size > 500) cache.clear()
    cache.set(url, json)
    return json
  })
  queue = run.catch(() => undefined)
  return run
}

const router = Router()
router.use(requireAuth)

router.get('/reverse', requirePermission('visits.write'), async (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'Valid lat and lng are required' })
  }
  try {
    const data = await nominatim<{ display_name?: string }>('/reverse', {
      lat: lat.toFixed(6),
      lon: lng.toFixed(6),
      zoom: '18',
      addressdetails: '0',
    })
    return res.json({ address: data.display_name || null })
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Address lookup failed' })
  }
})

router.get('/search', requirePermission('visits.write'), async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 3) return res.status(400).json({ error: 'Type at least 3 characters' })
  try {
    const data = await nominatim<Array<{ display_name: string; lat: string; lon: string }>>('/search', {
      q,
      limit: '5',
      ...(process.env.GEOCODER_COUNTRY_CODES ? { countrycodes: process.env.GEOCODER_COUNTRY_CODES } : {}),
    })
    return res.json(data.map((d) => ({ address: d.display_name, lat: Number(d.lat), lng: Number(d.lon) })))
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Address search failed' })
  }
})

export default router
