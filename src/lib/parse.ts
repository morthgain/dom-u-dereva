import type { Product } from "./types";

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

function matchProduct(query: string, products: { name: string; norm: string }[]): string | null {
  const exact = products.find((product) => product.norm === query);
  if (exact) return exact.name;

  let contained: { name: string; length: number } | null = null;
  for (const product of products) {
    if (product.norm.length >= 3 && query.includes(product.norm)) {
      if (!contained || product.norm.length > contained.length) {
        contained = { name: product.name, length: product.norm.length };
      }
    }
  }
  if (contained) return contained.name;

  let covering: { name: string; length: number } | null = null;
  for (const product of products) {
    if (query.length >= 4 && product.norm.includes(query)) {
      if (!covering || product.norm.length < covering.length) {
        covering = { name: product.name, length: product.norm.length };
      }
    }
  }
  return covering?.name ?? null;
}

export function parseOrderText(
  text: string,
  products: Product[],
): { items: { name: string; qty: number }[]; unparsed: string[] } {
  const index = products.map((product) => ({ name: product.name, norm: normalizeName(product.name) }));
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
    const query = normalizeName(namePart.replace(/\d+\s*%/g, " "));
    const found = matchProduct(query, index);
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
