/**
 * คลัง research_items ระดับ ticker (ไม่ใช่ระดับ run)
 *
 * เดิม item ผูกกับ run เดียว ทำให้รอบติดตามรายสัปดาห์ต้องค้นของเดิมซ้ำทุกรอบ
 * (ก่อน dedupe: 544 item ทั้ง DB โดยซ้ำกันเอง 113 แถว) ตอนนี้ item เป็นของ ticker:
 *   run_id        = รอบที่เจอครั้งแรก (คงไว้เป็นหลักฐานว่าตอนนั้นเห็นอะไร)
 *   first_seen_on = วันที่เจอครั้งแรก / last_seen_on = วันที่ยังเจออยู่ล่าสุด
 *                   (ใช้ 'วันที่' ไม่ใช่ run id เพราะรอบ review รายสัปดาห์ไม่ได้สร้าง run ใหม่)
 *   status        = active | archived (เก่าและไม่สำคัญพอ) | superseded (มีข่าวใหม่มาแทน)
 */

/** key สำหรับกันซ้ำ: ใช้ url ถ้ามี ไม่งั้นใช้ title ที่ normalize แล้ว (เช่น item สรุปงบที่ไม่มีลิงก์) */
export function itemKey(item) {
  const url = (item.url ?? "").trim();
  if (url) return `url:${url}`;
  return `title:${(item.title ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

async function findItem(tx, ticker, key) {
  const isUrl = key.startsWith("url:");
  const rs = await tx.execute(
    isUrl
      ? { sql: `SELECT id FROM research_items WHERE ticker = ? AND url = ? LIMIT 1`, args: [ticker, key.slice(4)] }
      : {
          sql: `SELECT id FROM research_items WHERE ticker = ? AND lower(trim(title)) = ? LIMIT 1`,
          args: [ticker, key.slice(6)],
        }
  );
  return rs.rows.length > 0 ? Number(rs.rows[0].id) : null;
}

/**
 * เพิ่ม item เข้าคลัง — ถ้าเคยมีแล้วแค่ประทับว่าวันนี้ยังเจออยู่
 * **ไม่เขียนทับ content_md ของเดิม** เพราะข้อความตอนนั้นคือหลักฐานว่าตอนนั้นรู้อะไร
 * ctx = { ticker, runId, onDate } — runId คือรอบที่ยึดเป็นต้นทาง (รอบ review ใช้ base run)
 * คืน { id, created }
 */
export async function upsertItem(tx, ctx, item) {
  const { ticker, runId, onDate } = ctx;
  const existingId = await findItem(tx, ticker, itemKey(item));

  if (existingId != null) {
    await tx.execute({
      sql: `UPDATE research_items
            SET last_seen_on = ?, status = COALESCE(status, 'active')
            WHERE id = ?`,
      args: [onDate, existingId],
    });
    return { id: existingId, created: false };
  }

  const rs = await tx.execute({
    sql: `INSERT INTO research_items
            (run_id, last_seen_run_id, ticker, category, title, url, source, published_at, content_md,
             importance, status, first_seen_on, last_seen_on)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?) RETURNING id`,
    args: [
      runId,
      runId,
      ticker,
      item.category ?? "other",
      item.title,
      item.url ?? null,
      item.source ?? null,
      item.published_at ?? null,
      item.content_md ?? "",
      item.importance ?? 3,
      onDate,
      onDate,
    ],
  });
  return { id: Number(rs.rows[0].id), created: true };
}

/**
 * ทำเครื่องหมายว่า item เก่าถูกแทนที่ด้วยข่าวใหม่ (เช่น "ลือว่าจะซื้อกิจการ" → "ปิดดีลแล้ว")
 * ref = { url } หรือ { title } ของอันเก่า — หาไม่เจอก็ข้ามเงียบๆ ไม่ใช่ error
 */
export async function markSuperseded(tx, ticker, ref, newItemId) {
  const oldId = await findItem(tx, ticker, itemKey(ref));
  if (oldId == null || oldId === newItemId) return false;
  await tx.execute({
    sql: `UPDATE research_items SET status = 'superseded', superseded_by = ? WHERE id = ?`,
    args: [newItemId ?? null, oldId],
  });
  return true;
}
