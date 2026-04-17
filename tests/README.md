# Tests

Runner: [Vitest](https://vitest.dev)

```sh
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage (80% line target)
```

## Layout

- `tests/scoring/` — pure scoring logic (no I/O)
- `tests/audits/` — job creation logic
- `tests/integration/` — (placeholder) end-to-end DB + queue flows — not yet implemented

## Conventions

- Test files match `*.test.ts`
- Keep tests focused on one unit; no mocking of internal logic
- Integration tests require a real DB — document setup in each fixture
