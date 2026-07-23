/**
 * Polymarket Gamma API integration — a free, unauthenticated prediction-market
 * price source. Used as an independent fair-probability reference against
 * which the primary Novibet/Bet365 pair can be valued.
 *
 * Base: https://gamma-api.polymarket.com
 * outcomePrices are already probabilities (sum ≈ 1.00, no bookmaker overround).
 */

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CACHE_TTL_MS = 30 * 60 * 1000;

export type PolymarketMarket = {
  id?: string | number;
  conditionId?: string;
  slug?: string;
  question: string;
  outcomes: string[];
  outcomePrices: string[];
  endDate?: string;
  volume24hr?: number;
  liquidity?: number;
  tags?: Array<{ slug?: string; label?: string } | string>;
  events?: Array<{ tags?: Array<{ slug?: string; label?: string } | string> }>;
};

export type PolymarketProbs = {
  home: number;
  draw: number | null;
  away: number;
  shape: "three_way" | "binary_home" | "binary_away" | "binary_draw" | "combined_binaries";
  question: string;
  conditionId: string | null;
  endDate: string | null;
};

let loggedFetchError = false;

function parseOutcomePrices(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseOutcomes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isSportsMarket(m: PolymarketMarket): boolean {
  const q = m.question.toLowerCase();
  // Football / soccer signals in question text
  const footballish = /\b(soccer|football|match|vs\.?|beat|defeat|win|winner|draw|goals?|full[- ]time|to score|corners?)\b/i.test(q);
  const tagsPool: Array<{ slug?: string; label?: string } | string> = [
    ...(m.tags ?? []),
    ...(m.events?.flatMap((e) => e.tags ?? []) ?? []),
  ];
  const tagText = tagsPool
    .map((t) => (typeof t === "string" ? t : (t.slug ?? "") + " " + (t.label ?? "")))
    .join(" ")
    .toLowerCase();
  const tagFootball = /\b(soccer|football|epl|la ?liga|serie ?a|bundesliga|ligue ?1|champions ?league|world ?cup|uefa|fifa|mls|copa)\b/.test(tagText);
  // Exclude obvious non-football sports if their tags dominate
  const otherSport = /\b(nba|nfl|nhl|mlb|tennis|ufc|mma|golf|cricket|nascar|f1|formula)\b/.test(tagText);
  if (otherSport && !tagFootball) return false;
  return footballish || tagFootball;
}

export async function fetchActiveSportsMarkets(): Promise<PolymarketMarket[]> {
  const url = `${GAMMA_BASE}/markets?active=true&closed=false&limit=500&order=volume24hr&ascending=false`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      if (!loggedFetchError) {
        console.warn("polymarket: gamma fetch non-OK", res.status);
        loggedFetchError = true;
      }
      return [];
    }
    const body = (await res.json()) as unknown;
    const arr = Array.isArray(body) ? body : Array.isArray((body as { data?: unknown[] })?.data) ? (body as { data: unknown[] }).data : [];
    const markets: PolymarketMarket[] = arr
      .map((raw) => {
        const r = raw as Record<string, unknown>;
        return {
          id: r.id as string | number | undefined,
          conditionId: r.conditionId as string | undefined,
          slug: r.slug as string | undefined,
          question: String(r.question ?? ""),
          outcomes: parseOutcomes(r.outcomes),
          outcomePrices: parseOutcomePrices(r.outcomePrices),
          endDate: r.endDate as string | undefined,
          volume24hr: typeof r.volume24hr === "number" ? r.volume24hr : Number(r.volume24hr) || 0,
          liquidity: typeof r.liquidity === "number" ? r.liquidity : Number(r.liquidity) || 0,
          tags: r.tags as PolymarketMarket["tags"],
          events: r.events as PolymarketMarket["events"],
        };
      })
      .filter((m) => m.question && m.outcomePrices.length > 0)
      .filter(isSportsMarket);
    return markets;
  } catch (err) {
    if (!loggedFetchError) {
      console.warn("polymarket: gamma fetch failed", err instanceof Error ? err.message : String(err));
      loggedFetchError = true;
    }
    return [];
  }
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|cf|sc|afc|ac|sv|as|us|cd|ss|club|de|del|la|el|los|the)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalise(s).split(" ").filter((t) => t.length >= 3);
}

function containsAll(haystack: string, needles: string[]): boolean {
  return needles.every((n) => haystack.includes(n));
}

/**
 * Try to resolve a fixture to a Polymarket market. Requires:
 *  - both team names (or their tokens) appear in the market question, AND
 *  - the market endDate is within ±48h of kickoff.
 * Returns null if uncertain.
 */
export function matchToPolymarket(
  home: string,
  away: string,
  kickoff: string | null | undefined,
  markets: PolymarketMarket[],
): PolymarketMarket | null {
  if (!home || !away) return null;
  const kickoffMs = kickoff ? Date.parse(kickoff) : NaN;
  if (!Number.isFinite(kickoffMs)) return null;
  const windowMs = 48 * 3600 * 1000;

  const homeToks = tokens(home);
  const awayToks = tokens(away);
  if (homeToks.length === 0 || awayToks.length === 0) return null;

  const candidates: Array<{ m: PolymarketMarket; score: number }> = [];
  for (const m of markets) {
    if (!m.endDate) continue;
    const endMs = Date.parse(m.endDate);
    if (!Number.isFinite(endMs)) continue;
    if (Math.abs(endMs - kickoffMs) > windowMs) continue;
    const q = normalise(m.question);
    // Require at least the strongest token of each side
    const homeHit = homeToks.some((t) => q.includes(t)) && containsAll(q, homeToks.slice(0, 1));
    const awayHit = awayToks.some((t) => q.includes(t)) && containsAll(q, awayToks.slice(0, 1));
    if (!homeHit || !awayHit) continue;
    const score = (m.volume24hr ?? 0) + (m.liquidity ?? 0);
    candidates.push({ m, score });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].m;
}

