export type Verdict = "opportunity" | "trap" | "ignore";

export type BookmakerMarket = {
  name: string;
  odds?: Array<{
    home?: string;
    draw?: string;
    away?: string;
    over?: string;
    under?: string;
    hdp?: number;
    max?: number;
  }>;
  updatedAt?: string;
};

export type OddsEvent = {
  id: number | string;
  sport?: string;
  home: string;
  away: string;
  date?: string;
  league?: string;
  status?: string;
  bookmakers?: Record<string, BookmakerMarket[]>;
};

export type EventSummary = {
  id: string;
  sport: string;
  competition: string | null;
  home: string;
  away: string;
  kickoff: string | null;
};

export type ScoredMatch = {
  event: EventSummary;
  contextScore: number;      // 0..10
  explosionScore: number;    // 0..100
  valueScore: number;        // 0..100
  trapScore: number;         // 0..100
  confidence: number;        // 1..10
  verdict: Verdict;
  stake: "Small" | "Pass";
  recommendedMarket: string | null;
  recommendedSelection: string | null;
  bestOdds: number | null;
  fairProbability: number | null;
  impliedProbability: number | null;
  edgePercent: number | null;
  evPercent: number | null;
  reasoning: string;
  signals: Record<string, unknown>;
};
