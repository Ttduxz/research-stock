# Tee Stock Research

ระบบวิเคราะห์หุ้นแบบ multi-agent pipeline: Claude Code เป็น orchestrator + ทีม agent 3 ทีม เขียนผลลง DB (libSQL/Turso) แล้วอ่านผ่านเว็บ Next.js ที่ deploy บน Vercel

## โครงสร้าง

- `app/` — Next.js (App Router) หน้าเว็บอ่านอย่างเดียว: `/` รายชื่อหุ้น, `/stock/[ticker]` รายละเอียด, `/insights` + `/insights/[slug]` รายงาน hint, `/best-price` จัดอันดับหุ้นที่ราคาน่าสนใจที่สุด (คำนวณจาก `lib/ranking.ts` — ไม่มีข้อมูลใหม่ ใช้เฉพาะที่มีใน DB), `/track-record` ทฤษฎีแม่นแค่ไหน (สถิติจาก `thesis_checks` ผ่าน `lib/track-record.ts` — ไม่ใช้ราคา; risk นับแยกเพราะ risk ที่ "ยืนยัน" คือเรื่องร้ายเกิดจริง) + การ์ด "เคยบอกว่าถ้า → จะส่งผล / ตอนนี้ เพราะ → ส่งผลให้" ทุกข้อ
- `lib/db.ts` — client + query ทั้งหมด (Turso ผ่าน env, fallback ไฟล์ `data/stock.db`)
- `scripts/` — `init-db.mjs` (สร้าง schema), `ingest.mjs` (นำ bundle.json ลง DB), `ingest-hint.mjs` (นำ hint.json ลง DB), `list-hints.mjs` (list hint — กัน dedup ตอนหาต้นทาง 30 วัน / หา exposure ตอนดูย้อนหลังยาว), `get-hint.mjs <slug>` (ดึง hint เดียวแบบเต็ม), `seed-demo.mjs`, `schema.mjs` (นิยาม schema — แก้ที่นี่ที่เดียว)
- `scripts/` (รอบติดตาม) — `prev-context.mjs <TICKER>` (ความจำของรอบก่อนแบบกระชับ), `price-delta.mjs [--due] [--json]` (ราคาจริงเทียบแผน + เกณฑ์แข็ง ไม่ใช้ agent), `ingest-review.mjs` (บันทึกผลทบทวน + ตรวจความซื่อสัตย์ของ claim + บังคับคำอธิบาย 4 ช่อง `if_md/then_md/because_md/so_md` และ `impact` = good/bad/mixed ต่อหุ้นสำหรับข้อที่รู้ผลแล้ว — สีการ์ด risk ใช้ impact เพราะ risk บางข้อคือ "ความเสี่ยงที่ทฤษฎีจะผิด" ซึ่งเกิดจริงแล้วดีต่อหุ้น เดาจาก status ไม่ได้), `explain-checks.mjs export|export-impact|apply` (เติมคำอธิบาย 4 ช่อง/impact ให้ผลตรวจเก่าที่ยังไม่มี — ใช้แค่ข้อความใน DB, then_md ต้องมาจากทฤษฎีเดิม), `items.mjs` (คลัง item ระดับ ticker), `archive-items.mjs` / `dedupe-items.mjs` (ดูแลอายุข่าว), `quotes.mjs` (ราคาฝั่ง node)
- `.claude/agents/` — ทีม: `stock-researcher` (research), `stock-analyst` (analyze), `stock-theorist` (theorie), `stock-reviewer` (ทบทวนรายสัปดาห์ — ดูหัวข้อ "รอบติดตาม" ด้านล่าง), `hint-analyst` (วิเคราะห์ hint แยก — ดูหัวข้อ "Hint" ด้านล่าง)
- `.claude/commands/research-stock.md` — `/research-stock <TICKER>` รัน pipeline เต็ม (รวมขั้นเช็ค hint)
- `.claude/commands/review-stock.md` / `review-week.md` — `/review-stock <TICKER>` รอบติดตาม 1 ตัว, `/review-week` ทำคิวทั้งสัปดาห์จบในคำสั่งเดียว (orchestrator ห้ามอ่านไฟล์ JSON เอง ส่งแค่ path ให้ agent — ทำให้ 29 ticker กิน context ~30k จบใน session เดียว)
- `pipeline/output/` — ไฟล์กลางของแต่ละ run (gitignored), `pipeline/examples/demo-bundle.json` — ตัวอย่างรูปแบบ bundle

