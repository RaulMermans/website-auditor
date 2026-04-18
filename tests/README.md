# Tests

Runner: [Vitest](https://vitest.dev)

```sh
npm test              # run once
npm run test:integration # real Postgres + pg-boss proof for Shot 2
npm run test:watch    # watch mode
npm run test:coverage # with coverage (80% line target)
```

## Layout

- `tests/scoring/` — pure scoring logic (no I/O)
- `tests/audits/` — job creation logic
- `tests/integration/` — real DB + queue proofs for critical slices

## Conventions

- Test files match `*.test.ts`
- Keep tests focused on one unit; no mocking of internal logic
- Integration tests require a disposable Postgres DB

## Shot 2 integration proof

Set `TEST_DATABASE_URL` to a disposable Postgres database. The integration runner maps it to
`DATABASE_URL`, applies the real Shot 2 SQL migration, runs `createAuditJob()` against the real
repository and `pg-boss` adapter, then asserts persisted rows and a queued job.

Example with Docker:

```sh
docker run --name website-auditor-test-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=website_auditor_test \
  -p 55432:5432 \
  -d postgres:16-alpine

TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/website_auditor_test \
  npm run test:integration
```
