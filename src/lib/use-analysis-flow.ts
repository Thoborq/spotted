"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createAnalysis, saveAnalysisResult } from "@/lib/analysis-store";
import type { AnalysisResult } from "@/lib/analysis-types";

export const STAGE_COUNT = 3;
const STAGE_DURATION = 1150;
const MIN_PROCESSING_MS = STAGE_DURATION * (STAGE_COUNT - 1);

export function useAnalysisFlow() {
  const router = useRouter();
  const [stageIndex, setStageIndex] = useState<number | null>(null);

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

    const minDuration = new Promise((resolve) => setTimeout(resolve, MIN_PROCESSING_MS));
    const formData = new FormData();
    formData.append("image", file);

    let analysisId: string;
    try {
      const [response] = await Promise.all([
        fetch("/api/analyze", { method: "POST", body: formData }),
        minDuration,
      ]);
      if (!response.ok) throw new Error(`/api/analyze antwortete mit ${response.status}`);
      const result: AnalysisResult = await response.json();
      analysisId = saveAnalysisResult(result).id;
    } catch (error) {
      console.error("Analyse fehlgeschlagen, falle auf Dummy-Ergebnis zurück:", error);
      await minDuration;
      analysisId = createAnalysis().id;
    }

    router.push(`/analyse/${analysisId}`);
  }

  return { stageIndex, runAnalysis };
}
