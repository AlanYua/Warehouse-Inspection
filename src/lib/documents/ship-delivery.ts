export const LOGISTICS_SELF_PICKUP = "自取";
export const LOGISTICS_WAREHOUSE_DELIVERY = "倉庫親送";

/** 自送：自取 + 倉庫親送（logisticsNo 固定字樣） */
export const SELF_DELIVERY_LOGISTICS_NOS = [
  LOGISTICS_SELF_PICKUP,
  LOGISTICS_WAREHOUSE_DELIVERY,
] as const;

export function isSelfDeliveryLogistics(
  logisticsNo: string | null | undefined,
): boolean {
  const ln = (logisticsNo ?? "").trim();
  return (SELF_DELIVERY_LOGISTICS_NOS as readonly string[]).includes(ln);
}

export type ShipDeliveryInput = {
  selfPickup?: boolean;
  warehouseDelivery?: boolean;
  logisticsNo?: string;
};

export function resolveShipDelivery(input: ShipDeliveryInput):
  | {
      ok: true;
      logisticsNo: string;
      selfPickup: boolean;
      warehouseDelivery: boolean;
      skipPackageCount: boolean;
    }
  | { ok: false; error: string } {
  const selfPickup = Boolean(input.selfPickup);
  const warehouseDelivery = Boolean(input.warehouseDelivery);
  if (selfPickup && warehouseDelivery) {
    return { ok: false, error: "自取與倉庫親送請擇一" };
  }
  const ln = (input.logisticsNo ?? "").trim();
  if (!selfPickup && !warehouseDelivery && !ln) {
    return {
      ok: false,
      error: "請勾選自取、倉庫親送或填寫物流單號",
    };
  }
  const logisticsNo = selfPickup
    ? LOGISTICS_SELF_PICKUP
    : warehouseDelivery
      ? LOGISTICS_WAREHOUSE_DELIVERY
      : ln;
  return {
    ok: true,
    logisticsNo,
    selfPickup,
    warehouseDelivery,
    skipPackageCount: selfPickup || warehouseDelivery,
  };
}
