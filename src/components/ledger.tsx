"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Leaf } from "lucide-react";
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
import {
  auctionServerSnapshot,
  auctionSnapshot,
  refreshAuction,
  subscribeAuction,
  type AuctionFeed,
} from "@/lib/auction-sheet";
import { catalog, productByName } from "@/lib/catalog";
import { purchaseList, quoteOrder, resolvePrices } from "@/lib/calc";
import { groschen } from "@/lib/format";
import { parseOrderText, searchProducts, type ProductHit } from "@/lib/parse";
import type { AuctionMode, Order, OrderItem, Product } from "@/lib/types";

const STORAGE_KEY = "dom-u-dereva-ledger-v1";
const STORAGE_EVENT = "ledger-change";

const hints = {
  markup: "Проценты сверху себестоимости на все заказы. 10 — это 10%.",
  auction: "Какую цену аукциона брать: самый дешёвый лот сейчас или среднюю за 7 дней.",
  orderText:
    "До пяти позиций через запятую, точку с запятой или с новой строки. Число можно в начале или в конце: «3 настой календулы» или «настой календулы 3». Название можно писать как в игре. Если строки изделий ещё пустые, текст разберётся сам, когда уйдёте из поля. Если уже заполнены — нажмите «Разобрать текст».",
  customer: "Как зовут заказчика. Так строка подписана в журнале.",
  place: "Откуда заказчик: деревня, город или постоялый двор.",
  profession: "Чья это работа. Список изделий по стрелке откроется на этой профессии.",
  master: "Кто из мастерской берёт заказ.",
  status:
    "Пока стоит «Не взят», цена в журнале пересчитывается сама. Любой другой статус запоминает итог. Верните «Не взят» — и цена снова живая.",
  discount: "Скидка заказчику в процентах, уже после наценки. 10 — это 10%.",
  product:
    "Название из книги или как в игре. Стрелка справа открывает список, внутри него можно сменить профессию. Стрелки клавиатуры листают список, Enter выбирает строку.",
  qty: "Сколько штук нужно заказчику. Число крафтов — сколько целых партий рецепта на это количество.",
  agreed: "Сумма, о которой уже договорились, в грошах. В итог не входит, это только запись.",
  goodsSearch: "Часть названия: как в игре, как в книге или английское имя из ЛК.",
  goodsProfession: "Оставить в таблице изделия одной профессии или показать все.",
  priceSearch: "Часть названия ингредиента, чтобы быстрее найти строку.",
  manualPrice: "Своя цена за одну штуку, в грошах. Она важнее аукциона. Сотрите число — вернётся цена из книги.",
  importBook: "Вставьте сюда текст скачанного файла книги: заказы, наценка и свои цены.",
  listProfession: "Какую профессию показать в списке. «Все профессии» — весь каталог.",
};

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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const auction = useSyncExternalStore(subscribeAuction, auctionSnapshot, auctionServerSnapshot);
  const liveAuction = useMemo(() => new Map(auction.items.map((item) => [item.key, item])), [auction]);

  function save(next: SavedBook) {
    writeSnapshot(next);
  }

  const resolved = useMemo(
    () => resolvePrices(catalog.prices, liveAuction, mode, overrides),
    [liveAuction, mode, overrides],
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
    const pool = catalog.products.filter((product) => profession === "все" || product.profession === profession);
    if (!productQuery.trim()) return pool.slice(0, 40).map((product) => ({ product, alias: null as string | null }));
    return searchProducts(productQuery, pool, 40);
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

  function clearSlot(order: Order, index: number) {
    const items = padItems(order.items);
    items[index] = { name: "", qty: 0 };
    updateOrder(order.id, { items: items.filter((item) => item.name || item.qty) });
  }

  function removeOrder(id: string) {
    const nextOrders = book.orders.filter((order) => order.id !== id);
    const nextActive =
      book.activeId === id ? (nextOrders[nextOrders.length - 1]?.id ?? "") : book.activeId;
    save({ ...book, orders: nextOrders, activeId: nextActive });
    setPendingDeleteId(null);
  }

  function editOrder(id: string) {
    save({ ...book, activeId: id });
    setTab("order");
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
                data-hint={hints.markup}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Цена с аукциона
              <Select value={mode} onValueChange={(value) => save({ ...book, mode: value as AuctionMode })}>
                <SelectTrigger className="w-full" aria-label="Цена с аукциона" data-hint={hints.auction}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ДЕШЕВЛЕ ВСЕГО">Дешевле всего</SelectItem>
                  <SelectItem value="СРЕДНЯЯ ЗА 7 ДН">Средняя за 7 дней</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <div className="flex flex-col items-start gap-2 sm:col-span-2">
              <AuctionNote feed={auction} />
              <Button variant="outline" onClick={() => void refreshAuction()}>
                Обновить аукцион
              </Button>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2">
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
          <a
            className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
            href="dom-u-dereva-mebel.xlsx"
            download
          >
            Таблица «что сделано»
          </a>
          </div>
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
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl">Редактирование заказа</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {active.customer || active.text || "Новая строка журнала"} · {active.status}. Правки сразу пишутся в журнал.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    const order = blankOrder();
                    save({ ...book, orders: [...book.orders, order], activeId: order.id });
                  }}
                >
                  Новый заказ
                </Button>
                <Button variant="destructive" onClick={() => setPendingDeleteId(active.id)}>
                  Удалить заказ
                </Button>
              </div>
            </div>
            {pendingDeleteId === active.id && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-[oklch(0.9_0.04_70)] px-3 py-2 text-sm">
                <p>Удалить этот заказ из журнала?</p>
                <Button size="sm" variant="destructive" onClick={() => removeOrder(active.id)}>
                  Да, удалить
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPendingDeleteId(null)}>
                  Оставить
                </Button>
              </div>
            )}
            <label className="grid gap-1 text-sm">
              Текст заказа
              <textarea
                className="border-input bg-background min-h-20 w-full rounded-lg border px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={active.text}
                data-hint={hints.orderText}
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
                До пяти позиций. Число можно поставить в начале или в конце. Название можно писать как в игре
                или выбрать стрелкой из списка.
              </p>
            </div>
            {active.unparsed.length > 0 && (
              <p className="mt-3 rounded-lg bg-[oklch(0.9_0.04_70)] px-3 py-2 text-sm">
                Не распознано: {active.unparsed.join("; ")}
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Имя заказчика">
                <Input
                  value={active.customer}
                  data-hint={hints.customer}
                  onChange={(event) => updateOrder(active.id, { customer: event.target.value })}
                />
              </Field>
              <Field label="Место проживания">
                <Input
                  value={active.place}
                  data-hint={hints.place}
                  onChange={(event) => updateOrder(active.id, { place: event.target.value })}
                />
              </Field>
              <Field label="Профессия">
                <Choice
                  value={active.profession}
                  options={catalog.professions}
                  onChange={(profession) => updateOrder(active.id, { profession })}
                  label="Профессия"
                  hint={hints.profession}
                />
              </Field>
              <Field label="Мастер">
                <Choice
                  value={active.master}
                  options={catalog.masters}
                  onChange={(master) => updateOrder(active.id, { master })}
                  label="Мастер"
                  hint={hints.master}
                />
              </Field>
              <Field label="Статус">
                <Choice
                  value={active.status}
                  options={catalog.statuses}
                  onChange={(status) => changeStatus(active, status)}
                  label="Статус"
                  hint={hints.status}
                />
              </Field>
              <Field label="Скидка, %">
                <Input
                  inputMode="decimal"
                  data-hint={hints.discount}
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
                    <th className="py-2 pr-2 font-medium">Статус</th>
                    <th className="py-2 font-medium" />
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
                            profession={active.profession}
                            onChange={(name) => setItem(active, index, { name })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            className="w-24"
                            inputMode="decimal"
                            data-hint={hints.qty}
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
                        <td className="py-2 pr-2">{line?.status ?? ""}</td>
                        <td className="py-2 text-right">
                          {(slot.name || slot.qty > 0) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => clearSlot(active, index)}
                              aria-label={`Убрать позицию ${index + 1}`}
                            >
                              Убрать
                            </Button>
                          )}
                        </td>
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
                  data-hint={hints.agreed}
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
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => editOrder(order.id)}>
                              Изменить
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setPendingDeleteId(order.id)}>
                              Удалить
                            </Button>
                          </div>
                          {pendingDeleteId === order.id && (
                            <div className="mt-2 flex justify-end gap-2">
                              <Button size="sm" variant="destructive" onClick={() => removeOrder(order.id)}>
                                Да, удалить
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setPendingDeleteId(null)}>
                                Оставить
                              </Button>
                            </div>
                          )}
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
              Себестоимость одной штуки — крафт делить на выход. Цена заказчику уже с наценкой мастерской. Поиск
              понимает и название из игры.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_16rem]">
              <Input
                value={productQuery}
                placeholder="Название в игре, в книге или в ЛК"
                onChange={(event) => setProductQuery(event.target.value)}
                aria-label="Поиск изделия"
                data-hint={hints.goodsSearch}
              />
              <Choice
                value={profession}
                options={professions}
                onChange={setProfession}
                label="Фильтр профессии"
                hint={hints.goodsProfession}
              />
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
                  {visibleProducts.map(({ product, alias }) => {
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
                          {alias && <div className="text-xs text-muted-foreground">в игре: {alias}</div>}
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
              Своя цена важнее аукциона. Если её нет, берётся что дешевле: лот или свой крафт.
            </p>
            <AuctionNote feed={auction} />
            <Input
              className="mt-3 max-w-md"
              value={priceQuery}
              placeholder="Ингредиент"
              onChange={(event) => setPriceQuery(event.target.value)}
              aria-label="Поиск сырья"
              data-hint={hints.priceSearch}
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
                          data-hint={hints.manualPrice}
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
      <FieldHints />
    </main>
  );
}

function FieldHints() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready) return;
    const node = ref.current;
    if (!node) return;
    let text = "";

    const place = (cursorX: number, cursorY: number) => {
      node.hidden = false;
      node.style.visibility = "hidden";
      const rect = node.getBoundingClientRect();
      let x = cursorX + 16;
      let y = cursorY + 22;
      if (x + rect.width > window.innerWidth - 8) x = cursorX - rect.width - 16;
      if (y + rect.height > window.innerHeight - 8) y = cursorY - rect.height - 16;
      x = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
      y = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.style.visibility = "visible";
    };

    const show = (host: HTMLElement, cursorX: number, cursorY: number) => {
      const next = host.dataset.hint ?? "";
      if (!next) {
        node.hidden = true;
        text = "";
        return;
      }
      if (next !== text) {
        node.textContent = next;
        text = next;
      }
      place(cursorX, cursorY);
    };

    const hide = () => {
      node.hidden = true;
      text = "";
    };

    const hostOf = (target: EventTarget | null) =>
      target instanceof Element ? (target.closest("[data-hint]") as HTMLElement | null) : null;

    const move = (event: MouseEvent) => {
      const host = hostOf(event.target);
      if (!host) {
        hide();
        return;
      }
      show(host, event.clientX, event.clientY);
    };

    const focus = (event: FocusEvent) => {
      const host = hostOf(event.target);
      if (!host) return;
      const rect = host.getBoundingClientRect();
      show(host, rect.left, rect.bottom);
    };

    const blur = (event: FocusEvent) => {
      if (!hostOf(event.relatedTarget)) hide();
    };

    document.addEventListener("mousemove", move);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("scroll", hide, true);
    };
  }, [ready]);

  if (!ready) return null;
  return createPortal(
    <div
      ref={ref}
      hidden
      role="tooltip"
      className="pointer-events-none fixed z-[80] max-w-72 rounded-lg border bg-[oklch(0.97_0.02_92)] px-3 py-2 text-sm leading-snug text-[oklch(0.28_0.03_55)] shadow-md"
    />,
    document.body,
  );
}

