// Fetches team form from API-Football (api-sports.io) with heavy caching.
// If API_FOOTBALL_KEY is absent every function returns null and the app
// continues to work exactly as before.

import type { FormMatch } from "./rates";

const API_BASE = "https://v3.football.api-sports.io";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

let warnedMissingKey = false;
function readKey(): string | null {
  const k = process.env.API_FOOTBALL_KEY;
  if (!k) {
    if (!warnedMissingKey) {
      console.log("model: API_FOOTBALL_KEY not set — shadow model disabled");
      warnedMissingKey = true;
    }
    return null;
  }
  return k;
}

function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|afc|cfc|sk|bk|if|jk)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export class ApiFootballError extends Error {
  status: number;
  constructor(status: number, path: string) {
    super(`api-football ${path} → ${status}`);
    this.status = status;
  }
}

async function apiGet(path: string, key: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": key },
  });
  if (!res.ok) {
    throw new ApiFootballError(res.status, path);
  }
  return await res.json();
}

// -------------------- findTeamId --------------------

const NEGATIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type TeamLookupDebug = {
  name: string;
  query: string;
  hits: number;
  hitNames: string[];
  rejectedByExactMatch: boolean;
  apiError?: string;
};

export type TeamLookupStats = {
  negativeCacheHits: number;
  apiErrors: number;
  rateLimited: boolean;
  debug: TeamLookupDebug[];
  debugCap: number;
};

export function makeLookupStats(debugCap = 3): TeamLookupStats {
  return {
    negativeCacheHits: 0,
    apiErrors: 0,
    rateLimited: false,
    debug: [],
    debugCap,
  };
}

async function searchTeams(
  key: string,
  query: string,
): Promise<Array<{ team?: { id?: number; name?: string } }>> {
  const body = (await apiGet(
    `/teams?search=${encodeURIComponent(query)}`,
    key,
  )) as { response?: Array<{ team?: { id?: number; name?: string } }> };
  return body.response ?? [];
}

export async function findTeamId(
  name: string,
  stats?: TeamLookupStats,
): Promise<number | null> {
  const key = readKey();
  if (!key) return null;
  const norm = normaliseName(name);
  if (!norm) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cached } = await supabaseAdmin
    .from("team_ids")
    .select("team_id, not_found, resolved_at")
    .eq("name", norm)
    .maybeSingle();
  if (cached) {
    if (cached.team_id && !cached.not_found) return cached.team_id;
    if (cached.not_found) {
      const age = Date.now() - new Date(cached.resolved_at).getTime();
      if (age < NEGATIVE_CACHE_TTL_MS) {
        if (stats) stats.negativeCacheHits++;
        return null;
      }
      // TTL expired — allow one retry below.
    }
  }

  // Circuit-break: once we hit a rate limit during this scan, don't burn
  // more requests — every subsequent call will hit the same wall.
  if (stats?.rateLimited) return null;

  const tryQuery = async (
    q: string,
  ): Promise<{ id: number | null; hits: Array<{ team?: { id?: number; name?: string } }>; rejectedByExactMatch: boolean }> => {
    const hits = await searchTeams(key, q);
    if (!hits.length) return { id: null, hits, rejectedByExactMatch: false };
    const exact = hits.find(
      (h) => h.team?.name && normaliseName(h.team.name) === norm,
    );
    const pick = exact ?? hits[0];
    const id = pick.team?.id ?? null;
    const rejectedByExactMatch = !exact && hits.length > 0;
    return { id: id ?? null, hits, rejectedByExactMatch };
  };

  const recordDebug = (entry: TeamLookupDebug) => {
    if (!stats) return;
    if (stats.debug.length < stats.debugCap) stats.debug.push(entry);
  };

  const persistNotFound = async () => {
    await supabaseAdmin.from("team_ids").upsert({
      name: norm,
      team_id: null,
      not_found: true,
      resolved_at: new Date().toISOString(),
    });
  };

  try {
    const primary = await tryQuery(name.trim());
    let picked = primary;
    let queryUsed = name.trim();

    if (primary.hits.length === 0) {
      const fallback = await tryQuery(norm);
      if (fallback.hits.length > 0 || fallback.id != null) {
        picked = fallback;
        queryUsed = norm;
      }
    }

    if (picked.id == null) {
      recordDebug({
        name,
        query: queryUsed,
        hits: picked.hits.length,
        hitNames: picked.hits.slice(0, 5).map((h) => h.team?.name ?? "?"),
        rejectedByExactMatch: picked.rejectedByExactMatch,
      });
      await persistNotFound();
      return null;
    }

    await supabaseAdmin.from("team_ids").upsert({
      name: norm,
      team_id: picked.id,
      not_found: false,
      resolved_at: new Date().toISOString(),
    });
    return picked.id;
  } catch (err) {
    const status = err instanceof ApiFootballError ? err.status : 0;
    if (stats) {
      stats.apiErrors++;
      if (status === 429) stats.rateLimited = true;
      recordDebug({
        name,
        query: name.trim(),
        hits: 0,
        hitNames: [],
        rejectedByExactMatch: false,
        apiError: status ? `HTTP ${status}` : String(err),
      });
    }
    // Don't spam the console with the same 429 repeatedly.
    if (status !== 429 || (stats && stats.apiErrors <= 1)) {
      console.error("model: findTeamId failed for", name, err);
    }
    // Do NOT persist as not_found — the team may exist; the API refused us.
    return null;
  }
}

