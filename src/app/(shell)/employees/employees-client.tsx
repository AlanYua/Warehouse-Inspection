/**
 * (client) 員工表單與列表
 * 檔案：src/app/(shell)/employees/employees-client.tsx
 */

"use client";

import { Role } from "@prisma/client";
import { useCallback, useEffect, useState } from "react";
import { roleLabel } from "@/lib/role-labels";

type Row = {
  id: string;
  username: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const roles = [
  Role.ADMIN,
  Role.WAREHOUSE,
  Role.WAREHOUSE_SUPERVISOR,
  Role.SALES,
  Role.PROCUREMENT,
] as const;

export default function EmployeesClient({
  initialRows,
}: {
  initialRows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [filterRole, setFilterRole] = useState<Role | "ALL">("ALL");
  const [filterKeyword, setFilterKeyword] = useState("");

  const [cUsername, setCUsername] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cName, setCName] = useState("");
  const [cRole, setCRole] = useState<Role>(Role.WAREHOUSE);

  const filtered = rows.filter((r) => {
    if (filterRole !== "ALL" && r.role !== filterRole) return false;
    if (filterKeyword.trim()) {
      const kw = filterKeyword.trim().toLowerCase();
      return (
        r.username.toLowerCase().includes(kw) ||
        r.name.toLowerCase().includes(kw)
      );
    }
    return true;
  });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/users", { credentials: "include" });
      const text = await res.text();
      if (!res.ok) {
        setErr(text || `HTTP ${res.status}`);
        return;
      }
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : [];
      } catch {
        setErr(`回應不是 JSON：${text.slice(0, 200)}`);
        return;
      }
      if (!Array.isArray(data)) {
        setErr("回應格式錯誤（預期為帳號陣列）");
        return;
      }
      setRows(data as Row[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 非同步 fetch 後才 setState
    void load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy("create");
    const res = await fetch("/api/users", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: cUsername.trim(),
        password: cPassword,
        name: cName.trim(),
        role: cRole,
      }),
    });
    setBusy(null);
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    setCUsername("");
    setCPassword("");
    setCName("");
    setCRole(Role.WAREHOUSE);
    void load();
  }

  async function saveRow(id: string, patch: {
    username?: string;
    name?: string;
    role?: Role;
    password?: string;
    isActive?: boolean;
  }) {
    setErr(null);
    setBusy(id);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(null);
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    void load();
  }

  async function deleteRow(id: string) {
    setErr(null);
    setBusy(id);
    const res = await fetch(`/api/users/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(null);
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    void load();
  }

  return (
    <div className="space-y-8">
      {err && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-2 rounded-md whitespace-pre-wrap break-all">
          {err}
        </p>
      )}

      <section className="panel panel-body space-y-3">
        <h2 className="font-medium text-foreground">新增員工</h2>
        <form
          onSubmit={(e) => void createUser(e)}
          className="filter-bar !grid-cols-2 sm:!grid-cols-3 lg:!grid-cols-5"
        >
          <div>
            <label className="field-label">帳號</label>
            <input
              required
              minLength={2}
              maxLength={64}
              className="ui-input font-mono"
              value={cUsername}
              onChange={(e) => setCUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block">
              初始密碼（至少 6 字）
            </label>
            <input
              required
              type="password"
              minLength={6}
              className="mt-0.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm min-w-[10rem]"
              value={cPassword}
              onChange={(e) => setCPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block">姓名</label>
            <input
              required
              className="mt-0.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm min-w-[8rem]"
              value={cName}
              onChange={(e) => setCName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block">角色</label>
            <select
              className="mt-0.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm min-w-[8rem]"
              value={cRole}
              onChange={(e) => setCRole(e.target.value as Role)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={busy === "create"}
            className="btn-primary"
          >
            建立
          </button>
        </form>
      </section>

      <section className="filter-bar !grid-cols-2 sm:!grid-cols-3">
        <div>
          <label className="text-xs text-muted-foreground block">部門 / 角色</label>
          <select
            className="mt-0.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm min-w-[8rem]"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as Role | "ALL")}
          >
            <option value="ALL">全部</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block">關鍵字（帳號 / 姓名）</label>
          <input
            className="mt-0.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm min-w-[14rem]"
            placeholder="搜尋..."
            value={filterKeyword}
            onChange={(e) => setFilterKeyword(e.target.value)}
          />
        </div>
        <span className="text-xs text-muted-foreground pb-1">
          {filtered.length} / {rows.length} 筆
        </span>
      </section>

      <section>
        <h2 className="font-medium text-foreground mb-2">帳號列表</h2>
        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {rows.length === 0
                ? "尚無帳號資料。請用上方「新增員工」建立。"
                : "找不到符合條件的員工。"}
            </p>
          ) : (
            filtered.map((r) => (
              <EmployeeCard
                key={`mobile-${r.id}-${r.updatedAt}`}
                row={r}
                busy={busy === r.id}
                onSave={(patch) => void saveRow(r.id, patch)}
                onToggleActive={(next) =>
                  void saveRow(r.id, { isActive: next })
                }
                onDelete={() => void deleteRow(r.id)}
              />
            ))
          )}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="p-2 min-w-[7rem]">帳號</th>
                <th className="p-2">姓名</th>
                <th className="p-2">角色</th>
                <th className="p-2">狀態</th>
                <th className="p-2">建立時間</th>
                <th className="p-2 min-w-[12rem]">更新</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="border-t border-border">
                  <td
                    colSpan={6}
                    className="p-6 text-center text-muted-foreground text-sm"
                  >
                    {rows.length === 0
                      ? "尚無帳號資料。若你預期應有員工，請按下方說明檢查；或直接用上方「新增員工」建立。"
                      : "找不到符合條件的員工。"}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <EmployeeRow
                    key={`${r.id}-${r.updatedAt}`}
                    row={r}
                    busy={busy === r.id}
                    onSave={(patch) => void saveRow(r.id, patch)}
                    onToggleActive={(next) =>
                      void saveRow(r.id, { isActive: next })
                    }
                    onDelete={() => void deleteRow(r.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EmployeeRow({
  row,
  busy,
  onSave,
  onToggleActive,
  onDelete,
}: {
  row: Row;
  busy: boolean;
  onSave: (patch: {
    username?: string;
    name?: string;
    role?: Role;
    password?: string;
    isActive?: boolean;
  }) => void;
  onToggleActive: (next: boolean) => void;
  onDelete: () => void;
}) {
  const [username, setUsername] = useState(row.username);
  const [name, setName] = useState(row.name);
  const [role, setRole] = useState<Role>(row.role);
  const [newPw, setNewPw] = useState("");

  return (
    <tr className="border-t border-border">
      <td className="p-2">
        <input
          className="w-full min-w-[6rem] rounded border border-input bg-background px-2 py-1 font-mono text-xs"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
        />
      </td>
      <td className="p-2">
        <input
          className="w-full min-w-[6rem] rounded border border-input bg-background px-2 py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      <td className="p-2">
        <select
          className="rounded border border-input bg-background px-2 py-1"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {roles.map((x) => (
            <option key={x} value={x}>
              {roleLabel(x)}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <span
          className={
            row.isActive
              ? "inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-700 px-2 py-0.5 text-xs border border-emerald-500/20"
              : "inline-flex items-center rounded-full bg-zinc-500/10 text-zinc-600 px-2 py-0.5 text-xs border border-zinc-500/20"
          }
        >
          {row.isActive ? "啟用" : "停用"}
        </span>
      </td>
      <td className="p-2 text-xs whitespace-nowrap">
        {new Date(row.createdAt).toLocaleString()}
      </td>
      <td className="p-2">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={busy}
            className="text-xs px-2 py-1 rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50"
            onClick={() => {
              const next = !row.isActive;
              const label = next ? "啟用" : "停用";
              if (!confirm(`確定要${label}此帳號？`)) return;
              onToggleActive(next);
            }}
          >
            {row.isActive ? "停用" : "啟用"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="text-xs px-2 py-1 rounded-md border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 disabled:opacity-50"
            onClick={() => {
              if (
                !confirm(
                  `確定要刪除帳號「${row.username} / ${row.name}」？\n` +
                    "此動作無法復原。",
                )
              ) {
                return;
              }
              onDelete();
            }}
          >
            刪除
          </button>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="新密碼（選填）"
            className="flex-1 min-w-[8rem] rounded border border-input bg-background px-2 py-1 text-xs"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            className="text-xs px-2 py-1 rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50"
            onClick={() => {
              const patch: {
                username?: string;
                name?: string;
                role?: Role;
                password?: string;
              } = {};
              if (username.trim() !== row.username) {
                patch.username = username.trim();
              }
              if (name.trim() !== row.name) patch.name = name.trim();
              if (role !== row.role) patch.role = role;
              if (newPw.length > 0) {
                if (newPw.length < 6) {
                  alert("新密碼至少 6 字");
                  return;
                }
                patch.password = newPw;
              }
              if (Object.keys(patch).length === 0) return;
              onSave(patch);
            }}
          >
            儲存
          </button>
        </div>
      </td>
    </tr>
  );
}

function EmployeeCard({
  row,
  busy,
  onSave,
  onToggleActive,
  onDelete,
}: {
  row: Row;
  busy: boolean;
  onSave: (patch: {
    username?: string;
    name?: string;
    role?: Role;
    password?: string;
    isActive?: boolean;
  }) => void;
  onToggleActive: (next: boolean) => void;
  onDelete: () => void;
}) {
  const [username, setUsername] = useState(row.username);
  const [name, setName] = useState(row.name);
  const [role, setRole] = useState<Role>(row.role);
  const [newPw, setNewPw] = useState("");

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{row.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{row.username}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={
              row.isActive
                ? "inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-700 px-2 py-0.5 text-xs border border-emerald-500/20"
                : "inline-flex items-center rounded-full bg-zinc-500/10 text-zinc-600 px-2 py-0.5 text-xs border border-zinc-500/20"
            }
          >
            {row.isActive ? "啟用" : "停用"}
          </span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {roleLabel(row.role)} · 建立 {new Date(row.createdAt).toLocaleDateString()}
      </div>
      <div className="space-y-2 pt-1 border-t border-border/50">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">帳號</label>
            <input
              className="w-full rounded border border-input bg-background px-2 py-1 font-mono text-xs"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">姓名</label>
            <input
              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">角色</label>
            <select
              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {roles.map((x) => (
                <option key={x} value={x}>
                  {roleLabel(x)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">新密碼</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="（選填）"
              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50"
            onClick={() => {
              const next = !row.isActive;
              const label = next ? "啟用" : "停用";
              if (!confirm(`確定要${label}此帳號？`)) return;
              onToggleActive(next);
            }}
          >
            {row.isActive ? "停用" : "啟用"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-md border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 disabled:opacity-50"
            onClick={() => {
              if (
                !confirm(
                  `確定要刪除帳號「${row.username} / ${row.name}」？\n` +
                    "此動作無法復原。",
                )
              ) {
                return;
              }
              onDelete();
            }}
          >
            刪除
          </button>
          <button
            type="button"
            disabled={busy}
            className="ml-auto text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
            onClick={() => {
              const patch: {
                username?: string;
                name?: string;
                role?: Role;
                password?: string;
              } = {};
              if (username.trim() !== row.username) {
                patch.username = username.trim();
              }
              if (name.trim() !== row.name) patch.name = name.trim();
              if (role !== row.role) patch.role = role;
              if (newPw.length > 0) {
                if (newPw.length < 6) {
                  alert("新密碼至少 6 字");
                  return;
                }
                patch.password = newPw;
              }
              if (Object.keys(patch).length === 0) return;
              onSave(patch);
            }}
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}
