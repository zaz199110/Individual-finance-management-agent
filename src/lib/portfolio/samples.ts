import fs from "node:fs";
import path from "node:path";
import { getProjectRoot } from "@/lib/paths";
import type { HoldingsProposePayload } from "./types";

let cached: {
  holdings_initial: HoldingsProposePayload;
  holdings_update: HoldingsProposePayload;
  holdings_manual_single: HoldingsProposePayload;
} | null = null;

function loadExamples() {
  if (cached) return cached;
  const p = path.join(
    getProjectRoot(),
    "app-config/samples/holdings-propose-payload.examples.json",
  );
  cached = JSON.parse(fs.readFileSync(p, "utf8")) as typeof cached;
  return cached!;
}

export function loadSampleHoldingsInitial(): HoldingsProposePayload {
  return structuredClone(loadExamples().holdings_initial);
}

export function loadSampleHoldingsUpdate(
  previousVersionId?: string,
): HoldingsProposePayload {
  const sample = structuredClone(loadExamples().holdings_update);
  if (previousVersionId) {
    sample.previous_version_id = previousVersionId;
  }
  return sample;
}

export function loadSampleHoldingsSingle(): HoldingsProposePayload {
  return structuredClone(loadExamples().holdings_manual_single);
}
