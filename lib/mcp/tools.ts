import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import * as data from "@/lib/cached";
import type { EntryPlan, Hint, HintGlossaryTerm, HintSource, HintStat, HintVisual, RunDetails, ThesisCheck, FinTable } from "@/lib/db";
import { getQuotes } from "@/lib/quote";
import { rankByPrice, entryLabel, WEIGHTS, type PriceRank } from "@/lib/ranking";
import { tally, byConfidence, calibrationVerdict, isThesisClaim, type Tally } from "@/lib/track-record";
import { PLAN_STATUS_LABEL } from "@/lib/plan-status";
import { HINT_STATUS_LABEL, isActiveHint } from "@/lib/hint-status";
import { listWatchTickers, setWatch } from "@/lib/watchlist";
import { addRequest, countOpenRequests, listMyRequests, MAX_OPEN_REQUESTS_PER_USER } from "@/lib/stock-requests";
import { logAccess } from "@/lib/access-log";
import type { Scope } from "@/lib/mcp/store";

/**
 * tools ของ MCP — เว็บในมุมของ AI agent: "ย่อยให้แล้ว" ไม่ใช่ dump ตาราง DB
 *
 * หลัก:
 * - อ่านผ่าน lib/cached.ts ชุดเดียวกับหน้าเว็บ → ตัวเลขตรงกับที่คนเห็นบนเว็บเสมอ และไม่เพิ่มโหลด Turso
 * - คืน markdown กระชับ (agent อ่านง่าย กิน token น้อยกว่า JSON) + ลิงก์หน้าเว็บทุกก้อนให้ agent อ้างอิงได้
 * - ทุกคำตอบที่มีเนื้อหาวิเคราะห์ปิดท้ายด้วย disclaimer — เนื้อหาเป็นการศึกษา ไม่ใช่คำแนะนำการลงทุน
 * - ไม่มี tool ไหนสร้างความเห็นใหม่ ทุกอย่างคือสิ่งที่ pipeline เขียนไว้แล้วใน DB (+ ราคาสดใน rank_by_price)
 * - ข้อมูลส่วนตัว (watchlist/คำขอ) ใช้อีเมลจาก token เท่านั้น ไม่รับอีเมลจาก argument
 */

export interface McpUser {
  email: string;
  scopes: Scope[];
  label: string;
  origin: string;
}

const DISCLAIMER =
  "\n\n---\n_เนื้อหาเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน — ทุกตัวเลข/ความเห็นมาจากรายงานในระบบ Tee Stock Research ณ วันที่ระบุ ไม่ได้ปรับตามข่าวหลังจากนั้น_";

const TICKER = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase().replace(/^\$/, ""))
  .pipe(z.string().regex(/^[A-Z0-9.\-]{1,15}$/, "ticker ไม่ถูกต้อง เช่น AAPL, BRK.B"));

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

// ---------- formatting helpers ----------

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const fail = (s: string) => ({ content: [{ type: "text" as const, text: s }], isError: true });

function parse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
const list = (raw: string | null | undefined): string[] => {
  const v = parse<unknown>(raw);
  return Array.isArray(v) ? v.map(String) : [];
};
const num = (n: number | null | undefined, d = 2) =>
  n == null ? "–" : n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : d });
