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

export type ConsensusOddsResult = {
  consensus: {
    home: number | null;
    draw: number | null;
    away: number | null;
  };
  kalshi: number | null; // implied prob 0..1 for home outcome
  polymarket: number | null; // implied prob 0..1 for home outcome
  bookmakerCount: number;
  updatedAt: string;
};
