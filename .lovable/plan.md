
# BetLab v1 — Build plan

Project is currently the blank Lovable template. I'll build BetLab from scratch using the Figma as the visual source of truth and the odds integrations from your prompt. Backend uses TanStack Start server functions (same security model as Supabase Edge Functions — keys stay server-side; no key ever ships to the browser). I'll call these "server functions" internally but they play the same role as your existing `football-data` edge function.

## What I'll build in this pass

### 1. Design system (from Figma)
Port these tokens to `src/styles.css` as oklch semantic tokens:
- Backgrounds: `bg/page #04101c`, `bg/card #12283f`, `bg/card-inner #0b1b2e`
- Text: `text/primary #f5f8fa`, `text/secondary #aebecc`, `text/muted #7c93a8`, `text/disabled #5a7085`
- Border: `border/divider #16304b`
- Accent: `accent/volt #c6f135`, `accent/volt-dim #9fc71f`
- Fonts (loaded via `<link>` in `__root.tsx` head): Space Grotesk (display), Archivo (body), IBM Plex Mono (labels/captions)
- Type scale + spacing per Figma spec (Title 36/44 -1.2, Section Label 11/16 +1.2 uppercase, Body 15/22, Value 32/40, Caption mono 13/18)
- Shared primitives: `Card`, `SectionLabel`, `Divider`, `Badge`, `Bullet`, `StatCard`, `Pill`, `ProgressBar`, `KeyValueRow`, `NavBar`, `Footer`

### 2. Screens from Figma (routes)
- `/` — **Morning Briefing** (Good morning, today's market conditions, badge, bullets, 3 stat cards)
- `/goal-explosion` — **Goal Explosion** (match + score, markets, edge)
- `/match-intelligence` — **Why Should I Trust This** (key/value rows, attack/defense/tempo bars, interesting/avoid lists)
- `/popular-pick-warning` — **Popular Pick Warning** (Public confidence % + BetLab assessment %, bullets, verdict)
- `/yesterday` — **Yesterday's Analysis** (recap, hit rate 4/6, insight)

Nav Bar tabs: Signals · Analysis · History (mapped to routes above).

### 3. Additional tabs called out in your prompt (not in Figma)
Minimal but functional shells matching the design language, so the odds wiring has somewhere to live:
- `/value-scanner` — **Value Scanner** table: match, Novibet odds (live from `novibet-odds`), implied prob, Edge %, EV. Existing math preserved as pure functions in `src/lib/value.ts`.
- Popular Pick Warning wired to `consensus-odds` for Public confidence %.
- 9-signal model as a pure stub in `src/lib/nine-signal.ts` returning BetLab assessment % (you can drop your real logic in later — I won't touch its output shape).

I will **not** build wizard / bet log / leaderboard in this pass unless you say so — that would double the scope. Say the word and I'll add them next.

### 4. Odds integrations (the core ask)

Two server functions with the same pattern as `football-data`:

**`getNovibetOdds({ matchId | teams, date })`** → `src/lib/odds/novibet.functions.ts`
- Reads `ODDS_API_IO_KEY` from server env inside `.handler()`
- Calls odds-api.io, filters bookmaker = Novibet
- Returns `{ status: "ok", home, draw, away, spread, totals, market, updatedAt }` or `{ status: "no_odds_available" }`

**`getConsensusOdds({ matchId | teams, date })`** → `src/lib/odds/consensus.functions.ts`
- Reads `SPORTSGAMEODDS_KEY` from server env inside `.handler()`
- Returns `{ consensus: { home, draw, away }, kalshi: number|null, polymarket: number|null, updatedAt }`

**Client:**
- TanStack Query with a session cache (`staleTime: Infinity`, key = match id) — same "don't burn quota" pattern
- Loading spinner (accent/volt small ring)
- Greek error toast: «Δεν ήταν δυνατή η φόρτωση αποδόσεων»
- Fallback: if novibet returns `no_odds_available`, Value Scanner shows consensus odds with a small mono label «Μέση αγοράς» ("market average")

### 5. Secrets
I'll wire the code to read `ODDS_API_IO_KEY` and `SPORTSGAMEODDS_KEY`. **You add both in Project Settings → Secrets before the endpoints will work** (I'll prompt via `add_secret` once code is in). Keys never appear in the client bundle.

### 6. Content language
UI labels stay Greek where your prompt implies they already are (error message, "Μέση αγοράς"). Section headings from the Figma stay English as designed (`TODAY'S MARKET CONDITIONS`, `Public confidence`, etc.) — say the word if you want everything localized.

## Technical notes

```text
src/
  styles.css                        design tokens (oklch) + fonts
  routes/
    __root.tsx                       fonts <link>, NavBar, Footer, <Outlet/>
    index.tsx                        Morning Briefing
    goal-explosion.tsx
    match-intelligence.tsx
    popular-pick-warning.tsx
    yesterday.tsx
    value-scanner.tsx
  components/betlab/                 Card, SectionLabel, Badge, Bullet, StatCard, ProgressBar, KeyValueRow, NavBar, Footer, Spinner
  lib/
    odds/
      novibet.functions.ts           createServerFn — ODDS_API_IO_KEY
      consensus.functions.ts         createServerFn — SPORTSGAMEODDS_KEY
      types.ts
    value.ts                         edge %, EV, implied prob (pure)
    nine-signal.ts                   stub returning BetLab assessment
    i18n.ts                          Greek strings
```

Nothing touches wizard / bet log / leaderboard / 9-signal internals — those aren't in the repo yet, and when they arrive later the odds fetchers plug in unchanged.

## Out of scope for this pass (call out if you want any of these added)
- Wizard, bet log, leaderboard tabs
- Real 9-signal model logic (stub only)
- Auth / user accounts / Lovable Cloud
- Persistent history (Yesterday's Analysis uses static demo copy from the Figma)

Reply "go" (or edit the plan) and I'll build it.
