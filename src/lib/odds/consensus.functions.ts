import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ConsensusOddsResult } from "./types";

const QuerySchema = z.object({
  matchId: z.string().optional(),
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional(),
  date: z.string().optional(),
});

/**
 * Consensus / market-average odds across bookmakers, plus Kalshi and
 * Polymarket implied probabilities where available.
 * Reads SPORTSGAMEODDS_KEY from server env inside the handler.
 */
export const getConsensusOdds = createServerFn({ method: "POST" })
  .inputValidator((raw) => QuerySchema.parse(raw))
  .handler(async ({ data }): Promise<ConsensusOddsResult> => {
    const apiKey = process.env.SPORTSGAMEODDS_KEY;
    const empty: ConsensusOddsResult = {
      consensus: { home: null, draw: null, away: null },
      kalshi: null,
      polymarket: null,
      bookmakerCount: 0,
      updatedAt: new Date().toISOString(),
    };
    if (!apiKey) return empty;

    const params = new URLSearchParams({
      sportID: "SOCCER",
      oddsFormat: "decimal",
    });
    if (data.matchId) params.set("eventID", data.matchId);
    if (data.date) params.set("startsAfter", data.date);

    const url = `https://api.sportsgameodds.com/v2/events?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: {
          "x-api-key": apiKey,
          accept: "application/json",
        },
      });
      if (!res.ok) return empty;

      const json = (await res.json()) as { data?: UpstreamEvent[] };
      const event = pickEvent(json.data ?? [], data);
      if (!event) return empty;

      const priced = collectMoneyline(event);
      const consensus = {
        home: average(priced.home),
        draw: average(priced.draw),
        away: average(priced.away),
      };

      const kalshi = pickImplied(event, "kalshi");
      const polymarket = pickImplied(event, "polymarket");

      return {
        consensus,
        kalshi,
        polymarket,
        bookmakerCount: priced.home.length,
        updatedAt: event.updated ?? new Date().toISOString(),
      };
    } catch (err) {
      console.error("consensus-odds fetch failed", err);
      return empty;
    }
  });

/* ------------ helpers ------------ */

type UpstreamOdds = {
  bookmakerID?: string;
  odds?: { home?: number; draw?: number; away?: number };
  impliedProbability?: { home?: number };
};
type UpstreamEvent = {
  eventID: string;
  teams?: { home?: { names?: { long?: string } }; away?: { names?: { long?: string } } };
  updated?: string;
  odds?: UpstreamOdds[];
};

function pickEvent(events: UpstreamEvent[], q: z.infer<typeof QuerySchema>) {
  if (!events.length) return undefined;
  if (q.matchId) return events.find((e) => e.eventID === q.matchId) ?? events[0];
  const h = q.homeTeam?.toLowerCase();
  const a = q.awayTeam?.toLowerCase();
  if (h && a) {
    return events.find((e) => {
      const eh = e.teams?.home?.names?.long?.toLowerCase() ?? "";
      const ea = e.teams?.away?.names?.long?.toLowerCase() ?? "";
      return eh.includes(h) && ea.includes(a);
    });
  }
  return events[0];
}

function collectMoneyline(event: UpstreamEvent) {
  const home: number[] = [];
  const draw: number[] = [];
  const away: number[] = [];
  for (const row of event.odds ?? []) {
    if (row.bookmakerID === "kalshi" || row.bookmakerID === "polymarket") continue;
    if (row.odds?.home) home.push(row.odds.home);
    if (row.odds?.draw) draw.push(row.odds.draw);
    if (row.odds?.away) away.push(row.odds.away);
  }
  return { home, draw, away };
}

function average(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pickImplied(event: UpstreamEvent, bookmakerID: string): number | null {
  const row = event.odds?.find((r) => r.bookmakerID === bookmakerID);
  return row?.impliedProbability?.home ?? null;
}
