#!/bin/sh
set -eu

# Always write runtime API URL for the browser.
# CapRover: set NEXT_PUBLIC_API_URL or API_URL on the frontend app.
# Never bake localhost into production images / hosted deploys.
DEFAULT_API_URL="https://crm-server.dartcodes.cloud"

node <<'NODE'
const fs = require('fs');

const DEFAULT = 'https://crm-server.dartcodes.cloud';
const raw = (process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || DEFAULT).trim();
const cleaned = raw.replace(/\/+$/, '');

function isLocalApi(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0';
  } catch {
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
  }
}

// Hosted CapRover must never point the browser at localhost.
const url = !cleaned || isLocalApi(cleaned) ? DEFAULT : cleaned;
const target = '/app/public/env.js';
const body = `window.__CRM_API_URL__=${JSON.stringify(url)};\n`;

try {
  fs.mkdirSync('/app/public', { recursive: true });
  fs.writeFileSync(target, body);
  console.log('[crm] runtime API URL =>', url);
} catch (err) {
  console.error('[crm] failed to write', target, err && err.message ? err.message : err);
  console.error('[crm] continuing with baked env.js / client fallbacks');
}
NODE

exec node server.js