## Hint / Insights

ระหว่าง research หุ้นตัวหนึ่ง ถ้าทีม research เจอประเด็นที่ **กระทบกว้างกว่าหุ้นตัวนั้น** (เชิงระบบการเงิน/อุตสาหกรรมทั้งเซกเตอร์/มหภาค/กฎระเบียบ) และมั่นใจสูงว่าสำคัญพอ — `stock-researcher` จะ flag ไว้ใน field `hints` ของ `research.json` (เกณฑ์และ schema ดู spec ของ agent) จากนั้น `/research-stock` จะเช็ค dedup กับ `hints` ในสัปดาห์ที่ผ่านมา แล้วถ้าไม่ซ้ำจะสั่ง agent `hint-analyst` (model: **fable**) ค้นเพิ่ม+วิเคราะห์ลึกแยกเป็นรายงานของตัวเอง บันทึกลงตาราง `hints` แสดงที่ `/insights/<slug>`

**hint ไม่ใช่แค่ความเสี่ยง** — แต่ละ hint มี `direction` (`positive` โอกาส / `negative` ความเสี่ยง / `mixed` ทั้งสองอย่าง) และ `magnitude` (`high`/`mid`/`low` ขนาดผลกระทบ) เกณฑ์การ flag เหมือนกันทั้งสองทิศทาง อย่าเอนเอียงไปหาแต่เรื่องลบเพราะดูน่าตื่นเต้นกว่า

ผลคือถ้าสั่งวิเคราะห์ N ticker จะได้ N รายงานหุ้นปกติ **บวก** X รายงาน hint (X มักเป็น 0 — ตั้งเกณฑ์ไว้สูงตั้งใจ ไม่ใช่ flag ทุกข่าวที่เจอ)

นอกจากสร้าง hint ใหม่ `/research-stock` ยังเช็คย้อนกลับด้วยว่าหุ้นที่กำลัง research ตัวนี้**เกี่ยวข้อง/อาจได้รับผลกระทบ**จาก hint ที่มีอยู่แล้วหรือไม่ (ขั้น 2.6 — ไม่ว่า hint นั้นจะเจอวันนี้หรือก่อนหน้า) ถ้าใช่ ต้อง **factor เข้ากับการวิเคราะห์จริงตามทิศทางของ hint ไม่ใช่แค่แปะหมายเหตุ**: hint ลบ → analyst ปรับ `risk_level`/verdict ลง + เพิ่มหัวข้อ "จาก [hint] ต้องระวังอะไร", theorist ใส่ใน `risks`/bear scenario + ลด allocation ไม้ลึก; hint บวก → analyst ปรับคะแนน/verdict ขึ้น + เพิ่มหัวข้อ "จาก [hint] เป็นโอกาสอะไร", theorist ใส่ใน `catalysts`/bull scenario + พิจารณาเพิ่ม allocation ไม้ตื้น — ทุกจุดที่อ้างถึงต้องมีลิงก์ `/insights/<slug>`

## รอบติดตามรายสัปดาห์ (review)

หุ้นที่เคย research แล้วจะถูกทบทวนทุกสัปดาห์ด้วย `/review-stock` — **ไม่ใช่ research ใหม่ทั้งหมด** แต่เอาสิ่งที่รอบก่อนคิดไว้มาตัดสินด้วยหลักฐานใหม่ ใช้แค่ 2 agent: `stock-researcher` (โหมดติดตาม ค้นเฉพาะของใหม่ตั้งแต่รอบก่อน) + `stock-reviewer` (opus)

