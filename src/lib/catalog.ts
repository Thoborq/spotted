import type { ProductIcon } from "@/components/ui/ProductThumb";

export type AlternativeRole = "best" | "cheapest" | "premium" | "other";

export type CatalogAlternative = {
  role: AlternativeRole;
  name: string;
  store: string;
  price: number;
};

export type CatalogProduct = {
  name: string;
  brand: string;
  category: string;
  confidence: number;
  icon: ProductIcon;
  tone: number;
  originalStore: string;
  originalPrice: number;
  alternatives: CatalogAlternative[];
};

export const catalog: CatalogProduct[] = [
  {
    name: "Air Max 97",
    brand: "Nike",
    category: "Sneaker",
    confidence: 98,
    icon: "shoe",
    tone: 0,
    originalStore: "Nike.com",
    originalPrice: 189,
    alternatives: [
      { role: "best", name: "Retro Runner Mesh", store: "About You", price: 74.95 },
      { role: "cheapest", name: "Classic Sneaker 97-Style", store: "Amazon", price: 54 },
      { role: "premium", name: "Runner Premium Edition", store: "Zalando", price: 139 },
    ],
  },
  {
    name: "Oversize Hoodie",
    brand: "COS",
    category: "Hoodie",
    confidence: 94,
    icon: "shirt",
    tone: 1,
    originalStore: "COS.com",
    originalPrice: 89,
    alternatives: [
      { role: "best", name: "Oversize Fleece Hoodie", store: "Zalando", price: 44.9 },
      { role: "cheapest", name: "Basic Oversize Hoodie", store: "H&M", price: 24.99 },
      { role: "premium", name: "Heavyweight Hoodie Organic", store: "Arket", price: 69 },
    ],
  },
  {
    name: "Chrono Watch",
    brand: "Daniel Wellington",
    category: "Uhr",
    confidence: 91,
    icon: "watch",
    tone: 4,
    originalStore: "danielwellington.com",
    originalPrice: 219,
    alternatives: [
      { role: "best", name: "Minimal Chrono Mesh", store: "Liebeskind", price: 99 },
      { role: "cheapest", name: "Quarz Chrono Basic", store: "Amazon", price: 49.9 },
      { role: "premium", name: "Classic Chrono Steel", store: "Fossil", price: 159 },
    ],
  },
  {
    name: "Tote Bag Canvas",
    brand: "Arket",
    category: "Tasche",
    confidence: 87,
    icon: "bag",
    tone: 2,
    originalStore: "Arket.com",
    originalPrice: 69,
    alternatives: [
      { role: "best", name: "Canvas Tote Organic", store: "Zalando", price: 34.9 },
      { role: "cheapest", name: "Basic Canvas Bag", store: "H&M", price: 17.99 },
      { role: "premium", name: "Canvas Shopper Heavy", store: "Filippa K", price: 54 },
    ],
  },
  {
    name: "Lederguertel Classic",
    brand: "Tommy Hilfiger",
    category: "Gürtel",
    confidence: 96,
    icon: "tag",
    tone: 3,
    originalStore: "Tommy.com",
    originalPrice: 59,
    alternatives: [
      { role: "best", name: "Reversible Leather Belt", store: "About You", price: 27.9 },
      { role: "cheapest", name: "Basic Leather Belt", store: "Amazon", price: 14.9 },
      { role: "premium", name: "Leather Belt Heritage", store: "Marc O'Polo", price: 45 },
    ],
  },
];
