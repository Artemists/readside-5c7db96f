import { createFileRoute } from "@tanstack/react-router";
import { fetchNovibetOdds } from "@/lib/odds/novibet.server";

export const Route = createFileRoute("/api/public/test-odds")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const homeTeam = url.searchParams.get("home") ?? undefined;
        const awayTeam = url.searchParams.get("away") ?? undefined;
        const date = url.searchParams.get("date") ?? undefined;
        const matchId = url.searchParams.get("id") ?? undefined;
        const result = await fetchNovibetOdds({ matchId, homeTeam, awayTeam, date });
        return new Response(JSON.stringify(result, null, 2), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
