# Deployment

This repo ships two independently-deployed things: a Fastify backend
(`src/`) and a Next.js frontend (`web/`). They have nothing in common at
deploy time — different platforms, different build processes, different
env vars — documented separately below.

## Backend (`src/`) — Railway

Deploys exactly like the other 6 GmLeads backend services: Dockerfile →
GHCR image → Railway. See `gmleads-agents/context/DEPLOYMENT.md` for the
canonical, cross-service version of this. Briefly:

- CI's `publish` job builds and pushes `ghcr.io/gomarg/gmleads-dashboard`
  (public image, no registry credentials needed to pull it).
- Depends on `@gmleads/shared` via a sibling `file:../gmleads-shared`
  path — CI's `quality`/`publish` jobs check it out as a sibling before
  building, using `SHARED_REPO_PAT` (a fine-grained PAT scoped to
  read-only `contents` on `gmleads-shared`).
- Required Railway env vars: `DATABASE_URL`, `REDIS_URL`,
  `DASHBOARD_JWT_SECRET` (must byte-match `gmleads-gateway`'s copy).
- No public Railway domain — reached only via `gmleads-gateway`'s proxy.

## Frontend (`web/`) — Vercel

### Architecture

Fully client-side (ADR-014, Option B) — no server-side session, no
cookies, no BFF. The browser calls `gmleads-gateway`'s public API
directly; access token in memory, refresh token in `localStorage`.

Its only external dependency is `@gomarg/shared-schemas` — a small,
published npm package (types + Zod schemas, zero backend dependencies).
**It is not a sibling `file:` dependency and never was, as of this
writing.** An earlier design used `file:../../gmleads-shared`, which
Vercel's build sandbox can never satisfy (confirmed live, not assumed —
it has no access to sibling repos under any deployment method, CLI or
git-integrated). See `gmleads-shared/packages/shared-schemas/README.md`
for the full story and the shared/shared-schemas boundary.

### Vercel project settings

- **Root Directory:** `web` — required because the project is connected
  to this whole repo (which also contains the unrelated backend at the
  root), not just the `web/` subdirectory. This is a project-level
  setting (Vercel dashboard → Settings → Git → Root Directory, or via
  the API — the CLI has no flag for it), independent of anything in the
  repo itself.
- **Install/Build/Output Command:** all on auto-detect. Do not set a
  custom install command — there is nothing left for one to do.
  (Historical note: an earlier CLI-only deployment phase set a custom
  install command in `vercel.json` for the old sibling-checkout
  approach. That file is deleted and the equivalent *project-level*
  override was explicitly reset via
  `vercel project update --auto-detect install-command` — deleting
  `vercel.json` alone does not clear a project setting that was set
  from it.)
- **Production branch:** `main`. Preview deployments build on every
  other branch/PR automatically.

### Required environment variables (Production + Preview + Development)

| Variable | Purpose | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Gateway URL the browser calls | Public — bundled into client JS. Currently `https://gmleads-gateway-production.up.railway.app` |
| `GITHUB_PACKAGES_READ_TOKEN` | Authenticates `npm install` against GitHub Packages for `@gomarg/shared-schemas` | **Build-time only** — never read by any app code at runtime, never exposed to the client bundle (not `NEXT_PUBLIC_`-prefixed). See below for scope. |

### `GITHUB_PACKAGES_READ_TOKEN` — what it needs, and the least-privilege setup

Consumed via `web/.npmrc`:
```
@gomarg:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_READ_TOKEN}
```

**Current state:** a classic PAT scoped to `repo` + `read:packages` —
broader than necessary, since it grants full repo access this use case
never needs.

**Preferred, not yet done:** a fine-grained PAT scoped to exactly:
- Repository: `gmleads-shared` only
- Permissions: Packages → Read only

Swap it in Vercel (Settings → Environment Variables →
`GITHUB_PACKAGES_READ_TOKEN`) whenever convenient — not urgent, the
current token works correctly, this is a scope-tightening follow-up.

### GitHub Actions (`quality-web` CI job) needs no token at all

Rather than a second manually-managed secret, `gmleads-dashboard` was
granted repository-level **Actions access** to the `@gomarg/shared-schemas`
package itself (GitHub → `orgs/GoMarg/packages` → `shared-schemas` →
Package settings → Manage Actions access → add `gmleads-dashboard`,
Read role). With that one-time grant in place, the workflow's built-in
`secrets.GITHUB_TOKEN` can install the package with no PAT of its own —
confirmed working, not assumed. If a new repo ever needs to consume this
package in CI, granting it the same Actions access is the pattern to
repeat — no new secret required.

One easy-to-miss detail if debugging this in the future: `web/.npmrc`
(the same file Vercel uses) expects the env var to be named exactly
`GITHUB_PACKAGES_READ_TOKEN`, not the more common `NODE_AUTH_TOKEN`
convention `actions/setup-node` usually documents — a project-level
`.npmrc` takes precedence over the one `setup-node` generates, so a
mismatched name here fails silently with a 401 that looks like a real
permissions problem but isn't one.

### Deployment process

Push to `develop` → PR → merge to `main` → Vercel's git integration
builds and promotes automatically. No manual deploy step, no image
tags to manage (unlike the backend services) — Vercel handles the full
build-and-deploy from source on every push to `main`.

### Local development

See `web/README.md` — needs `GITHUB_PACKAGES_READ_TOKEN` exported in
your shell for `npm install` to succeed at all, same token as above
(or your own personal fine-grained PAT with the same scope).
