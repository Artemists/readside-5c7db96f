/**
 * Stub for BetLab's 9-signal model. The Value Scanner and Popular Pick
 * Warning surfaces read `betLabAssessment(matchId)` from here — swap the
 * implementation with the real logic without touching UI.
 */

export type NineSignalResult = {
  fairProbability: number; // 0..1 — used by Value Scanner
  assessmentPercent: number; // 0..100 — used by Popular Pick Warning
  signals: Array<{ label: string; on: boolean }>;
};

const FIXTURES: Record<string, NineSignalResult> = {
  "wc2026-usa-mex": {
    fairProbability: 0.42,
    assessmentPercent: 54,
    signals: [
      { label: "Home form", on: true },
      { label: "xG differential", on: true },
      { label: "Rest days", on: false },
      { label: "Rotation risk", on: true },
      { label: "Set-piece edge", on: false },
      { label: "Referee tendency", on: false },
      { label: "Line movement", on: true },
      { label: "Public %", on: false },
      { label: "Sharp %", on: true },
    ],
  },
  "wc2026-arg-bra": {
    fairProbability: 0.51,
    assessmentPercent: 61,
    signals: [
      { label: "Home form", on: true },
      { label: "xG differential", on: true },
      { label: "Rest days", on: true },
      { label: "Rotation risk", on: false },
      { label: "Set-piece edge", on: true },
      { label: "Referee tendency", on: false },
      { label: "Line movement", on: true },
      { label: "Public %", on: true },
      { label: "Sharp %", on: true },
    ],
  },
  "wc2026-esp-fra": {
    fairProbability: 0.38,
    assessmentPercent: 47,
    signals: [
      { label: "Home form", on: false },
      { label: "xG differential", on: true },
      { label: "Rest days", on: true },
      { label: "Rotation risk", on: true },
      { label: "Set-piece edge", on: false },
      { label: "Referee tendency", on: true },
      { label: "Line movement", on: false },
      { label: "Public %", on: false },
      { label: "Sharp %", on: true },
    ],
  },
};

export function betLabAssessment(matchId: string): NineSignalResult {
  return (
    FIXTURES[matchId] ?? {
      fairProbability: 0.4,
      assessmentPercent: 50,
      signals: [],
    }
  );
}
