# Phase F3 — Admin usage board

## Goal
Surface the F2 telemetry: cache optimization statistics, token economics, popular concepts.

## Implementation
- `src/lib/usage.functions.ts`: `getUsageSummary` now also returns total prompt/completion
  tokens, a `byDay` series (calls, cached hits, hit rate, spend, savings) and `topConcepts`
  derived from `code_gen_jobs` runs in the same window.
- `src/components/admin/UsagePanel.tsx`: 7/30/90-day window switch, headline stats
  (calls, hit rate, credits spent vs saved, tokens in/out, errors), daily volume bars with the
  cached share shaded green, per-task and per-model tables, and a popular-concepts table.
- `src/routes/_authenticated/admin.tsx`: new section 16 · AI_Usage_Board plus index entry.

## Notes
- Credits remain estimates for comparison, not billing.
- Popular concepts measure code-example generation demand; no new table was needed.

## Next task
Phase F4 — Encrypted server-side BYOK key vault.
