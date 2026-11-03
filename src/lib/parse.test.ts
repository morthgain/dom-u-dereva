import assert from "node:assert/strict";
import { auctionByKey, catalog, productByName } from "./catalog";
import { purchaseList, quoteOrder, resolvePrices } from "./calc";
import { GAME_NAMES } from "./game-names";
import { matchProductName, parseOrderText, searchProducts } from "./parse";

for (const entry of GAME_NAMES) {
  assert.ok(productByName.has(entry.catalog), entry.catalog);
}

const gameNames: Record<string, string> = {
  "Двуспальная деревенская кровать": "Простая двуспальная кровать (декор)",
  "Длинный стол на козлах": "Длинный стол (декор)",
  "Жёлтая палатка": "Маленькая жёлтая палатка (декор)",
  "Желтая палатка": "Маленькая жёлтая палатка (декор)",
  "Икона Спаса Нерукотворного": "Икона, вар. 2 (декор)",
  "Карта": "Карта (декор)",
  "Книжная полка": "Простой книжный шкаф (декор)",
  "Двурогий подсвечник": "Двойной подсвечник (декор)",
  "Лютня": "Лютня (декор)",
  "Деревенская кровать": "Простая кровать (декор)",
  "Деревенский стул": "Простой стул (декор)",
};

for (const [game, book] of Object.entries(gameNames)) {
  const parsed = parseOrderText(game, catalog.products);
  assert.deepEqual(parsed.unparsed, [], game);
  assert.equal(parsed.items[0]?.name, book, game);
  assert.equal(parsed.items[0]?.qty, 1, game);
}

const withQty = parseOrderText("2 двуспальная деревенская кровать", catalog.products);
assert.equal(withQty.items[0]?.name, "Простая двуспальная кровать (декор)");
assert.equal(withQty.items[0]?.qty, 2);

const mixed = parseOrderText(
  "двуспальная деревенская кровать, 3 настой календулы индржиха",
  catalog.products,
);
assert.deepEqual(
  mixed.items.map((item) => `${item.qty} ${item.name}`),
  ["1 Простая двуспальная кровать (декор)", "3 Настой календулы Индржиха"],
);

const unknown = parseOrderText("несуществующая вещь мастерской", catalog.products);
assert.deepEqual(unknown.items, []);
assert.deepEqual(unknown.unparsed, ["несуществующая вещь мастерской"]);

assert.equal(matchProductName("Деревенская бригантина", catalog.products), null);
assert.equal(matchProductName("Простая бригантина", catalog.products), "Простая бригантина");
assert.equal(matchProductName("Лютни", catalog.products), "Лютни");
assert.equal(matchProductName("Икона", catalog.products), "Икона (декор)");

let renamed = 0;
for (const product of catalog.products) {
  const found = matchProductName(product.name, catalog.products);
  if (found !== product.name) {
    renamed += 1;
    console.error("round-trip", product.name, "->", found);
  }
}
assert.equal(renamed, 0);

const bedSearch = searchProducts("деревенская кровать", catalog.products, 5);
assert.equal(bedSearch[0]?.product.name, "Простая кровать (декор)");
const doubleSearch = searchProducts("двуспальная деревенская кровать", catalog.products, 3);
assert.equal(doubleSearch[0]?.product.name, "Простая двуспальная кровать (декор)");
assert.equal(doubleSearch[0]?.alias, "Двуспальная деревенская кровать");
const shelfSearch = searchProducts("книжная полка", catalog.products, 3);
assert.equal(shelfSearch[0]?.product.name, "Простой книжный шкаф (декор)");
const trestle = searchProducts("козлах", catalog.products, 3);
assert.equal(trestle[0]?.product.name, "Длинный стол (декор)");

const resolved = resolvePrices(catalog.prices, auctionByKey, "ДЕШЕВЛЕ ВСЕГО", {});
const priceOf = (name: string) => resolved.find((item) => item.name === name)?.calc ?? null;
const quote = quoteOrder(withQty.items, productByName, catalog.recipes, priceOf, 0.1, 0);
assert.equal(quote.lines[0]?.status, "ОК");
assert.equal(quote.lines[0]?.crafts, 2);
const bought = purchaseList(quote.lines, catalog.recipes, resolved);
const logs = bought.lines.find((line) => line.name.startsWith("брёвна"));
assert.equal(logs?.qty, 96);

console.log("parse ok", { bed: quote.total, logs: logs?.qty });
