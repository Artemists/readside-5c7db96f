
# Home screen: real scan engine + live data

## Current state (verified against the repo)

- **Supabase / Lovable Cloud is NOT enabled on this project.** There is no `supabase/` folder, no migrations, no tables, no edge functions. Your prompt refers to "an existing `football-data` edge function using API-Football" — that does not exist in this codebase. What exists is a TanStack Start server function `getNovibetOdds` (`src/lib/odds/novibet.server.ts`) that calls **odds-api.io** (Novibet bookmaker), using the `ODDS_API_IO_KEY` secret. No API-Football key, no fixtures source, no persistence.
- **9-signal scoring logic does not exist.** `src/lib/nine-signal.ts` is a hardcoded fixture map of 3 demo matches with fake `assessmentPercent` values and 9 boolean labels ("Home form", "xG differential", "Rest days", "Rotation risk", "Set-piece edge", "Referee tendency", "Line movement", "Public %", "Sharp %"). These labels also don't match the 9 signals you listed in the prompt (tournament fitness, public tax, goals, altitude/climate, motivation, EV/odds value, H2H — that's 7, not 9). Needs to be written from scratch, and the signal list needs to be nailed down first.
- **Home screen** (`src/routes/index.tsx`) renders a static greeting, a hardcoded "High uncertainty day" warning, three fixed bullets, and three `StatCard`s whose numbers come from a deterministic per-day hash of the Athens date — they change at midnight but they are not real. No "Models updated 4m ago" line is currently rendered; it may be from an older screenshot. Nothing is tappable, nothing hits a backend.
- **Match universe:** `src/lib/matches.ts` hardcodes 3 WC26 fixtures. There is no live fixtures feed.

## What I need clarified before building

