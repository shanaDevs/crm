#!/bin/sh
set -eu

# Runtime API URL for CapRover / Docker (no rebuild needed)
# Set NEXT_PUBLIC_API_URL or API_URL in the container env.
node -e "const fs=require('fs'); const u=process.env.NEXT_PUBLIC_API_URL||process.env.API_URL||''; fs.mkdirSync('/app/public',{recursive:true}); fs.writeFileSync('/app/public/env.js','window.__CRM_API_URL__='+JSON.stringify(u)+';\\n'); console.log('CRM API URL:', u||'(empty — using build-time NEXT_PUBLIC_API_URL)');"

exec node server.js
