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

/** Fetch odds for a single event across all bookmakers. */
export async function fetchOddsForEvent(
  eventId: string,
  apiKey: string,
): Promise<{ event: OddsEvent | null; status: CallStatus }> {
  const url = `${BASE}/odds?eventId=${encodeURIComponent(eventId)}&apiKey=${encodeURIComponent(apiKey)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch (err) {
    console.error(`fetchOddsForEvent ${eventId}: network error`, err);
    return { event: null, status: "failed" };
  }
  if (res.status === 429) return { event: null, status: "rate_limited" };
  if (!res.ok) return { event: null, status: "failed" };
  const body = (await res.json()) as OddsEvent | OddsEvent[];
  const event = Array.isArray(body) ? body[0] : body;
  return { event: event ?? null, status: "ok" };
}