**แยกคนตั้งกับคนตัดสินออกจากกัน** — reviewer แก้ทฤษฎี/verdict/entry_plan เองไม่ได้เด็ดขาด ทำได้แค่ตัดสินว่าข้อความเดิมข้อไหน `confirmed`/`weakened`/`broken`/`too-early` แล้วยกธง `escalate` ให้ analyst/theorist ทำรอบใหม่ ถ้าปล่อยให้ผู้ตัดสินขยับคำทำนายเองทีละนิดทุกสัปดาห์ ทฤษฎีจะไหลตามราคาจนไม่มีอะไรผิดได้เลย

กติกาที่ `ingest-review.mjs` บังคับ (อย่าใส่ `--force` เพื่อให้ผ่าน):
- `claim` ต้องคัดลอกข้อความเดิมจาก `assumptions`/`catalysts`/`risks` มาตรงตัวอักษร ห้ามเรียบเรียงใหม่
- status ที่ไม่ใช่ `too-early` ต้องมีหลักฐานที่มี url อย่างน้อย 1 ชิ้น
- **ราคาไม่ใช่หลักฐาน** ราคาคือสิ่งที่ทฤษฎีพยายามอธิบาย ใช้ยืนยัน/หักล้างทฤษฎีไม่ได้
- ทุกรอบต้องมี `action_md` + `plan_status` (no-action / watch / plan-live / plan-broken) — ตอบให้ได้ว่า **อ่านจบแล้วต้องทำอะไรไหม** โดยอิง `entry_plan` เดิม ไม่ใช่คำแนะนำใหม่ รอบที่ตอบข้อนี้ไม่ได้คือรอบที่ไม่มีประโยชน์

เกณฑ์แข็งจาก `price-delta.mjs` (ราคาขยับ ≥7% / เพิ่งเข้าโซนไม้ลึก / แตะเป้า bull-bear / ครบ 8 สัปดาห์ตั้งแต่ full run) บังคับให้ reviewer ต้องตรวจหนักขึ้นและอธิบายให้ได้ แต่**ราคาอย่างเดียวไม่ใช่เหตุให้รัน pipeline ใหม่** — จะรัน `/research-stock` ต่อเมื่อ reviewer ยกธงเอง, มี claim `broken`, งบใหม่ออก, หรือครบ 8 สัปดาห์

**ข่าวเป็นของ ticker ไม่ใช่ของ run** — `research_items` มีอายุขัย (`active`/`archived`/`superseded`) รอบติดตามเพิ่มเฉพาะของใหม่เข้าคลังเดิม ข่าวที่ถูกข่าวใหม่ทับให้ mark `supersedes` ส่วนข่าวเก่าที่ไม่สำคัญพอถูก `archive-items.mjs` เก็บเข้ากรุ (ไม่ลบ — ต้องย้อนดูได้ว่าตอนนั้นตัดสินจากหลักฐานอะไร)

หน้าเว็บ: **ผลทบทวนอยู่ในรายงานเดิม ไม่แยกหน้า** — หน้า `/stock/[ticker]` แสดงแถบ "ทบทวนล่าสุด" ใต้สรุปภาพรวม (จุดยืน + สิ่งที่เกิดขึ้น + ราคาเทียบวันที่ทำรายงาน) และติดผลตัดสินไว้กับข้อความเดิมในหัวข้อทฤษฎีทีละข้อ (ข้อความยังเป็นของเดิมทุกตัวอักษร ป้ายบอกว่าหลักฐานใหม่หนุนหรือค้าน)

**"ไม่มีอะไรเปลี่ยน" คือคำตอบปกติของสัปดาห์ส่วนใหญ่** เหมือนเกณฑ์ hint ที่ตั้งไว้สูงโดยตั้งใจ

