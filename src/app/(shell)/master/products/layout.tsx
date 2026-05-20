import type { Metadata } from "next";

export const metadata: Metadata = { title: "商品主檔" };

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
