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
  "Деревенская кровать": "Простая кровать (декор)",
  "Деревенский табурет": "Простой стул (декор)",
  "Деревенский стул": "Простой стул, вар. 2 (декор)",
  "Деревенский стол": "Простой стол (декор)",
  "Деревенский шкаф": "Простой шкаф (декор)",
  "Деревенские полки": "Простая полка (декор)",
  "Длинная лавка": "Простая скамья (декор)",
  "Длинный стол на козлах": "Длинный стол (декор)",
  "Маленький ящик": "Маленький сундук (декор)",
  "Тканый коврик": "Ковёр, вар. 1 (декор)",
  "Узорчатый ковёр": "Ковёр, вар. 2 (декор)",
  "Серая шкура": "Серый мех (декор)",
  "Приподнятый очаг": "Высокий очаг (декор)",
  "Венок из листьев": "Венок из хмеля (декор)",
  "Подвесной котёл": "Котёл (декор)",
  "Корзина для яиц": "Корзина яиц (декор)",
  "Глиняная кружка": "Кружка (декор)",
  "Глиняная посуда": "Керамика (декор)",
  "Набросок": "Рисунок (декор)",
  "Чернильница с пером": "Чернильница (декор)",
  "Настенный полог": "Занавесь (декор)",
  "Оленьи рога на щите": "Оленьи рога (декор)",
  "Ряд книг": "Стопка книг (декор)",
  "Козлы для седла": "Подставка для седла (декор)",
  "Бочонок с краном": "Бочонок с краником (декор)",
  "Купеческая полка": "Торговая полка (декор)",
  "Каравай": "Хлеб (декор)",
  "Сушеные травы": "Пучки трав (декор)",
  "Жареный поросенок": "Блюдо со свининой (декор)",
  "Фонарь": "Нарядный фонарь (декор)",
  "Двойной подсвечник": "Парный подсвечник (декор)",
  "Двурогий подсвечник": "Двойной подсвечник (декор)",
  "Подсвечник с шипом": "Подсвечник со штырём (декор)",
  "Жёлтая палатка": "Маленькая жёлтая палатка (декор)",
  "Желтая палатка": "Маленькая жёлтая палатка (декор)",
  "Икона Спаса Нерукотворного": "Икона, вар. 2 (декор)",
  "Карта": "Карта (декор)",
  "Книжная полка": "Простой книжный шкаф (декор)",
  "Лютня": "Лютня (декор)",
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
assert.equal(renamed, 1, "only the book row Фонарь shares the game's word for the level-5 lantern");
assert.equal(matchProductName("Фонарь", catalog.products), "Нарядный фонарь (декор)");

const levels: Record<string, number> = {
  "Деревенский табурет": 2,
  "Деревенский стул": 3,
  "Длинная лавка": 3,
  "Маленький ящик": 3,
  "Фонарь": 5,
  "Набросок": 3,
  "Приподнятый очаг": 4,
  "Двойной подсвечник": 4,
  "Двурогий подсвечник": 5,
};
for (const [game, level] of Object.entries(levels)) {
  const name = matchProductName(game, catalog.products);
  assert.equal(productByName.get(name ?? "")?.level, level, game);
}

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
