# Tee Stock Research

ระบบวิเคราะห์หุ้นแบบ multi-agent pipeline: Claude Code เป็น orchestrator + ทีม agent 3 ทีม เขียนผลลง DB (libSQL/Turso) แล้วอ่านผ่านเว็บ Next.js ที่ deploy บน Vercel

## โครงสร้าง

- `app/` — Next.js (App Router) หน้าเว็บอ่านอย่างเดียว: `/` รายชื่อหุ้น, `/stock/[ticker]` รายละเอียด, `/insights` + `/insights/[slug]` รายงาน hint, `/best-price` จัดอันดับหุ้นที่ราคาน่าสนใจที่สุด (คำนวณจาก `lib/ranking.ts` — ไม่มีข้อมูลใหม่ ใช้เฉพาะที่มีใน DB), `/track-record` ทฤษฎีแม่นแค่ไหน (สถิติจาก `thesis_checks` ผ่าน `lib/track-record.ts` — ไม่ใช้ราคา; risk นับแยกเพราะ risk ที่ "ยืนยัน" คือเรื่องร้ายเกิดจริง) + การ์ด "เคยบอกว่าถ้า → จะส่งผล / ตอนนี้ เพราะ → ส่งผลให้" ทุกข้อ
- `lib/db.ts` — client + query ทั้งหมด (Turso ผ่าน env, fallback ไฟล์ `data/stock.db`)
- `scripts/` — `init-db.mjs` (สร้าง schema), `ingest.mjs` (นำ bundle.json ลง DB), `ingest-hint.mjs` (นำ hint.json ลง DB), `list-hints.mjs` (list hint — กัน dedup ตอนหาต้นทาง 30 วัน / หา exposure ตอนดูย้อนหลังยาว), `get-hint.mjs <slug>` (ดึง hint เดียวแบบเต็ม), `seed-demo.mjs`, `schema.mjs` (นิยาม schema — แก้ที่นี่ที่เดียว)
- `scripts/` (ด่านตรวจของ pipeline เต็ม — ดูหัวข้อ "ด่านตรวจ 2 ด่าน") — `check-sanity.mjs <DIR>` (อ่าน `sanity.json` จาก agent `data-sanity` + ตรวจซ้ำด้วยโค้ด exit 1 = BLOCKING), `check-compliance.mjs <DIR>` (อ่าน `compliance.json` จาก agent `stock-compliance` + ตรวจว่า passage มีจริง + สแกนคำต้องห้าม + disclaimer exit 1 = ห้าม ingest), `watch-brief.mjs` (สรุปก่อนเปิดตลาดของ watchlist อ่านจาก DB อย่างเดียว)
- `scripts/` (รอบติดตาม) — `prev-context.mjs <TICKER>` (ความจำของรอบก่อนแบบกระชับ), `price-delta.mjs [--due] [--json]` (ราคาจริงเทียบแผน + เกณฑ์แข็ง ไม่ใช้ agent), `ingest-review.mjs` (บันทึกผลทบทวน + ตรวจความซื่อสัตย์ของ claim + บังคับคำอธิบาย 4 ช่อง `if_md/then_md/because_md/so_md` และ `impact` = good/bad/mixed ต่อหุ้นสำหรับข้อที่รู้ผลแล้ว — สีการ์ด risk ใช้ impact เพราะ risk บางข้อคือ "ความเสี่ยงที่ทฤษฎีจะผิด" ซึ่งเกิดจริงแล้วดีต่อหุ้น เดาจาก status ไม่ได้), `explain-checks.mjs export|export-impact|apply` (เติมคำอธิบาย 4 ช่อง/impact ให้ผลตรวจเก่าที่ยังไม่มี — ใช้แค่ข้อความใน DB, then_md ต้องมาจากทฤษฎีเดิม), `items.mjs` (คลัง item ระดับ ticker), `archive-items.mjs` / `dedupe-items.mjs` (ดูแลอายุข่าว), `quotes.mjs` (ราคาฝั่ง node)
- `.claude/agents/` — ทีม: `stock-researcher` (research), `data-sanity` (ด่านตรวจข้อมูลก่อนคิด), `stock-analyst` (analyze), `stock-theorist` (theorie), `stock-compliance` (ด่านตรวจภาษาก่อนเผยแพร่), `stock-reviewer` (ทบทวนรายสัปดาห์ — ดูหัวข้อ "รอบติดตาม" ด้านล่าง), `hint-analyst` (วิเคราะห์ hint แยก — ดูหัวข้อ "Hint" ด้านล่าง), `hint-illustrator` (เติมภาพ/ศัพท์/สรุปให้ hint เก่า — ดูหัวข้อ "ชั้นอ่านให้เข้าใจ")
- `.claude/commands/research-stock.md` — `/research-stock <TICKER>` รัน pipeline เต็ม (รวมขั้นเช็ค hint)
- `.claude/commands/watch-brief.md` — `/watch-brief` สรุปก่อนเปิดตลาดของหุ้นที่ติดตาม (ต้องทำอะไรไหม / สถานะเปลี่ยน / ราคาถึงเกณฑ์ / insight ที่กระทบ / ค้างทบทวน) อ่านจาก DB อย่างเดียว ไม่ค้นเว็บ ไม่ผลิตความเห็นใหม่
- `.claude/commands/review-stock.md` / `review-week.md` — `/review-stock <TICKER>` รอบติดตาม 1 ตัว, `/review-week` ทำคิวทั้งสัปดาห์จบในคำสั่งเดียว (orchestrator ห้ามอ่านไฟล์ JSON เอง ส่งแค่ path ให้ agent — ทำให้ 29 ticker กิน context ~30k จบใน session เดียว)
- `pipeline/output/` — ไฟล์กลางของแต่ละ run (gitignored), `pipeline/examples/demo-bundle.json` — ตัวอย่างรูปแบบ bundle

