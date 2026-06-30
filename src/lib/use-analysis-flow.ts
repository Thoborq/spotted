"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAnalysisResult } from "@/lib/analysis-store";
import type { AnalyzeResponse, PipelineDebug } from "@/lib/analysis-types";

// Must match STAGE_COUNT in AnalysisProcessingOverlay.tsx.
// 2.5 s per stage keeps the animation live throughout the real API call (6–15 s).
export const STAGE_COUNT = 4;
const STAGE_DURATION = 2500;
const MIN_PROCESSING_MS = STAGE_DURATION * (STAGE_COUNT - 1);

export const DEBUG_SESSION_KEY = "spotted.debug.pipeline";

export function getDebugData(): PipelineDebug | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DEBUG_SESSION_KEY);
    return raw ? (JSON.parse(raw) as PipelineDebug) : null;
  } catch { return null; }
}

function isDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    process.env.NODE_ENV === "development" ||
    new URLSearchParams(window.location.search).get("debug") === "true"
  );
}

/**
 * "not_configured": kein SERPAPI_KEY gesetzt, echte Suche ist noch nicht
 * aktiviert. "failed": Suche war aktiv, hat aber kein echtes Ergebnis
 * geliefert (zu wenige Treffer, Netzwerk-/Serverfehler). In beiden Fällen
 * wird NIE ein Dummy-Ergebnis als echte Analyse angezeigt.
 */
export type AnalysisOutcome = "not_configured" | "failed" | "no_eu_shop";

export function useAnalysisFlow() {
  const router = useRouter();
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<AnalysisOutcome | null>(null);

  useEffect(() => {
    if (stageIndex === null || stageIndex >= STAGE_COUNT - 1) return;
    const timer = setTimeout(
      () => setStageIndex((current) => (current ?? 0) + 1),
      STAGE_DURATION,
    );
    return () => clearTimeout(timer);
  }, [stageIndex]);

  async function runAnalysis(file: File) {
    setStageIndex(0);
    setOutcome(null);

    const minDuration = new Promise((resolve) => setTimeout(resolve, MIN_PROCESSING_MS));
    const formData = new FormData();
    formData.append("image", file);

    try {
      const [response] = await Promise.all([
        fetch("/api/analyze", { method: "POST", body: formData }),
        minDuration,
      ]);

      if (!response.ok) {
        throw new Error(`/api/analyze antwortete mit ${response.status}`);
      }

      const data: AnalyzeResponse = await response.json();

      // Store debug data in sessionStorage for the result page (dev or ?debug=true)
      if (isDebugMode() && data.debug) {
        try {
          window.sessionStorage.setItem(DEBUG_SESSION_KEY, JSON.stringify(data.debug));
        } catch { /* ignore quota errors */ }
      }

      if (data.status === "ok") {
        const analysisId = saveAnalysisResult(data.result).id;
        router.push(`/analyse/${analysisId}`);
        return;
      }

      setStageIndex(null);
      if (data.status === "not_configured") setOutcome("not_configured");
      else if (data.status === "no_eu_shop") setOutcome("no_eu_shop");
      else setOutcome("failed");
    } catch (error) {
      console.error("Analyse fehlgeschlagen:", error);
      setStageIndex(null);
      setOutcome("failed");
    }
  }

  function reset() {
    setOutcome(null);
  }

  return { stageIndex, outcome, runAnalysis, reset };
}
