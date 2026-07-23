import type { OddsEvent } from "./types";

const BASE = "https://api.odds-api.io/v3";

type RawEvent = {
  id: number | string;
  sport?: string | { name?: string; slug?: string };
  league?: string | { name?: string; slug?: string };
  home: string;
  away: string;
  date?: string;
  status?: string;
};

export type EventListItem = {
  id: string;
  sport: string;
  league?: string;
  home: string;
  away: string;
  date?: string;
  status?: string;
};

export type CallStatus = "ok" | "rate_limited" | "failed";

function pickName(v: RawEvent["sport"] | RawEvent["league"]): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  return v.name ?? v.slug;
}

/** List events for a sport. Returns a discriminated result so callers can
 *  distinguish an empty response from a rate-limit or failure. */
export async function listEvents(
  sport: string,
  apiKey: string,
): Promise<{ events: EventListItem[]; status: CallStatus }> {
  const url = `${BASE}/events?sport=${encodeURIComponent(sport)}&apiKey=${encodeURIComponent(apiKey)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch (err) {
    console.error(`listEvents ${sport}: network error`, err);
    return { events: [], status: "failed" };
  }
  if (res.status === 429) {
    console.warn(`listEvents ${sport}: HTTP 429 rate limited`);
    return { events: [], status: "rate_limited" };
  }
  if (!res.ok) {
    console.error(`listEvents ${sport}: HTTP ${res.status}`);
    return { events: [], status: "failed" };
  }
  const body = (await res.json()) as
    | RawEvent[]
    | { events?: RawEvent[]; error?: string };
  const arr: RawEvent[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { events?: RawEvent[] }).events)
      ? ((body as { events?: RawEvent[] }).events as RawEvent[])
      : [];
  if (!Array.isArray(body) && body && "error" in body && body.error) {
    console.error(`listEvents ${sport}: ${body.error}`);
    const msg = String(body.error).toLowerCase();
    if (msg.includes("rate") || msg.includes("limit") || msg.includes("quota")) {
      return { events: [], status: "rate_limited" };
    }
    return { events: [], status: "failed" };
  }
  return {
    events: arr.map((e) => ({
      id: String(e.id),
      sport: pickName(e.sport) ?? sport,
      league: pickName(e.league),
      home: e.home,
      away: e.away,
      date: e.date,
      status: e.status,
    })),
    status: "ok",
  };
}

/** Fetch odds for a single event, restricted to the given bookmakers.
 *  The /v3/odds endpoint REQUIRES a `bookmakers=` query param — omitting it
 *  returns `{"error":"Missing bookmakers"}` with HTTP 200. Our plan currently
 *  allows only 2 selected bookmakers (Bet365, Novibet). */
export async function fetchOddsForEvent(
  eventId: string,
  apiKey: string,
  bookmakers: readonly string[],
): Promise<{ event: OddsEvent | null; status: CallStatus }> {
  const books = bookmakers.join(",");
  const url = `${BASE}/odds?eventId=${encodeURIComponent(eventId)}&bookmakers=${encodeURIComponent(books)}&apiKey=${encodeURIComponent(apiKey)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch (err) {
    console.error(`fetchOddsForEvent ${eventId}: network error`, err);
    return { event: null, status: "failed" };
  }
  if (res.status === 429) return { event: null, status: "rate_limited" };
  if (!res.ok) return { event: null, status: "failed" };
  const body = (await res.json()) as
    | OddsEvent
    | OddsEvent[]
    | { error?: string };
  const raw = Array.isArray(body) ? body[0] : body;
  if (!raw) return { event: null, status: "ok" };
  if ("error" in raw && raw.error) {
    const msg = String(raw.error).toLowerCase();
    console.error(`fetchOddsForEvent ${eventId}: ${raw.error}`);
    if (msg.includes("rate") || msg.includes("limit") || msg.includes("quota")) {
      return { event: null, status: "rate_limited" };
    }
    return { event: null, status: "failed" };
  }
  return { event: raw as OddsEvent, status: "ok" };
}

export type SportProbeResult = {
  sport: string;
  ok: boolean;
  status: number;
  eventCount: number;
  source: "sports_endpoint" | "events_probe";
  error?: string;
};

const CANDIDATE_SPORTS = [
  "football",
  "basketball",
  "tennis",
  "hockey",
  "baseball",
  "americanfootball",
  "mma",
  "cricket",
  "rugby",
  "volleyball",
] as const;

async function probeEventsForSport(
  sport: string,
  apiKey: string,
): Promise<SportProbeResult> {
  const url = `${BASE}/events?sport=${encodeURIComponent(sport)}&apiKey=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      return { sport, ok: false, status: res.status, eventCount: 0, source: "events_probe" };
    }
    const body = (await res.json()) as unknown;
    const arr: unknown[] = Array.isArray(body)
      ? body
      : Array.isArray((body as { events?: unknown[] })?.events)
        ? ((body as { events?: unknown[] }).events as unknown[])
        : [];
    if (!Array.isArray(body) && body && typeof body === "object" && "error" in body) {
      const err = String((body as { error?: unknown }).error ?? "unknown");
      return { sport, ok: false, status: res.status, eventCount: 0, source: "events_probe", error: err };
    }
    return { sport, ok: true, status: res.status, eventCount: arr.length, source: "events_probe" };
  } catch (err) {
    return {
      sport,
      ok: false,
      status: 0,
      eventCount: 0,
      source: "events_probe",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Probe which sports the odds provider actually serves on our plan.
 *  Tries /v3/sports first; falls back to per-sport /v3/events probes.
 *  Never throws — failures are returned as data. */
export async function probeAvailableSports(
  apiKey: string,
): Promise<SportProbeResult[]> {
  // Try the sports listing endpoint first.
  const sportsUrl = `${BASE}/sports?apiKey=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(sportsUrl, { headers: { accept: "application/json" } });
    if (res.ok) {
      const body = (await res.json()) as unknown;
      const arr: unknown[] = Array.isArray(body)
        ? body
        : Array.isArray((body as { sports?: unknown[] })?.sports)
          ? ((body as { sports?: unknown[] }).sports as unknown[])
          : [];
      if (arr.length > 0) {
        return arr.map((s) => {
          const slug =
            typeof s === "string"
              ? s
              : (s as { slug?: string; name?: string })?.slug ??
                (s as { name?: string })?.name ??
                "unknown";
          return {
            sport: String(slug),
            ok: true,
            status: res.status,
            eventCount: -1, // unknown from listing endpoint
            source: "sports_endpoint" as const,
          };
        });
      }
    }
    // Non-ok or empty → fall through to events probing.
  } catch {
    // Ignore and fall through.
  }

  // Fallback: probe /v3/events for each candidate sport. Bounded (10 calls).
  const results: SportProbeResult[] = [];
  for (const sport of CANDIDATE_SPORTS) {
    results.push(await probeEventsForSport(sport, apiKey));
  }
  return results;
}

