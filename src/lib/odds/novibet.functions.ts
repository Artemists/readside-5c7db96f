import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchNovibetOdds } from "./novibet.server";

const QuerySchema = z.object({
  matchId: z.string().optional(),
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional(),
  date: z.string().optional(),
});

/**
 * Novibet moneyline / spread / totals for a single fixture.
 * ODDS_API_IO_KEY is read inside the server-only helper.
 */
export const getNovibetOdds = createServerFn({ method: "POST" })
  .inputValidator((raw) => QuerySchema.parse(raw))
  .handler(async ({ data }) => fetchNovibetOdds(data));
