import type { OddsEvent } from "./types";

const BASE = "https://api.odds-api.io/v3";

type EventListItem = {
  id: number | string;
  sport?: string;
  league?: string;
  home: string;
  away: string;
  date?: string;
};

/** List events for a sport within the next few days (default 14d). */
export async function listEvents(
  sport: string,
  apiKey: string,
): Promise<EventListItem[]> {
  const url = `${BASE}/events?sport=${encodeURIComponent(sport)}&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const body = (await res.json()) as EventListItem[] | { events?: EventListItem[] };
  const list = Array.isArray(body) ? body : (body.events ?? []);
  return list.map((e) => ({ ...e, sport: e.sport ?? sport }));
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