## ด่านตรวจ 2 ด่านใน `/research-stock` (ดัดแปลงจาก plugin Claude for Financial Advisors ของ Anthropic)

หลักร่วม: **agent หาและชี้ สคริปต์ตัดสิน คนแก้คือทีมที่เขียน** — ด่านไม่แก้ข้อความ/ตัวเลขเอง (ถ้าด่านแก้เองได้ มันจะกลายเป็นคนเขียนอีกคนที่ไม่มีใครตรวจ)

- **ขั้น 2.7 data-sanity** (ก่อน analyst): agent `data-sanity` ตรวจ `research.json` 7 ข้อ (เก่า/ขัดแย้ง/สอดคล้องภายใน/ขนาดผิดปกติ/ครบถ้วน/ซ้ำ/คุณภาพแหล่ง) ทุกธงต้องบอก `contaminates` = ตัวเลข/ข้อสรุปไหนของรายงานจะรับปัญหาไป → `check-sanity.mjs` ตรวจรูปแบบ + ตรวจซ้ำด้วยโค้ด · exit 1 BLOCKING = ส่งกลับ researcher 1 ครั้ง ไม่ผ่านอีก = หยุด ไม่ออกรายงาน · **exit 3 RESOLVE = "ค้นเพิ่มแล้วน่าจะหาย" ส่งกลับ researcher โหมดค้นเพิ่ม 1 รอบ** (ตัวเลข valuation ขัดกัน / item importance ≥4 ที่ url เป็นหน้ารวมข่าว / segment ไม่มีกำไรทั้งที่มี filing หรือเอาสัดส่วนรายได้มาใส่ `margin_pct` / notes_md ผลักงานไป "รอบถัดไป" — โค้ดจับทั้งหมดนี้เอง) รอบสองธงที่เหลือลดเป็น flag · **exit 2 PARTIAL = `coverage.status` ไม่ใช่ complete (เช่นโควตาค้นเว็บหมด) หยุดทั้ง pipeline** ให้เปิด session ใหม่รัน `/research-stock <TICKER> --resume` (`--find-partial` หา dir ค้าง, `assemble-bundle.mjs` ก็ปฏิเสธไฟล์ partial) · FLAGS (ปกติ) = analyst ต้องอ่าน `sanity.json` และใส่คำเตือนใน "ข้อจำกัดของการวิเคราะห์" — **"หาไม่ได้" ที่ยังไม่ได้ลองหาจากต้นทางไม่ใช่ข้อจำกัด มันคืองานที่ยังไม่เสร็จ** (บทเรียนจาก PLTR/TSLA 2026-09-17 ที่รัน full run ต่อท้าย `/review-week` จนโควตาหมด researcher ไปดึงหน้า Bing News แทนต้นทาง แล้ว analyst เขียนเป็น "ข้อจำกัด" 8 ข้อ)
- **ห้ามรัน `/research-stock` ต่อท้าย `/review-week` ใน session เดียวกัน** — โควตา WebSearch ~200/session ใช้ร่วมกันทุก agent; `/review-week` ขั้น 3 แค่พิมพ์รายการ `/research-stock <TICKER> --review=latest` ให้ user ไปรันใน session ใหม่ (สคริปต์หยิบ review id จาก DB เอง) ไม่เกิน 2 ตัวต่อ session
- **ขั้น 4.5 compliance gate** (ก่อน ingest): agent `stock-compliance` ตรวจ `analysis.json`+`theories.json` 8 กฎ (คำรับประกัน/คำสั่งซื้อขาย/ตัวเลขไม่มีที่มาใน research/ด้านเดียว/cherry-pick/มั่นใจเกินหลักฐาน/disclaimer/ศัพท์ไม่แปลในชั้นคนทั่วไป) คัดลอก `passage` ตรงตัว → `check-compliance.mjs` ตรวจว่า passage มีจริง + สแกนคำต้องห้ามด้วย regex + disclaimer ใน `invalidation_md` · exit 1 = ส่งประโยคกลับให้ analyst/theorist แก้ **ห้ามแก้ verdict/คะแนน/เป้า/โซนไม้เพราะเรื่องถ้อยคำ** ไม่เกิน 2 รอบ ไม่ผ่าน = ห้าม ingest · ตัวเลขที่มีลิงก์ `/insights/<slug>` ถือว่ามีที่มา
- รอบทบทวนไม่มี agent ด่านแยก (ประหยัด) แต่ `ingest-review.mjs` สแกนคำต้องห้ามใน `action_md`/`review_md`/`alternatives_md` ด้วย regex ชุดเดียวกัน — **regex ภาษาไทยห้ามใช้ lookahead `(?![ก-๙])` กันขอบคำ** เพราะไทยไม่มีช่องว่างคั่นคำ ("ซื้อเลยตอนนี้" จะหลุด — เคยหลุดจริงตอนทดสอบ)
- agent ที่อ่านเนื้อหาจากเว็บ/ไฟล์ที่มาจากเว็บ (`stock-researcher`, `data-sanity`, `stock-compliance`, `hint-*`) **ห้ามมี Bash** — เนื้อหาที่อ่านคือ untrusted input การจำกัด tool ต้องเป็นเชิงโครงสร้าง ไม่ใช่แค่สั่งด้วยข้อความ
- plugin ต้นทางติดตั้งไว้ที่ user scope (`claude-for-financial-advisors@knowledge-work-plugins`) — skill ของมัน (`/compliance`, `/pre-meeting` ฯลฯ) ผูกกับ CRM/พอร์ตลูกค้าและกฎ SEC ใช้กับโปรเจคนี้ตรงๆ ไม่ได้ เอามาแค่แนวคิด

