import { catalog } from "./catalog";
import type { AuctionItem } from "./types";

const SHEET_ID = "14VR2jtgveM7tPMk-k7rK_bAADxtVJsZrK6u_-eVziRs";
const AUCTION_GID = "1530303183";

export const AUCTION_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${AUCTION_GID}`;

const STORAGE_KEY = "dom-u-dereva-auction-v1";

export type AuctionFeed = {
  updated: string;
  items: AuctionItem[];
  status: "idle" | "sheet" | "book";
};

type SheetCell = { v?: unknown } | null;
type SheetRow = { c?: SheetCell[] };

const bookFeed: AuctionFeed = {
  updated: catalog.auctionUpdated,
  items: catalog.auction,
  status: "idle",
};

let feed: AuctionFeed = bookFeed;
let cacheReady = false;
const listeners = new Set<() => void>();
let pending: Promise<void> | null = null;

function cellValue(row: SheetRow, index: number): unknown {
  const cell = row.c?.[index];
  if (!cell) return null;
  return cell.v ?? null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function stampFromSheet(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const coded = value.match(/Date\((\d+),(\d+),(\d+),(\d+),(\d+)/);
  if (coded) {
    const month = String(Number(coded[2]) + 1).padStart(2, "0");
    const day = coded[3].padStart(2, "0");
    const hour = coded[4].padStart(2, "0");
    const minute = coded[5].padStart(2, "0");
    return `${coded[1]}-${month}-${day}T${hour}:${minute}:00`;
  }
  const plain = value.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if (!plain) return null;
  return `${plain[3]}-${plain[2]}-${plain[1]}T${plain[4]}:${plain[5]}:00`;
}

export function parseAuctionSheet(raw: string): { updated: string; items: AuctionItem[] } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let table: { table?: { rows?: SheetRow[] } };
  try {
    table = JSON.parse(raw.slice(start, end + 1)) as { table?: { rows?: SheetRow[] } };
  } catch {
    return null;
  }
  const rows = table.table?.rows ?? [];
  if (!rows.length) return null;
  const updated = stampFromSheet(cellValue(rows[0], 11)) ?? "";
  const items: AuctionItem[] = [];
  for (const row of rows.slice(1)) {
    const key = cellValue(row, 0);
    const name = cellValue(row, 1);
    if (typeof key !== "string" || !key.trim() || key === "КЛЮЧ") continue;
    if (typeof name !== "string" || !name.trim()) continue;
    items.push({
      key,
      name,
      cheap: numberOrNull(cellValue(row, 2)),
      avg: numberOrNull(cellValue(row, 3)),
      sold: numberOrNull(cellValue(row, 4)),
      listed: numberOrNull(cellValue(row, 5)),
      bid: numberOrNull(cellValue(row, 6)),
      instant: numberOrNull(cellValue(row, 7)),
      category: typeof cellValue(row, 8) === "string" ? String(cellValue(row, 8)) : "",
    });
  }
  if (!updated || items.length < 10) return null;
  return { updated, items };
}

function readCache(): AuctionFeed | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "") as AuctionFeed;
    if (saved?.status === "sheet" && saved.updated && Array.isArray(saved.items) && saved.items.length > 10) {
      return saved;
    }
  } catch {
    return null;
  }
  return null;
}

function emit(next: AuctionFeed) {
  feed = next;
  listeners.forEach((listener) => listener());
}

export function subscribeAuction(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (typeof window !== "undefined") void refreshAuction();
  return () => listeners.delete(onStoreChange);
}

export function auctionSnapshot(): AuctionFeed {
  if (!cacheReady && typeof window !== "undefined") {
    cacheReady = true;
    const cached = readCache();
    if (cached) feed = cached;
  }
  return feed;
}

export function auctionServerSnapshot(): AuctionFeed {
  return bookFeed;
}

export async function refreshAuction(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(AUCTION_SHEET_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const parsed = parseAuctionSheet(await response.text());
      if (!parsed) throw new Error("empty");
      const next: AuctionFeed = { updated: parsed.updated, items: parsed.items, status: "sheet" };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      emit(next);
    } catch {
      if (feed.status !== "sheet") emit({ ...bookFeed, status: "book" });
    } finally {
      pending = null;
    }
  })();
  return pending;
}
