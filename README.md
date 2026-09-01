# 📈 Tee Stock Research

ระบบวิเคราะห์หุ้นด้วยทีม AI specialist — สั่ง research ผ่าน Claude Code ผลลัพธ์เก็บลง DB และอ่านผ่านเว็บ

## สถาปัตยกรรม

```
คุณสั่ง: /research-stock NVDA
        │
        ▼
┌─ Claude Code (orchestrator / software engineering team) ─┐
│                                                          │
│  1. research team  (stock-researcher agent)              │
│     ค้นข่าว งบการเงิน filing อุตสาหกรรม sentiment          │
│        → research.json                                   │
│  2. analyze team   (stock-analyst agent)                 │
│     วิเคราะห์ศักยภาพ ให้คะแนน verdict                      │
│        → analysis.json                                   │
│  3. theorie team   (stock-theorist agent)                │
│     ตั้งทฤษฎี/สมมุติฐาน + scenario bull/base/bear          │
│        → theories.json                                   │
│  4. ingest bundle → DB                                   │
└──────────────────────────┬───────────────────────────────┘
                           ▼
                 libSQL (Turso cloud / local SQLite)
                           ▼
              Next.js บน Vercel (อ่านอย่างเดียว)
```

**ทำไม libSQL/Turso**: ข้อมูลเป็นเชิงเอกสาร (รายงาน+JSON) เขียนน้อยอ่านมาก — SQLite จึงพอและได้ข้อดีคือ dev ในเครื่องไม่ต้องตั้ง DB server เลย (ใช้ไฟล์ `data/stock.db`) ส่วน production ใช้ Turso ซึ่งเป็น SQLite บน cloud ที่ Vercel serverless ต่อได้โดยตรง มี free tier

## เริ่มใช้งานในเครื่อง

```bash
npm install
npm run db:init
npm run db:seed     # ข้อมูลตัวอย่าง ticker DEMO (สมมุติทั้งหมด)
npm run dev         # เปิด http://localhost:3000
```

## สั่ง research หุ้นจริง

เปิด Claude Code ในโฟลเดอร์นี้แล้วพิมพ์:

```
/research-stock NVDA
```

pipeline จะรันทีม agent ทั้ง 3 ตามลำดับ แล้ว ingest ผลลง DB อัตโนมัติ (ดูรายละเอียดใน `.claude/commands/research-stock.md`)

## Deploy บน Vercel

ระบบเลือกแหล่งข้อมูลอัตโนมัติ 3 โหมด (ดู `lib/db.ts`):

| โหมด | เงื่อนไข | เว็บอัปเดตยังไง |
|---|---|---|
| **Snapshot** (ค่าเริ่มต้นบน Vercel) | ไม่มี env Turso | `npm run deploy` — export ข้อมูลเป็น `data/export.json` แนบไปกับ deployment (pipeline `/research-stock` ทำให้อัตโนมัติ) |
| **Turso cloud** | ตั้ง `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | ingest เขียนตรงขึ้น cloud — เว็บอัปเดตทันที ไม่ต้อง deploy ซ้ำ |
| **SQLite file** | local dev | ไฟล์ `data/stock.db` |

deploy ครั้งแรก/ครั้งถัดไปด้วย Vercel CLI: `npm run deploy`

**อัปเกรดเป็น Turso ภายหลัง** (แนะนำเมื่อข้อมูลเยอะขึ้น): สมัครฟรีที่ [turso.tech](https://turso.tech) → ใส่ `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` ในไฟล์ `.env` ในเครื่อง และใน Vercel → Settings → Environment Variables → รัน `npm run db:init` หนึ่งครั้ง → เสร็จ โค้ดสลับโหมดเองอัตโนมัติ

## Schema (หลัก)

| ตาราง | เก็บอะไร |
|---|---|
| `stocks` | ข้อมูลหุ้น (ticker, ชื่อ, ตลาด, sector) |
| `research_runs` | รอบการ research แต่ละครั้ง + สรุปรวม + ราคา ณ วันรัน |
| `research_items` | ข้อมูลดิบจาก research team (ข่าว/งบ/filing/ฯลฯ พร้อมแหล่งอ้างอิง) |
| `analyses` | บทวิเคราะห์ + verdict + คะแนนพื้นฐาน/momentum + ความเสี่ยง |
| `theories` | ทฤษฎี/สมมุติฐาน + scenario bull/base/bear + catalysts + risks |

---

⚠️ ระบบนี้สร้างเพื่อการศึกษา ผลวิเคราะห์มาจาก AI ไม่ใช่คำแนะนำการลงทุน
