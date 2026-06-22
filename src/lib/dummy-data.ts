import type { ProductIcon } from "@/components/ui/ProductThumb";

export type SpotItem = {
  id: string;
  name: string;
  brand: string;
  match: number;
  icon: ProductIcon;
  tone: number;
  day: "Heute" | "Gestern" | "Diese Woche";
  time: string;
};

export const recentSpots: SpotItem[] = [
  {
    id: "1",
    name: "Air Max 97",
    brand: "Nike",
    match: 98,
    icon: "shoe",
    tone: 0,
    day: "Heute",
    time: "11:24",
  },
  {
    id: "2",
    name: "Oversize Hoodie",
    brand: "COS",
    match: 94,
    icon: "shirt",
    tone: 1,
    day: "Heute",
    time: "09:02",
  },
  {
    id: "3",
    name: "Chrono Watch",
    brand: "Daniel Wellington",
    match: 91,
    icon: "watch",
    tone: 4,
    day: "Gestern",
    time: "18:40",
  },
  {
    id: "4",
    name: "Tote Bag Canvas",
    brand: "Arket",
    match: 87,
    icon: "bag",
    tone: 2,
    day: "Gestern",
    time: "14:15",
  },
  {
    id: "5",
    name: "Lederguertel Classic",
    brand: "Tommy Hilfiger",
    match: 96,
    icon: "tag",
    tone: 3,
    day: "Diese Woche",
    time: "Mo, 10:51",
  },
];

export type AlternativeItem = {
  id: string;
  name: string;
  store: string;
  price: string;
  diff: string;
  icon: ProductIcon;
  tone: number;
};

export const analyseResult = {
  name: "Air Max 97",
  brand: "Nike",
  match: 98,
  category: "Sneaker",
  original: {
    store: "Nike.com",
    price: "189,00 €",
    icon: "shoe" as ProductIcon,
    tone: 0,
  },
  alternatives: [
    {
      id: "a1",
      name: "Air Max ähnlich Runner",
      store: "Zalando",
      price: "79,90 €",
      diff: "−58%",
      icon: "shoe" as ProductIcon,
      tone: 2,
    },
    {
      id: "a2",
      name: "Retro Runner Mesh",
      store: "About You",
      price: "64,95 €",
      diff: "−66%",
      icon: "shoe" as ProductIcon,
      tone: 1,
    },
    {
      id: "a3",
      name: "Classic Sneaker 97-Style",
      store: "Amazon",
      price: "54,00 €",
      diff: "−71%",
      icon: "shoe" as ProductIcon,
      tone: 4,
    },
  ] as AlternativeItem[],
};
