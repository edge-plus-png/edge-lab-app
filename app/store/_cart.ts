// app/store/_cart.ts
import type { Product } from "./_data";

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
};

const KEY = "edge_lab_demo_cart_v1";

export function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function addToCart(product: Product) {
  const items = loadCart();
  const existing = items.find((i) => i.productId === product.id);
  if (existing) existing.qty += 1;
  else items.push({ productId: product.id, name: product.name, price: product.price, qty: 1 });
  saveCart(items);
  return items;
}

export function removeFromCart(productId: string) {
  const items = loadCart().filter((i) => i.productId !== productId);
  saveCart(items);
  return items;
}

export function clearCart() {
  saveCart([]);
}

export function cartTotal(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}