function AuctionNote({ feed }: { feed: AuctionFeed }) {
  if (feed.status === "sheet") {
    return (
      <p className="text-sm text-muted-foreground">
        Аукцион читается из общей Google-таблицы. Там цены обновляются раз в день. Сейчас в расчёте снимок{" "}
        {snapshotLabel(feed.updated)}.
      </p>
    );
  }
  if (feed.status === "book") {
    return (
      <p className="text-sm text-muted-foreground">
        Общая таблица не открылась. В расчёте снимок книги от {snapshotLabel(catalog.auctionUpdated)}.
      </p>
    );
  }
  return <p className="text-sm text-muted-foreground">Сверяем аукцион с общей таблицей…</p>;
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
  hint,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  label: string;
  hint?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={label} data-hint={hint}>
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

const productListProfessions = ["все", ...catalog.professions.filter((item) => item && item !== "-")];

function productChoices(query: string, profession: string): ProductHit[] {
  const trimmed = query.trim();
  if (trimmed.length >= 2) return searchProducts(trimmed, catalog.products, 30);
  const pool = catalog.products.filter((product) => profession === "все" || product.profession === profession);
  const needle = trimmed.toLowerCase();
  const unique = new Map<string, Product>();
  for (const product of pool) {
    if (!unique.has(product.name)) unique.set(product.name, product);
  }
  return [...unique.values()]
    .filter((product) => !needle || product.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((product) => ({ product, alias: null, rank: 0 }));
}

function ProductField({
  value,
  profession,
  onChange,
}: {
  value: string;
  profession: string;
  onChange: (name: string) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [listProfession, setListProfession] = useState(profession || "все");
  const [cursor, setCursor] = useState(0);
  const [box, setBox] = useState({ top: 0, left: 0, width: 280, maxHeight: 280 });
  const options = useMemo(
    () => (open ? productChoices(browse ? "" : value, listProfession) : []),
    [open, browse, value, listProfession],
  );

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const node = rootRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const spaceBelow = window.innerHeight - rect.bottom;
      const maxHeight = Math.min(340, Math.max(180, spaceBelow > 220 ? spaceBelow - 12 : rect.top - 12));
      const top = spaceBelow > 220 ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4);
      setBox({ top, left, width, maxHeight });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    const node = menuRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [cursor, open, listProfession]);

  function openList() {
    const next = productListProfessions.includes(profession) ? profession : "все";
    const choices = productChoices("", next);
    const current = choices.findIndex((item) => item.product.name === value);
    setListProfession(next);
    setBrowse(true);
    setCursor(current >= 0 ? current : 0);
    setOpen(true);
  }

  function choose(name: string) {
    onChange(name);
    setBrowse(false);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openList();
      else setCursor((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp" && open) {
      event.preventDefault();
      setCursor((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && options[cursor]) {
      event.preventDefault();
      choose(options[cursor].product.name);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="flex min-w-0" data-hint={hints.product}>
      <Input
        value={value}
        placeholder="Начните название"
        role="combobox"
        aria-label="Изделие"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className="min-w-0 rounded-r-none"
        onChange={(event) => {
          onChange(event.target.value);
          setBrowse(false);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => {
          if (value.trim().length >= 2) {
            setBrowse(false);
            setOpen(true);
          }
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-r-lg border border-l-0 border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Список изделий"
        aria-expanded={open}
        onClick={() => (open && browse ? setOpen(false) : openList())}
      >
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 flex flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md"
            style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
          >
            <label className="flex items-center gap-2 border-b px-2 py-1.5 text-xs text-muted-foreground">
              Профессия
              <select
                aria-label="Профессия в списке"
                data-hint={hints.listProfession}
                className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={listProfession}
                onChange={(event) => {
                  setListProfession(event.target.value);
                  setBrowse(true);
                  setCursor(0);
                }}
              >
                {productListProfessions.map((item) => (
                  <option key={item} value={item}>
                    {item === "все" ? "Все профессии" : item}
                  </option>
                ))}
              </select>
            </label>
            <ul id={listId} className="min-h-0 flex-1 overflow-auto p-1" role="listbox" aria-label="Изделия">
              {options.length === 0 && <li className="px-2 py-2 text-sm text-muted-foreground">Ничего не найдено</li>}
              {options.map(({ product, alias }, index) => (
                <li key={product.name}>
                  <button
                    type="button"
                    role="option"
                    data-index={index}
                    aria-selected={index === cursor || product.name === value}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${index === cursor ? "bg-accent" : ""}`}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => choose(product.name)}
                  >
                    <span className="block">{product.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {alias ? `в игре: ${alias}` : `${product.profession}${product.level ? ` · ур. ${product.level}` : ""}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
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
            data-hint={hints.importBook}
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
