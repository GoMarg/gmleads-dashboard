// Global test setup — points integration tests at the real Postgres/Redis
// containers started by `docker compose up` in gmleads-infra (host-mapped
// ports), so tests exercise the real adapters instead of hand-rolled mocks.
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:15432/gmleads_local';
process.env.REDIS_URL ??= 'redis://localhost:16379';
