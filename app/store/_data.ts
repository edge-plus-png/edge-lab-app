// app/store/_data.ts
export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
};

export const PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Demo Ticket",
    description: "A simple demo product used to simulate a real checkout flow.",
    price: 10.0,
  },
  {
    id: "p2",
    name: "Training Session",
    description: "A service-style item (good for booking platforms).",
    price: 15.0,
  },
  {
    id: "p3",
    name: "Membership",
    description: "Recurring-style concept (still a one-off payment in the demo).",
    price: 20.0,
  },
];