## Hint / Insights

ระหว่าง research หุ้นตัวหนึ่ง ถ้าทีม research เจอประเด็นที่ **กระทบกว้างกว่าหุ้นตัวนั้น** (เชิงระบบการเงิน/อุตสาหกรรมทั้งเซกเตอร์/มหภาค/กฎระเบียบ) และมั่นใจสูงว่าสำคัญพอ — `stock-researcher` จะ flag ไว้ใน field `hints` ของ `research.json` (เกณฑ์และ schema ดู spec ของ agent) จากนั้น `/research-stock` จะเช็ค dedup กับ `hints` ในสัปดาห์ที่ผ่านมา แล้วถ้าไม่ซ้ำจะสั่ง agent `hint-analyst` (model: **fable**) ค้นเพิ่ม+วิเคราะห์ลึกแยกเป็นรายงานของตัวเอง บันทึกลงตาราง `hints` แสดงที่ `/insights/<slug>`

**hint ไม่ใช่แค่ความเสี่ยง** — แต่ละ hint มี `direction` (`positive` โอกาส / `negative` ความเสี่ยง / `mixed` ทั้งสองอย่าง) และ `magnitude` (`high`/`mid`/`low` ขนาดผลกระทบ) เกณฑ์การ flag เหมือนกันทั้งสองทิศทาง อย่าเอนเอียงไปหาแต่เรื่องลบเพราะดูน่าตื่นเต้นกว่า

