import type {
  AuctionItem,
  AuctionMode,
  LineResult,
  OrderItem,
  OrderQuote,
  PriceItem,
  Product,
  PurchaseLine,
  ResolvedPrice,
} from "./types";

function auctionPrice(
  item: PriceItem,
  auctionByKey: Map<string, AuctionItem>,
  mode: AuctionMode,
): number | null {
  if (!item.key) return null;
  const lot = auctionByKey.get(item.key);
  if (!lot) return null;
  if (mode === "ДЕШЕВЛЕ ВСЕГО") return lot.cheap ?? lot.avg;
  return lot.avg ?? lot.cheap;
}

function ownCraft(item: PriceItem, calc: Map<string, number | null>): number | null {
  let best: number | null = null;
  for (const recipe of item.crafts) {
    if (recipe.output <= 0) continue;
    let total = recipe.fee;
    let ok = true;
    for (const ingredient of recipe.ings) {
      const price = calc.get(ingredient.name);
      if (price == null) {
        ok = false;
        break;
      }
      total += ingredient.qty * price;
    }
    if (!ok) continue;
    const unit = total / recipe.output;
    best = best == null ? unit : Math.min(best, unit);
  }
  return best;
}

export function resolvePrices(
  prices: PriceItem[],
  auctionByKey: Map<string, AuctionItem>,
  mode: AuctionMode,
  overrides: Record<string, number | null>,
): ResolvedPrice[] {
  const manualOf = (item: PriceItem): number | null => {
    if (Object.prototype.hasOwnProperty.call(overrides, item.name)) {
      const value = overrides[item.name];
      return value == null || Number.isNaN(value) ? null : value;
    }
    return item.manual;
  };

  let calc = new Map<string, number | null>(prices.map((item) => [item.name, null]));
  let own = new Map<string, number | null>();
  let sources = new Map<string, ResolvedPrice["source"]>();

  for (let pass = 0; pass < 40; pass += 1) {
    const previous = calc;
    const nextOwn = new Map<string, number | null>();
    const nextCalc = new Map<string, number | null>();
    const nextSources = new Map<string, ResolvedPrice["source"]>();
    let changed = false;

    for (const item of prices) {
      const crafted = ownCraft(item, previous);
      nextOwn.set(item.name, crafted);
      const manual = manualOf(item);
      const auction = auctionPrice(item, auctionByKey, mode);
      let price: number | null;
      let source: ResolvedPrice["source"];
      if (manual != null) {
        price = manual;
        source = "вручную";
      } else if (auction != null && crafted != null) {
        if (crafted <= auction + 1e-9) {
          price = crafted;
          source = "свой крафт";
        } else {
          price = auction;
          source = "аукцион";
        }
      } else if (auction != null) {
        price = auction;
        source = "аукцион";
      } else if (crafted != null) {
        price = crafted;
        source = "свой крафт";
      } else {
        price = null;
        source = "НЕТ ЦЕНЫ";
      }
      nextCalc.set(item.name, price);
      nextSources.set(item.name, source);
      if (previous.get(item.name) !== price) changed = true;
    }

    calc = nextCalc;
    own = nextOwn;
    sources = nextSources;
    if (!changed) break;
  }

  return prices.map((item) => ({
    name: item.name,
    manual: manualOf(item),
    auction: auctionPrice(item, auctionByKey, mode),
    own: own.get(item.name) ?? null,
    calc: calc.get(item.name) ?? null,
    source: sources.get(item.name) ?? "НЕТ ЦЕНЫ",
    note: item.note,
  }));
}

export function roundUpGroschen(value: number): number {
  const clean = Math.round(value * 1e8) / 1e8;
  return Math.ceil(clean - 1e-9);
}

export function craftsFor(qty: number, output: number): number {
  if (!qty) return 0;
  const batch = output > 0 ? output : 1;
  return Math.ceil(qty / batch - 1e-9);
}

export function lineResult(
  item: OrderItem,
  product: Product | undefined,
  recipes: { name: string; qty: number }[] | undefined,
  priceOf: (name: string) => number | null,
  markup: number,
  discount: number,
): LineResult {
  if (!product || !recipes?.length) {
    return {
      name: item.name,
      qty: item.qty,
      output: product?.output ?? 0,
      crafts: 0,
      unit: null,
      cost: null,
      customer: null,
      status: product ? "НЕТ РЕЦЕПТА" : "НЕТ В ИЗДЕЛИЯХ",
    };
  }

  let missing = 0;
  let ingredients = 0;
  for (const line of recipes) {
    const price = priceOf(line.name);
    if (price == null) missing += 1;
    else ingredients += line.qty * price;
  }
  const output = product.output > 0 ? product.output : 1;
  const unit = (ingredients + product.fee + product.extra) / output;
  const cost = item.qty ? item.qty * unit : null;
  const customer = cost == null ? null : cost * (1 + markup) * (1 - discount);
  return {
    name: item.name,
    qty: item.qty,
    output,
    crafts: craftsFor(item.qty, output),
    unit,
    cost,
    customer,
    status: missing ? `НЕТ ЦЕНЫ: ${missing} ингр.` : "ОК",
  };
}

export function quoteOrder(
  items: OrderItem[],
  products: Map<string, Product>,
  recipes: Record<string, { name: string; qty: number }[]>,
  priceOf: (name: string) => number | null,
  markup: number,
  discount: number,
): OrderQuote {
  const filled = items.filter((item) => item.name && item.qty);
  const lines = filled.map((item) =>
    lineResult(item, products.get(item.name), recipes[item.name], priceOf, markup, discount),
  );
  if (!lines.length) {
    return {
      lines,
      cost: null,
      markupAmount: null,
      discountAmount: null,
      total: null,
      profit: null,
      warning: false,
    };
  }
  const cost = lines.reduce((sum, line) => sum + (line.cost ?? 0), 0);
  const markupAmount = cost * markup;
  const discountAmount = -(cost + markupAmount) * discount;
  const total = roundUpGroschen(cost + markupAmount + discountAmount);
  return {
    lines,
    cost,
    markupAmount,
    discountAmount,
    total,
    profit: total - cost,
    warning: lines.some((line) => line.status.startsWith("НЕТ")),
  };
}

export function purchaseList(
  lines: LineResult[],
  recipes: Record<string, { name: string; qty: number }[]>,
  resolved: ResolvedPrice[],
): { lines: PurchaseLine[]; total: number | null } {
  const order = new Map(resolved.map((item, index) => [item.name, index]));
  const priceByName = new Map(resolved.map((item) => [item.name, item]));
  const need = new Map<string, number>();
  for (const line of lines) {
    if (!line.crafts) continue;
    for (const ingredient of recipes[line.name] ?? []) {
      need.set(ingredient.name, (need.get(ingredient.name) ?? 0) + line.crafts * ingredient.qty);
    }
  }
  const rows = [...need.entries()]
    .map(([name, qty]) => {
      const price = priceByName.get(name);
      const unit = price?.calc ?? null;
      return {
        name,
        qty,
        price: unit,
        sum: unit == null ? null : qty * unit,
        source: price?.source ?? "НЕТ ЦЕНЫ",
      };
    })
    .sort((a, b) => (order.get(a.name) ?? 9999) - (order.get(b.name) ?? 9999));
  const known = rows.filter((row) => row.sum != null);
  return {
    lines: rows,
    total: known.length ? known.reduce((sum, row) => sum + (row.sum ?? 0), 0) : null,
  };
}
