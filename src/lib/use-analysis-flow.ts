"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAnalysisResult } from "@/lib/analysis-store";
import type { AnalyzeResponse } from "@/lib/analysis-types";

export const STAGE_COUNT = 3;
const STAGE_DURATION = 1150;
const MIN_PROCESSING_MS = STAGE_DURATION * (STAGE_COUNT - 1);

/**
 * "not_configured": kein SERPAPI_KEY gesetzt, echte Suche ist noch nicht
 * aktiviert. "failed": Suche war aktiv, hat aber kein echtes Ergebnis
 * geliefert (zu wenige Treffer, Netzwerk-/Serverfehler). In beiden Fällen
 * wird NIE ein Dummy-Ergebnis als echte Analyse angezeigt.
 */
export type AnalysisOutcome = "not_configured" | "failed";

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

      if (data.status === "ok") {
        const analysisId = saveAnalysisResult(data.result).id;
        router.push(`/analyse/${analysisId}`);
        return;
      }

      setStageIndex(null);
      setOutcome(data.status === "not_configured" ? "not_configured" : "failed");
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