## กติกาสำคัญ

- **โมเดลทีม agent (ห้าม override):** researcher=sonnet, analyst+theorist=opus, reviewer=opus, hint-analyst=fable (กำหนดใน `.claude/agents/*.md` แล้ว) — hint-analyst รันเฉพาะตอนมี hint ที่ผ่านเกณฑ์จริงเท่านั้น ไม่ใช่ทุก ticker; นอกเหนือจากนี้ใช้ Fable เฉพาะเมื่อ user สั่ง "วิเคราะห์แบบลึกสุด" เป็นรายตัว; รัน batch หลาย ticker ให้ทำใน session ใหม่ และลดการโพสต์สถานะระหว่างรอ agent

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
npm run review:due       # คิวหุ้นที่ค้างทบทวนเกิน 7 วัน + ราคาเทียบแผน
npm run review:context -- <TICKER>   # ความจำของรอบก่อน (ป้อนให้ reviewer)
npm run ingest-review -- <review.json> [research.json]
npm run items:archive    # dry run; ใส่ -- --apply เพื่อเขียนจริง
npm run review:summary   # สรุปผลรอบทบทวนของวันนี้จาก DB
```

## Login + log การเข้าใช้

- บังคับ login Google ทั้งเว็บ (ทุกบัญชี Google เข้าได้) ผ่าน Auth.js v5 — `auth.ts` + `middleware.ts` (runtime nodejs) ยกเว้น `/login`, `/api/auth`, `/api/health`
- การเปิดหน้าบันทึกจากฝั่ง browser: `components/PageViewLogger.tsx` → `POST /api/log` (ตัวตนเอาจาก session) ลงตาราง `access_logs`; login/logout บันทึกผ่าน `events` ใน `auth.ts` — โค้ดเขียน/อ่านอยู่ `lib/access-log.ts`
- **ห้ามย้าย page-view log กลับไปไว้ใน middleware** — production prefetch ลิงก์ที่อยู่ในจอผ่าน middleware ด้วยและ header prefetch ถูกตัดทิ้ง ทำให้ log ปลอมเต็มไปหมด (dev ไม่ prefetch เลยไม่เห็นปัญหา)
- หน้า `/admin/logs` เห็นเฉพาะอีเมลใน env `ADMIN_EMAILS` (คนอื่นได้ 404)
- อีเมลใน env `LOG_EXCLUDE_EMAILS` (คั่นด้วย comma) ไม่ถูกบันทึก log เลย — ใช้กันเจ้าของระบบปน log ผู้ใช้จริง
- `access_logs` **ห้ามใส่ใน `export-db.mjs`** — กันอีเมลผู้ใช้หลุดไปกับ `data/export.json` ที่ commit
- env ที่ต้องมี (local + Vercel): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAILS`

## Deployment

- Vercel project: `ttduxzs-projects/tee-stock-research` (link ไว้แล้วใน `.vercel/`)
- โหมดข้อมูลปัจจุบัน: **Turso cloud** (ตั้งแต่ 2026-09-01) — DB `tee-stock` org `duxz` region aws-us-east-1; env อยู่ใน `.env` (local, gitignored) และ Vercel Production
- ingest / ingest-hint เขียนตรงขึ้น Turso → เว็บ production อัปเดตภายใน ~60 วินาที (หน้าเว็บอ่านผ่าน `lib/cached.ts` ที่ cache query 60s — ลดความหน่วงทุกคลิกเพราะ Vercel/Turso อยู่ us-east) **ไม่ต้องรัน `npm run deploy`** (ขั้น 6.5 ของ `/research-stock` ข้ามได้ — deploy เฉพาะตอนแก้โค้ด/UI เช่นหน้า `/insights` นี้)
- ไฟล์ `data/stock.db` เป็นข้อมูลเก่าก่อน migrate (สำรองไว้); โหมด snapshot (`data/export.json`) ยังเป็น fallback ถ้า env หาย