// -------------------- form cache + fetch --------------------

type CachedForm = {
  fixtures: Array<{
    fixture: { id: number; date: string; status?: { short?: string } };
    teams: {
      home: { id: number; name: string; winner?: boolean | null };
      away: { id: number; name: string; winner?: boolean | null };
    };
    goals: { home: number | null; away: number | null };
  }>;
};

async function readFormCache(teamId: number): Promise<CachedForm | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("form_cache")
    .select("payload, fetched_at")
    .eq("team_id", teamId)
    .maybeSingle();
  if (!data) return null;
  const age = Date.now() - new Date(data.fetched_at).getTime();
  if (age > CACHE_TTL_MS) return null;
  return data.payload as unknown as CachedForm;
}

async function writeFormCache(teamId: number, payload: CachedForm): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("form_cache").upsert({
    team_id: teamId,
    payload: payload as never,
    fetched_at: new Date().toISOString(),
  });
}

// Raw shape returned by API-Football under `response`.
type ApiFixture = {
  fixture: { id: number; date: string; status?: { short?: string } };
  teams: {
    home: { id: number; name: string; winner?: boolean | null };
    away: { id: number; name: string; winner?: boolean | null };
  };
  goals: { home: number | null; away: number | null };
};

async function fetchTeamFixtures(
  teamId: number,
  limit: number,
  key: string,
): Promise<CachedForm | null> {
  const cached = await readFormCache(teamId);
  if (cached) return cached;
  try {
    const body = (await apiGet(
      `/fixtures?team=${teamId}&last=${limit}`,
      key,
    )) as { response?: ApiFixture[] };
    // Normalise at the fetch boundary: API-Football returns rows under
    // `response`. We cache in our own `{ fixtures: [...] }` shape so cached
    // payloads stay stable if the API ever adds sibling fields.
    const normalised: CachedForm = { fixtures: body.response ?? [] };
    await writeFormCache(teamId, normalised);
    return normalised;
  } catch (err) {
    console.error("model: fetchTeamFixtures failed", teamId, err);
    return null;
  }
}

export type RecentFormMatch = FormMatch & {
  result: "W" | "D" | "L";
  date: string;
};

export async function getRecentForm(
  teamId: number,
  limit = 10,
): Promise<RecentFormMatch[] | null> {
  const key = readKey();
  if (!key) return null;
  const body = await fetchTeamFixtures(teamId, Math.max(limit, 10), key);
  if (!body) return null;
  const fixtures = (body.fixtures ?? [])
    .filter((f) => {
      const s = f.fixture?.status?.short ?? "";
      return s === "FT" || s === "AET" || s === "PEN";
    })
    .filter((f) => f.goals.home != null && f.goals.away != null)
    .sort(
      (a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime(),
    )
    .slice(0, limit);

  return fixtures.map((f) => {
    const isHome = f.teams.home.id === teamId;
    const gf = (isHome ? f.goals.home : f.goals.away) as number;
    const ga = (isHome ? f.goals.away : f.goals.home) as number;
    const result: "W" | "D" | "L" = gf > ga ? "W" : gf < ga ? "L" : "D";
    return { goalsFor: gf, goalsAgainst: ga, isHome, result, date: f.fixture.date };
  });
}

// -------------------- head-to-head --------------------

export type H2HMatch = {
  date: string;
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
};

export async function getHeadToHead(
  homeId: number,
  awayId: number,
  limit = 10,
): Promise<H2HMatch[] | null> {
  const key = readKey();
  if (!key) return null;
  try {
    const body = (await apiGet(
      `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=${limit}`,
      key,
    )) as { response?: ApiFixture[] };
    return (body.response ?? [])
      .filter((f) => f.goals.home != null && f.goals.away != null)
      .slice(0, limit)
      .map((f) => ({
        date: f.fixture.date,
        homeId: f.teams.home.id,
        awayId: f.teams.away.id,
        homeGoals: f.goals.home as number,
        awayGoals: f.goals.away as number,
      }));
  } catch (err) {
    console.error("model: getHeadToHead failed", homeId, awayId, err);
    return null;
  }
}

// -------------------- combined helper for scan --------------------

export type ModelInputs = {
  homeForm: RecentFormMatch[];
  awayForm: RecentFormMatch[];
  h2h: H2HMatch[];
  sampleSize: number;
};

export type ModelFailure = "no_key" | "team_unresolved" | "insufficient_form";

export async function getModelInputs(
  home: string,
  away: string,
  stats?: TeamLookupStats,
): Promise<{ inputs: ModelInputs | null; reason: ModelFailure | null }> {
  if (!readKey()) return { inputs: null, reason: "no_key" };
  const [homeId, awayId] = await Promise.all([findTeamId(home, stats), findTeamId(away, stats)]);
  if (!homeId || !awayId) return { inputs: null, reason: "team_unresolved" };
  const [homeForm, awayForm, h2h] = await Promise.all([
    getRecentForm(homeId),
    getRecentForm(awayId),
    getHeadToHead(homeId, awayId),
  ]);
  if (!homeForm || !awayForm || homeForm.length < 3 || awayForm.length < 3) {
    return { inputs: null, reason: "insufficient_form" };
  }
  return {
    inputs: {
      homeForm,
      awayForm,
      h2h: h2h ?? [],
      sampleSize: Math.min(homeForm.length, awayForm.length),
    },
    reason: null,
  };
}
