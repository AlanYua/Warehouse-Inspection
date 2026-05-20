export type ExternalDocumentRow = {
  documentNumber: string;
  documentType: string;
  /** 單據方向：OUT=驗出、IN=驗入（舊匯入表可缺省，落庫預設 OUT） */
  flow?: "OUT" | "IN" | null;
  documentDate: string | null;
  lingyueCode: string | null;
  channelCode: string | null;
  counterpartyName: string | null;
  phone: string | null;
  address: string | null;
  departmentName: string | null;
  creatorName: string | null;
  lines: Array<{
    productCode: string | null;
    barcode: string | null;
    productName: string | null;
    docQuantity: number;
    storageLocation: string | null;
    remark: string;
  }>;
};

