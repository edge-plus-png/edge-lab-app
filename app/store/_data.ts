// app/store/_data.ts
export type Product = {
  id: string;
  name: string;
  price: number; // GBP
  description: string;
};

export const PRODUCTS: Product[] = [
  {
    id: "setup-10",
    name: "edge+ Demo Service (£10)",
    price: 10.0,
    description: "Use this to force an APPROVE path in demos.",
  },
  {
    id: "setup-1001",
    name: "edge+ Demo Service (£10.01)",
    price: 10.01,
    description: "Use this to force a DECLINE path in demos.",
  },
  {
    id: "setup-0",
    name: "edge+ Demo Service (£0.00)",
    price: 0.0,
    description: "Use this to force an ERROR path in demos.",
  },
];