ผลคือถ้าสั่งวิเคราะห์ N ticker จะได้ N รายงานหุ้นปกติ **บวก** X รายงาน hint (X มักเป็น 0 — ตั้งเกณฑ์ไว้สูงตั้งใจ ไม่ใช่ flag ทุกข่าวที่เจอ)

**hint มีอายุขัย** — `/review-hints` (agent `hint-reviewer`, opus) ทบทวน hint ที่ไม่ได้ตรวจเกิน 14 วันด้วยหลักฐานที่มีลิงก์ แล้วตัดสินเป็น `active` (ยังมีผล) / `played-out` (เกิดขึ้นครบแล้ว) / `invalidated` (ถูกหักล้างแล้ว) ผ่าน `ingest-hint-review.mjs` (เปลี่ยนสถานะต้องมี url) — ขั้น 2.6 ใช้ `list-hints.mjs --active` เท่านั้น **hint ที่ปิดแล้วห้ามถูกเอาไปปรับหุ้นตัวอื่น** (รายงานเดิมเก็บไว้ไม่ลบ หน้าเว็บติดป้ายสถานะ) หุ้นที่เคยอ้างถึง hint ที่เพิ่งถูกปิดดูได้ด้วย `hint-exposure.mjs <slug>` · `/review-week` ทำ `/review-hints --max=5` ต่อท้ายถ้าโควตาค้นเว็บเหลือ

นอกจากสร้าง hint ใหม่ `/research-stock` ยังเช็คย้อนกลับด้วยว่าหุ้นที่กำลัง research ตัวนี้**เกี่ยวข้อง/อาจได้รับผลกระทบ**จาก hint ที่มีอยู่แล้วหรือไม่ (ขั้น 2.6 — ไม่ว่า hint นั้นจะเจอวันนี้หรือก่อนหน้า) ถ้าใช่ ต้อง **factor เข้ากับการวิเคราะห์จริงตามทิศทางของ hint ไม่ใช่แค่แปะหมายเหตุ**: hint ลบ → analyst ปรับ `risk_level`/verdict ลง + เพิ่มหัวข้อ "จาก [hint] ต้องระวังอะไร", theorist ใส่ใน `risks`/bear scenario + ลด allocation ไม้ลึก; hint บวก → analyst ปรับคะแนน/verdict ขึ้น + เพิ่มหัวข้อ "จาก [hint] เป็นโอกาสอะไร", theorist ใส่ใน `catalysts`/bull scenario + พิจารณาเพิ่ม allocation ไม้ตื้น — ทุกจุดที่อ้างถึงต้องมีลิงก์ `/insights/<slug>`

### ชั้น "อ่านให้เข้าใจ" ของ hint (visuals / glossary / tldr)

รายงาน hint อ่านยากเพราะเป็นเรื่องการเงินเชิงระบบ — แต่ละ hint จึงมีชั้นช่วยอ่าน 3 อย่างเก็บใน `hints.visuals_json` / `glossary_json` / `tldr_md` (สเปกเต็ม + ตัวอย่างอยู่ `pipeline/hint-visuals-spec.md` ตัวตรวจอยู่ `scripts/hint-visuals.mjs`):
- **ภาพประกอบ 2-4 ภาพ** — agent ส่งแค่ JSON (bars / compare / flow+steps / scale / timeline) เว็บวาดเองด้วย `components/HintVisuals.tsx` (ไลบรารี `motion` — animation ตอนเลื่อนเข้าจอ, flow เล่นทีละขั้นได้) **agent ห้ามส่ง SVG/HTML** (untrusted input) · วางในเนื้อหาด้วยบรรทัด `[[visual:<id>]]` หน้าเว็บแยก `content_md` ตรง marker · **ภาพมีได้เฉพาะเมื่อแสดงสิ่งที่ตัวหนังสือทำไม่ได้** (เทียบขนาด / การไหล / ตำแหน่งบนสเกล) "กล่องข้อความ 3 กล่อง" ไม่ใช่ภาพ (บทเรียน 2026-09-17) · ทุกภาพต้องมี `read_md` ("อ่านภาพ") · **ตัวเลขทุกตัวในภาพต้องมีใน content_md/stats อยู่แล้ว** ตัวตรวจค้นตรงตัว ผิดข้อเดียว = ไม่บันทึกทั้งไฟล์ ไม่มี `--force`
- **ศัพท์ 3-8 คำ** (`glossary`) ที่ถ้าไม่รู้แล้วอ่านต่อไม่ได้ — `components/HintGlossary.tsx` แสดงเป็นชิป + ไฮไลต์คำในเนื้อหา (แตะแล้วเห็นความหมาย) ทำกับ text node เท่านั้น
- **สรุป 2-4 bullet** (`tldr_md`) ภาษาคน แสดงบนสุดก่อน stat rail
- hint ใหม่: `hint-analyst` เขียนมาเองตั้งแต่แรก (`ingest-hint.mjs` ตรวจ) · hint เก่า: **`/illustrate-hint <slug|URL>`** (`.claude/commands/illustrate-hint.md` — ไม่ใช้โควตาค้นเว็บ รันต่อท้ายคำสั่งอื่นได้; `--all` ทำทุกตัวที่ยังไม่มี ไม่เกิน 5/session, `--redo` ทำใหม่ทับ) ซึ่งทำ 3 ขั้นนี้ให้: `npm run hints:illustrate -- export <DIR> [--slug X]` → agent `hint-illustrator` (opus, Read/Write เท่านั้น ไม่ค้นเว็บ) เขียน `<slug>.illustrated.json` → `npm run hints:illustrate -- apply <file>` (content_md แก้ได้แค่แทรก marker — สคริปต์เทียบว่าตัด marker แล้วต้องเท่าต้นฉบับ)

