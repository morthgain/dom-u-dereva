import assert from "node:assert/strict";
import { auctionByKey, catalog, productByName } from "./catalog";
import { purchaseList, quoteOrder, resolvePrices } from "./calc";
import { parseOrderText } from "./parse";

const resolved = resolvePrices(catalog.prices, auctionByKey, "ДЕШЕВЛЕ ВСЕГО", {});
const priceOf = (name: string) => resolved.find((item) => item.name === name)?.calc ?? null;

const henry = quoteOrder(
  [{ name: "Настой календулы Индржиха", qty: 3 }],
  productByName,
  catalog.recipes,
  priceOf,
  0.1,
  0,
);
assert.equal(henry.total, 124);
assert.equal(henry.lines[0]?.crafts, 1);
assert.equal(henry.lines[0]?.status, "ОК");

const parsed = parseOrderText(
  "20 сильный настой календулы, 50 снадобье из мандрагоры 10%",
  catalog.products,
);
assert.deepEqual(
  parsed.items.map((item) => `${item.qty} ${item.name}`),
  ["20 Сильный настой календулы", "50 Снадобье из мандрагоры"],
);
assert.deepEqual(parsed.unparsed, []);

const both = quoteOrder(parsed.items, productByName, catalog.recipes, priceOf, 0.1, 0);
assert.ok(both.total && both.total > 0);
assert.equal(both.warning, false);

const bought = purchaseList(henry.lines, catalog.recipes, resolved);
assert.ok(bought.lines.some((line) => line.name.startsWith("календула")));
assert.ok(bought.lines.some((line) => line.name.startsWith("древняя мандрагора")));
assert.equal(
  bought.lines.reduce((sum, line) => sum + line.qty, 0) > 0,
  true,
);

const trailing = parseOrderText("настой календулы индржиха 3", catalog.products);
assert.equal(trailing.items[0]?.name, "Настой календулы Индржиха");
assert.equal(trailing.items[0]?.qty, 3);

console.log("calc ok", { henry: henry.total, pair: both.total, purchase: bought.total });
