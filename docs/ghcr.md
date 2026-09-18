# GitHub Container Registry (GHCR)

On every push to `main`/`master` (and version tags `v*`), GitHub Actions builds and pushes:

- `ghcr.io/<owner>/<repo>/backend`
- `ghcr.io/<owner>/<repo>/frontend`

PRs build images but do not push.

## One-time GitHub setup

1. Push this repository to GitHub.
2. Repo → **Settings** → **Actions** → **General** → Workflow permissions → **Read and write permissions**.
3. Optional: **Settings** → **Secrets and variables** → **Actions** → Variables → `NEXT_PUBLIC_API_URL` (public API URL baked into the frontend image).
4. After the first green run, open your GitHub profile/org → **Packages**.

## Pull images

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
docker pull ghcr.io/<owner>/<repo>/backend:latest
docker pull ghcr.io/<owner>/<repo>/frontend:latest
```

## Local build

```bash
docker build -t crmtool-backend ./backend
docker build -t crmtool-frontend --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 ./frontend

# or
docker compose build
```