## รอบติดตามรายสัปดาห์ (review)

หุ้นที่เคย research แล้วจะถูกทบทวนทุกสัปดาห์ด้วย `/review-stock` — **ไม่ใช่ research ใหม่ทั้งหมด** แต่เอาสิ่งที่รอบก่อนคิดไว้มาตัดสินด้วยหลักฐานใหม่ ใช้แค่ 2 agent: `stock-researcher` (โหมดติดตาม ค้นเฉพาะของใหม่ตั้งแต่รอบก่อน) + `stock-reviewer` (opus)

**แยกคนตั้งกับคนตัดสินออกจากกัน** — reviewer แก้ทฤษฎี/verdict/entry_plan เองไม่ได้เด็ดขาด ทำได้แค่ตัดสินว่าข้อความเดิมข้อไหน `confirmed`/`weakened`/`broken`/`too-early` แล้วยกธง `escalate` ให้ analyst/theorist ทำรอบใหม่ ถ้าปล่อยให้ผู้ตัดสินขยับคำทำนายเองทีละนิดทุกสัปดาห์ ทฤษฎีจะไหลตามราคาจนไม่มีอะไรผิดได้เลย

กติกาที่ `ingest-review.mjs` บังคับ (อย่าใส่ `--force` เพื่อให้ผ่าน):
- `claim` ต้องคัดลอกข้อความเดิมจาก `assumptions`/`catalysts`/`risks` มาตรงตัวอักษร ห้ามเรียบเรียงใหม่
- status ที่ไม่ใช่ `too-early` ต้องมีหลักฐานที่มี url อย่างน้อย 1 ชิ้น
- **ราคาไม่ใช่หลักฐาน** ราคาคือสิ่งที่ทฤษฎีพยายามอธิบาย ใช้ยืนยัน/หักล้างทฤษฎีไม่ได้
- ทุกรอบต้องมี `action_md` + `plan_status` (no-action / watch / plan-live / plan-broken) — ตอบให้ได้ว่า **อ่านจบแล้วต้องทำอะไรไหม** โดยอิง `entry_plan` เดิม ไม่ใช่คำแนะนำใหม่ รอบที่ตอบข้อนี้ไม่ได้คือรอบที่ไม่มีประโยชน์
- ทุกรอบต้องมี `alternatives_md` (ทางเลือกที่พิจารณาแล้ว**ไม่เลือก** + เพราะอะไร — อิงแผนเดิม/อำนาจผู้ตัดสิน ไม่ใช่ที่เสนอไม้ใหม่) และ `data_quality_md` (ข้อมูลที่ยังสงสัยของรอบนี้ หรือ "ไม่มี — เหตุผล") — คำตัดสินที่ไม่บอกว่าชั่งกับอะไรและยืนบนข้อมูลแค่ไหน ตรวจย้อนไม่ได้ (แนวคิดจาก rebalance memo ของ plugin) หน้าหุ้นแสดง 2 ช่องนี้แบบพับไว้ใต้ `action_md`

