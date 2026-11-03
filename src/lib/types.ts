export type AuctionMode = "ДЕШЕВЛЕ ВСЕГО" | "СРЕДНЯЯ ЗА 7 ДН";

export type AuctionItem = {
  key: string;
  name: string;
  cheap: number | null;
  avg: number | null;
  sold: number | null;
  listed: number | null;
  bid: number | null;
  instant: number | null;
  category: string;
};

export type CraftLine = { name: string; qty: number };

export type CraftRecipe = {
  output: number;
  fee: number;
  ings: CraftLine[];
};

export type PriceItem = {
  name: string;
  manual: number | null;
  key: string | null;
  note: string;
  crafts: CraftRecipe[];
};

export type Product = {
  name: string;
  profession: string;
  level: number;
  output: number;
  fee: number;
  extra: number;
  composition: string;
  lk: string;
};

export type OrderItem = { name: string; qty: number };

export type Order = {
  id: string;
  text: string;
  customer: string;
  place: string;
  manualPrice: number | null;
  profession: string;
  status: string;
  master: string;
  frozenPrice: number | null;
  items: OrderItem[];
  discount: number;
  unparsed: string[];
};

export type Catalog = {
  auctionUpdated: string;
  markupDefault: number;
  auction: AuctionItem[];
  prices: PriceItem[];
  products: Product[];
  recipes: Record<string, CraftLine[]>;
  seedOrders: Omit<Order, "id" | "unparsed">[];
  masters: string[];
  professions: string[];
  statuses: string[];
};

export type ResolvedPrice = {
  name: string;
  manual: number | null;
  auction: number | null;
  own: number | null;
  calc: number | null;
  source: "вручную" | "аукцион" | "свой крафт" | "НЕТ ЦЕНЫ";
  note: string;
};

export type LineResult = {
  name: string;
  qty: number;
  output: number;
  crafts: number;
  unit: number | null;
  cost: number | null;
  customer: number | null;
  status: string;
};

export type OrderQuote = {
  lines: LineResult[];
  cost: number | null;
  markupAmount: number | null;
  discountAmount: number | null;
  total: number | null;
  profit: number | null;
  warning: boolean;
};

export type PurchaseLine = {
  name: string;
  qty: number;
  price: number | null;
  sum: number | null;
  source: string;
};
