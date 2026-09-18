# GitHub Container Registry (GHCR)

On every push to `main`/`master` (and version tags `v*`), GitHub Actions builds and pushes:

- `ghcr.io/<owner>/<repo>-backend`
- `ghcr.io/<owner>/<repo>-frontend`

For this repo (`shanaDevs/crm`):

- `ghcr.io/shanadevs/crm-backend:latest`
- `ghcr.io/shanadevs/crm-frontend:latest`

> Flat names are required. Nested names like `ghcr.io/.../crm/frontend` stay **private forever** on GHCR, so CapRover often shows “image not found” / 401.

PRs build images but do not push.

## One-time GitHub setup

1. Push this repository to GitHub.
2. Repo → **Settings** → **Actions** → **General** → Workflow permissions → **Read and write permissions**.
3. Optional: **Settings** → **Secrets and variables** → **Actions** → Variables → `NEXT_PUBLIC_API_URL` (public API URL baked into the frontend image).
4. After the first green run, open your GitHub profile/org → **Packages**.
5. Confirm each package (`crm-backend`, `crm-frontend`) is **Public** (workflow tries to set this automatically).

## CapRover image names

| App | Image |
|-----|--------|
| Backend | `ghcr.io/shanadevs/crm-backend:latest` |
| Frontend | `ghcr.io/shanadevs/crm-frontend:latest` |

If CapRover still cannot pull, add a GitHub PAT with `read:packages` as the registry password, or make the packages Public.

## Pull images

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
docker pull ghcr.io/shanadevs/crm-backend:latest
docker pull ghcr.io/shanadevs/crm-frontend:latest
```

## Local build

```bash
docker build -t crmtool-backend ./backend
docker build -t crmtool-frontend --build-arg NEXT_PUBLIC_API_URL=https://crm-server.dartcodes.cloud ./frontend

# or
docker compose build
```
