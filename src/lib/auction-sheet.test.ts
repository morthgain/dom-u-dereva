import assert from "node:assert/strict";
import { parseAuctionSheet } from "./auction-sheet";

const sample = `/*O_o*/
google.visualization.Query.setResponse({"table":{"rows":[
  {"c":[{"v":"КЛЮЧ"},{"v":"ТОВАР"},null,null,null,null,null,null,{"v":"КАТЕГОРИЯ"},null,{"v":"ОБНОВЛЕНО:"},{"v":"Date(2026,10,3,6,27,49)"}]},
  {"c":[{"v":"good:logs"},{"v":"брёвна"},{"v":5},{"v":4},{"v":4236},{"v":16080},null,{"v":3},{"v":"timber"}]},
  {"c":[{"v":"good:nettle"},{"v":"крапива"},{"v":3},{"v":3},{"v":543},{"v":852},null,{"v":2},{"v":"herbs"}]},
  {"c":[{"v":"herb_urticaria"},{"v":"Nettle"},null,null,{"v":0},{"v":0},{"v":1},{"v":0},{"v":"herbs"}]},
  {"c":[{"v":"good:a"},{"v":"а"},{"v":1},{"v":1},{"v":1},{"v":1},null,{"v":1},{"v":"x"}]},
  {"c":[{"v":"good:b"},{"v":"б"},{"v":1},{"v":1},{"v":1},{"v":1},null,{"v":1},{"v":"x"}]},
  {"c":[{"v":"good:c"},{"v":"в"},{"v":1},{"v":1},{"v":1},{"v":1},null,{"v":1},{"v":"x"}]},
  {"c":[{"v":"good:d"},{"v":"г"},{"v":1},{"v":1},{"v":1},{"v":1},null,{"v":1},{"v":"x"}]},
  {"c":[{"v":"good:e"},{"v":"д"},{"v":1},{"v":1},{"v":1},{"v":1},null,{"v":1},{"v":"x"}]},
  {"c":[{"v":"good:f"},{"v":"е"},{"v":1},{"v":1},{"v":1},{"v":1},null,{"v":1},{"v":"x"}]},
  {"c":[{"v":"good:g"},{"v":"ж"},{"v":1},{"v":1},{"v":1},{"v":1},null,{"v":1},{"v":"x"}]},
  {"c":[{"v":"good:h"},{"v":"з"},{"v":1},{"v":1},{"v":1},{"v":1},null,{"v":1},{"v":"x"}]}
]}});`;

const parsed = parseAuctionSheet(sample);
assert.ok(parsed);
assert.equal(parsed.updated, "2026-11-03T06:27:00");
assert.equal(parsed.items[0]?.cheap, 5);
assert.equal(parsed.items.find((item) => item.key === "herb_urticaria")?.cheap, null);
assert.equal(parsed.items.find((item) => item.key === "herb_urticaria")?.sold, 0);
console.log("auction sheet ok", parsed.items.length);
