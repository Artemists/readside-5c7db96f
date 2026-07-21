import { createFileRoute } from "@tanstack/react-router";
import { fetchNovibetOdds } from "@/lib/odds/novibet.server";

export const Route = createFileRoute("/api/public/test-odds")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const home = url.searchParams.get("home") ?? undefined;
        const away = url.searchParams.get("away") ?? undefined;
        const date = url.searchParams.get("date") ?? undefined;
        const result = await fetchNovibetOdds({ home_team: home, away_team: away, date } as any);
        return new Response(JSON.stringify(result, null, 2), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
