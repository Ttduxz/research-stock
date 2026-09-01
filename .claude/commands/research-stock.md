---
description: รัน pipeline วิเคราะห์หุ้นเต็มรูปแบบ (research → analyze → theorize → บันทึกลง DB) สำหรับ ticker ที่ระบุ
argument-hint: <TICKER> [ชื่อบริษัท/ตลาด ถ้า ticker กำกวม]
---

รัน pipeline วิเคราะห์หุ้นสำหรับ: $ARGUMENTS

คุณคือ orchestrator ของระบบ Tee Stock Research ทำตามขั้นตอนนี้ตามลำดับ (ขั้น 2-4 ต้องรอผลขั้นก่อนหน้า):

**ขั้น 2.5 กับ 2.6 ต่างจุดประสงค์กัน** — 2.5 คือหุ้นตัวนี้ *สร้าง* hint ใหม่หรือไม่ (research team เจอเรื่องใหญ่ระหว่างค้น), 2.6 คือหุ้นตัวนี้ *ได้รับผลกระทบจาก* hint ที่มีอยู่แล้วหรือไม่ (ไม่ว่าจะเป็นของวันนี้หรือเก่ากว่านั้น) — ทำทั้งคู่ทุกครั้ง ทั้งสองขั้นมักจะไม่มีอะไรให้ทำ (ไม่มี hint ใหม่ / ไม่เกี่ยวข้องกับ hint เก่า) ซึ่งเป็นเรื่องปกติ

**กติกาประหยัด token (สำคัญ):** ทีม agent ถูกกำหนด `model: sonnet` ไว้ในไฟล์ spec แล้ว ห้าม override เป็นโมเดลแพงกว่า (ยกเว้น `hint-analyst` ที่ตั้งเป็น `model: fable` ไว้ตั้งใจ — รันเฉพาะตอนมี hint ที่ผ่านเกณฑ์จริง ไม่ใช่ทุก ticker); ระหว่างรอ agent อย่าโพสต์ข้อความสถานะยาว — โพสต์เฉพาะตอนมี action จริง; ถ้ารันหลาย ticker ควรเริ่มใน session ใหม่ที่ context ยังเล็ก และตรวจไฟล์ด้วยสคริปต์ validate ครั้งเดียวต่อไฟล์พอ

1. **เตรียม workspace**: กำหนด `DIR = pipeline/output/<TICKER>-<YYYY-MM-DD>` (วันที่วันนี้) สร้าง directory ถ้ายังไม่มี ถ้า ticker กำกวม (มีหลายตลาด) ให้ระบุตลาดตามที่ user บอก หรือเลือกตลาดหลักของหุ้นนั้น

2. **Research team**: spawn agent `stock-researcher` ด้วย prompt ที่ระบุ ticker, ชื่อบริษัทเท่าที่รู้, และสั่งให้เขียนผลลง `<DIR>/research.json` — รอจนเสร็จ แล้วอ่านไฟล์ตรวจว่า JSON ถูกต้องและมี research_items

2.5. **เช็ค hint** (ประเด็นที่กระทบกว้างกว่าหุ้นตัวนี้): ถ้า `research.json` มี `hints` ไม่ว่างเปล่า ให้ทำต่อไปนี้ต่อ hint แต่ละอัน **ก่อน** ไปขั้น 3:
   - รัน `node scripts/list-hints.mjs` เช็คว่ามีรายงาน hint เรื่องเดียวกัน/คล้ายกันถูกทำไปแล้วในช่วง 30 วันที่ผ่านมาหรือไม่ (ใช้วิจารณญาณเทียบหัวข้อ/`dek` ไม่ต้องตรงคำเป๊ะ) — ถ้าซ้ำ ข้าม ไม่ต้องทำซ้ำ
   - ถ้าไม่ซ้ำและยังมั่นใจว่าสำคัญพอ (ดูเกณฑ์ใน spec ของ `stock-researcher`): spawn agent `hint-analyst` ด้วย prompt ที่ส่ง title, why_it_matters, evidence จาก hint นั้น + ticker ที่เจอ (`discovered_from`) + วันที่วันนี้ (`run_date`) สั่งเขียนผลลง `<DIR>/hints/<slug>.json`
   - ตรวจไฟล์ผลลัพธ์ว่ามี `slug`, `title`, `content_md` แล้วรัน `node scripts/ingest-hint.mjs <DIR>/hints/<slug>.json` ตรวจว่าขึ้น `✔ ingested hint`
   - เก็บรายชื่อ hint ที่ทำสำเร็จไว้สรุปในขั้น 7

