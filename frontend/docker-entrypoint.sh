#!/bin/sh
set -eu

# Always write runtime API URL for the browser.
# CapRover: set NEXT_PUBLIC_API_URL or API_URL on the frontend app.
# Default production backend:
DEFAULT_API_URL="https://crm-server.dartcodes.cloud"

node <<'NODE'
const fs = require('fs');
const url = (process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'https://crm-server.dartcodes.cloud').replace(/\/+$/, '');
fs.mkdirSync('/app/public', { recursive: true });
fs.writeFileSync('/app/public/env.js', `window.__CRM_API_URL__=${JSON.stringify(url)};\n`);
console.log('[crm] runtime API URL =>', url);
NODE

exec node server.js
