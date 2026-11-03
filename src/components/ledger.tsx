"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auctionByKey, catalog, productByName } from "@/lib/catalog";
import { purchaseList, quoteOrder, resolvePrices } from "@/lib/calc";
import { groschen } from "@/lib/format";
import { parseOrderText } from "@/lib/parse";
import type { AuctionMode, Order, OrderItem } from "@/lib/types";

const STORAGE_KEY = "dom-u-dereva-ledger-v1";
const STORAGE_EVENT = "ledger-change";

type SavedBook = {
  orders: Order[];
  activeId: string;
  markup: number;
  mode: AuctionMode;
  overrides: Record<string, number | null>;
};

function blankOrder(): Order {
  return {
    id: crypto.randomUUID(),
    text: "",
    customer: "",
    place: "",
    manualPrice: null,
    profession: "-",
    status: "НЕ ВЗЯТ",
    master: "-",
    frozenPrice: null,
    items: [],
    discount: 0,
    unparsed: [],
  };
}

function seedBook(): SavedBook {
  const orders: Order[] = catalog.seedOrders.map((order, index) => ({
    ...order,
    id: `seed-${index}`,
    unparsed: [],
    frozenPrice: order.status === "НЕ ВЗЯТ" ? null : order.frozenPrice,
  }));
  const last = [...orders].reverse().find((order) => order.text.trim()) ?? orders[orders.length - 1];
  return {
    orders,
    activeId: last?.id ?? "",
    markup: catalog.markupDefault,
    mode: "ДЕШЕВЛЕ ВСЕГО",
    overrides: {},
  };
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(STORAGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(STORAGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readSnapshot(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

function writeSnapshot(book: SavedBook) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function parseBook(raw: string | null): SavedBook {
  if (!raw) return seedBook();
  try {
    const saved = JSON.parse(raw) as SavedBook;
    if (!saved.orders?.length) return seedBook();
    return {
      orders: saved.orders,
      activeId: saved.activeId || saved.orders[saved.orders.length - 1].id,
      markup: saved.markup ?? catalog.markupDefault,
      mode: saved.mode ?? "ДЕШЕВЛЕ ВСЕГО",
      overrides: saved.overrides ?? {},
    };
  } catch {
    return seedBook();
  }
}

function snapshotLabel(iso: string): string {
  const match = iso.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return iso;
  const months = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}, ${match[4]}:${match[5]}`;
}

function padItems(items: OrderItem[]): OrderItem[] {
  const next = items.slice(0, 5);
  while (next.length < 5) next.push({ name: "", qty: 0 });
  return next;
}

export function Ledger() {
  const raw = useSyncExternalStore(subscribe, readSnapshot, () => null);
  const book = useMemo(() => parseBook(raw), [raw]);
  const { orders, activeId, markup, mode, overrides } = book;
  const [productQuery, setProductQuery] = useState("");
  const [profession, setProfession] = useState("все");
  const [priceQuery, setPriceQuery] = useState("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [tab, setTab] = useState("order");

  function save(next: SavedBook) {
    writeSnapshot(next);
  }

  const resolved = useMemo(
    () => resolvePrices(catalog.prices, auctionByKey, mode, overrides),
    [mode, overrides],
  );
  const priceOf = useMemo(() => {
    const map = new Map(resolved.map((item) => [item.name, item.calc]));
    return (name: string) => map.get(name) ?? null;
  }, [resolved]);

  const active = orders.find((order) => order.id === activeId) ?? orders[orders.length - 1];
  const quote = useMemo(
    () =>
      quoteOrder(
        active?.items.filter((item) => item.name && item.qty) ?? [],
        productByName,
        catalog.recipes,
        priceOf,
        markup,
        active?.discount ?? 0,
      ),
    [active, markup, priceOf],
  );
  const purchase = useMemo(
    () => purchaseList(quote.lines, catalog.recipes, resolved),
    [quote.lines, resolved],
  );

  const professions = useMemo(() => {
    const names = new Set(catalog.products.map((product) => product.profession).filter(Boolean));
    return ["все", ...[...names].sort((a, b) => a.localeCompare(b, "ru"))];
  }, []);

  const visibleProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    return catalog.products
      .filter((product) => profession === "все" || product.profession === profession)
      .filter((product) => !query || product.name.toLowerCase().includes(query) || product.lk.toLowerCase().includes(query))
      .slice(0, 40);
  }, [productQuery, profession]);

  const visiblePrices = useMemo(() => {
    const query = priceQuery.trim().toLowerCase();
    return resolved.filter((item) => !query || item.name.toLowerCase().includes(query));
  }, [priceQuery, resolved]);

  function updateOrder(id: string, patch: Partial<Order>) {
    save({
      ...book,
      orders: book.orders.map((order) => (order.id === id ? { ...order, ...patch } : order)),
    });
  }

  function changeStatus(order: Order, status: string) {
    if (order.status === "НЕ ВЗЯТ" && status !== "НЕ ВЗЯТ") {
      updateOrder(order.id, { status, frozenPrice: quote.total });
      return;
    }
    if (status === "НЕ ВЗЯТ") {
      updateOrder(order.id, { status, frozenPrice: null });
      return;
    }
    updateOrder(order.id, { status });
  }

  function parseInto(order: Order) {
    const parsed = parseOrderText(order.text, catalog.products);
    updateOrder(order.id, { items: parsed.items, unparsed: parsed.unparsed });
  }

  function setItem(order: Order, index: number, patch: Partial<OrderItem>) {
    const items = padItems(order.items);
    items[index] = { ...items[index], ...patch };
    updateOrder(order.id, { items: items.filter((item) => item.name || item.qty) });
  }

  if (!active) {
    return (
      <main className="mx-auto flex min-h-full max-w-5xl flex-col items-start gap-4 px-4 py-16">
        <p className="font-display text-3xl text-[oklch(0.38_0.05_155)]">В книге пока нет заказов.</p>
        <Button
          onClick={() => {
            const order = blankOrder();
            save({ ...book, orders: [order], activeId: order.id });
          }}
        >
          Новый заказ
        </Button>
      </main>
    );
  }

  const frozen = active.status !== "НЕ ВЗЯТ" && active.frozenPrice != null;
  const shownTotal = frozen ? active.frozenPrice : quote.total;
  const slots = padItems(active.items);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="ledger-sheet mb-6 overflow-hidden rounded-2xl border">
        <div className="flex flex-col gap-4 bg-[oklch(0.34_0.045_158)] px-5 py-5 text-[oklch(0.95_0.02_92)] sm:flex-row sm:items-end sm:justify-between sm:px-7">
          <div className="flex items-start gap-3">
            <span className="mt-1 grid size-11 place-items-center rounded-full border border-[oklch(0.78_0.08_95)]/70 bg-[oklch(0.42_0.05_150)]">
              <Leaf className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-xs tracking-[0.28em] text-[oklch(0.86_0.06_95)]">KCD ROLEPLAY</p>
              <h1 className="font-display text-4xl leading-none sm:text-5xl">Дом у дерева</h1>
              <p className="mt-1 text-sm text-[oklch(0.9_0.03_95)]">Счётная книга мастерской</p>
            </div>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-[oklch(0.9_0.025_95)]">
            Тот же счёт, что в общей книге: рецепт, аукцион, наценка и округление вверх до гроша.
          </p>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-7">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Наценка мастерской
              <Input
                inputMode="decimal"
                value={String(Math.round(markup * 1000) / 10)}
                onChange={(event) => {
                  const next = Number(event.target.value.replace(",", "."));
                  if (!Number.isNaN(next)) save({ ...book, markup: Math.min(500, Math.max(0, next)) / 100 });
                }}
                aria-label="Наценка мастерской, проценты"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Цена с аукциона
              <Select value={mode} onValueChange={(value) => save({ ...book, mode: value as AuctionMode })}>
                <SelectTrigger className="w-full" aria-label="Цена с аукциона">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ДЕШЕВЛЕ ВСЕГО">Дешевле всего</SelectItem>
                  <SelectItem value="СРЕДНЯЯ ЗА 7 ДН">Средняя за 7 дней</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <BackupDialog
            importText={importText}
            importError={importError}
            onImportText={setImportText}
            onExport={() => {
              const blob = new Blob(
                [JSON.stringify({ orders, activeId, markup, mode, overrides }, null, 2)],
                { type: "application/json" },
              );
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "dom-u-dereva-kniga.json";
              link.click();
              URL.revokeObjectURL(url);
            }}
            onImport={() => {
              try {
                const saved = JSON.parse(importText) as SavedBook;
                if (!Array.isArray(saved.orders) || !saved.orders.length) {
                  setImportError("В файле нет заказов.");
                  return;
                }
                save({
                  orders: saved.orders,
                  activeId: saved.activeId || saved.orders[0].id,
                  markup: saved.markup ?? catalog.markupDefault,
                  mode: saved.mode ?? "ДЕШЕВЛЕ ВСЕГО",
                  overrides: saved.overrides ?? {},
                });
                setImportError("");
                setImportText("");
              } catch {
                setImportError("Это не книга, которую можно прочитать.");
              }
            }}
          />
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start bg-[oklch(0.88_0.03_88)]">
          <TabsTrigger value="order">Заказ</TabsTrigger>
          <TabsTrigger value="journal">Журнал</TabsTrigger>
          <TabsTrigger value="goods">Изделия</TabsTrigger>
          <TabsTrigger value="prices">Сырьё</TabsTrigger>
        </TabsList>

        <TabsContent value="order" className="grid grid-cols-1 gap-4">
          <section className="ledger-sheet rounded-2xl border p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-3xl">Текущий заказ</h2>
              <Button
                onClick={() => {
                  const order = blankOrder();
                  save({ ...book, orders: [...book.orders, order], activeId: order.id });
                }}
              >
                Новый заказ
              </Button>
            </div>
            <label className="grid gap-1 text-sm">
              Текст заказа
              <textarea
                className="border-input bg-background min-h-20 w-full rounded-lg border px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={active.text}
                placeholder="20 сильный настой календулы, 50 снадобье из мандрагоры"
                onChange={(event) => updateOrder(active.id, { text: event.target.value })}
                onBlur={(event) => {
                  const text = event.currentTarget.value;
                  if (text.trim() && active.items.length === 0) {
                    const parsed = parseOrderText(text, catalog.products);
                    updateOrder(active.id, { text, items: parsed.items, unparsed: parsed.unparsed });
                  }
                }}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => parseInto(active)}>
                Разобрать текст
              </Button>
              <p className="self-center text-sm text-muted-foreground">
                До пяти позиций. Число можно поставить в начале или в конце.
              </p>
            </div>
            {active.unparsed.length > 0 && (
              <p className="mt-3 rounded-lg bg-[oklch(0.9_0.04_70)] px-3 py-2 text-sm">
                Не распознано: {active.unparsed.join("; ")}
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Имя заказчика">
                <Input value={active.customer} onChange={(event) => updateOrder(active.id, { customer: event.target.value })} />
              </Field>
              <Field label="Место проживания">
                <Input value={active.place} onChange={(event) => updateOrder(active.id, { place: event.target.value })} />
              </Field>
              <Field label="Профессия">
                <Choice
                  value={active.profession}
                  options={catalog.professions}
                  onChange={(profession) => updateOrder(active.id, { profession })}
                  label="Профессия"
                />
              </Field>
              <Field label="Мастер">
                <Choice
                  value={active.master}
                  options={catalog.masters}
                  onChange={(master) => updateOrder(active.id, { master })}
                  label="Мастер"
                />
              </Field>
              <Field label="Статус">
                <Choice
                  value={active.status}
                  options={catalog.statuses}
                  onChange={(status) => changeStatus(active, status)}
                  label="Статус"
                />
              </Field>
              <Field label="Скидка, %">
                <Input
                  inputMode="decimal"
                  value={String(Math.round(active.discount * 1000) / 10)}
                  onChange={(event) => {
                    const next = Number(event.target.value.replace(",", "."));
                    if (!Number.isNaN(next)) {
                      updateOrder(active.id, { discount: Math.min(100, Math.max(0, next)) / 100 });
                    }
                  }}
                />
              </Field>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Изделие</th>
                    <th className="py-2 pr-2 font-medium">Кол-во</th>
                    <th className="py-2 pr-2 font-medium">Крафтов</th>
                    <th className="py-2 pr-2 font-medium">Себест. 1 шт</th>
                    <th className="py-2 pr-2 font-medium">Себестоимость</th>
                    <th className="py-2 pr-2 font-medium">Заказчику</th>
                    <th className="py-2 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot, index) => {
                    const line = quote.lines.find((entry) => entry.name === slot.name && entry.qty === slot.qty);
                    return (
                      <tr key={`${active.id}-${index}`} className="border-t align-top">
                        <td className="py-2 pr-2">
                          <ProductField
                            value={slot.name}
                            onChange={(name) => setItem(active, index, { name })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            className="w-24"
                            inputMode="decimal"
                            value={slot.qty ? String(slot.qty) : ""}
                            onChange={(event) => {
                              const qty = Number(event.target.value.replace(",", "."));
                              setItem(active, index, { qty: Number.isNaN(qty) ? 0 : qty });
                            }}
                            aria-label={`Количество ${index + 1}`}
                          />
                        </td>
                        <td className="py-2 pr-2">{line ? line.crafts : ""}</td>
                        <td className="py-2 pr-2">{groschen(line?.unit)}</td>
                        <td className="py-2 pr-2">{groschen(line?.cost)}</td>
                        <td className="py-2 pr-2">{groschen(line?.customer)}</td>
                        <td className="py-2">{line?.status ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="ledger-sheet rounded-2xl border p-4 sm:p-6">
              <h2 className="font-display text-3xl">К оплате</h2>
              <dl className="mt-3 grid gap-2 text-sm">
                <Row label="Себестоимость" value={groschen(quote.cost)} />
                <Row label="Наценка" value={groschen(quote.markupAmount)} />
                <Row label="Скидка" value={groschen(quote.discountAmount)} />
                <Row label="Итого, вверх до гроша" value={groschen(shownTotal)} strong />
                <Row label="Заработок мастерской" value={frozen ? groschen((shownTotal ?? 0) - (quote.cost ?? 0)) : groschen(quote.profit)} />
              </dl>
              {quote.warning && (
                <p className="mt-3 text-sm text-[oklch(0.42_0.12_35)]">
                  У части позиций нет цен ингредиентов — итог занижен. Впишите их на вкладке «Сырьё».
                </p>
              )}
              {frozen && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <p>Цена зафиксирована при смене статуса: {groschen(active.frozenPrice)}.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateOrder(active.id, { frozenPrice: quote.total })}
                  >
                    Пересчитать цену
                  </Button>
                </div>
              )}
              <Field label="Цена, о которой договорились">
                <Input
                  className="mt-1 max-w-40"
                  inputMode="decimal"
                  value={active.manualPrice ?? ""}
                  onChange={(event) => {
                    const raw = event.target.value.replace(",", ".");
                    updateOrder(active.id, { manualPrice: raw === "" ? null : Number(raw) });
                  }}
                />
              </Field>
            </div>
            <div className="ledger-sheet rounded-2xl border p-4 sm:p-6">
              <h2 className="font-display text-3xl">Закупка под заказ</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                По целым крафтам и без платы за станок. Промежуточные изделия показаны как есть: их можно купить или скрафтить.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-2 font-medium">Ингредиент</th>
                      <th className="py-2 pr-2 font-medium">Нужно</th>
                      <th className="py-2 pr-2 font-medium">Цена</th>
                      <th className="py-2 pr-2 font-medium">Сумма</th>
                      <th className="py-2 font-medium">Источник</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchase.lines.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-muted-foreground">
                          Позиции ещё не разобраны.
                        </td>
                      </tr>
                    )}
                    {purchase.lines.map((line) => (
                      <tr key={line.name} className="border-t">
                        <td className="py-2 pr-2">{line.name}</td>
                        <td className="py-2 pr-2">{groschen(line.qty)}</td>
                        <td className="py-2 pr-2">{groschen(line.price)}</td>
                        <td className="py-2 pr-2">{groschen(line.sum)}</td>
                        <td className="py-2">{line.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm">Итого закупка: {groschen(purchase.total)}</p>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="journal">
          <section className="ledger-sheet rounded-2xl border p-4 sm:p-6">
            <h2 className="font-display text-3xl">Журнал заказов</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Заказ</th>
                    <th className="py-2 pr-2 font-medium">Заказчик</th>
                    <th className="py-2 pr-2 font-medium">Профессия</th>
                    <th className="py-2 pr-2 font-medium">Статус</th>
                    <th className="py-2 pr-2 font-medium">Цена</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-muted-foreground">
                        Журнал пуст. Новый заказ пишется на вкладке «Заказ».
                      </td>
                    </tr>
                  )}
                  {[...orders].reverse().map((order) => {
                    const rowQuote = quoteOrder(
                      order.items.filter((item) => item.name && item.qty),
                      productByName,
                      catalog.recipes,
                      priceOf,
                      markup,
                      order.discount,
                    );
                    const price =
                      order.status !== "НЕ ВЗЯТ" && order.frozenPrice != null
                        ? order.frozenPrice
                        : rowQuote.total;
                    return (
                      <tr key={order.id} className="border-t">
                        <td className="max-w-xs py-2 pr-2">{order.text || "Пустой заказ"}</td>
                        <td className="py-2 pr-2">{order.customer || "—"}</td>
                        <td className="py-2 pr-2">{order.profession}</td>
                        <td className="py-2 pr-2">{order.status}</td>
                        <td className="py-2 pr-2">{groschen(price)}</td>
                        <td className="py-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              save({ ...book, activeId: order.id });
                              setTab("order");
                            }}
                          >
                            Открыть
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="goods">
          <section className="ledger-sheet rounded-2xl border p-4 sm:p-6">
            <h2 className="font-display text-3xl">Изделия</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Себестоимость одной штуки — крафт делить на выход. Цена заказчику уже с наценкой мастерской.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_16rem]">
              <Input
                value={productQuery}
                placeholder="Название или имя в ЛК"
                onChange={(event) => setProductQuery(event.target.value)}
                aria-label="Поиск изделия"
              />
              <Choice value={profession} options={professions} onChange={setProfession} label="Фильтр профессии" />
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Изделие</th>
                    <th className="py-2 pr-2 font-medium">Профессия</th>
                    <th className="py-2 pr-2 font-medium">Ур.</th>
                    <th className="py-2 pr-2 font-medium">Выход</th>
                    <th className="py-2 pr-2 font-medium">Себест.</th>
                    <th className="py-2 pr-2 font-medium">С наценкой</th>
                    <th className="py-2 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-muted-foreground">
                        Такого изделия в книге нет.
                      </td>
                    </tr>
                  )}
                  {visibleProducts.map((product) => {
                    const row = quoteOrder(
                      [{ name: product.name, qty: 1 }],
                      productByName,
                      catalog.recipes,
                      priceOf,
                      markup,
                      0,
                    ).lines[0];
                    return (
                      <tr key={product.name} className="border-t">
                        <td className="py-2 pr-2">
                          <div>{product.name}</div>
                          <div className="text-xs text-muted-foreground">{product.composition}</div>
                        </td>
                        <td className="py-2 pr-2">{product.profession}</td>
                        <td className="py-2 pr-2">{product.level || "—"}</td>
                        <td className="py-2 pr-2">{product.output}</td>
                        <td className="py-2 pr-2">{groschen(row?.unit)}</td>
                        <td className="py-2 pr-2">{groschen(row?.unit == null ? null : row.unit * (1 + markup))}</td>
                        <td className="py-2">{row?.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="prices">
          <section className="ledger-sheet rounded-2xl border p-4 sm:p-6">
            <h2 className="font-display text-3xl">Сырьё и аукцион</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Своя цена важнее аукциона. Если её нет, берётся что дешевле: лот или свой крафт. Снимок аукциона:{" "}
              {snapshotLabel(catalog.auctionUpdated)}.
            </p>
            <Input
              className="mt-3 max-w-md"
              value={priceQuery}
              placeholder="Ингредиент"
              onChange={(event) => setPriceQuery(event.target.value)}
              aria-label="Поиск сырья"
            />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Предмет</th>
                    <th className="py-2 pr-2 font-medium">Вручную</th>
                    <th className="py-2 pr-2 font-medium">Аукцион</th>
                    <th className="py-2 pr-2 font-medium">Свой крафт</th>
                    <th className="py-2 pr-2 font-medium">В расчёте</th>
                    <th className="py-2 font-medium">Источник</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePrices.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-muted-foreground">
                        Такого сырья в книге нет.
                      </td>
                    </tr>
                  )}
                  {visiblePrices.map((item) => (
                    <tr key={item.name} className="border-t">
                      <td className="py-2 pr-2">
                        <div>{item.name}</div>
                        {item.note && <div className="text-xs text-muted-foreground">{item.note}</div>}
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          className="w-24"
                          inputMode="decimal"
                          value={item.manual ?? ""}
                          aria-label={`Цена вручную: ${item.name}`}
                          onChange={(event) => {
                            const raw = event.target.value.replace(",", ".");
                            const base = catalog.prices.find((price) => price.name === item.name)?.manual ?? null;
                            const next = { ...overrides };
                            if (raw === "") {
                              if (base == null) delete next[item.name];
                              else next[item.name] = null;
                            } else {
                              const value = Number(raw);
                              if (Number.isNaN(value)) return;
                              if (value === base) delete next[item.name];
                              else next[item.name] = value;
                            }
                            save({ ...book, overrides: next });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">{groschen(item.auction)}</td>
                      <td className="py-2 pr-2">{groschen(item.own)}</td>
                      <td className="py-2 pr-2">{groschen(item.calc)}</td>
                      <td className="py-2">{item.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      {children}
    </label>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "font-display text-2xl" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Choice({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProductField({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const matches =
    query.length < 1
      ? []
      : catalog.products.filter((product) => product.name.toLowerCase().includes(query)).slice(0, 8);
  return (
    <div className="relative">
      <Input
        value={value}
        placeholder="Начните название"
        aria-label="Изделие"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md">
          {matches.map((product) => (
            <li key={product.name}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(product.name);
                  setOpen(false);
                }}
              >
                {product.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BackupDialog({
  importText,
  importError,
  onImportText,
  onExport,
  onImport,
}: {
  importText: string;
  importError: string;
  onImportText: (value: string) => void;
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Сохранить книгу</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">Книга в этом браузере</DialogTitle>
          <DialogDescription>
            Заказы, наценка и свои цены сырья уже запоминаются здесь. Файл нужен, чтобы перенести книгу на другой компьютер.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Button onClick={onExport}>Скачать файл</Button>
          <textarea
            className="border-input min-h-28 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            value={importText}
            placeholder="Вставьте сюда содержимое файла"
            onChange={(event) => onImportText(event.target.value)}
          />
          {importError && <p className="text-sm text-destructive">{importError}</p>}
          <Button variant="secondary" onClick={onImport}>
            Загрузить из текста
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