const pct = (n: number | null | undefined) => (n == null ? "–" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`);
/** กันตัว | ในเนื้อหาทำตาราง markdown แตก */
const cell = (s: unknown) => String(s ?? "–").replace(/\|/g, "/").replace(/\s*\n\s*/g, " ");
const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
function table(head: string[], rows: unknown[][]): string {
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}
function finTable(t: FinTable | undefined, title: string): string {
  if (!t?.rows?.length) return "";
  return `**${title}**\n\n${table(["", ...t.years.map(String)], t.rows.map((r) => [r.label, ...r.values]))}`;
}
const CHECK_LABEL: Record<string, string> = {
  confirmed: "✅ ยืนยันแล้ว",
  weakened: "⚠️ อ่อนลง",
  broken: "❌ พังแล้ว",
  "too-early": "⏳ ยังเร็วไป",
};

async function audit(user: McpUser, tool: string, detail = "") {
  await logAccess({ email: user.email, event: "mcp", path: `mcp:${tool}${detail ? ` ${detail}` : ""}`, userAgent: user.label });
}

// ---------- tools ----------

export function registerTools(server: McpServer, getUser: (ctx: unknown) => McpUser | null) {
  /** ห่อ callback: ตรวจ token + scope + log ในที่เดียว tool ด้านล่างเลยเขียนแค่ตรรกะ */
  function guarded<A>(tool: string, scope: Scope, fn: (args: A, user: McpUser) => Promise<ReturnType<typeof text>>) {
    return async (args: A, ctx: unknown) => {
      const user = getUser(ctx);
      if (!user) return fail("ไม่พบการยืนยันตัวตน — เชื่อมต่อใหม่ที่หน้า /connect");
      if (!user.scopes.includes(scope))
        return fail(`การเชื่อมต่อนี้ไม่ได้รับสิทธิ์ "${scope}" — ผู้ใช้ต้องอนุญาตใหม่ที่หน้า /connect`);
      try {
        const [out] = await Promise.all([fn(args, user), audit(user, tool, (args as { ticker?: string; slug?: string })?.ticker ?? (args as { slug?: string })?.slug ?? "")]);
        return out;
      } catch (err) {
        console.error(`[mcp] ${tool} failed:`, err);
        return fail("เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์ ลองใหม่อีกครั้ง");
      }
    };
  }

  // 1) ค้นหา / รายชื่อหุ้น ------------------------------------------------------------
  server.registerTool(
    "search_stocks",
    {
      title: "ค้นหาหุ้นที่มีรายงาน",
      description:
        "รายชื่อหุ้นที่ระบบ Tee Stock Research วิเคราะห์ไว้แล้ว พร้อมมุมมองล่าสุด (bullish/neutral/bearish), คะแนนพื้นฐาน/momentum, ระดับความเสี่ยง, วันที่ทำรายงาน และสถานะแผนจากรอบทบทวนรายสัปดาห์ล่าสุด " +
        "ใช้ก่อน get_stock_report เพื่อหา ticker ที่มี — ถ้าไม่เจอหุ้นที่ต้องการ ใช้ request_stock_analysis ได้",
      inputSchema: z.object({
        query: z.string().max(60).optional().describe("ค้นจาก ticker/ชื่อบริษัท/เซกเตอร์ เช่น 'NVDA', 'semiconductor' (เว้นว่าง = ทั้งหมด)"),
        verdict: z.enum(["bullish", "neutral", "bearish"]).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      annotations: READ,
    },
    guarded("search_stocks", "research", async ({ query, verdict, limit }, user) => {
      const [stocks, snaps, reviews] = await Promise.all([
        data.listStocksWithLatest(),
        data.listLatestSnapshots(),
        data.listLatestReviews(),
      ]);
      const analysis = new Map(snaps.map((s) => [s.stock.ticker, s.analysis]));
      const review = new Map(reviews.map((r) => [r.ticker, r]));
      const q = query?.trim().toLowerCase();
      const rows = stocks
        .filter((s) => s.latest_run_id != null && s.ticker !== "DEMO")
        .filter((s) => !q || [s.ticker, s.name, s.sector].some((v) => v?.toLowerCase().includes(q)))
        .filter((s) => !verdict || s.latest_verdict === verdict);
      if (rows.length === 0)
        return text(`ไม่พบหุ้นที่ตรงเงื่อนไข${q ? ` "${query}"` : ""} — ถ้าเป็นหุ้นที่อยากให้วิเคราะห์ ใช้ request_stock_analysis`);
      const shown = rows.slice(0, limit);
      const body = table(
        ["ticker", "บริษัท", "เซกเตอร์", "มุมมอง", "พื้นฐาน", "momentum", "เสี่ยง", "รายงาน", "ทบทวนล่าสุด"],
        shown.map((s) => {
          const a = analysis.get(s.ticker);
          const r = review.get(s.ticker);
          return [
            s.ticker,
            s.name,
            s.sector,
            s.latest_verdict,
            a?.fundamentals_score,
            a?.momentum_score,
            a?.risk_level,
            s.latest_run_date,
            r ? `${r.review_date} · ${PLAN_STATUS_LABEL[r.plan_status ?? ""] ?? r.plan_status ?? r.stance}` : "–",
          ];
        })
      );
      return text(
        `พบ ${rows.length} ตัว${rows.length > shown.length ? ` (แสดง ${shown.length})` : ""} · คะแนนเต็ม 10 · รายละเอียดเต็มใช้ get_stock_report\n\n${body}\n\nหน้าเว็บ: ${user.origin}/`
      );
    })
  );

  // 2) รายงานหุ้นรายตัว ---------------------------------------------------------------
  const SECTIONS = ["overview", "analysis", "theories", "entry_plan", "financials", "news", "review_history"] as const;
  server.registerTool(
    "get_stock_report",
    {
      title: "รายงานวิเคราะห์หุ้นรายตัว",
      description:
        "รายงานฉบับล่าสุดของหุ้น 1 ตัว เลือกได้ทีละส่วน: overview (สรุป + ผลทบทวนล่าสุด + ต้องทำอะไรไหม), analysis (มุมมอง/คะแนน/เหตุผล), " +
        "theories (ทฤษฎี + scenario bull/base/bear + ผลตรวจทฤษฎีข้อต่อข้อว่ายืนยัน/อ่อนลง/พังแล้ว), entry_plan (แผนสะสมแบ่งไม้ของทีม — เพื่อการศึกษา), " +
        "financials (ธุรกิจ/segment/งบย้อนหลัง/valuation — ยาว), news (ข่าว/เอกสารสำคัญที่ยังใช้งานพร้อมลิงก์ต้นทาง), review_history (รอบทบทวนรายสัปดาห์ย้อนหลัง) " +
        "ค่าเริ่มต้นคือ overview+analysis+theories+entry_plan — ขอ financials/news เฉพาะเมื่อต้องใช้",
      inputSchema: z.object({
        ticker: TICKER,
        sections: z.array(z.enum(SECTIONS)).min(1).optional(),
      }),
      annotations: READ,
    },
    guarded("get_stock_report", "research", async ({ ticker, sections }, user) => {
      const want = new Set(sections ?? ["overview", "analysis", "theories", "entry_plan"]);
      const [stock, runs] = await Promise.all([data.getStock(ticker), data.listRuns(ticker)]);
      if (!stock || runs.length === 0)
        return text(`ยังไม่มีรายงานของ ${ticker} ในระบบ — ใช้ search_stocks ดูตัวที่มี หรือ request_stock_analysis เพื่อขอให้วิเคราะห์`);
      const latest = runs[0];
      const [bundle, reviews, checks] = await Promise.all([
        data.getRunBundle(latest.id),
        want.has("overview") || want.has("review_history") ? data.listReviews(ticker) : Promise.resolve([]),
        want.has("theories") ? data.listThesisChecks(ticker) : Promise.resolve([] as ThesisCheck[]),
      ]);
      const { run, analysis, theories } = bundle;
      const details = parse<RunDetails>(run?.details_json) ?? {};
      const url = `${user.origin}/stock/${ticker}`;
      const out: string[] = [
        `# ${ticker} — ${stock.name}`,
        `${[stock.exchange, stock.sector, stock.currency].filter(Boolean).join(" · ")} · รายงานวันที่ ${latest.run_date} · ราคา ณ วันทำรายงาน ${num(latest.price_at_run)} ${stock.currency} · ${runs.length} รอบวิเคราะห์ · ${url}`,
      ];

      if (want.has("overview")) {
        out.push("## ภาพรวม");
        if (details.company_line) out.push(details.company_line);
        if (run?.summary_md) out.push(run.summary_md);
        if (details.stats?.length) out.push(details.stats.map((s) => `- **${s.label}**: ${s.value}${s.note ? ` (${s.note})` : ""}`).join("\n"));
        const r = reviews[0];
        if (r) {
          out.push(
            `### ทบทวนล่าสุด ${r.review_date}` +
              `\n- สถานะแผน: **${PLAN_STATUS_LABEL[r.plan_status ?? ""] ?? r.plan_status ?? "–"}** · จุดยืน: ${r.stance}` +
              (r.price_at_review != null ? ` · ราคา ${num(r.price_at_review)} (${pct(r.price_move_pct == null ? null : r.price_move_pct / 100)} จากวันทำรายงาน)` : "") +
              (r.action_md ? `\n- ต้องทำอะไรไหม: ${r.action_md}` : "") +
              `\n\n${r.review_md}` +
              (r.escalate_reason ? `\n\n**ยกธงให้วิเคราะห์ใหม่:** ${r.escalate_reason}` : "") +
              (r.data_quality_md ? `\n\n**คุณภาพข้อมูลรอบนี้:**\n${r.data_quality_md}` : "")
          );
        }
      }

      if (want.has("analysis") && analysis) {
        out.push(
          `## บทวิเคราะห์\n- มุมมอง: **${analysis.verdict}** · พื้นฐาน ${analysis.fundamentals_score ?? "–"}/10 · momentum ${analysis.momentum_score ?? "–"}/10 · ความเสี่ยง ${analysis.risk_level ?? "–"}`
        );
        const kp = list(analysis.key_points);
        if (kp.length) out.push(`**ประเด็นหลัก**\n${kp.map((k) => `- ${k}`).join("\n")}`);
        out.push(analysis.content_md);
      }

      if (want.has("theories") && theories.length) {
        // ผลตรวจล่าสุดต่อ claim (checks เรียงรอบใหม่ก่อนอยู่แล้ว)
        const latestCheck = new Map<string, ThesisCheck>();
        for (const c of checks) {
          const k = c.claim.replace(/\s+/g, " ").trim();
          if (!latestCheck.has(k)) latestCheck.set(k, c);
        }
        const withCheck = (claim: string) => {
          const c = latestCheck.get(claim.replace(/\s+/g, " ").trim());
          return c ? `${claim} — ${CHECK_LABEL[c.status] ?? c.status}${c.evidence_md ? `: ${clip(c.evidence_md, 280)}` : ""}` : claim;
        };
        out.push("## ทฤษฎี");
        for (const t of theories) {
          const sc = parse<Record<string, { target?: number; probability?: number; rationale?: string }>>(t.scenarios);
          out.push(
            `### ${t.title}\nความมั่นใจ ${t.confidence ?? "–"}/100 · กรอบเวลา ${t.horizon ?? "–"}\n\n${t.thesis_md}` +
              (list(t.assumptions).length ? `\n\n**สมมุติฐาน**\n${list(t.assumptions).map((a) => `- ${withCheck(a)}`).join("\n")}` : "") +
              (list(t.catalysts).length ? `\n\n**ปัจจัยกระตุ้น**\n${list(t.catalysts).map((a) => `- ${withCheck(a)}`).join("\n")}` : "") +
              (list(t.risks).length ? `\n\n**ความเสี่ยง** (✅ = ความเสี่ยงเกิดขึ้นจริง)\n${list(t.risks).map((a) => `- ${withCheck(a)}`).join("\n")}` : "") +
              (sc
                ? `\n\n**Scenario**\n${(["bull", "base", "bear"] as const)
                    .filter((k) => sc[k])
                    .map((k) => `- ${k}: เป้า ${num(sc[k].target)} · โอกาส ${sc[k].probability ?? "–"}%${sc[k].rationale ? ` — ${clip(sc[k].rationale, 300)}` : ""}`)
                    .join("\n")}`
                : "")
          );
        }
      }

      if (want.has("entry_plan")) {
        const plan = parse<EntryPlan>(latest.entry_plan_json);
        if (plan) {
          out.push(
            "## แผนสะสมแบ่งไม้ (ความเห็นเชิงกลยุทธ์ของทีม theorist เพื่อการศึกษา ไม่ใช่คำสั่งซื้อขาย)" +
              (plan.stance_md ? `\n${plan.stance_md}` : "") +
              (plan.tranches?.length
                ? `\n\n${table(
                    ["ไม้", "ช่วงราคา", "สัดส่วน", "เงื่อนไข", "เหตุผล"],
                    plan.tranches.map((t) => [t.level, t.price_range, t.allocation, t.trigger, clip(t.rationale, 200)])
                  )}`
                : "") +
              (plan.invalidation_md ? `\n\n**แผนใช้ไม่ได้เมื่อ:** ${plan.invalidation_md}` : "")
          );
        }
      }

      if (want.has("financials")) {
        out.push("## ธุรกิจและงบการเงิน");
        if (details.business_md) out.push(details.business_md);
        if (details.segments?.length)
          out.push(
            table(
              ["segment", "รายได้", "สัดส่วน", "YoY", "margin"],
              details.segments.map((s) => [s.name, s.revenue, s.share, s.yoy, s.margin_pct != null ? `${s.margin_pct}% ${s.margin_label ?? ""}` : "–"])
            )
          );
        for (const [t, title] of [
          [details.pl_history, "งบกำไรขาดทุนย้อนหลัง"],
          [details.balance_history, "งบดุลย้อนหลัง"],
        ] as const) {
          const s = finTable(t, title);
          if (s) out.push(s);
        }
        if (details.pl_note_md) out.push(details.pl_note_md);
        if (details.cashflow_kv?.length) out.push(`**กระแสเงินสด**\n${details.cashflow_kv.map((c) => `- ${c.k}: ${c.v}`).join("\n")}`);
        if (details.latest_quarter_md) out.push(`**ไตรมาสล่าสุด**\n${details.latest_quarter_md}`);
        if (details.guidance?.rows?.length)
          out.push(`**Guidance**\n\n${table(details.guidance.columns, details.guidance.rows.map((r) => [r.label, ...r.values]))}`);
        if (details.valuation_md) out.push(`**Valuation**\n${details.valuation_md}`);
        if (details.drivers?.length) out.push(`**ตัวขับเคลื่อน**\n${details.drivers.map((d) => `- ${d}`).join("\n")}`);
        if (details.risks?.length) out.push(`**ความเสี่ยงเชิงธุรกิจ**\n${details.risks.map((d) => `- ${d}`).join("\n")}`);
      }

      if (want.has("news")) {
        const items = (await data.listActiveItems(ticker))
          .sort((a, b) => b.importance - a.importance || (b.published_at ?? "").localeCompare(a.published_at ?? ""))
          .slice(0, 15);
        out.push(
          `## ข่าว/เอกสารสำคัญ (${items.length} รายการที่ยังใช้งาน เรียงตามความสำคัญ)\n` +
            items
              .map((i) => `- **${i.title}** (${[i.source, i.published_at?.slice(0, 10), `สำคัญ ${i.importance}/5`].filter(Boolean).join(" · ")})${i.url ? ` ${i.url}` : ""}\n  ${clip(i.content_md, 400)}`)
              .join("\n")
        );
      }

      if (want.has("review_history")) {
        out.push(
          `## ประวัติรอบทบทวน\n` +
            (reviews.length
              ? table(
                  ["วันที่", "จุดยืน", "สถานะแผน", "ราคาขยับ", "ต้องทำอะไรไหม"],
                  reviews.slice(0, 8).map((r) => [r.review_date, r.stance, PLAN_STATUS_LABEL[r.plan_status ?? ""] ?? r.plan_status, pct(r.price_move_pct == null ? null : r.price_move_pct / 100), clip(r.action_md, 160)])
                )
              : "ยังไม่มีรอบทบทวน")
        );
      }

      return text(out.join("\n\n") + DISCLAIMER);
    })
  );

  // 3) จัดอันดับราคา -----------------------------------------------------------------
  server.registerTool(
    "rank_by_price",
    {
      title: "จัดอันดับหุ้นที่ราคาน่าสนใจตอนนี้",
      description:
        "จัดอันดับหุ้นในระบบด้วยราคาตลาดล่าสุด (Yahoo, หน่วง ~2 นาที) เทียบกับเป้า scenario และแผนสะสมแบ่งไม้ในรายงาน — สูตรเดียวกับหน้า /best-price " +
        "คะแนนสูง = ราคาปัจจุบันห่างจากเป้าถ่วงความน่าจะเป็นมาก/อยู่ในโซนของแผน ไม่ได้แปลว่าควรซื้อ แถวที่ stale = ราคาขยับมากจนรายงานเริ่มเก่า",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(10),
        sector: z.string().max(60).optional().describe("กรองเซกเตอร์ (ค้นแบบมีคำนี้อยู่)"),
      }),
      annotations: { ...READ, idempotentHint: false, openWorldHint: true },
    },
    guarded("rank_by_price", "research", async ({ limit, sector }, user) => {
      const snaps = (await data.listLatestSnapshots()).filter(
        (s) => s.stock.ticker !== "DEMO" && (!sector || s.stock.sector?.toLowerCase().includes(sector.toLowerCase()))
      );
      const quotes = await getQuotes(snaps.map((s) => s.stock.ticker));
      const ranked = rankByPrice(snaps, quotes).slice(0, limit);
      if (ranked.length === 0) return text("ไม่มีหุ้นที่จัดอันดับได้ตามเงื่อนไขนี้");
      const row = (r: PriceRank, i: number) => [
        i + 1,
        r.ticker,
        Math.round(r.score),
        `${num(r.price)}${r.priceSource === "run" ? " (ราคาวันทำรายงาน)" : ""}`,
        pct(r.upsidePct),
        `${num(r.bearTarget)} / ${num(r.baseTarget)} / ${num(r.bullTarget)}`,
        entryLabel(r.entry),
        r.verdict,
        r.riskLevel,
        r.stale ? `⚠️ ${pct(r.moveSinceRunPct)} จากวันรายงาน ${r.runDate}` : r.runDate,
      ];
      return text(
        `อันดับตามราคา ณ ตอนนี้ (${ranked.filter((r) => r.priceSource === "live").length}/${ranked.length} ตัวได้ราคาสด)\n\n` +
          table(["#", "ticker", "คะแนน", "ราคา", "ถึงเป้าถ่วงน้ำหนัก", "เป้า bear/base/bull", "แผนแบ่งไม้", "มุมมอง", "เสี่ยง", "รายงาน"], ranked.map(row)) +
          `\n\n**วิธีคิดคะแนน (0-100):** ${WEIGHTS.map((w) => `${w.label} ${Math.round(w.weight * 100)}%`).join(" · ")}` +
          `\n\nหน้าเว็บ: ${user.origin}/best-price` +
          DISCLAIMER
      );
    })
  );

  // 4) insights ----------------------------------------------------------------------
  server.registerTool(
    "list_insights",
    {
      title: "รายการ insight ระดับอุตสาหกรรม/มหภาค",
      description:
        "Insight (hint) คือประเด็นที่กระทบกว้างกว่าหุ้นตัวเดียว (เชิงระบบการเงิน/ทั้งเซกเตอร์/มหภาค/กฎระเบียบ) ทั้งด้านโอกาส (positive) และความเสี่ยง (negative) " +
        "พร้อมรายชื่อหุ้นที่รายงานล่าสุดนำ insight นั้นไปคิดแล้ว — insight ที่ปิดแล้ว (played-out/invalidated) ไม่ควรใช้ปรับมุมมองหุ้นอีก",
      inputSchema: z.object({
        status: z.enum(["active", "closed", "all"]).default("active"),
        direction: z.enum(["positive", "negative", "mixed"]).optional(),
      }),
      annotations: READ,
    },
    guarded("list_insights", "research", async ({ status, direction }, user) => {
      const [hints, exposure] = await Promise.all([data.listHints(), data.listLatestRunInsightSlugs()]);
      const bySlug = new Map<string, string[]>();
      for (const [t, slugs] of Object.entries(exposure)) for (const s of slugs) bySlug.set(s, [...(bySlug.get(s) ?? []), t]);
      const rows = hints
        .filter((h) => status === "all" || (status === "active") === isActiveHint(h.status))
        .filter((h) => !direction || h.direction === direction)
        .sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0) || b.run_date.localeCompare(a.run_date));
      if (rows.length === 0) return text("ไม่มี insight ตามเงื่อนไขนี้");
      return text(
        table(
          ["slug", "หัวข้อ", "ทิศทาง", "ขนาด", "impact", "วันที่", "สถานะ", "หุ้นที่นำไปคิดแล้ว"],
          rows.map((h) => [h.slug, `${h.title}${h.dek ? ` — ${clip(h.dek, 120)}` : ""}`, h.direction, h.magnitude, h.impact_score, h.run_date, HINT_STATUS_LABEL[h.status ?? "active"], (bySlug.get(h.slug) ?? []).join(", ") || "–"])
        ) + `\n\nรายละเอียดใช้ get_insight · หน้าเว็บ: ${user.origin}/insights`
      );
    })
  );

  server.registerTool(
    "get_insight",
    {
      title: "รายงาน insight ฉบับเต็ม",
      description: "รายงาน insight 1 เรื่อง: สรุปภาษาคน, ตัวเลขสำคัญ, ศัพท์ที่ต้องรู้, เนื้อหาเต็ม, สถานะล่าสุด (ยังมีผล/เกิดครบแล้ว/ถูกหักล้าง) และแหล่งอ้างอิง",
      inputSchema: z.object({ slug: z.string().regex(/^[a-z0-9-]{1,120}$/).describe("จาก list_insights") }),
      annotations: READ,
    },
    guarded("get_insight", "research", async ({ slug }, user) => {
      const [h, exposure] = await Promise.all([data.getHint(slug), data.listLatestRunInsightSlugs()]);
      if (!h) return text(`ไม่พบ insight "${slug}" — ใช้ list_insights ดูรายการ`);
      return text(formatInsight(h, exposure, user.origin) + DISCLAIMER);
    })
  );

  // 5) track record ------------------------------------------------------------------
  server.registerTool(
    "get_track_record",
    {
      title: "ทฤษฎีที่เคยตั้งไว้แม่นแค่ไหน",
      description:
        "สถิติความแม่นของทฤษฎีในระบบ ตัดสินจากหลักฐาน (ไม่ใช้ราคา) โดยทีม reviewer: สัดส่วนที่ยืนยัน/อ่อนลง/พัง และความมั่นใจที่ประกาศไว้เชื่อได้แค่ไหน " +
        "ใส่ ticker เพื่อดูผลตรวจรายข้อของหุ้นตัวนั้น — ใช้ประกอบการตัดสินว่าจะเชื่อรายงานของระบบนี้มากน้อยแค่ไหน",
      inputSchema: z.object({ ticker: TICKER.optional() }),
      annotations: READ,
    },
    guarded("get_track_record", "research", async ({ ticker }, user) => {
      const rows = (await data.listTrackRecordRows()).filter((r) => !ticker || r.ticker === ticker);
      if (rows.length === 0) return text(ticker ? `${ticker} ยังไม่มีผลตรวจทฤษฎี` : "ยังไม่มีผลตรวจทฤษฎี");
      const thesis = rows.filter(isThesisClaim);
      const risks = rows.filter((r) => !isThesisClaim(r));
      const fmt = (t: Tally) =>
        `${t.total} ข้อ · ยืนยัน ${t.counts.confirmed} · อ่อนลง ${t.counts.weakened} · พัง ${t.counts.broken} · ยังเร็วไป ${t.counts["too-early"]}` +
        (t.confirmRate != null ? ` · อัตรายืนยัน ${Math.round(t.confirmRate * 100)}% ของข้อที่รู้ผล` : "") +
        (t.avgConfidence != null ? ` (ความมั่นใจเฉลี่ยที่ประกาศ ${Math.round(t.avgConfidence * 100)}%)` : "");
      const out = [
        `# Track record${ticker ? ` — ${ticker}` : " ทั้งระบบ"}`,
        `**ทฤษฎี (สมมุติฐาน + ปัจจัยกระตุ้น):** ${fmt(tally(thesis))}`,
        `**ความเสี่ยงที่เตือนไว้** (ยืนยัน = เรื่องร้ายเกิดจริง): ${fmt(tally(risks))}`,
      ];
      if (!ticker) {
        const v = calibrationVerdict(thesis);
        out.push(`**ความมั่นใจเชื่อได้ไหม:** ${v.answer} — ${v.detail}`);
        out.push(table(["ความมั่นใจ", "ผล"], byConfidence(thesis).map((g) => [g.label, fmt(g.tally)])));
      } else {
        out.push(
          rows
            .map(
              (r) =>
                `- [${r.claim_type}] ${CHECK_LABEL[r.status] ?? r.status} (${r.review_date}) ${r.claim}` +
                (r.because_md ? `\n  เพราะ: ${r.because_md}` : r.evidence_md ? `\n  หลักฐาน: ${clip(r.evidence_md, 300)}` : "") +
                (r.so_md ? `\n  ส่งผลให้: ${r.so_md}` : "")
            )
            .join("\n")
        );
      }
      out.push(`หน้าเว็บ: ${user.origin}/track-record`);
      return text(out.join("\n\n"));
    })
  );

  // 6) บัญชีของผู้ใช้ (scope account) ------------------------------------------------------
  server.registerTool(
    "get_my_watchlist",
    {
      title: "หุ้นที่ฉันติดตาม + ต้องทำอะไรไหม",
      description:
        "หุ้นที่ผู้ใช้ (เจ้าของการเชื่อมต่อนี้) กดติดตามไว้ พร้อมสรุปก่อนเปิดตลาด: สถานะแผนจากรอบทบทวนล่าสุด, 'ต้องทำอะไรไหม', ราคาสดเทียบแผนแบ่งไม้ และ insight ที่รายงานนำไปคิดแล้ว " +
        "เรียงตัวที่มีความเคลื่อนไหว (แผนพัง/เข้าโซน) ขึ้นก่อน",
      inputSchema: z.object({}),
      annotations: { ...READ, openWorldHint: true },
    },
    guarded("get_my_watchlist", "account", async (_args: Record<string, never>, user) => {
      const tickers = await listWatchTickers(user.email);
      if (tickers.length === 0) return text(`ยังไม่ได้ติดตามหุ้นตัวไหน — ใช้ update_watchlist เพื่อเพิ่ม หรือกด ☆ บนเว็บ ${user.origin}`);
      const [snaps, reviews, exposure] = await Promise.all([data.listLatestSnapshots(), data.listLatestReviews(), data.listLatestRunInsightSlugs()]);
      const mine = snaps.filter((s) => tickers.includes(s.stock.ticker));
      const quotes = await getQuotes(mine.map((s) => s.stock.ticker));
      const rank = new Map(rankByPrice(mine, quotes).map((r) => [r.ticker, r]));
      const review = new Map(reviews.map((r) => [r.ticker, r]));
      const ORDER = ["plan-broken", "plan-live", "watch", "no-action"];
      const sorted = [...tickers].sort((a, b) => {
        const ia = ORDER.indexOf(review.get(a)?.plan_status ?? "");
        const ib = ORDER.indexOf(review.get(b)?.plan_status ?? "");
        return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
      });
      const blocks = sorted.map((t) => {
        const r = review.get(t);
        const p = rank.get(t);
        const snap = mine.find((s) => s.stock.ticker === t);
        return (
          `### ${t}${snap ? ` — ${snap.stock.name}` : ""}\n` +
          `- มุมมอง: ${snap?.analysis?.verdict ?? "–"} · รายงาน ${snap?.run.run_date ?? "–"}` +
          (p ? `\n- ราคา ${num(p.price)} (${p.priceSource === "live" ? `วันนี้ ${pct(p.dayChangePct)}` : "ราคาวันทำรายงาน"}) · แผนแบ่งไม้: ${entryLabel(p.entry)} · ถึงเป้าถ่วงน้ำหนัก ${pct(p.upsidePct)}${p.stale ? " · ⚠️ ราคาขยับมากจากวันทำรายงาน" : ""}` : "") +
          (r
            ? `\n- ทบทวนล่าสุด ${r.review_date}: **${PLAN_STATUS_LABEL[r.plan_status ?? ""] ?? r.plan_status ?? r.stance}**${r.action_md ? `\n- ต้องทำอะไรไหม: ${r.action_md}` : ""}`
            : "\n- ยังไม่มีรอบทบทวน") +
          (exposure[t]?.length ? `\n- insight ที่นำไปคิดแล้ว: ${exposure[t].join(", ")}` : "") +
          `\n- ${user.origin}/stock/${t}`
        );
      });
      return text(`# หุ้นที่ติดตาม (${tickers.length})\n\n${blocks.join("\n\n")}` + DISCLAIMER);
    })
  );

  server.registerTool(
    "update_watchlist",
    {
      title: "เพิ่ม/เอาออกจากหุ้นที่ติดตาม",
      description: "เพิ่มหรือเอาหุ้นออกจาก watchlist ของผู้ใช้ (มีผลกับหน้า /watchlist บนเว็บด้วย) — ใช้ได้เฉพาะหุ้นที่มีรายงานในระบบ",
      inputSchema: z.object({ ticker: TICKER, action: z.enum(["add", "remove"]) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guarded("update_watchlist", "account", async ({ ticker, action }, user) => {
      if (!(await data.getStock(ticker))) return text(`${ticker} ยังไม่มีในระบบ ติดตามไม่ได้ — ใช้ request_stock_analysis เพื่อขอให้วิเคราะห์`);
      await setWatch(user.email, ticker, action === "add");
      return text(action === "add" ? `ติดตาม ${ticker} แล้ว` : `เลิกติดตาม ${ticker} แล้ว`);
    })
  );

  server.registerTool(
    "request_stock_analysis",
    {
      title: "ขอให้วิเคราะห์หุ้นที่ยังไม่มี",
      description:
        `ส่งคำขอให้ทีมวิเคราะห์หุ้นที่ยังไม่มีในระบบ ในชื่อผู้ใช้ — ไม่ได้วิเคราะห์ทันที ทีมเลือกทำตามจำนวนคนขอ (ใช้เวลาเป็นวัน ไม่รับประกันว่าจะทำ) ` +
        `ค้างได้สูงสุด ${MAX_OPEN_REQUESTS_PER_USER} ตัวต่อคน · ไม่ใส่ ticker = ดูคำขอของตัวเองทั้งหมด`,
      inputSchema: z.object({
        ticker: TICKER.optional(),
        note: z.string().max(200).optional().describe("เหตุผลสั้นๆ ว่าทำไมสนใจ (ไม่บังคับ)"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guarded("request_stock_analysis", "account", async ({ ticker, note }, user) => {
      if (ticker) {
        if (await data.getStock(ticker)) return text(`${ticker} มีรายงานในระบบแล้ว — ใช้ get_stock_report ได้เลย`);
        if ((await countOpenRequests(user.email)) >= MAX_OPEN_REQUESTS_PER_USER)
          return text(`ขอค้างไว้ครบ ${MAX_OPEN_REQUESTS_PER_USER} ตัวแล้ว — รอให้ตัวที่ขอไว้ถูกวิเคราะห์ก่อน`);
        const r = await addRequest(user.email, ticker, note?.trim() || null);
        if (r === "duplicate") return text(`เคยขอ ${ticker} ไว้แล้ว`);
      }
      const mine = await listMyRequests(user.email);
      return text(
        (ticker ? `ส่งคำขอ ${ticker} แล้ว\n\n` : "") +
          (mine.length
            ? table(["ticker", "สถานะ", "ขอเมื่อ"], mine.map((r) => [r.ticker, r.in_system ? "มีรายงานแล้ว" : "รอวิเคราะห์", r.created_at.slice(0, 10)]))
            : "ยังไม่เคยส่งคำขอ")
      );
    })
  );
}

function formatInsight(h: Hint, exposure: Record<string, string[]>, origin: string): string {
  const stats = parse<HintStat[]>(h.stats_json) ?? [];
  const glossary = parse<HintGlossaryTerm[]>(h.glossary_json) ?? [];
  const sources = parse<HintSource[]>(h.sources_json) ?? [];
  const visuals = new Map((parse<HintVisual[]>(h.visuals_json) ?? []).map((v) => [v.id, v]));
  const tickers = Object.entries(exposure).filter(([, s]) => s.includes(h.slug)).map(([t]) => t);
  // ภาพวาดบนเว็บจาก JSON — agent เห็นภาพไม่ได้ แทน marker ด้วย "อ่านภาพ" ที่เขียนไว้ให้คนอยู่แล้ว
  const content = h.content_md.replace(/^\[\[visual:([^\]]+)\]\]\s*$/gm, (_m, id: string) => {
    const v = visuals.get(id.trim());
    return v ? `> ภาพประกอบ: ${v.title} — ${v.read_md}` : "";
  });
  const status = h.status ?? "active";
  return [
    `# ${h.title}`,
    `${h.dek ?? ""}`,
    `ทิศทาง ${h.direction ?? "–"} · ขนาด ${h.magnitude ?? "–"} · impact ${h.impact_score ?? "–"}/100 · วันที่ ${h.run_date} · เจอระหว่างวิเคราะห์ ${h.discovered_from ?? "–"} · ${origin}/insights/${h.slug}`,
    `**สถานะ: ${HINT_STATUS_LABEL[status] ?? status}**${h.last_checked_on ? ` (ตรวจล่าสุด ${h.last_checked_on})` : ""}${h.status_md ? ` — ${h.status_md}` : ""}` +
      (isActiveHint(status) ? "" : "\n⚠️ insight นี้ปิดแล้ว — เก็บไว้เป็นประวัติ ไม่ควรใช้ปรับมุมมองหุ้นอีก"),
    h.tldr_md ? `## สรุป\n${h.tldr_md}` : "",
    stats.length ? `## ตัวเลขสำคัญ\n${stats.map((s) => `- **${s.label}**: ${s.value}${s.note ? ` (${s.note})` : ""}`).join("\n")}` : "",
    glossary.length ? `## ศัพท์\n${glossary.map((g) => `- **${g.term}**: ${g.meaning_md}`).join("\n")}` : "",
    `## เนื้อหา\n${content}`,
    h.opinion_md ? `## ความเห็นผู้เขียน\n${h.opinion_md}` : "",
    tickers.length ? `## หุ้นที่รายงานล่าสุดนำ insight นี้ไปคิดแล้ว\n${tickers.join(", ")}` : "",
    sources.length ? `## แหล่งอ้างอิง\n${sources.map((s) => `- [${s.group}] ${s.title} ${s.url}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const SERVER_INSTRUCTIONS = `Tee Stock Research — คลังรายงานวิเคราะห์หุ้น (ส่วนใหญ่หุ้นสหรัฐฯ) ที่ผลิตโดย pipeline หลาย agent: research → ตรวจข้อมูล → analyze → theorize → ตรวจภาษา แล้วทบทวนทุกสัปดาห์ด้วยหลักฐานใหม่
เนื้อหาเป็นภาษาไทย (ศัพท์เทคนิคอังกฤษ) ถ้าผู้ใช้ถามภาษาอื่นให้แปล/สรุปให้

วิธีใช้ที่แนะนำ:
- หาตัวที่มี: search_stocks → อ่าน: get_stock_report (เริ่มจาก section ค่าเริ่มต้น ขอ financials/news เฉพาะเมื่อต้องใช้)
- "ตัวไหนราคาน่าสนใจ": rank_by_price · ประเด็นทั้งอุตสาหกรรม: list_insights → get_insight
- ก่อนเชื่อรายงาน: get_track_record บอกว่าทฤษฎีของระบบแม่นแค่ไหน
- เรื่องของผู้ใช้เอง: get_my_watchlist / update_watchlist / request_stock_analysis

กติกาเวลาเอาไปตอบผู้ใช้:
- เป็นข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน อย่าแปลง "แผนสะสมแบ่งไม้" หรืออันดับราคาเป็นคำสั่งซื้อขาย
- บอกวันที่ของรายงานเสมอ — ความเห็นเป็น ณ วันนั้น ราคาหลังจากนั้นไม่ใช่หลักฐานว่าทฤษฎีถูก/ผิด
- อ้างลิงก์หน้าเว็บที่แนบมาในผลลัพธ์ เพื่อให้ผู้ใช้ตรวจต้นทางได้
- อย่าแต่งตัวเลขที่ไม่มีในผลลัพธ์ ถ้าไม่มีข้อมูลให้บอกตรงๆ`;
