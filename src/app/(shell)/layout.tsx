/**
 * 已登入後共用外殼：頂部 AppNav ＋ 主內容區（max-width）。
 */
import { AppNav } from "@/components/AppNav";

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full flex flex-col bg-gradient-to-b from-background via-muted/30 to-background">
      <AppNav />
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
