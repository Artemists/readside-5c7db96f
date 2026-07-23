import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/run-scan-now")({
  server: {
    handlers: {
      GET: async () => {
        const { runScanNow } = await import("@/lib/scan/scan.server");
        const t0 = Date.now();
        try {
          const result = await runScanNow();
          return Response.json({ ok: true, durationMs: Date.now() - t0, result });
        } catch (err) {
          return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
        }
      },
    },
  },
});
