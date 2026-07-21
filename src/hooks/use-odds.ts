import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

import { getNovibetOdds } from "@/lib/odds/novibet.functions";
import type { MatchQuery } from "@/lib/odds/types";
import { el } from "@/lib/i18n";

/** Session-cached Novibet odds. Same "don't burn quota" pattern as football-data. */
export function useNovibetOdds(query: MatchQuery, enabled = true) {
  const fetchFn = useServerFn(getNovibetOdds);
  const notified = useRef(false);

  const q = useQuery({
    queryKey: ["novibet-odds", query.matchId ?? `${query.homeTeam}-${query.awayTeam}`],
    queryFn: () => fetchFn({ data: query }),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  useEffect(() => {
    if (q.isError && !notified.current) {
      notified.current = true;
      toast.error(el.loadOddsFail);
    }
  }, [q.isError]);

  return q;
}