เกณฑ์แข็งจาก `price-delta.mjs` (ราคาขยับ ≥7% / เพิ่งเข้าโซนไม้ลึก / แตะเป้า bull-bear / ครบ 8 สัปดาห์ตั้งแต่ full run) บังคับให้ reviewer ต้องตรวจหนักขึ้นและอธิบายให้ได้ แต่**ราคาอย่างเดียวไม่ใช่เหตุให้รัน pipeline ใหม่** — จะรัน `/research-stock` ต่อเมื่อ reviewer ยกธงเอง, มี claim `broken`, งบใหม่ออก, หรือครบ 8 สัปดาห์

**ข่าวเป็นของ ticker ไม่ใช่ของ run** — `research_items` มีอายุขัย (`active`/`archived`/`superseded`) รอบติดตามเพิ่มเฉพาะของใหม่เข้าคลังเดิม ข่าวที่ถูกข่าวใหม่ทับให้ mark `supersedes` ส่วนข่าวเก่าที่ไม่สำคัญพอถูก `archive-items.mjs` เก็บเข้ากรุ (ไม่ลบ — ต้องย้อนดูได้ว่าตอนนั้นตัดสินจากหลักฐานอะไร)

หน้าเว็บ: **ผลทบทวนอยู่ในรายงานเดิม ไม่แยกหน้า** — หน้า `/stock/[ticker]` แสดงแถบ "ทบทวนล่าสุด" ใต้สรุปภาพรวม (จุดยืน + สิ่งที่เกิดขึ้น + ราคาเทียบวันที่ทำรายงาน) และติดผลตัดสินไว้กับข้อความเดิมในหัวข้อทฤษฎีทีละข้อ (ข้อความยังเป็นของเดิมทุกตัวอักษร ป้ายบอกว่าหลักฐานใหม่หนุนหรือค้าน)

**"ไม่มีอะไรเปลี่ยน" คือคำตอบปกติของสัปดาห์ส่วนใหญ่** เหมือนเกณฑ์ hint ที่ตั้งไว้สูงโดยตั้งใจ

## กติกาสำคัญ

