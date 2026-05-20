/**
 * html5-qrcode 全螢幕掃條碼：解碼後 callback，關閉時正確 stop/clear 釋放鏡頭。
 */
"use client";

import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { useEffect, useId, useRef, useState, type MutableRefObject } from "react";

type Props = {
  onDecoded: (text: string) => void;
  onClose: () => void;
};

/** stop() 在未啟動時會「同步 throw」字串，不能用 .catch() 接。 */
function disposeScanner(
  q: Html5Qrcode,
  disposingRef: MutableRefObject<boolean>,
): Promise<void> {
  if (disposingRef.current) return Promise.resolve();
  disposingRef.current = true;
  return (async () => {
    try {
      if (q.getState() !== Html5QrcodeScannerState.NOT_STARTED) {
        await q.stop();
      }
    } catch {
      /* sync throw 或 reject */
    }
    try {
      q.clear();
    } catch {
      /* ignore */
    }
  })();
}

export function BarcodeCamera({ onDecoded, onClose }: Props) {
  const regionId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);
  const disposingRef = useRef(false);
  const onDecodedRef = useRef(onDecoded);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onDecodedRef.current = onDecoded;
    onCloseRef.current = onClose;
  }, [onDecoded, onClose]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    disposingRef.current = false;

    const q = new Html5Qrcode(regionId);
    q.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 260, height: 160 } },
      (decoded) => {
        onDecodedRef.current(decoded);
        void disposeScanner(q, disposingRef).finally(() => onCloseRef.current());
      },
      () => {},
    ).catch((e: Error) => setErr(e.message));

    return () => {
      void disposeScanner(q, disposingRef);
    };
  }, [regionId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card text-card-foreground rounded-xl max-w-lg w-full p-4 shadow-lg border border-border">
        <div className="flex justify-between items-center mb-2">
          <span className="font-medium">掃描條碼</span>
          <button type="button" className="text-sm underline" onClick={onClose}>
            關閉
          </button>
        </div>
        {err && <p className="text-sm text-destructive mb-2">{err}</p>}
        <div id={regionId} className="rounded overflow-hidden" />
        <p className="text-xs text-muted-foreground mt-2">
          需 HTTPS 或本機方可使用鏡頭；也可用 USB 條碼槍在輸入框輸入。
        </p>
      </div>
    </div>
  );
}
