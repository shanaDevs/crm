import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

function spacesConfigured() {
  return Boolean(
    process.env.DO_SPACES_KEY &&
      process.env.DO_SPACES_SECRET &&
      process.env.DO_SPACES_BUCKET &&
      (process.env.DO_SPACES_ENDPOINT || process.env.DO_SPACES_REGION)
  )
}

/**
 * DigitalOcean Spaces TLS cert is only `*.sgp1.digitaloceanspaces.com`.
 * Buckets with dots (e.g. `dartcodes.data`) cannot use virtual-hosted URLs like
 * `https://dartcodes.data.sgp1.digitaloceanspaces.com` — path-style on the
 * region endpoint is required: `https://sgp1.digitaloceanspaces.com/bucket/key`.
 */
function resolveSpacesEndpoint() {
  const region = (process.env.DO_SPACES_REGION || 'sgp1').trim()
  const raw = (process.env.DO_SPACES_ENDPOINT || '').trim().replace(/\/+$/, '')
  const bucket = (process.env.DO_SPACES_BUCKET || '').trim()

  if (!raw) {
    return `https://${region}.digitaloceanspaces.com`
  }

  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const host = u.hostname.toLowerCase()

    // Already a region endpoint: sgp1.digitaloceanspaces.com
    if (/^[a-z0-9-]+\.digitaloceanspaces\.com$/.test(host)) {
      return `${u.protocol}//${host}`
    }

    // Virtual-hosted / bucket subdomain → strip to region endpoint
    // e.g. dartcodes.data.sgp1.digitaloceanspaces.com → sgp1.digitaloceanspaces.com
    const m = host.match(/(?:^|\.)(([a-z0-9-]+)\.digitaloceanspaces\.com)$/)
    if (m) {
      return `${u.protocol}//${m[1]}`
    }
  } catch {
    // fall through
  }

  // If someone pasted the bucket host without parsing, still prefer region URL
  if (bucket && raw.includes(bucket)) {
    return `https://${region}.digitaloceanspaces.com`
  }

  return raw
}

function getClient() {
  if (!spacesConfigured()) return null

  const endpoint = resolveSpacesEndpoint()

  return new S3Client({
    region: process.env.DO_SPACES_REGION || 'sgp1',
    endpoint,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    },
    // Required for buckets with dots (TLS wildcard is only *.sgp1.digitaloceanspaces.com).
    forcePathStyle: true,
  })
}

const memoryStore = new Map<string, { buffer: Buffer; mimeType: string; fileName: string }>()

export async function uploadPrivateFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folder = 'uploads'
) {
  const prefix = process.env.DO_SPACES_FOLDER_PREFIX || 'crmtool/'
  const key = `${prefix}${folder}/${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const client = getClient()

  if (!client) {
    memoryStore.set(key, { buffer, mimeType, fileName })
    return { key, storage: 'memory' as const }
  }

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ACL: 'private',
    })
  )
  return { key, storage: 'spaces' as const }
}

export async function getSignedDownloadUrl(key: string, expiresIn = 300) {
  const client = getClient()
  if (!client) {
    if (!memoryStore.has(key)) throw new Error('File not found')
    return `/api/files/local?key=${encodeURIComponent(key)}`
  }
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET!,
      Key: key,
    }),
    { expiresIn }
  )
}

export function getLocalFile(key: string) {
  return memoryStore.get(key)
}

export async function testSpacesConnection() {
  const client = getClient()
  if (!client) {
    return { ok: false, mode: 'memory', message: 'Spaces credentials not configured; using in-memory storage' }
  }
  try {
    await client.send(new HeadBucketCommand({ Bucket: process.env.DO_SPACES_BUCKET! }))
    return {
      ok: true,
      mode: 'spaces',
      message: `Connected to DigitalOcean Spaces (${resolveSpacesEndpoint()}, path-style)`,
    }
  } catch (err) {
    return { ok: false, mode: 'spaces', message: err instanceof Error ? err.message : 'Connection failed' }
  }
}
