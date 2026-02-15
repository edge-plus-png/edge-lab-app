// app/store/_cart.ts
import type { Product } from "./_data";

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
};

const KEY = "edge_lab_demo_cart_v1";

function safeParse(json: string | null) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY);
  const parsed = safeParse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(Boolean);
}

export function saveCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function clearCart() {
  saveCart([]);
  return [];
}

export function addToCart(product: Product, qty: number = 1) {
  const items = loadCart();
  const idx = items.findIndex((i) => i.productId === product.id);

  if (idx >= 0) {
    items[idx] = { ...items[idx], qty: items[idx].qty + qty };
  } else {
    items.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      qty,
    });
  }

  saveCart(items);
  return items;
}

export function updateQty(productId: string, qty: number) {
  const items = loadCart()
    .map((i) => (i.productId === productId ? { ...i, qty } : i))
    .filter((i) => i.qty > 0);
  saveCart(items);
  return items;
}

export function removeFromCart(productId: string) {
  const items = loadCart().filter((i) => i.productId !== productId);
  saveCart(items);
  return items;
}

export function cartTotal(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}