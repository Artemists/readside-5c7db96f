import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/test-odds-raw")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const apiKey = process.env.ODDS_API_IO_KEY!;
        const url = new URL(request.url);
        const path = url.searchParams.get("p") ?? "events?sport=football";
        const upstream = `https://api.odds-api.io/v3/${path}${path.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(apiKey)}`;
        const res = await fetch(upstream, { headers: { accept: "application/json" } });
        const text = await res.text();
        return new Response(
          JSON.stringify({ status: res.status, upstream: upstream.replace(apiKey, "***"), body: text.slice(0, 5000) }, null, 2),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
