# CRM Tool

npm workspaces monorepo with separate **backend** and **frontend** packages.

```
crmtool/
  package.json      # workspace root — npm run dev
  backend/          # Express + Prisma + PostgreSQL (port 4000)
  frontend/         # Next.js UI (port 3000)
```

## Quick start

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

- API: http://localhost:4000  
- UI: http://localhost:3000  

### Demo logins (password: `Password123!`)

| Email | Role |
|-------|------|
| admin@crmtool.local | CRM Admin |
| manager@crmtool.local | IT Manager |
| marketing@crmtool.local | Marketing Officer |
| dev@crmtool.local | Developer |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Backend + frontend together |
| `npm run dev:backend` | API only |
| `npm run dev:frontend` | UI only |
| `npm run db:push` | Push Prisma schema |
| `npm run db:seed` | Seed roles, users, products |
| `npm run build` | Build both packages |

## Docker / GHCR CI

Pushing to `main`/`master` builds and publishes images to GitHub Container Registry:

- `ghcr.io/<owner>/<repo>/backend`
- `ghcr.io/<owner>/<repo>/frontend`

See [docs/ghcr.md](docs/ghcr.md) for setup and pull instructions.
