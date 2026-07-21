# @gmleads/dashboard-web

Next.js frontend for the GmLeads dashboard (KAN-100): login, lead list with
filters, session replay. Full design in
`gmleads-agents/context/adr/014-dashboard-frontend.md`.

Independent toolchain from the Fastify backend in `../src` — its own
`package.json`, deployed separately (Vercel, per `architecture.md`'s
locked stack; the backend stays on Railway per ADR-012).

## Local development

```bash
cp .env.local.example .env.local   # then set NEXT_PUBLIC_API_URL
export GITHUB_PACKAGES_READ_TOKEN=<a PAT scoped to read-only Packages on gmleads-shared>
npm install
npm run dev
```

`npm install` needs `GITHUB_PACKAGES_READ_TOKEN` in your shell environment
(not `.env.local` — npm reads it via `.npmrc`, before the app itself ever
starts) to authenticate the `@gomarg` scope against GitHub Packages for
`@gomarg/shared-schemas`. See `../DEPLOYMENT.md` for where to get one.

Requires `gmleads-gateway` (and, for it, `gmleads-dashboard`'s backend)
running locally — see the root repo's `docker-compose.yml` in
`gmleads-infra`, or run each service's `npm run dev` directly.

## Scripts

- `npm run dev` / `build` / `start` — Next.js
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint (`eslint-config-next`)
- `npm test` — Vitest + Testing Library, jsdom environment

## Architecture notes

- **No BFF, no cookies, no server-side session** — the browser calls
  `gmleads-gateway`'s public API directly. Access token in memory only;
  refresh token in `localStorage`, rotated on every use (reuses KAN-99's
  auth exactly as implemented). See ADR-014, Decision 1.
- `workspaceId` is only ever read from the authenticated session (login/
  refresh response) — never a URL param or other user-editable input.
- Shared Zod schemas/types come from `@gomarg/shared-schemas`, a separate
  published npm package (GitHub Packages) — not `@gmleads/shared`, which
  pulls in Node-only backend deps (Postgres, Redis, Argon2, Fastify) that
  don't belong in a browser bundle, and which Vercel's build sandbox can't
  reach anyway (no access to sibling repos). See
  `gmleads-shared/packages/shared-schemas/README.md` for the full
  shared/shared-schemas boundary, and `../DEPLOYMENT.md` for how this
  actually deploys.