- **โมเดลทีม agent (ห้าม override):** researcher=sonnet, analyst+theorist=opus, reviewer=opus, hint-reviewer=opus, hint-analyst=fable (กำหนดใน `.claude/agents/*.md` แล้ว) — hint-analyst รันเฉพาะตอนมี hint ที่ผ่านเกณฑ์จริงเท่านั้น ไม่ใช่ทุก ticker; นอกเหนือจากนี้ใช้ Fable เฉพาะเมื่อ user สั่ง "วิเคราะห์แบบลึกสุด" เป็นรายตัว; รัน batch หลาย ticker ให้ทำใน session ใหม่ และลดการโพสต์สถานะระหว่างรอ agent

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
npm run watch:brief      # สรุปก่อนเปิดตลาดของ watchlist (--email= / --all / --days= / --json)
npm run check:sanity -- <DIR>       # ด่านตรวจข้อมูล (หลัง agent data-sanity)
npm run check:compliance -- <DIR>   # ด่านตรวจภาษา (หลัง agent stock-compliance)
```

## Login + log การเข้าใช้

- บังคับ login Google ทั้งเว็บ (ทุกบัญชี Google เข้าได้) ผ่าน Auth.js v5 — `auth.ts` + `middleware.ts` (runtime nodejs) ยกเว้น `/login`, `/api/auth`, `/api/health`
- การเปิดหน้าบันทึกจากฝั่ง browser: `components/PageViewLogger.tsx` → `POST /api/log` (ตัวตนเอาจาก session) ลงตาราง `access_logs`; login/logout บันทึกผ่าน `events` ใน `auth.ts` — โค้ดเขียน/อ่านอยู่ `lib/access-log.ts`
- **ห้ามย้าย page-view log กลับไปไว้ใน middleware** — production prefetch ลิงก์ที่อยู่ในจอผ่าน middleware ด้วยและ header prefetch ถูกตัดทิ้ง ทำให้ log ปลอมเต็มไปหมด (dev ไม่ prefetch เลยไม่เห็นปัญหา)
- หน้า `/admin/logs` เห็นเฉพาะอีเมลใน env `ADMIN_EMAILS` (คนอื่นได้ 404)
- อีเมลใน env `LOG_EXCLUDE_EMAILS` (คั่นด้วย comma) ไม่ถูกบันทึก log เลย — ใช้กันเจ้าของระบบปน log ผู้ใช้จริง
- `access_logs` **ห้ามใส่ใน `export-db.mjs`** — กันอีเมลผู้ใช้หลุดไปกับ `data/export.json` ที่ commit
- คำขอให้วิเคราะห์หุ้น (เมนู `/request` ฟอร์ม + คำขอของตัวเอง; ผลค้นหาที่ไม่เจอบนหน้ารวมหุ้นลิงก์มาพร้อม `?ticker=`): ตาราง `stock_requests` (email, ticker, note) ผูกอีเมลเหมือนกัน — **ไม่อยู่ใน `export-db.mjs` ไม่ผ่าน `lib/cached.ts`**; หน้า `/admin/requests` แสดงแค่จำนวนคนขอ ไม่แสดงอีเมล; ดูคิวใน Claude Code ด้วย `node scripts/list-requests.mjs` แล้วเลือกรัน `/research-stock` เอง (ไม่รันอัตโนมัติ)
- **ไม่เก็บ IP ของผู้ใช้** (privacy) — คอลัมน์ `access_logs.ip` ถูกลบทิ้งพร้อมข้อมูลเก่าแล้ว (migration ใน `schema.mjs`) อย่าเพิ่มกลับ; log เก็บแค่อีเมล / เหตุการณ์ / หน้า / user-agent
- หุ้นที่ฉันติดตาม (`/watchlist`): ตาราง `watchlist` (email, ticker) ผูกกับอีเมลเหมือนกัน — **ห้ามใส่ใน `export-db.mjs` และห้ามห่อด้วย `lib/cached.ts`** (ต่างกันรายคน + ต้องเห็นผลทันทีหลังกด ☆) โค้ดอยู่ `lib/watchlist.ts` + server action `app/watchlist/actions.ts` ที่เอาอีเมลจาก session เท่านั้น
  - หน้า `/watchlist` เป็นการ์ด (`app/watchlist/views.tsx`) แบ่ง "มีเรื่องใหม่" (ตั้งแต่เปิดหน้าครั้งก่อน — `lib/watch-brief.ts` ฉบับเว็บของ `watch-brief.mjs` ไม่ดึงราคาสด) / "ที่เหลือ"; ราคาบนการ์ด + ตำแหน่งบนแถบไม้เป็นราคาสดจาก `lib/quote.ts` (`getLatestQuotes` + ป้าย "ราคา HH:MM" เวลาไทย + % วันนี้) ตัวที่ดึงไม่ได้ fallback เป็นราคารอบทบทวน (ป้าย "ราคา ณ ทบทวน <วันที่>") — **สถานะแผนยังมาจาก `plan_status` เท่านั้น ห้ามคำนวณจากราคาสด**; จุดตั้งต้นเก็บในตาราง `watchlist_seen` (ผูกอีเมล — กฎเดียวกับ `watchlist`) บันทึกจาก client หลัง mount เท่านั้น (`components/WatchlistSeen.tsx` — เหตุผลเดียวกับ page-view log); รายละเอียดเปิดเป็น `<dialog>` (`components/WatchCard.tsx`) ไม่ใช่กางในที่ · แถบไม้ของแผน (`components/PlanZone.tsx`) ทุกช่องต้องมีป้าย (เลขไม้ในช่อง + "ราคาตอนนี้") — แถบไม่มีป้ายผู้ใช้บอกว่าสับสน · ดาวอยู่ขวาบนการ์ดที่เดียว
- env ที่ต้องมี (local + Vercel): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAILS`

## MCP — ให้ agent ของผู้ใช้มาเกาะเว็บเป็น tools

