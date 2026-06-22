import type { ProductIcon } from "@/components/ui/ProductThumb";
import { catalog, type AlternativeRole, type CatalogProduct } from "./catalog";

export type StoredAlternative = {
  role: AlternativeRole;
  name: string;
  store: string;
  price: number;
  savingsPercent: number;
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
  original: { store: string; price: number };
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

function buildAnalysis(product: CatalogProduct, createdAt: number): StoredAnalysis {
  return {
    id: `${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    name: product.name,
    brand: product.brand,
    category: product.category,
    confidence: product.confidence,
    icon: product.icon,
    tone: product.tone,
    original: { store: product.originalStore, price: product.originalPrice },
    alternatives: product.alternatives.map((alt) => ({
      ...alt,
      savingsPercent: Math.round((1 - alt.price / product.originalPrice) * 100),
    })),
  };
}

export function createAnalysis(): StoredAnalysis {
  const history = readAll();
  const index = history.length % catalog.length;
  let product = catalog[index];
  if (history[0]?.name === product.name && catalog.length > 1) {
    product = catalog[(index + 1) % catalog.length];
  }
  const analysis = buildAnalysis(product, Date.now());
  writeAll([analysis, ...history].slice(0, MAX_ENTRIES));
  return analysis;
}

export function getHistory(): StoredAnalysis[] {
  return readAll();
}

export function getAnalysisById(id: string): StoredAnalysis | undefined {
  return readAll().find((item) => item.id === id);
}

const SEED_OFFSETS_MS = [
  0,
  1000 * 60 * 60 * 3,
  1000 * 60 * 60 * 26,
  1000 * 60 * 60 * 30,
  1000 * 60 * 60 * 24 * 4,
];

export function seedHistoryIfEmpty() {
  if (typeof window === "undefined") return;
  if (readAll().length > 0) return;
  const now = Date.now();
  const seeded = SEED_OFFSETS_MS.map((offset, i) =>
    buildAnalysis(catalog[i % catalog.length], now - offset),
  );
  writeAll(seeded);
}
