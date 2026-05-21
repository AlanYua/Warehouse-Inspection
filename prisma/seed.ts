/**
 * 開發用資料：示範帳號、部門／通路／商品、三筆不同狀態驗收單、列印表頭。
 * 執行：npm run db:seed
 */
import "dotenv/config";
import {
  AcceptMethod,
  DocumentSource,
  DocumentStatus,
  PrismaClient,
  Role,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  if (adminPassword === "admin123") {
    console.warn(
      "[seed] ⚠️  使用預設密碼 admin123，正式環境請設定環境變數 ADMIN_PASSWORD",
    );
  }
  const hash = await bcrypt.hash(adminPassword, 10);
  const adminUpdate =
    process.env.ADMIN_PASSWORD != null && process.env.ADMIN_PASSWORD !== ""
      ? { passwordHash: hash, name: "管理者", role: Role.ADMIN, isActive: true }
      : {};
  await prisma.user.upsert({
    where: { username: "admin" },
    update: adminUpdate,
    create: {
      username: "admin",
      passwordHash: hash,
      name: "管理者",
      role: Role.ADMIN,
    },
  });

  // 避免「只是想補 admin」卻把 DEMO 資料又灌回來：
  // 只有在明確指定 SEED_DEMO=YES 時才建立示範資料。
  if (process.env.SEED_DEMO !== "YES") {
    console.log(
      "[seed] admin ensured. Demo seed skipped (set SEED_DEMO=YES to seed demo data).",
    );
    return;
  }

  const whHash = await bcrypt.hash("warehouse123", 10);
  await prisma.user.upsert({
    where: { username: "warehouse" },
    update: {},
    create: {
      username: "warehouse",
      passwordHash: whHash,
      name: "倉庫人員",
      role: Role.WAREHOUSE,
    },
  });
  const salesHash = await bcrypt.hash("sales123", 10);
  await prisma.user.upsert({
    where: { username: "sales" },
    update: {},
    create: {
      username: "sales",
      passwordHash: salesHash,
      name: "業務",
      role: Role.SALES,
    },
  });
  const procHash = await bcrypt.hash("proc123", 10);
  await prisma.user.upsert({
    where: { username: "procurement" },
    update: {},
    create: {
      username: "procurement",
      passwordHash: procHash,
      name: "採購",
      role: Role.PROCUREMENT,
    },
  });

  await prisma.department.upsert({
    where: { name: "倉儲一部" },
    update: {},
    create: { name: "倉儲一部" },
  });
  await prisma.department.upsert({
    where: { name: "業務部" },
    update: {},
    create: { name: "業務部" },
  });

  const dept = await prisma.department.findFirst({ where: { name: "倉儲一部" } });
  if (dept) {
    await prisma.channel.upsert({
      where: { channelCode: "CH-DEMO" },
      update: {},
      create: {
        channelCode: "CH-DEMO",
        name: "示範通路",
        phone: "02-00000000",
        address: "台北市",
        lingyueCode: "LY-001",
        departmentId: dept.id,
      },
    });
  }

  await prisma.product.upsert({
    where: { productCode: "SKU-DEMO" },
    update: {},
    create: {
      productCode: "SKU-DEMO",
      barcode: "4710000000001",
      name: "示範商品",
      brand: "示範牌",
      storageLocation: "A-01",
    },
  });
  await prisma.product.upsert({
    where: { productCode: "SKU-DEMO-B" },
    update: {},
    create: {
      productCode: "SKU-DEMO-B",
      barcode: "4710000000002",
      name: "示範商品 B",
      brand: "示範牌",
      storageLocation: "A-02",
    },
  });

  const deptWh = await prisma.department.findFirst({
    where: { name: "倉儲一部" },
  });
  const ch = await prisma.channel.findUnique({
    where: { channelCode: "CH-DEMO" },
  });

  if (deptWh && ch) {
    const demoNos = ["DEMO-2026-0001", "DEMO-2026-0002", "DEMO-2026-0003"];
    await prisma.inspectionDoc.deleteMany({
      where: { documentNumber: { in: demoNos } },
    });

    let typeRows = await prisma.documentTypeOption.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    if (typeRows.length === 0) {
      await prisma.documentTypeOption.createMany({
        data: [
          { name: "銷貨出庫", sortOrder: 1 },
          { name: "調撥出庫", sortOrder: 2 },
          { name: "銷退", sortOrder: 3 },
        ],
        skipDuplicates: true,
      });
      typeRows = await prisma.documentTypeOption.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
    }
    const docTypeAt = (i: number) => typeRows[i % typeRows.length]!.name;

    await prisma.inspectionDoc.create({
      data: {
        documentNumber: demoNos[0],
        documentType: docTypeAt(0),
        lingyueCode: "LY-001",
        channelCode: ch.channelCode,
        counterpartyName: "凱明實業有限公司",
        phone: "02-27001234",
        address: "新北市中和區建康路 168 號 5 樓",
        departmentId: deptWh.id,
        creatorName: "示範製單",
        status: DocumentStatus.PENDING,
        acceptMethod: AcceptMethod.MANUAL,
        source: DocumentSource.EXCEL,
        lines: {
          create: [
            {
              productCode: "SKU-DEMO",
              barcode: "4710000000001",
              productName: "示範商品",
              docQuantity: 10,
              remark: "範例明細一",
              storageLocation: "A-01",
            },
            {
              productCode: "SKU-DEMO-B",
              barcode: "4710000000002",
              productName: "示範商品 B",
              docQuantity: 3,
              remark: "範例明細二",
              storageLocation: "A-02",
            },
          ],
        },
      },
    });

    await prisma.inspectionDoc.create({
      data: {
        documentNumber: demoNos[1],
        documentType: docTypeAt(1),
        channelCode: ch.channelCode,
        counterpartyName: "翌辰科技股份有限公司",
        phone: "04-22567890",
        address: "臺中市西屯區台灣大道三段 99 號",
        departmentId: deptWh.id,
        creatorName: "示範製單",
        status: DocumentStatus.INSPECTING,
        acceptMethod: AcceptMethod.BARCODE,
        source: DocumentSource.EXCEL,
        lines: {
          create: [
            {
              productCode: "SKU-DEMO",
              barcode: "4710000000001",
              productName: "示範商品",
              docQuantity: 5,
              remark: "驗收進行中範例",
              storageLocation: "A-01",
            },
          ],
        },
      },
    });

    await prisma.inspectionDoc.create({
      data: {
        documentNumber: demoNos[2],
        documentType: docTypeAt(2),
        channelCode: ch.channelCode,
        counterpartyName: "和泰商行",
        phone: "07-76123456",
        address: "高雄市前鎮區中山二路 5 號",
        departmentId: deptWh.id,
        creatorName: "示範製單",
        status: DocumentStatus.SHIPPED,
        acceptMethod: AcceptMethod.MANUAL,
        source: DocumentSource.EXCEL,
        packageCount: 1,
        lines: {
          create: [
            {
              productCode: "SKU-DEMO-B",
              barcode: "4710000000002",
              productName: "示範商品 B",
              docQuantity: 2,
              remark: "已出貨範例",
              storageLocation: "A-02",
            },
          ],
        },
      },
    });
  }

  await prisma.companyPrintHeader.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      companyName: "示範公司",
      companyPhone: "02-12345678",
      companyAddress: "示範地址",
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
