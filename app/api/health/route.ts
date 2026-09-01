import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

export const dynamic = "force-dynamic";

/** ตรวจสุขภาพการเชื่อมต่อ DB — ไม่เผยค่า secret */
export async function GET() {
  const url = process.env.TURSO_DATABASE_URL ?? null;
  const token = process.env.TURSO_AUTH_TOKEN ?? null;
  const info: Record<string, unknown> = {
    mode: url ? "turso" : process.env.VERCEL ? "snapshot" : "local-file",
    url_len: url?.length ?? 0,
    url_starts: url ? url.slice(0, 12) : null,
    url_has_whitespace: url ? /\s/.test(url) : null,
    token_len: token?.length ?? 0,
    token_has_whitespace: token ? /\s/.test(token) : null,
    token_dots: token ? token.split(".").length - 1 : null,
  };
  if (url) {
    try {
      const db = createClient({ url: url.trim(), authToken: token?.trim() });
      const rs = await db.execute("SELECT COUNT(*) AS n FROM stocks");
      info.query_ok = true;
      info.stocks = Number(rs.rows[0].n);
    } catch (e) {
      info.query_ok = false;
      info.error = String(e).slice(0, 300);
    }
  }
  return NextResponse.json(info);
}