- endpoint `/api/mcp` (Streamable HTTP, stateless, ไลบรารี `mcp-handler` + `@modelcontextprotocol/server` v2) — tools อยู่ `lib/mcp/tools.ts` อ่านผ่าน `lib/cached.ts` ชุดเดียวกับหน้าเว็บ คืน markdown ย่อยแล้ว + ลิงก์หน้าเว็บ + disclaimer; **ไม่มี tool ไหนผลิตความเห็นใหม่** (อย่าเพิ่ม tool ที่เรียก LLM/รัน pipeline จากคำขอของคนนอก)
- tools: `search_stocks`, `get_stock_report` (เลือก sections), `rank_by_price`, `list_insights`/`get_insight`, `get_track_record` (scope `research`) + `get_my_watchlist`, `update_watchlist`, `request_stock_analysis` (scope `account` — อีเมลจาก token เท่านั้น ไม่รับจาก argument) · เพิ่ม/แก้ tool ต้องแก้รายการใน `app/connect/page.tsx` ให้ตรง
- ยืนยันตัว 2 แบบ ตัวตน = อีเมล Google เดิมของเว็บ: (1) OAuth 2.1 ที่เว็บเป็น authorization server เอง (`/.well-known/*`, `/api/oauth/register|token|revoke`, หน้ายินยอม `/oauth/authorize` → form post ไป `/api/oauth/authorize` พร้อม HMAC ด้วย `AUTH_SECRET`) — public client + PKCE S256 บังคับ, access 1 ชม., refresh 30 วันหมุนทุกครั้ง (refresh เก่าถูกใช้ซ้ำ = เพิกถอนทั้ง family) (2) API key ส่วนตัว `tsr_key_…` สร้างที่หน้า `/connect` (สูงสุด 5)
- ตาราง `mcp_clients` / `mcp_auth_codes` / `mcp_tokens` เก็บแค่ sha256 ของ code/token — **ห้ามใส่ใน `export-db.mjs` และห้ามผ่าน `lib/cached.ts`**; rate limit 120 req/นาที/token นับใน `verifyToken` (UPDATE…RETURNING คำสั่งเดียว); ทุก tool call log ลง `access_logs` event `mcp`
- `middleware.ts` ไม่ครอบ `/api/mcp`, `/api/oauth/*`, `/.well-known/*` (ใช้ bearer token — redirect ไป /login แล้ว client พัง) แต่ครอบ `/oauth/authorize` (ต้อง login ก่อนยินยอม)
- ทดสอบ local โดยไม่แตะ Turso: `preview_start dev-localdb` (port 3100 ใช้ `data/stock.db`) · ต้องการข้อมูลจริงล่าสุด: `node scripts/dev-copy-db.mjs <email>` (อ่าน Turso อย่างเดียว คัดตารางสาธารณะ + watchlist ของอีเมลนั้นลง `data/dev-copy.db`) แล้ว `preview_start dev-copydb` (port 3000 — port ที่ลงทะเบียน Google OAuth ไว้ login บัญชีจริงได้; 3200 ได้ redirect_uri_mismatch)
- **ตอนพัฒนาเว็บ ใช้ MCP `tee-stock` อ่านข้อมูลแทนการเปิดเว็บ/เขียน SQL ได้** (ตั้งไว้ local scope ใน `~/.claude.json` ของเครื่อง dev แล้ว — ไม่อยู่ใน repo) ข้อควรรู้: อ่าน **production** เสมอ ไม่ใช่ `data/stock.db` ที่แก้อยู่ในเครื่อง และช้ากว่าของจริงได้ถึง 60 วินาที (cache) — งานที่ต้องเห็นผลทันทีหลัง ingest ให้ query DB ตรง

## Deployment

- Vercel project: `ttduxzs-projects/tee-stock-research` (link ไว้แล้วใน `.vercel/`)
- โหมดข้อมูลปัจจุบัน: **Turso cloud** (ตั้งแต่ 2026-09-01) — DB `tee-stock` org `duxz` region aws-us-east-1; env อยู่ใน `.env` (local, gitignored) และ Vercel Production
- ingest / ingest-hint เขียนตรงขึ้น Turso → เว็บ production อัปเดตภายใน ~60 วินาที (หน้าเว็บอ่านผ่าน `lib/cached.ts` ที่ cache query 60s — ลดความหน่วงทุกคลิกเพราะ Vercel/Turso อยู่ us-east) **ไม่ต้องรัน `npm run deploy`** (ขั้น 6.5 ของ `/research-stock` ข้ามได้ — deploy เฉพาะตอนแก้โค้ด/UI เช่นหน้า `/insights` นี้)
- ไฟล์ `data/stock.db` เป็นข้อมูลเก่าก่อน migrate (สำรองไว้); โหมด snapshot (`data/export.json`) ยังเป็น fallback ถ้า env หาย
