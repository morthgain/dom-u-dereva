import raw from "@/data/catalog.json";
import type { Catalog } from "./types";

export const catalog = raw as unknown as Catalog;

export const productByName = new Map(catalog.products.map((product) => [product.name, product]));

export const auctionByKey = new Map(catalog.auction.map((item) => [item.key, item]));