/**
 * Map a matched market's outcomePrices onto {home, draw, away}. Handles:
 *   - single 3-way market with outcomes labelled home / draw / away (or team names)
 *   - single binary market ("Will TEAM beat TEAM?") where the "Yes" price is
 *     one side's win probability (returned as binary_home / binary_away)
 * Returns null when the shape can't be determined confidently.
 * NOTE: Combining separate binary markets into a full 3-way is left for a
 * later pass — Gamma /markets doesn't reliably link sibling markets. Returning
 * a single-side probability lets the caller compute per-selection shadow edge
 * against that side only.
 */
export function polymarketProbabilities(
  market: PolymarketMarket,
  home: string,
  away: string,
): PolymarketProbs | null {
  const outcomes = market.outcomes;
  const prices = market.outcomePrices.map((p) => Number(p)).filter((n) => Number.isFinite(n));
  if (prices.length !== outcomes.length) return null;
  if (prices.length === 0) return null;
  const sum = prices.reduce((a, b) => a + b, 0);
  if (sum < 0.9 || sum > 1.1) return null; // sanity: probabilities should sum ~1

  const homeToks = tokens(home);
  const awayToks = tokens(away);
  const normOutcomes = outcomes.map((o) => normalise(o));

  // 3-way market: home / draw / away (or team-name / draw / team-name)
  if (prices.length === 3) {
    let homeIdx = -1, awayIdx = -1, drawIdx = -1;
    for (let i = 0; i < normOutcomes.length; i++) {
      const o = normOutcomes[i];
      if (/\bdraw\b|\btie\b/.test(o)) drawIdx = i;
      else if (o === "home" || homeToks.some((t) => o.includes(t))) homeIdx = i;
      else if (o === "away" || awayToks.some((t) => o.includes(t))) awayIdx = i;
    }
    if (homeIdx >= 0 && awayIdx >= 0 && drawIdx >= 0 && homeIdx !== awayIdx) {
      return {
        home: prices[homeIdx],
        draw: prices[drawIdx],
        away: prices[awayIdx],
        shape: "three_way",
        question: market.question,
        conditionId: market.conditionId ?? null,
        endDate: market.endDate ?? null,
      };
    }
    return null;
  }

  // Binary market: outcomes usually ["Yes","No"]. Question text tells us
  // which side "Yes" refers to.
  if (prices.length === 2) {
    const q = normalise(market.question);
    const yesIdx = normOutcomes.findIndex((o) => o === "yes");
    if (yesIdx < 0) return null;
    const yesP = prices[yesIdx];
    // Which team does "Yes" describe? Prefer the team named first / most prominently.
    const homeMatch = homeToks.some((t) => q.includes(t));
    const awayMatch = awayToks.some((t) => q.includes(t));
    if (!homeMatch || !awayMatch) return null;
    // Heuristic: whichever team appears with a "win/beat/defeat" verb first
    const idxHome = homeToks
      .map((t) => q.indexOf(t))
      .filter((i) => i >= 0)
      .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
    const idxAway = awayToks
      .map((t) => q.indexOf(t))
      .filter((i) => i >= 0)
      .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
    // "Will TEAM_A beat TEAM_B" → Yes = TEAM_A wins
    if (/beat|defeat|win against|wins? vs|to win/.test(q)) {
      if (idxHome < idxAway) {
        return {
          home: yesP,
          draw: null,
          away: 1 - yesP,
          shape: "binary_home",
          question: market.question,
          conditionId: market.conditionId ?? null,
          endDate: market.endDate ?? null,
        };
      }
      return {
        home: 1 - yesP,
        draw: null,
        away: yesP,
        shape: "binary_away",
        question: market.question,
        conditionId: market.conditionId ?? null,
        endDate: market.endDate ?? null,
      };
    }
    // "Will the match end in a draw?" → Yes = draw
    if (/\bdraw\b|\btie\b/.test(q)) {
      return {
        home: (1 - yesP) / 2,
        draw: yesP,
        away: (1 - yesP) / 2,
        shape: "binary_draw",
        question: market.question,
        conditionId: market.conditionId ?? null,
        endDate: market.endDate ?? null,
      };
    }
    return null;
  }

  return null;
}

// -------- Cache (Supabase-backed, 30 min TTL) --------

export type CachedPolymarket = {
  match_id: string;
  condition_id: string | null;
  payload: PolymarketProbs;
  fetched_at: string;
};

export async function getCachedPolymarket(matchIds: string[]): Promise<Map<string, PolymarketProbs>> {
  if (matchIds.length === 0) return new Map();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - CACHE_TTL_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("polymarket_cache")
    .select("match_id, condition_id, payload, fetched_at")
    .in("match_id", matchIds)
    .gte("fetched_at", since);
  if (error) {
    console.warn("polymarket: cache read failed", error.message);
    return new Map();
  }
  const out = new Map<string, PolymarketProbs>();
  for (const row of data ?? []) {
    out.set(row.match_id, row.payload as PolymarketProbs);
  }
  return out;
}

export async function storeCachedPolymarket(entries: Array<{ matchId: string; probs: PolymarketProbs }>): Promise<void> {
  if (entries.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = entries.map((e) => ({
    match_id: e.matchId,
    condition_id: e.probs.conditionId,
    payload: e.probs,
    fetched_at: new Date().toISOString(),
  }));
  const { error } = await supabaseAdmin
    .from("polymarket_cache")
    .upsert(rows, { onConflict: "match_id" });
  if (error) console.warn("polymarket: cache write failed", error.message);
}
