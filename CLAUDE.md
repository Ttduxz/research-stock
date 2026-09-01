# Tee Stock Research

ระบบวิเคราะห์หุ้นแบบ multi-agent pipeline: Claude Code เป็น orchestrator + ทีม agent 3 ทีม เขียนผลลง DB (libSQL/Turso) แล้วอ่านผ่านเว็บ Next.js ที่ deploy บน Vercel

## โครงสร้าง

- `app/` — Next.js (App Router) หน้าเว็บอ่านอย่างเดียว: `/` รายชื่อหุ้น, `/stock/[ticker]` รายละเอียด, `/insights` + `/insights/[slug]` รายงาน hint
- `lib/db.ts` — client + query ทั้งหมด (Turso ผ่าน env, fallback ไฟล์ `data/stock.db`)
- `scripts/` — `init-db.mjs` (สร้าง schema), `ingest.mjs` (นำ bundle.json ลง DB), `ingest-hint.mjs` (นำ hint.json ลง DB), `list-hints.mjs` (list hint — กัน dedup ตอนหาต้นทาง 30 วัน / หา exposure ตอนดูย้อนหลังยาว), `get-hint.mjs <slug>` (ดึง hint เดียวแบบเต็ม), `seed-demo.mjs`, `schema.mjs` (นิยาม schema — แก้ที่นี่ที่เดียว)
- `.claude/agents/` — ทีม: `stock-researcher` (research), `stock-analyst` (analyze), `stock-theorist` (theorie), `hint-analyst` (วิเคราะห์ hint แยก — ดูหัวข้อ "Hint" ด้านล่าง)
- `.claude/commands/research-stock.md` — `/research-stock <TICKER>` รัน pipeline เต็ม (รวมขั้นเช็ค hint)
- `pipeline/output/` — ไฟล์กลางของแต่ละ run (gitignored), `pipeline/examples/demo-bundle.json` — ตัวอย่างรูปแบบ bundle

## Hint / Insights

ระหว่าง research หุ้นตัวหนึ่ง ถ้าทีม research เจอประเด็นที่ **กระทบกว้างกว่าหุ้นตัวนั้น** (เชิงระบบการเงิน/อุตสาหกรรมทั้งเซกเตอร์/มหภาค/กฎระเบียบ) และมั่นใจสูงว่าสำคัญพอ — `stock-researcher` จะ flag ไว้ใน field `hints` ของ `research.json` (เกณฑ์และ schema ดู spec ของ agent) จากนั้น `/research-stock` จะเช็ค dedup กับ `hints` ในสัปดาห์ที่ผ่านมา แล้วถ้าไม่ซ้ำจะสั่ง agent `hint-analyst` (model: **fable**) ค้นเพิ่ม+วิเคราะห์ลึกแยกเป็นรายงานของตัวเอง บันทึกลงตาราง `hints` แสดงที่ `/insights/<slug>`

ผลคือถ้าสั่งวิเคราะห์ N ticker จะได้ N รายงานหุ้นปกติ **บวก** X รายงาน hint (X มักเป็น 0 — ตั้งเกณฑ์ไว้สูงตั้งใจ ไม่ใช่ flag ทุกข่าวที่เจอ)

นอกจากสร้าง hint ใหม่ `/research-stock` ยังเช็คย้อนกลับด้วยว่าหุ้นที่กำลัง research ตัวนี้**เกี่ยวข้อง/อาจได้รับผลกระทบ**จาก hint ที่มีอยู่แล้วหรือไม่ (ขั้น 2.6 — ไม่ว่า hint นั้นจะเจอวันนี้หรือก่อนหน้า) ถ้าใช่ analyst/theorist จะใส่มุมมองความเสี่ยงเชิงระบบ/การบริหารความเสี่ยงที่เชื่อมโยงไปยัง `/insights/<slug>` ไว้ในรายงานหุ้นตัวนั้นด้วย

## กติกาสำคัญ

- **โมเดลทีม agent (ห้าม override):** researcher=sonnet, analyst+theorist=opus, hint-analyst=fable (กำหนดใน `.claude/agents/*.md` แล้ว) — hint-analyst รันเฉพาะตอนมี hint ที่ผ่านเกณฑ์จริงเท่านั้น ไม่ใช่ทุก ticker; นอกเหนือจากนี้ใช้ Fable เฉพาะเมื่อ user สั่ง "วิเคราะห์แบบลึกสุด" เป็นรายตัว; รัน batch หลาย ticker ให้ทำใน session ใหม่ และลดการโพสต์สถานะระหว่างรอ agent

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
- ingest / ingest-hint เขียนตรงขึ้น Turso → เว็บ production อัปเดตทันที **ไม่ต้องรัน `npm run deploy`** (ขั้น 6.5 ของ `/research-stock` ข้ามได้ — deploy เฉพาะตอนแก้โค้ด/UI เช่นหน้า `/insights` นี้)
- ไฟล์ `data/stock.db` เป็นข้อมูลเก่าก่อน migrate (สำรองไว้); โหมด snapshot (`data/export.json`) ยังเป็น fallback ถ้า env หาย
