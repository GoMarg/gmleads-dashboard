# GmLeads Dashboard — v1 Frontend Release

**Date:** 2026-07-21
**Status:** Production, stabilized

First production release of the GmLeads dashboard frontend, plus the
stabilization pass that followed the initial smoke test. See
`DEPLOYMENT.md` for the full deploy mechanics this summarizes.

## Deployment URLs

| Component | URL |
|---|---|
| Dashboard (production) | https://gmleads-dashboard.vercel.app |
| API gateway (production, public) | https://gmleads-gateway-production.up.railway.app |
| `@gomarg/shared-schemas` package | `npm.pkg.github.com` — `@gomarg/shared-schemas@0.1.0` |

All other backend services (session, identify, notification, booking,
dashboard-backend, crm) are Railway-private-network-only — reachable
only through the gateway, no public URLs by design (see
`gmleads-agents/context/SECURITY.md`).

## Components deployed

- **Dashboard frontend** (this repo, `web/`) — Next.js 16 / React 19,
  Vercel, git-integrated (`main` = production).
- **7 backend services** — Railway, GHCR images, unchanged by this
  release (see `gmleads-agents/context/DEPLOYMENT.md`).
- **`@gomarg/shared-schemas`** — new this release. Extracted from
  `@gmleads/shared` specifically so the frontend has a
  zero-backend-dependency way to consume shared Zod schemas/types,
  since Vercel's build sandbox can't satisfy the sibling `file:`
  dependency every backend service uses. See
  `gmleads-shared/packages/shared-schemas/README.md`.
- **Not deployed:** `gmleads-widget` (Cloudflare Pages), staging
  environment. Both remain open roadmap items, out of scope for this
  release.

## Smoke test results

Full interactive pass via a real headless-Chrome session (DevTools
Protocol — actual form submission and navigation, not simulated):

| Check | Result |
|---|---|
| Login | Pass — real credential submit, redirected to `/leads`, refresh token persisted |
| Session persistence after refresh | Pass — reload kept the authenticated session |
| Logout | Pass — cleared localStorage, redirected to `/login` |
| Leads list, Routing, Slack, CRM, Business Hours, Rep Performance, Digest, Accounts, Dark Funnel | Pass — all 9 loaded real content while authenticated |
| Widget status indicator | Pass — present on `/leads` |
| Console errors | 0, across the full login→9 pages→logout session |
| Failed network requests (4xx/5xx) | 0, across the same session |
| Mobile layout | Pass — verified at 360/375/390/414/430px; nav overflow found and fixed (see below) |

### Found and fixed during this release

1. **Mobile nav overflow** — the 10-link header nav had no wrap or
   scroll; on any viewport narrower than its content, the logout
   button and widget-status indicator were pushed off-screen entirely,
   not just the trailing nav links. Fixed: header stacks vertically
   below the `sm` breakpoint, nav scrolls horizontally. Verified via
   real screenshots at 5 common mobile widths, not just code review.
2. **Missing `<main>` landmark on `/login`** — every `/leads/*` page
   already had one via `leads/layout.tsx`; `/login` used a plain `div`.
   Fixed directly on that page rather than adding a second `<main>` to
   the root layout, which would have nested one on every `/leads/*`
   page.
3. **3 unlabeled `<select>` elements** (found via the authenticated
   Lighthouse run below, not visible from `/login` alone) — date-range
   pickers on the leads page and funnel page, and the Slack
   channel-picker, none had an accessible name. Fixed with `aria-label`.
4. **Shared test admin account rotated** — `you@gomarg.com`'s password
   (disclosed in plaintext chat during earlier validation) was rotated
   via a direct Argon2id hash update, verified old password now 401s.

## Lighthouse scores

Two runs — `/login` (anonymous) and `/leads` (real authenticated
session, reusing the same logged-in Chrome profile Lighthouse
connected to via its debugging port — not achievable with a plain
`npx lighthouse <url>` invocation).

| Category | `/login` (anonymous) | `/leads` (authenticated) |
|---|---|---|
| Performance | 97 | 99 |
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |

Both scores are post-fix (the `<main>` landmark and `<select>` label
fixes above). Pre-fix, `/login` accessibility was 98 and `/leads` was
94 — both now 100 with zero remaining audit failures on either page.

## Known limitations

- **Only `/login` and `/leads` have been Lighthouse-audited.** The
  other 8 authenticated pages weren't individually run — the `<main>`
  and nav fixes apply to all of them (shared layout), but page-specific
  issues (e.g. another unlabeled control) haven't been ruled out
  elsewhere.
- **No staging environment.** Every change in this release went
  `develop` → PR → `main` → Vercel production directly. See
  `gmleads-agents/context/DEPLOYMENT.md`'s "known gaps."
- **`GITHUB_PACKAGES_READ_TOKEN` is a classic PAT** (`repo` +
  `read:packages`), broader than the least-privilege fine-grained
  alternative documented in `DEPLOYMENT.md`. Functional, not urgent.
- **Postgres's own connection password has never been rotated**,
  despite having been pasted in plaintext during initial setup — a
  separate item from the application-level account rotated in this
  release. See `gmleads-agents/context/SECURITY.md`.
- **`gmleads-widget` is not deployed anywhere** — the product's actual
  embeddable snippet has no live demo surface yet.
- A minor ~10px page-level horizontal overflow was observed at
  360–375px widths during the nav fix's verification, traced to page
  content rather than the nav itself. Not visually perceptible (mobile
  browsers hide scrollbars; confirmed clean in real screenshots) and
  left as-is rather than chased further, since it wasn't part of what
  was reported broken.

## Rollback procedure

### Dashboard frontend (Vercel)

Vercel retains every previous deployment. To roll back:
```bash
vercel ls gmleads-dashboard   # find the last known-good Production deployment
vercel promote <deployment-url>
```
Or via the dashboard: Deployments → select the prior Ready Production
deployment → **⋯** → **Promote to Production**. Takes effect
immediately, no rebuild.

### `@gomarg/shared-schemas`

Published versions are immutable (GitHub Packages rejects
republishing). To roll back a consumer: pin `web/package.json`'s
`@gomarg/shared-schemas` to the prior version, `npm install`, commit,
redeploy. No action needed on the package side itself.

### Backend services (Railway)

Out of scope for this release (unchanged), but for completeness: all 7
currently deploy from a floating `develop` GHCR tag, not an immutable
`sha-` tag (a known gap — see `gmleads-agents/context/DEPLOYMENT.md`
and GitHub issue
[`gmleads-infra#27`](https://github.com/GoMarg/gmleads-infra/issues/27)).
Rolling back today means manually finding the last known-good image
digest in GHCR and repointing the Railway service to it via the
dashboard or `railway` CLI — there is no one-command rollback until
that issue is resolved.

## Changelog (this release)

- [PR #29](https://github.com/GoMarg/gmleads-dashboard/pull/29) — Replace sibling `@gmleads/shared` dependency with `@gomarg/shared-schemas`
- [PR #30](https://github.com/GoMarg/gmleads-dashboard/pull/30) — Post-deployment cleanup (docs, stale env examples, lockfile artifact)
- [PR #31](https://github.com/GoMarg/gmleads-dashboard/pull/31) — Mobile nav overflow fix, `<main>` landmark on `/login`
- [PR #32](https://github.com/GoMarg/gmleads-dashboard/pull/32) — Unlabeled `<select>` fixes (authenticated Lighthouse findings)
- `gmleads-shared` [`7bf0fe3`](https://github.com/GoMarg/gmleads-shared/commit/7bf0fe3) — `@gomarg/shared-schemas` extraction and first publish
