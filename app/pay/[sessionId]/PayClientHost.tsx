"use client";

import dynamic from "next/dynamic";

const PayClient = dynamic(() => import("./PayClient"), { ssr: false });

export default function PayClientHost() {
  return <PayClient />;
}
