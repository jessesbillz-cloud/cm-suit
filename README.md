# cm-suite (FUTURE_NAME)

A construction-management suite for small and mid-size contractors: bids, files and drawings, daily reports, inspection scheduling, deliveries, corrections, RFIs, submittals, calendar and message board.

- Rules for working in this repo: `CLAUDE.md` (read first, every session).
- The full spec: `SPEC.md`.
- Decisions: `docs/decisions.md`. Ideas that are out of scope right now: `docs/ideas.md`.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | app against local Supabase (`supabase start` first) |
| `npm run check` | every gate: typecheck, lint, knip, hygiene, unit, db tests, probes, e2e |
| `npm run test:security` | anon probe + role probe |
| `npm run gen:types` | regenerate `src/data/database.types.ts` from the local schema |
| `npm run clean` | wipe `scratch/` and build output |

## Environments
- **staging**: deployed automatically on merge to `main`.
- **production**: promoted only by Jesse via the "Promote to production" workflow.

Nobody deploys from a laptop.
