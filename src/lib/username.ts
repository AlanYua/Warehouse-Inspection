/**
 * 帳號字串驗證（zod）：給登入、員工維護 API 共用。
 */
import { z } from "zod";

/** 登入／員工帳號：自訂、不可含空白字元 */
export const usernameSchema = z
  .string()
  .trim()
  .min(2, "帳號至少 2 字")
  .max(64)
  .regex(/^\S+$/, "不可含空白");