export type SportDetailResult = {
  sport: string;
  eventCount: number;
  sampled: Array<{
    id: string;
    home: string;
    away: string;
    league?: string;
    bookmakers: Array<{ name: string; markets: string[] }>;
  }>;
  error?: string;
};

/** Fetch events for one sport, then for the first 3 events report leagues
 *  and per-bookmaker market names. Uses up to 4 provider calls (1 events + 3 odds). */
export async function probeSportDetail(
  apiKey: string,
  sport: string,
): Promise<SportDetailResult> {
  const listed = await listEvents(sport, apiKey);
  if (listed.status !== "ok") {
    return { sport, eventCount: 0, sampled: [], error: `list ${listed.status}` };
  }
  const first = listed.events.slice(0, 3);
  const sampled: SportDetailResult["sampled"] = [];
  for (const e of first) {
    const { event } = await fetchOddsForEvent(e.id, apiKey, [
      "Bet365",
      "Novibet",
    ]);
    const books = event?.bookmakers ?? {};
    sampled.push({
      id: e.id,
      home: e.home,
      away: e.away,
      league: e.league,
      bookmakers: Object.entries(books).map(([name, markets]) => ({
        name,
        markets: (markets ?? []).map((m) => m.name),
      })),
    });
  }
  return { sport, eventCount: listed.events.length, sampled };
}
