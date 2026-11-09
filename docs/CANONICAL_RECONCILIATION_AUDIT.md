# Canonical-session reconciliation audit (2026-11-08)

## Scope

The repository snapshot `public/data/workout_sessions_canonical.json` contains 1,763 source records through 2026-11-05. This is **not** a fresh extract of the signed-in user's live Supabase data. Reconciliation is performed read-only in a Node.js process.

Running `npm run audit:canonical` prints the snapshot record count, retained count, removed count, record-date range, and the sources of records removed by the current matching function. It never writes to the database or alters the app's canonical sessions.

At the audit snapshot, the original matching function retained 1,059 records from 1,763. A separately tested conservative candidate retained 1,606. The candidate restored 557 previously removed records and removed 10 records the baseline kept. Therefore the net difference is +547 records. **Do not switch the app to that candidate** without record-level reconciliation. Some source pairs have similar workout distances but timestamps differing by several hours, consistent with FitnessView date-only records or timezone inconsistencies.

## Acceptance criteria before modifying deduplication

1. Reconcile Apple, Technogym, FitnessView, and schedule sessions using stable source IDs where available.
2. Identify date-only placeholder records separately from timed sessions.
3. Normalize units before distance comparison, and track uncertain units instead of silently assuming miles.
4. Match timed workouts using actual overlap and modality, not only same-day distance.
5. Generate reviewable records for ambiguous matches rather than merging or deleting them.
6. Recalculate and compare daily training load and CTL/ATL/TSB before deploying an algorithmic change.
7. Verify against a recent Supabase export as well as the bundled historical snapshot.
8. Keep a known-good production deployment available for rollback.

The audit output is observational, not a validation that all 1,059 retained sessions are correctly reconciled. Changes in output counts are signals to investigate, not evidence that more or fewer sessions is inherently better.
