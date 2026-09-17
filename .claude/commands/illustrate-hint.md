---
description: เติมภาพประกอบ/ศัพท์/สรุป 3 บรรทัด (ชั้นอ่านให้เข้าใจ) ให้รายงาน hint ที่มีอยู่แล้ว — ใช้เฉพาะข้อมูลในรายงาน ไม่ค้นเว็บ
---

เติม "ชั้นอ่านให้เข้าใจ" ให้ hint: $ARGUMENTS

รับได้ทั้ง slug (เช่น `nvidia-blackstone-ai-financing-spv`) หรือ URL ของหน้า `/insights/<slug>` (ตัดเอาเฉพาะ slug) · ใส่ `--all` แทน slug = ทำทุก hint ที่ยังไม่มีภาพ (ทีละตัว ไม่เกิน 5 ตัวต่อ session เพื่อคุม context) · ใส่ `--redo` ต่อท้าย slug = ทำใหม่ทับของเดิม

ไม่ใช้โควตาค้นเว็บเลย (agent มีแค่ Read/Write) รันต่อท้าย `/review-week` หรือ `/research-stock` ได้

## ขั้นตอน

1. **export** — `node scripts/illustrate-hints.mjs export pipeline/output/illustrate --slug <slug>` (ถ้า `--all` ไม่ต้องใส่ `--slug`; ถ้า `--redo` สคริปต์ยอมทับเพราะระบุ slug ตรงๆ) ได้ไฟล์ `pipeline/output/illustrate/<slug>.json` — **orchestrator ห้ามอ่านไฟล์นี้เอง** ส่งแค่ path ให้ agent
2. **agent `hint-illustrator`** (opus, Read/Write) — prompt: path ของไฟล์ + ให้เขียนผลที่ `pipeline/output/illustrate/<slug>.illustrated.json` ตามบทบาทของมัน (agent อ่าน `pipeline/hint-visuals-spec.md` เอง) ถ้ามีข้อสังเกตจาก user ว่าอยากเห็นภาพเรื่องไหนให้ส่งไปด้วยเป็น "ข้อสังเกต ไม่บังคับ"
3. **apply** — `node scripts/illustrate-hints.mjs apply pipeline/output/illustrate/<slug>.illustrated.json` · exit 1 = สคริปต์พิมพ์รายการปัญหา (ตัวเลขไม่มีในเนื้อหา / แก้ content_md นอกจาก marker / label ยาวเกิน ฯลฯ) → ส่งรายการนั้นกลับให้ agent ตัวเดิมแก้ **ไม่เกิน 2 รอบ** ห้ามแก้ JSON เองและห้ามใส่ `--force` (ไม่มี) ไม่ผ่าน = รายงาน user ว่าตัวไหนไม่ผ่านเพราะอะไร
4. **ไม่ต้อง deploy** — เขียนตรงขึ้น Turso หน้า `/insights/<slug>` อัปเดตภายใน ~60 วินาที
5. รายงาน user สั้นๆ: ทำกี่ภาพ ชนิดอะไร วางหลังหัวข้อไหน ภาพที่ agent คิดแล้วตัดทิ้งเพราะอะไร และลิงก์หน้า

## กติกา

- ภาพต้องแสดงสิ่งที่ตัวหนังสือทำไม่ได้ (เทียบขนาด / การไหล / ตำแหน่งบนสเกล) กล่องข้อความไม่ใช่ภาพ — ถ้า agent ส่ง `visuals: []` พร้อม `no_visual_reason` ให้ยอมรับและบอก user ตรงๆ
- ตัวเลขทุกตัวในภาพต้องมีในรายงานอยู่แล้ว ห้ามค้นเพิ่ม ห้ามคำนวณ (ตัวตรวจอยู่ `scripts/hint-visuals.mjs`)
- เนื้อหาเดิมห้ามเปลี่ยนแม้ตัวอักษรเดียว นอกจากแทรกบรรทัด `[[visual:<id>]]`
