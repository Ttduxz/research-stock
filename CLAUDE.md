# Tee Stock Research

ระบบวิเคราะห์หุ้นแบบ multi-agent pipeline: Claude Code เป็น orchestrator + ทีม agent 3 ทีม เขียนผลลง DB (libSQL/Turso) แล้วอ่านผ่านเว็บ Next.js ที่ deploy บน Vercel

## โครงสร้าง

- `app/` — Next.js (App Router) หน้าเว็บอ่านอย่างเดียว: `/` รายชื่อหุ้น, `/stock/[ticker]` รายละเอียด
- `lib/db.ts` — client + query ทั้งหมด (Turso ผ่าน env, fallback ไฟล์ `data/stock.db`)
- `scripts/` — `init-db.mjs` (สร้าง schema), `ingest.mjs` (นำ bundle.json ลง DB), `seed-demo.mjs`, `schema.mjs` (นิยาม schema — แก้ที่นี่ที่เดียว)
- `.claude/agents/` — ทีม: `stock-researcher` (research), `stock-analyst` (analyze), `stock-theorist` (theorie)
- `.claude/commands/research-stock.md` — `/research-stock <TICKER>` รัน pipeline เต็ม
- `pipeline/output/` — ไฟล์กลางของแต่ละ run (gitignored), `pipeline/examples/demo-bundle.json` — ตัวอย่างรูปแบบ bundle

## กติกาสำคัญ

- ข้อมูลหุ้นทุกชิ้นต้องมาจากการค้นเว็บจริง **ห้ามแต่งตัวเลข/ข่าว** — ticker `DEMO` เท่านั้นที่เป็นข้อมูลสมมุติ
- ตอบ user และเขียนเนื้อหาลง DB เป็นภาษาไทย (ศัพท์เทคนิค/ชื่อเฉพาะเป็นอังกฤษได้)
- แก้ schema: แก้ `scripts/schema.mjs` + types ใน `lib/db.ts` ให้ตรงกัน (ใช้ CREATE TABLE IF NOT EXISTS — ตารางเดิมต้อง migrate เอง)
- เนื้อหาวิเคราะห์เป็นการศึกษา ไม่ใช่คำแนะนำการลงทุน — ห้ามสั่งซื้อขายจริงทุกกรณี

## คำสั่งที่ใช้บ่อย

```
npm run dev        # dev server
npm run build      # ตรวจ build
npm run db:init    # สร้าง schema
npm run ingest -- <bundle.json>
npm run deploy     # export snapshot + deploy production (Vercel CLI ต้อง login แล้ว)
```

## Deployment

- Vercel project: `ttduxzs-projects/tee-stock-research` (link ไว้แล้วใน `.vercel/`)
- โหมดข้อมูลปัจจุบัน: **Turso cloud** (ตั้งแต่ 2026-09-01) — DB `tee-stock` org `duxz` region aws-us-east-1; env อยู่ใน `.env` (local, gitignored) และ Vercel Production
- ingest เขียนตรงขึ้น Turso → เว็บ production อัปเดตทันที **ไม่ต้องรัน `npm run deploy`** (ขั้น 6.5 ของ `/research-stock` ข้ามได้ — deploy เฉพาะตอนแก้โค้ด/UI)
- ไฟล์ `data/stock.db` เป็นข้อมูลเก่าก่อน migrate (สำรองไว้); โหมด snapshot (`data/export.json`) ยังเป็น fallback ถ้า env หาย
