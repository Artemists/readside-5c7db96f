import type { NovibetOddsResult } from "./types";

type OddsRow = {
  home?: string;
  draw?: string;
  away?: string;
  over?: string;
  under?: string;
  hdp?: number;
};
type Market = {
  name: string;
  odds?: OddsRow[];
  updatedAt?: string;
};
type OddsResponse = {
  id: number | string;
  home: string;
  away: string;
  date?: string;
  status?: string;
  bookmakers?: Record<string, Market[]>;
};

type EventItem = {
  id: number | string;
  home: string;
  away: string;
  date?: string;
};

export type NovibetQuery = {
  matchId?: string;
  homeTeam?: string;
  awayTeam?: string;
  date?: string;
};

const BASE = "https://api.odds-api.io/v3";

// Session-scoped memo: team-key -> eventId. Cleared on worker restart.
const eventIdCache = new Map<string, string>();

function cacheKey(q: NovibetQuery) {
  return `${(q.homeTeam ?? "").toLowerCase()}|${(q.awayTeam ?? "").toLowerCase()}|${q.date ?? ""}`;
}

function num(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function eventMatches(e: EventItem, q: NovibetQuery) {
  const h = q.homeTeam?.toLowerCase();
  const a = q.awayTeam?.toLowerCase();
  const eh = e.home?.toLowerCase() ?? "";
  const ea = e.away?.toLowerCase() ?? "";
  if (h && a) {
    const hit =
      (eh.includes(h) && ea.includes(a)) ||
      (eh.includes(a) && ea.includes(h));
    if (!hit) return false;
  }
  if (q.date && e.date) {
    if (!e.date.startsWith(q.date.slice(0, 10))) return false;
  }
  return true;
}

async function resolveEventId(
  q: NovibetQuery,
  apiKey: string,
): Promise<string | null> {
  if (q.matchId && /^\d+$/.test(q.matchId)) return q.matchId;

  const key = cacheKey(q);
  const cached = eventIdCache.get(key);
  if (cached) return cached;

  // Try /events/search first if we have team text.
  const searchTerm = q.homeTeam || q.awayTeam;
  if (searchTerm) {
    const url = `${BASE}/events/search?query=${encodeURIComponent(searchTerm)}&apiKey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.ok) {
      const body = (await res.json()) as EventItem[] | { events?: EventItem[] };
      const list = Array.isArray(body) ? body : (body.events ?? []);
      const match = list.find((e) => eventMatches(e, q));
      if (match) {
        const id = String(match.id);
        eventIdCache.set(key, id);
        return id;
      }
    }
  }

  // Fallback: list football events (next 14d by default).
  const listUrl = `${BASE}/events?sport=football&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(listUrl, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const body = (await res.json()) as EventItem[] | { events?: EventItem[] };
  const list = Array.isArray(body) ? body : (body.events ?? []);
  const match = list.find((e) => eventMatches(e, q));
  if (!match) return null;
  const id = String(match.id);
  eventIdCache.set(key, id);
  return id;
}

export async function fetchNovibetOdds(
  q: NovibetQuery,
): Promise<NovibetOddsResult> {
  const apiKey = process.env.ODDS_API_IO_KEY;
  if (!apiKey) return { status: "no_odds_available", reason: "missing_api_key" };

  try {
    const eventId = await resolveEventId(q, apiKey);
    if (!eventId) return { status: "no_odds_available", reason: "no_match" };

    const url = `${BASE}/odds?eventId=${encodeURIComponent(eventId)}&bookmakers=Novibet&apiKey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      return { status: "no_odds_available", reason: `upstream_${res.status}` };
    }

    const body = (await res.json()) as OddsResponse | OddsResponse[];
    const event = Array.isArray(body) ? body[0] : body;
    if (!event?.bookmakers) {
      return { status: "no_odds_available", reason: "no_bookmakers" };
    }

    // Case-insensitive lookup for "Novibet" key.
    const novibetKey = Object.keys(event.bookmakers).find(
      (k) => k.toLowerCase() === "novibet",
    );
    if (!novibetKey) return { status: "no_odds_available", reason: "no_novibet" };

    const markets = event.bookmakers[novibetKey] ?? [];
    const ml = markets.find((m) => m.name === "ML");
    const ah = markets.find(
      (m) => m.name === "Asian Handicap" || m.name === "AH",
    );
    const ou = markets.find(
      (m) => m.name === "Totals" || m.name === "Over/Under",
    );

    const mlOdds = ml?.odds?.[0];
    const home = num(mlOdds?.home);
    const away = num(mlOdds?.away);
    const draw = num(mlOdds?.draw);
    if (home == null || away == null) {
      return { status: "no_odds_available", reason: "no_ml" };
    }

    const ahOdds = ah?.odds?.[0];
    const spread =
      ahOdds && num(ahOdds.home) != null && num(ahOdds.away) != null
        ? {
            hdp: ahOdds.hdp ?? 0,
            home: num(ahOdds.home)!,
            away: num(ahOdds.away)!,
          }
        : null;

    const ouOdds = ou?.odds?.[0];
    const totals =
      ouOdds && num(ouOdds.over) != null && num(ouOdds.under) != null
        ? {
            line: ouOdds.hdp ?? 0,
            over: num(ouOdds.over)!,
            under: num(ouOdds.under)!,
          }
        : null;


    return {
      status: "ok",
      eventId: String(event.id),
      home,
      draw,
      away,
      spread,
      totals,
      updatedAt: ml?.updatedAt ?? new Date().toISOString(),
    };
  } catch (err) {
    console.error("novibet-odds fetch failed", err);
    return { status: "no_odds_available", reason: "fetch_error" };
  }
}
