/**
 * 全站版權聲明
 */
export function SiteCopyright({ className = "" }: { className?: string }) {
  return (
    <p
      className={`text-xs text-muted-foreground text-center ${className}`.trim()}
    >
      Copyright © 2026 Arthur 3C. All rights reserved.
    </p>
  );
}
