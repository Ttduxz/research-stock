---
description: รัน pipeline วิเคราะห์หุ้นเต็มรูปแบบ (research → analyze → theorize → บันทึกลง DB) สำหรับ ticker ที่ระบุ
argument-hint: <TICKER> [ชื่อบริษัท/ตลาด ถ้า ticker กำกวม]
---

รัน pipeline วิเคราะห์หุ้นสำหรับ: $ARGUMENTS

คุณคือ orchestrator ของระบบ Tee Stock Research ทำตามขั้นตอนนี้ตามลำดับ (ขั้น 2-4 ต้องรอผลขั้นก่อนหน้า):

1. **เตรียม workspace**: กำหนด `DIR = pipeline/output/<TICKER>-<YYYY-MM-DD>` (วันที่วันนี้) สร้าง directory ถ้ายังไม่มี ถ้า ticker กำกวม (มีหลายตลาด) ให้ระบุตลาดตามที่ user บอก หรือเลือกตลาดหลักของหุ้นนั้น

2. **Research team**: spawn agent `stock-researcher` ด้วย prompt ที่ระบุ ticker, ชื่อบริษัทเท่าที่รู้, และสั่งให้เขียนผลลง `<DIR>/research.json` — รอจนเสร็จ แล้วอ่านไฟล์ตรวจว่า JSON ถูกต้องและมี research_items

3. **Analyze team**: spawn agent `stock-analyst` ด้วย prompt ที่บอก path ของ `<DIR>/research.json` และสั่งเขียนผลลง `<DIR>/analysis.json` — รอจนเสร็จ ตรวจไฟล์

4. **Theorie team**: spawn agent `stock-theorist` ด้วย prompt ที่บอก path ทั้ง `<DIR>/research.json` และ `<DIR>/analysis.json` สั่งเขียนผลลง `<DIR>/theories.json` — รอจนเสร็จ ตรวจไฟล์ว่ามีทั้ง `theories`, `summary_md` และ `entry_plan` (แผนแบ่งไม้ 1/2/3)

5. **ประกอบ bundle**: รัน `node scripts/assemble-bundle.mjs <DIR>` (รวม 3 ไฟล์เป็น `<DIR>/bundle.json` อัตโนมัติ) ตรวจว่าขึ้น `✔ assembled` และ `details=yes`

6. **บันทึกลง DB**: รัน `node scripts/ingest.mjs <DIR>/bundle.json` และตรวจว่าขึ้น `✔ ingested`
   - ถ้าตั้ง env `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` ไว้ จะเขียนตรงขึ้น production DB — เว็บอัปเดตทันที ข้ามขั้น 6.5 ได้
   - ไม่งั้นเขียนลง `data/stock.db` ในเครื่อง แล้วทำขั้น 6.5

   **6.5 อัปเดตเว็บ production (โหมดไม่มี Turso)**: รัน `npm run deploy` (export snapshot + deploy ขึ้น Vercel) ตรวจว่าจบด้วย URL production

7. **สรุปให้ user**: verdict, คะแนน, ทฤษฎีหลักพร้อม scenario, และบอกว่าดูผลเต็มได้ที่หน้าเว็บ `/stock/<TICKER>` — ปิดท้ายเตือนว่าไม่ใช่คำแนะนำการลงทุน