1. **Fixtures source.** You mention API-Football but it isn't wired. Options:
   a. Add API-Football (you'd supply `API_FOOTBALL_KEY`); scan pulls today's WC26 (or all football) fixtures from it.
   b. Reuse odds-api.io `/events?sport=football` as the fixtures list (already working, no new key needed) and scan every event with Novibet odds today.
   c. Keep the static `WC26_MATCHES` list for now and only enrich with odds.
   Pick one — this drives everything.
2. **Signal set.** Your prompt lists 7 things ("tournament fitness, public pressure, goals signals, altitude/climate, motivation, EV/odds value, head-to-head history"). To ship "9-signal", I need the other 2 (candidates: rest days, injuries/rotation, home advantage, form, market movement, sharp %). I'll propose a set in the plan but you should confirm.
3. **Verdict thresholds.** What EV/composite score turns a match into Opportunity vs Trap vs Ignore? Proposed defaults: Opportunity = EV ≥ +5% AND composite ≥ 60; Trap = public tax high AND EV ≤ −3%; else Ignore. Confirm or tweak.
4. **"Stale" definition for auto-rescan on launch.** Proposed: run automatically if the most recent scan for today (Athens time) is older than 30 min or missing.
5. **Enable Lovable Cloud?** Persistence, the rescan button, and per-match detail all need a DB. I'll enable it in the build step unless you object.

## Proposed plan (once the above is answered)

### Step 1 — Enable Lovable Cloud and create schema

Two tables:

```text
scans
  id                  uuid pk
  scanned_at          timestamptz not null default now()
  local_date          date not null                 -- Athens-local YYYY-MM-DD
  fixtures_count      int not null
  duration_ms         int
  status              text not null                 -- 'ok' | 'partial' | 'failed'

match_signals
  id                  uuid pk
  scan_id             uuid references scans(id) on delete cascade
  local_date          date not null
  match_id            text not null                 -- odds-api eventId (string)
  home                text not null
  away                text not null
  kickoff             timestamptz
  competition         text
  verdict             text not null                 -- 'opportunity' | 'trap' | 'ignore'
  ev_percent          numeric(6,2)                  -- best EV across markets
  edge_percent        numeric(6,2)
  best_market         text                          -- 'home' | 'draw' | 'away' | 'over' | 'under' | ...
  best_odds           numeric(6,3)
  fair_probability    numeric(5,4)
  composite_score     numeric(5,2)                  -- 0..100
  signals             jsonb not null                -- { tournament_fitness: {score, note}, public_tax: {...}, ... }
  unique (local_date, match_id)
```

RLS: read-only to `anon` and `authenticated` for both tables (the app is read-only from the browser). Writes happen only through the server function via the service role. Grants added explicitly per project convention.

### Step 2 — Scan engine (TanStack server function, not Supabase Edge Function)

This project runs on TanStack Start on Cloudflare Workers. Adding a Supabase Edge Function here is wrong — the convention is `createServerFn` for app-internal server logic. Same security model (keys server-side), but native to the stack.

- `runDailyScan()` server function (`src/lib/scan/scan.functions.ts`) with `.middleware([requireSupabaseAuth])` off (this is a public trigger from the Home screen; we rate-limit by checking last scan timestamp instead). Steps: pull today's fixtures, for each fixture pull Novibet odds via existing `fetchNovibetOdds`, run each signal, compute composite + EV, assign verdict, upsert into `match_signals`, insert `scans` row.
- Signals implemented in `src/lib/signals/*.server.ts`, each exporting `score(match, odds, context) -> { score: 0..100, note: string }`. Composite = weighted mean. Weights defined in one place.
- `getTodayScanSummary()` server function: returns `{ counts: {opportunities, traps, ignore}, lastScanAt, topEdge }` for the Home screen.
- `getMatchSignals(matchId)` for the detail route.
- `listByVerdict(verdict)` for the tappable card destinations.

### Step 3 — Home screen wiring (`src/routes/index.tsx`)

- Loader primes `queryClient.ensureQueryData` for `getTodayScanSummary()`.
- On mount, if `lastScanAt` is missing or > 30 min old, auto-invoke `runDailyScan()` once.
- **Rescan button** (top-right of the header block): idle → "Scanning…" with spinner, disabled, on completion invalidate the summary query and show `Last scan: HH:mm` (Athens). Error toast in Greek on failure.
- **StatCards become `<Link>`s** to `/matches?verdict=opportunity|trap|ignore`, showing real counts (including 0 states).
- **Top Edge Preview**: new card below the three stats showing single highest-EV match (teams, market, EV%, verdict chip). Links to `/match/$matchId`. Hidden entirely when no matches.
- **Market conditions block**: computed live — e.g. "Thin edges today (avg %)" if mean absolute EV < 2%, "Elevated draw probability" if avg draw implied prob > 30%, else the whole block is hidden (no fake copy). Bullets are derived from the same data.

### Step 4 — Match detail route `/match/$matchId`

- Full 9-signal breakdown (each signal name + 0–100 score + short note).
- Odds table: Novibet decimal → implied prob → fair prob → edge %.
- Suggested unit sizing: Kelly-lite: `units = clamp(0.25 * (fair - implied) / (1 - implied), 0, 3)` (proposal — confirm).
- Error/notFound/pending components per project convention.

### Step 5 — Verdict-filtered list `/matches?verdict=...`

Simple list of today's matches filtered by the URL search param (validated with Zod), reusing existing card primitives. Empty state included.

## Notes on things I will NOT touch

Wizard, bet log, leaderboard, `nine-signal.ts` output shape used by `popular-pick-warning.tsx` / `goal-explosion.tsx` / `match-intelligence.tsx` (those keep working off the existing stub) unless you tell me to replace them too. Value Scanner keeps its current odds source.

## Please answer

1. Fixtures source (a / b / c above)?
2. Confirm the 9 signals — which two rounding out your list of 7?
3. Verdict thresholds — accept the defaults?
4. Auto-rescan staleness — 30 min OK?
5. OK to enable Lovable Cloud now?
