import type { ExternalDocumentRow } from "./types";

/**
 * 預設同步 adapter：
 * - 未接 ERP/外部 DB 時回傳空陣列，讓 worker 可正常啟動但不做任何事
 * - 之後要接真實 ERP_DB_URL 時，再把這裡替換成實作（或新增其他 adapter）
 */
export const noopAdapter = {
  async pullFromDatabase(): Promise<ExternalDocumentRow[]> {
    return [];
  },
};

