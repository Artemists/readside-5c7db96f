import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { NovibetOddsResult } from "./types";

const QuerySchema = z.object({
  matchId: z.string().optional(),
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional(),
  date: z.string().optional(),
});

/**
 * Fetch Novibet moneyline / spread / totals for a single fixture.
 * Reads ODDS_API_IO_KEY from server env inside the handler.
 * Never call this from a public route loader — call from a component
 * via useServerFn + useQuery so it runs client-side.
 */
export const getNovibetOdds = createServerFn({ method: "POST" })
  .inputValidator((raw) => QuerySchema.parse(raw))
  .handler(async ({ data }): Promise<NovibetOddsResult> => {
    const apiKey = process.env.ODDS_API_IO_KEY;
    if (!apiKey) {
      return { status: "no_odds_available", reason: "missing_api_key" };
    }

    const sport = "soccer";
    const params = new URLSearchParams({
      apiKey,
      regions: "eu",
      markets: "h2h,spreads,totals",
      oddsFormat: "decimal",
      bookmakers: "novibet",
    });
    if (data.date) params.set("date", data.date);

    const url = `https://api.odds-api.io/v2/odds/${sport}?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        return { status: "no_odds_available", reason: `upstream_${res.status}` };
      }
      const events = (await res.json()) as UpstreamEvent[];
      const event = pickEvent(events, data);
      if (!event) return { status: "no_odds_available", reason: "no_match" };

      const novibet = event.bookmakers?.find(
        (b) => b.key === "novibet" || /novibet/i.test(b.title ?? ""),
      );
      if (!novibet) return { status: "no_odds_available", reason: "no_novibet" };

      const h2h = novibet.markets?.find((m) => m.key === "h2h");
      if (!h2h) return { status: "no_odds_available", reason: "no_h2h" };

      const home = priceFor(h2h.outcomes, event.home_team);
      const away = priceFor(h2h.outcomes, event.away_team);
      const draw = priceFor(h2h.outcomes, "Draw");
      if (home == null || away == null) {
        return { status: "no_odds_available", reason: "incomplete_h2h" };
      }

      const spreadMarket = novibet.markets?.find((m) => m.key === "spreads");
      const totalsMarket = novibet.markets?.find((m) => m.key === "totals");

      return {
        status: "ok",
        market: "h2h",
        home,
        draw,
        away,
        spread: spreadMarket
          ? {
              line: spreadMarket.outcomes?.[0]?.point ?? 0,
              home: priceFor(spreadMarket.outcomes, event.home_team) ?? 0,
              away: priceFor(spreadMarket.outcomes, event.away_team) ?? 0,
            }
          : null,
        totals: totalsMarket
          ? {
              line: totalsMarket.outcomes?.[0]?.point ?? 0,
              over: priceFor(totalsMarket.outcomes, "Over") ?? 0,
              under: priceFor(totalsMarket.outcomes, "Under") ?? 0,
            }
          : null,
        updatedAt: novibet.last_update ?? new Date().toISOString(),
      };
    } catch (err) {
      console.error("novibet-odds fetch failed", err);
      return { status: "no_odds_available", reason: "fetch_error" };
    }
  });

/* ------------ helpers ------------ */

type Outcome = { name: string; price: number; point?: number };
type Market = { key: string; outcomes?: Outcome[] };
type Bookmaker = {
  key: string;
  title?: string;
  last_update?: string;
  markets?: Market[];
};
type UpstreamEvent = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time?: string;
  bookmakers?: Bookmaker[];
};

function pickEvent(events: UpstreamEvent[], q: z.infer<typeof QuerySchema>) {
  if (!events?.length) return undefined;
  if (q.matchId) {
    return events.find((e) => e.id === q.matchId) ?? undefined;
  }
  const h = q.homeTeam?.toLowerCase();
  const a = q.awayTeam?.toLowerCase();
  if (h && a) {
    return events.find(
      (e) =>
        e.home_team.toLowerCase().includes(h) &&
        e.away_team.toLowerCase().includes(a),
    );
  }
  return events[0];
}

function priceFor(outcomes: Outcome[] | undefined, name: string) {
  const o = outcomes?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return o?.price ?? null;
}
