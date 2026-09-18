const TOKEN_KEY = 'crm_token'
const LIVE_API_URL = 'https://crm-server.dartcodes.cloud'

declare global {
  interface Window {
    __CRM_API_URL__?: string
  }
}

function trimSlash(url: string) {
  return url.replace(/\/+$/, '')
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0'
}

function isLocalApiUrl(url: string) {
  try {
    return isLocalHost(new URL(url).hostname)
  } catch {
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url)
  }
}

/**
 * Resolve API base URL:
 * 1) Runtime CapRover env (`/env.js` → window.__CRM_API_URL__) — ignore localhost on hosted sites
 * 2) On any hosted domain → live backend (never localhost)
 * 3) NEXT_PUBLIC_API_URL build/runtime env (non-local only when hosted)
 * 4) Local fallback → http://localhost:4000
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const onLocalPage = isLocalHost(window.location.hostname)
    const runtime = window.__CRM_API_URL__?.trim()

    if (runtime && (onLocalPage || !isLocalApiUrl(runtime))) {
      return trimSlash(runtime)
    }

    // Hosted domain (CapRover) must never call localhost backend
    if (!onLocalPage) {
      return LIVE_API_URL
    }
  }

  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim()

  if (typeof window === 'undefined') {
    // SSR / build: never emit localhost into production responses
    if (fromEnv && !isLocalApiUrl(fromEnv)) return trimSlash(fromEnv)
    if (fromEnv && process.env.NODE_ENV !== 'production') return trimSlash(fromEnv)
    return process.env.NODE_ENV === 'production' ? LIVE_API_URL : 'http://localhost:4000'
  }

  // Browser on localhost: allow local API
  if (fromEnv) return trimSlash(fromEnv)
  return 'http://localhost:4000'
}

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

type RequestOptions = {
  method?: string
  body?: unknown
  formData?: FormData
  headers?: Record<string, string>
  auth?: boolean
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, headers = {}, auth = true } = options
  const API_URL = getApiBaseUrl()
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/api') ? path : `/api${path}`}`

  const finalHeaders: Record<string, string> = { ...headers }
  if (auth) {
    const token = getToken()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  let payload: BodyInit | undefined
  if (formData) {
    payload = formData
  } else if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: payload,
    credentials: 'include',
  })

  const contentType = res.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null)

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null) ||
      (typeof data === 'string' && data) ||
      res.statusText ||
      'Request failed'
    throw new ApiError(message, res.status, data)
  }

  return data as T
}