2.6. **เช็คความเกี่ยวข้องกับ hint ที่มีอยู่แล้ว** (ทั้งของเก่าและที่เพิ่งทำในขั้น 2.5): รัน `node scripts/list-hints.mjs 3650` (ดูย้อนหลังยาวเพราะจุดประสงค์คือหา exposure ไม่ใช่กัน dedup) ดูหัวข้อ+`dek` ทั้งหมด แล้วใช้วิจารณญาณเทียบกับ sector/ธุรกิจของหุ้นที่กำลัง research (จาก `stock.sector`/`details.business_md` ใน research.json) — ถ้าเห็นว่าหุ้นตัวนี้เกี่ยวข้องหรืออาจได้รับผลกระทบจริงๆ (ไม่ใช่เดาเลื่อนลอยหรือแค่อยู่ sector เดียวกันแบบห่างๆ) ให้รัน `node scripts/get-hint.mjs <slug>` ดึงเนื้อหาเต็ม แล้วสรุปสั้นๆ (2-4 ประโยค: ประเด็นคืออะไร + exposure ของหุ้นนี้โดยเฉพาะ) ไว้ส่งต่อในขั้น 3 และ 4 พร้อม slug — ไม่เจอ hint ที่เกี่ยวข้องจริงก็ข้ามได้ ไม่ต้องฝืนหา

3. **Analyze team**: spawn agent `stock-analyst` ด้วย prompt ที่บอก path ของ `<DIR>/research.json` และสั่งเขียนผลลง `<DIR>/analysis.json` — ถ้าขั้น 2.6 เจอ hint ที่เกี่ยวข้อง ให้แนบสรุป + slug ไปใน prompt ด้วย พร้อมย้ำว่าต้อง **factor เข้ากับ risk_level/verdict จริง** ไม่ใช่แค่แปะหมายเหตุท้ายรายงาน (ดู spec ของ agent) — รอจนเสร็จ ตรวจไฟล์

4. **Theorie team**: spawn agent `stock-theorist` ด้วย prompt ที่บอก path ทั้ง `<DIR>/research.json` และ `<DIR>/analysis.json` สั่งเขียนผลลง `<DIR>/theories.json` — ถ้าขั้น 2.6 เจอ hint ที่เกี่ยวข้อง ให้แนบสรุป + slug ไปใน prompt ด้วยเช่นกัน พร้อมย้ำว่าต้อง **factor เข้ากับ entry_plan จริง** (allocation/trigger/invalidation) ไม่ใช่แค่พูดถึงใน risks เฉยๆ (ดู spec ของ agent) — รอจนเสร็จ ตรวจไฟล์ว่ามีทั้ง `theories`, `summary_md` และ `entry_plan` (แผนแบ่งไม้ 1/2/3)

5. **ประกอบ bundle**: รัน `node scripts/assemble-bundle.mjs <DIR>` (รวม 3 ไฟล์เป็น `<DIR>/bundle.json` อัตโนมัติ) ตรวจว่าขึ้น `✔ assembled` และ `details=yes`

6. **บันทึกลง DB**: รัน `node scripts/ingest.mjs <DIR>/bundle.json` และตรวจว่าขึ้น `✔ ingested`
   - ถ้าตั้ง env `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` ไว้ จะเขียนตรงขึ้น production DB — เว็บอัปเดตทันที ข้ามขั้น 6.5 ได้
   - ไม่งั้นเขียนลง `data/stock.db` ในเครื่อง แล้วทำขั้น 6.5

   **6.5 อัปเดตเว็บ production (โหมดไม่มี Turso)**: รัน `npm run deploy` (export snapshot + deploy ขึ้น Vercel) ตรวจว่าจบด้วย URL production

7. **สรุปให้ user**: verdict, คะแนน, ทฤษฎีหลักพร้อม scenario, และบอกว่าดูผลเต็มได้ที่หน้าเว็บ `/stock/<TICKER>` — ถ้าขั้น 2.5 มี hint ที่ทำสำเร็จ ให้บอกแยกต่างหากชัดเจนว่าเจอ hint อะไรบ้างและดูได้ที่ `/insights/<slug>` — ปิดท้ายเตือนว่าไม่ใช่คำแนะนำการลงทุน

**เมื่อสั่งวิเคราะห์หลาย ticker พร้อมกัน**: ทำครบทุกขั้น (รวมขั้น 2.5) ต่อ ticker ก่อนไป ticker ถัดไป แล้วสรุปรวมท้ายสุดเป็น "N รายงานหุ้น + X hint" (X นับเฉพาะ hint ที่ไม่ซ้ำกับที่มีอยู่แล้ว) ไม่ต้องรอให้ทำครบทุก ticker ก่อนค่อยเช็ค hint
