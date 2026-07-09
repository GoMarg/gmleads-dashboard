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
npm install
npm run dev
```

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
- `@gmleads/shared`'s Zod schemas/types are imported via deep paths
  (`@gmleads/shared/dist/schemas/index.js`), never the package's root
  barrel — that barrel pulls in Node-only adapters (Postgres, Redis,
  Argon2) that don't belong in a browser bundle. See ADR-014.
