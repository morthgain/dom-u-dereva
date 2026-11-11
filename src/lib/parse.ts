import { GAME_NAMES } from "./game-names";
import type { Product } from "./types";

const STOP = new Set([
  "на",
  "из",
  "с",
  "со",
  "и",
  "для",
  "от",
  "в",
  "во",
  "по",
  "к",
  "ко",
  "а",
  "о",
  "у",
  "об",
  "обо",
  "под",
  "над",
  "при",
  "без",
  "до",
  "же",
  "ли",
  "бы",
  "декор",
  "вар",
]);

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/[%]/g, " ")
    .replace(/[.,;:!?()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Alias = { catalog: string; name: string; norm: string; tokens: string[] };

const aliases: Alias[] = GAME_NAMES.flatMap((entry) =>
  entry.names.map((name) => ({
    catalog: entry.catalog,
    name,
    norm: normalizeName(name),
    tokens: tokensOf(normalizeName(name)),
  })),
);

const aliasesByCatalog = new Map<string, Alias[]>();
const aliasByNorm = new Map<string, string>();
for (const alias of aliases) {
  const list = aliasesByCatalog.get(alias.catalog) ?? [];
  list.push(alias);
  aliasesByCatalog.set(alias.catalog, list);
  if (!aliasByNorm.has(alias.norm)) aliasByNorm.set(alias.norm, alias.catalog);
}

function tokensOf(norm: string): string[] {
  return norm.split(" ").filter((token) => token && !STOP.has(token));
}

function foldToken(token: string): string {
  if (token.startsWith("двурог") || token.startsWith("двойн")) return "двойн";
  return token;
}

type Indexed = {
  name: string;
  norm: string;
  tokens: string[];
};

function indexProducts(products: Product[]): Indexed[] {
  return products.map((product) => {
    const norm = normalizeName(product.name);
    return { name: product.name, norm, tokens: tokensOf(norm) };
  });
}

function tokenSubsetName(query: string, products: Indexed[]): string | null {
  const queryTokens = tokensOf(query).map((token) => foldToken(token));
  if (queryTokens.length < 2) return null;
  let bestCount = 0;
  const winners: string[] = [];
  for (const product of products) {
    const productTokens = product.tokens.map((token) => foldToken(token));
    if (productTokens.length < 2) continue;
    if (!productTokens.every((token) => queryTokens.includes(token))) continue;
    const count = new Set(productTokens).size;
    if (count > bestCount) {
      bestCount = count;
      winners.length = 0;
      winners.push(product.name);
    } else if (count === bestCount && !winners.includes(product.name)) {
      winners.push(product.name);
    }
  }
  return winners.length === 1 ? winners[0] : null;
}

export function matchProductName(query: string, products: Product[]): string | null {
  const normalized = normalizeName(query);
  if (!normalized) return null;
  const index = indexProducts(products);

  // A game name can be the same words as a different book row. The game name wins,
  // so «фонарь» is the level-5 lantern and not the level-2 row the book also calls «Фонарь».
  const alias = aliasByNorm.get(normalized);
  if (alias && index.some((product) => product.name === alias)) return alias;

  const exact = index.find((product) => product.norm === normalized);
  if (exact) return exact.name;

  let contained: { name: string; length: number } | null = null;
  for (const product of index) {
    if (product.norm.length >= 3 && normalized.includes(product.norm)) {
      if (!contained || product.norm.length > contained.length) {
        contained = { name: product.name, length: product.norm.length };
      }
    }
  }
  if (contained) return contained.name;

  let covering: { name: string; length: number } | null = null;
  for (const product of index) {
    if (normalized.length >= 4 && product.norm.includes(normalized)) {
      if (!covering || product.norm.length < covering.length) {
        covering = { name: product.name, length: product.norm.length };
      }
    }
  }
  if (covering) return covering.name;

  return tokenSubsetName(normalized, index);
}

export type ProductHit = { product: Product; alias: string | null; rank: number };

export function searchProducts(query: string, products: Product[], limit = 8): ProductHit[] {
  const normalized = normalizeName(query);
  if (normalized.length < 2) return [];
  const queryTokens = tokensOf(normalized);
  const hits: ProductHit[] = [];
  const seen = new Set<string>();

  for (const product of products) {
    if (seen.has(product.name)) continue;
    const norm = normalizeName(product.name);
    const productTokens = tokensOf(norm);
    const foldedProduct = productTokens.map((token) => foldToken(token));
    const foldedQuery = queryTokens.map((token) => foldToken(token));
    const productAliases = aliasesByCatalog.get(product.name) ?? [];
    let rank = 0;
    let alias: string | null = null;

    if (norm === normalized || productAliases.some((item) => item.norm === normalized)) {
      rank = productAliases.some((item) => item.norm === normalized) ? 110 : 100;
      alias = productAliases.find((item) => item.norm === normalized)?.name ?? null;
    } else if (norm.startsWith(normalized) || productAliases.some((item) => item.norm.startsWith(normalized))) {
      rank = 80;
      alias = productAliases.find((item) => item.norm.startsWith(normalized))?.name ?? null;
    } else if (foldedProduct.length >= 2 && foldedProduct.every((token) => foldedQuery.includes(token))) {
      rank = 70;
    } else if (norm.includes(normalized)) {
      rank = 60;
    } else if (
      productAliases.some((item) => item.tokens.length >= 1 && item.tokens.every((token) => queryTokens.includes(token)))
    ) {
      rank = 55;
      alias = productAliases.find((item) => item.tokens.every((token) => queryTokens.includes(token)))?.name ?? null;
    } else if (product.lk.toLowerCase().includes(normalized)) {
      rank = 40;
    } else if (
      foldedQuery.length >= 2 &&
      foldedQuery.every((token) => foldedProduct.includes(token))
    ) {
      rank = 30;
    } else if (
      normalized.length >= 4 &&
      productAliases.some((item) => item.tokens.some((token) => token.startsWith(normalized) || token === normalized))
    ) {
      rank = 25;
      alias =
        productAliases.find((item) => item.tokens.some((token) => token.startsWith(normalized) || token === normalized))
          ?.name ?? null;
    }

    if (!rank) continue;
    seen.add(product.name);
    hits.push({ product, alias, rank });
  }

  hits.sort((a, b) => b.rank - a.rank || a.product.name.length - b.product.name.length);
  return hits.slice(0, limit);
}

export function parseOrderText(
  text: string,
  products: Product[],
): { items: { name: string; qty: number }[]; unparsed: string[] } {
  const chunks = text
    .split(/[,;\n]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const items: { name: string; qty: number }[] = [];
  const unparsed: string[] = [];

  for (const chunk of chunks) {
    const leading = chunk.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
    const trailing = chunk.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)$/);
    let qty = 1;
    let namePart = chunk;
    if (leading) {
      qty = Number(leading[1].replace(",", "."));
      namePart = leading[2];
    } else if (trailing) {
      qty = Number(trailing[2].replace(",", "."));
      namePart = trailing[1];
    }
    const query = namePart.replace(/\d+\s*%/g, " ");
    const found = matchProductName(query, products);
    if (!found || !qty) {
      unparsed.push(chunk);
      continue;
    }
    if (items.length >= 5) {
      unparsed.push(chunk);
      continue;
    }
    items.push({ name: found, qty });
  }

  return { items, unparsed };
}
