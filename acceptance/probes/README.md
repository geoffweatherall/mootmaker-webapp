# Live-update probes (investigation, not a test suite)

Written for the 2026-10-01 multi-user investigation (webapp#132, #134, #135, #136; api#96). Kept so the
automated acceptance tests that replace them can reuse the approach. **Not run by `acceptance/run.sh`
or the release pipeline**, and nothing here asserts pass/fail: the output is a description of what
each view showed.

## What they do

- `recorder.ts` is injected into every page before the app loads. It records the page's visible
  text (`innerText`) on every animation frame and on every DOM mutation, as counts of known
  empty/negative phrases ("This meeting was cancelled.", "No meetings", "Free all day", ...),
  counts of watched strings (a meeting's subject), and the number of progress indicators. It also
  logs AppSync WebSocket messages, so a broadcast can be lined up with what the page did next.
- `harness.ts` handles sign-in, the GraphQL calls, booking a free slot, opening each view, and
  `transients()`, which finds any value a page showed that was true neither before nor after a
  change.
- `multi-user.probe.ts`: A (the E2E user) watches five views (the detail overlay, the pop-out page,
  Room Availability, Person Calendar, Home) while B (a fresh standard user) changes something,
  either over the API or through B's own browser. It also covers A switching tabs, with no B.
- `concurrent-edit.probe.ts`: an edit form left open while the same meeting changes elsewhere.
- `analyse.py` summarises `test-output/results.json` per scenario, method and view.

## Running

From `acceptance/probes/`, with the same environment `acceptance/run.sh` exports: source
mootmaker-api's `authenticate.sh <env>`, then set `WEBAPP_URL` and `SQS_QUEUE_URL` as `run.sh` does.

```
../../node_modules/.bin/playwright test -c playwright.config.ts multi-user.probe.ts
python3 analyse.py
```

Options:
- `PROBE_ONLY=editTitle,cancelled` runs only those scenarios.
- `PROBE_REPS_API` and `PROBE_REPS_UI` set the number of repetitions (defaults 3 and 2).
- Setting `PROBE_B_EMAIL` and `PROBE_B_PASSWORD` reuses an existing standard user as B instead
  of signing up a new one. That's needed for `concurrent-edit.probe.ts`, and it's the only part
  that uses AWS credentials.

The full matrix takes about 15 minutes against a seeded env.
