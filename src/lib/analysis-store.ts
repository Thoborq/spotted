import type { ProductIcon } from "@/components/ui/ProductThumb";
import type { AlternativeRole } from "./catalog";
import type { AnalysisResult } from "./analysis-types";

export type StoredAlternative = {
  role: AlternativeRole;
  name: string;
  store: string;
  price: number;
  savingsPercent: number;
  imageUrl?: string;
  link?: string;
};

export type StoredAnalysis = {
  id: string;
  createdAt: number;
  name: string;
  brand: string;
  category: string;
  confidence: number;
  icon: ProductIcon;
  tone: number;
  imageUrl?: string;
  original: { store: string; price: number; link?: string };
  alternatives: StoredAlternative[];
};

const STORAGE_KEY = "spotted.history.v1";
const MAX_ENTRIES = 30;

function readAll(): StoredAnalysis[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAnalysis[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: StoredAnalysis[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * Übernimmt ein echtes AnalysisResult aus /api/analyze in das bestehende
 * Verlauf/UI-Datenmodell. Wird ausschließlich mit echten Treffern
 * aufgerufen - es gibt keinen Dummy-Pfad mehr, der hier landet.
 */
export function saveAnalysisResult(result: AnalysisResult): StoredAnalysis {
  const history = readAll();
  const createdAt = Date.now();

  const analysis: StoredAnalysis = {
    id: `${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    name: result.originalProduct.name,
    brand: result.brand,
    category: result.category,
    confidence: result.confidence,
    icon: guessIcon(result.category, result.originalProduct.name),
    tone: Math.floor(Math.random() * 5),
    imageUrl: result.originalProduct.imageUrl,
    original: {
      store: result.originalProduct.store,
      price: result.originalProduct.price,
      link: result.originalProduct.link,
    },
    alternatives: [
      result.alternatives.best,
      result.alternatives.cheapest,
      result.alternatives.premium,
    ],
  };

  writeAll([analysis, ...history].slice(0, MAX_ENTRIES));
  return analysis;
}

function guessIcon(category: string, name: string): ProductIcon {
  const text = `${category} ${name}`.toLowerCase();
  if (/schuh|sneaker|shoe|stiefel|boot/.test(text)) return "shoe";
  if (/shirt|hoodie|jacke|jacket|pullover|mantel|coat/.test(text)) return "shirt";
  if (/uhr|watch/.test(text)) return "watch";
  if (/tasche|bag|rucksack/.test(text)) return "bag";
  if (/gürtel|guertel|belt/.test(text)) return "tag";
  return "sparkles";
}

export function getHistory(): StoredAnalysis[] {
  return readAll();
}

export function getAnalysisById(id: string): StoredAnalysis | undefined {
  return readAll().find((item) => item.id === id);
}
