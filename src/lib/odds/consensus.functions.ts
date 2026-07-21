import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchConsensusOdds } from "./consensus.server";

const QuerySchema = z.object({
  matchId: z.string().optional(),
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional(),
  date: z.string().optional(),
});

/**
 * Aggregated market-average odds + Kalshi / Polymarket implied probabilities.
 * SPORTSGAMEODDS_KEY is read inside the server-only helper.
 */
export const getConsensusOdds = createServerFn({ method: "POST" })
  .inputValidator((raw) => QuerySchema.parse(raw))
  .handler(async ({ data }) => fetchConsensusOdds(data));
