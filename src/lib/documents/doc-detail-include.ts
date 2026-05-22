/** 單據明細穩定順序（建立序 ≈ 匯入序） */
export const documentLinesOrderBy = [{ id: "asc" as const }];

export const inspectionDocDetailInclude = {
  department: true,
  lines: { orderBy: documentLinesOrderBy },
  lockedBy: { select: { id: true, name: true, username: true } },
  inspector: { select: { id: true, name: true, username: true } },
  picker: { select: { id: true, name: true, username: true } },
  stockedBy: { select: { id: true, name: true, username: true } },
} as const;
