export type MatchQuery = {
  matchId?: string;
  homeTeam?: string;
  awayTeam?: string;
  date?: string; // ISO date (YYYY-MM-DD)
};

export type NovibetOddsResult =
  | {
      status: "ok";
      eventId: string;
      home: number;
      draw: number | null;
      away: number;
      spread: { hdp: number; home: number; away: number } | null;
      totals: { line: number; over: number; under: number } | null;
      updatedAt: string;
    }
  | { status: "no_odds_available"; reason?: string };
