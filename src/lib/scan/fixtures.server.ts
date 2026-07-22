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

function pickName(v: RawEvent["sport"] | RawEvent["league"]): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  return v.name ?? v.slug;
}

/** List events for a sport (odds-api.io returns next ~14d, mixed statuses). */
export async function listEvents(
  sport: string,
  apiKey: string,
): Promise<EventListItem[]> {
  const url = `${BASE}/events?sport=${encodeURIComponent(sport)}&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    console.error(`listEvents ${sport}: HTTP ${res.status}`);
    return [];
  }
  const body = (await res.json()) as
    | RawEvent[]
    | { events?: RawEvent[]; error?: string };
  if (!Array.isArray(body)) {
    if (body && "error" in body && body.error) {
      console.error(`listEvents ${sport}: ${body.error}`);
    }
    const nested = (body as { events?: RawEvent[] }).events;
    if (!Array.isArray(nested)) return [];
    return nested.map((e) => ({
      id: String(e.id),
      sport: pickName(e.sport) ?? sport,
      league: pickName(e.league),
      home: e.home,
      away: e.away,
      date: e.date,
      status: e.status,
    }));
  }
  return body.map((e) => ({
    id: String(e.id),
    sport: pickName(e.sport) ?? sport,
    league: pickName(e.league),
    home: e.home,
    away: e.away,
    date: e.date,
    status: e.status,
  }));
}

/** Fetch odds for a single event across all bookmakers. */
export async function fetchOddsForEvent(
  eventId: string,
  apiKey: string,
): Promise<OddsEvent | null> {
  const url = `${BASE}/odds?eventId=${encodeURIComponent(eventId)}&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const body = (await res.json()) as OddsEvent | OddsEvent[];
  const event = Array.isArray(body) ? body[0] : body;
  if (!event) return null;
  return event;
}
