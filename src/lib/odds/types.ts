export type MatchQuery = {
  matchId?: string;
  homeTeam?: string;
  awayTeam?: string;
  date?: string; // ISO date (YYYY-MM-DD)
};

export type NovibetOddsResult =
  | {
      status: "ok";
      market: string;
      home: number;
      draw: number | null;
      away: number;
      spread: { line: number; home: number; away: number } | null;
      totals: { line: number; over: number; under: number } | null;
      updatedAt: string;
    }
  | { status: "no_odds_available"; reason?: string };
