/**
 * 通路主檔：Excel 匯入
 * 對應 URL：/api/channels/import
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidIfNoPermission,
  getSessionUser,
} from "@/lib/api-guard";
import {
  parseWorksheetRows,
  resolveChannelColumns,
  strCell,
} from "@/lib/excel-master-import";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const f = forbidIfNoPermission(u.role, "channels.edit");
  if (f) return f;

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "需要 multipart 檔案" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "檔案過大" }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  let headers: string[];
  let rows: string[][];
  try {
    const parsed = await parseWorksheetRows(buf);
    headers = parsed.headers;
    rows = parsed.rows;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "無法讀取 Excel" },
      { status: 400 },
    );
  }

  const cols = resolveChannelColumns(headers);
  if (!cols) {
    return NextResponse.json(
      {
        error:
          "表頭需含且為必填欄：通路代碼、名稱、部門（須與部門主檔名稱一致）、電話、地址、凌越代碼",
      },
      { status: 400 },
    );
  }

  const depts = await prisma.department.findMany();
  const deptByName = new Map(depts.map((d) => [d.name.trim().toLowerCase(), d]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skip = 0;
  const errs: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const channelCode = strCell(r[cols.channelCode]);
    const name = strCell(r[cols.name]);
    const deptName = strCell(r[cols.department]);
    const phone = strCell(r[cols.phone]);
    const address = strCell(r[cols.address]);
    const lingyueCode = strCell(r[cols.lingyueCode]);

    const rowLabel = `第 ${i + 2} 列`;
    if (
      !channelCode &&
      !name &&
      !deptName &&
      !phone &&
      !address &&
      !lingyueCode
    ) {
      skip++;
      continue;
    }
    if (
      !channelCode ||
      !name ||
      !deptName ||
      !phone ||
      !address ||
      !lingyueCode
    ) {
      errs.push(`${rowLabel}：通路欄位皆為必填（含電話、地址、凌越代碼）`);
      if (errs.length >= 40) break;
      continue;
    }
    const dept =
      deptByName.get(deptName.toLowerCase()) ??
      deptByName.get(deptName.replace(/\s/g, "").toLowerCase());
    if (!dept) {
      errs.push(`${rowLabel}：找不到部門「${deptName}」`);
      if (errs.length >= 40) break;
      continue;
    }

    try {
      const existing = await prisma.channel.findUnique({
        where: { channelCode },
        select: {
          id: true,
          name: true,
          departmentId: true,
          phone: true,
          address: true,
          lingyueCode: true,
          isActive: true,
        },
      });

      if (!existing) {
        await prisma.channel.create({
          data: {
            channelCode,
            name,
            departmentId: dept.id,
            phone,
            address,
            lingyueCode,
            isActive: true,
          },
        });
        created++;
        continue;
      }

      const next = {
        name,
        departmentId: dept.id,
        phone,
        address,
        lingyueCode,
        isActive: true,
      };

      const needUpdate =
        existing.name !== next.name ||
        existing.departmentId !== next.departmentId ||
        (existing.phone ?? "") !== (next.phone ?? "") ||
        (existing.address ?? "") !== (next.address ?? "") ||
        (existing.lingyueCode ?? "") !== (next.lingyueCode ?? "") ||
        existing.isActive !== next.isActive;

      if (!needUpdate) {
        unchanged++;
        continue;
      }

      await prisma.channel.update({
        where: { id: existing.id },
        data: next,
      });
      updated++;
    } catch (e) {
      errs.push(`第 ${i + 2} 列：${e instanceof Error ? e.message : "寫入失敗"}`);
      if (errs.length >= 40) break;
    }
  }

  const message =
    errs.length === 0 && created === 0 && updated === 0 && unchanged > 0
      ? unchanged === 5
        ? "五通路已建立"
        : `${unchanged} 通路已建立`
      : undefined;

  if (created + updated > 0 || errs.length > 0) {
    await writeAudit({
      user: u,
      action: "channel.import",
      targetType: "Channel",
      summary: `匯入通路（新增 ${created}、更新 ${updated}、未變 ${unchanged}、錯誤 ${errs.length}）`,
      meta: {
        filename: file.name,
        created,
        updated,
        unchanged,
        skippedEmpty: skip,
        errorCount: errs.length,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    imported: created + updated,
    created,
    updated,
    unchanged,
    skippedEmpty: skip,
    errors: errs,
    rowCount: rows.length,
    message,
  });
}
