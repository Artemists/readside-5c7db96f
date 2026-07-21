/** Demo World Cup 2026 fixtures for the Value Scanner + Popular Pick screens. */
export type Match = {
  id: string;
  home: string;
  away: string;
  kickoff: string; // ISO
  competition: string;
};

export const WC26_MATCHES: Match[] = [
  {
    id: "wc2026-usa-mex",
    home: "United States",
    away: "Mexico",
    kickoff: "2026-06-12T20:00:00Z",
    competition: "FIFA World Cup 2026",
  },
  {
    id: "wc2026-arg-bra",
    home: "Argentina",
    away: "Brazil",
    kickoff: "2026-06-15T22:00:00Z",
    competition: "FIFA World Cup 2026",
  },
  {
    id: "wc2026-esp-fra",
    home: "Spain",
    away: "France",
    kickoff: "2026-06-18T19:00:00Z",
    competition: "FIFA World Cup 2026",
  },
];

export function matchById(id: string): Match | undefined {
  return WC26_MATCHES.find((m) => m.id === id);
}
