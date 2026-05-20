import type { Metadata } from "next";

export const metadata: Metadata = { title: "日報表" };

export default function DailyReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
