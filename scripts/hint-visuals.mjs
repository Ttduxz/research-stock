/**
 * สเปก + ตัวตรวจ "ชั้นอ่านให้เข้าใจ" ของรายงาน hint — ใช้ร่วมกันโดย ingest-hint.mjs (hint ใหม่จาก hint-analyst)
 * และ illustrate-hints.mjs (เติมย้อนหลังให้ hint เก่าโดย hint-illustrator)
 *
 * หลักการ: agent ส่งแค่ "ข้อมูลของภาพ" (JSON) เว็บเป็นคนวาด (components/HintVisuals.tsx)
 *   - agent ที่อ่านเนื้อหาจากเว็บห้ามส่ง SVG/HTML — เนื้อหาเป็น untrusted input
 *   - ภาพต้องแสดงสิ่งที่ตัวหนังสือทำไม่ได้ 3 อย่างเท่านั้น: เทียบขนาด / ความสัมพันธ์-การไหล / ตำแหน่งบนสเกล
 *     "กล่องข้อความ" ไม่ใช่ภาพ (บทเรียนจากตัวอย่างแรกที่ทำ 2026-09-17: หัวข้อ "3 ชั้นซ้อนกัน" ใส่กล่อง 3 กล่องแล้วไม่ช่วยอะไร)
 *   - ทุกภาพต้องมี read_md = "อ่านภาพ" ตอบว่าภาพนี้ทำให้เห็นอะไรที่ย่อหน้าไม่ได้บอก — เขียนไม่ออก = ไม่ต้องมีภาพ
 *   - ตัวเลขทุกตัวในภาพต้องมีในเนื้อหา (content_md / dek / stats) อยู่แล้ว — ภาพไม่ใช่แหล่งข้อมูลใหม่
 *   - จำกัด 2-4 ภาพต่อรายงาน ให้เลือกจุดที่ช่วยที่สุด ไม่ใช่ทำทุกหัวข้อ
 *
 * ชนิดภาพ (field `type`):
 *   bars      เทียบขนาดหลายค่า        { unit?, items: [{ label, value, display?, note?, kind?: base|hot|est }] }
 *   compare   ก่อน/หลัง ต่อหมวด        { unit?, before_label, after_label, items: [{ label, before, after }] }
 *   flow      ใครจ่ายใคร/อะไรทำให้อะไร  { nodes: [{ id, label, sub?, kind?: actor|money|pressure|neutral, col 1-4, row 1-3 }],
 *                                        edges: [{ from, to, label?, kind?: money|pressure|neutral }],
 *                                        steps?: [{ title, edges: ["from>to", ...], caption_md }] }  ← เล่นทีละขั้นได้
 *   scale     ตำแหน่งบนช่วง             { unit?, min, max, markers: [{ label, value, kind?: now|past|threshold }],
 *                                        zones?: [{ from, to, label, tone?: ok|warn|bad }] }
 *   timeline  ลำดับเหตุการณ์ (+ยอดสะสม)  { unit?, items: [{ date: "YYYY-MM" | "YYYY-MM-DD", label, value?, note? }] }
 *
 * วางภาพในเนื้อหาด้วย marker บรรทัดเดี่ยว `[[visual:<id>]]` ใน content_md — ภาพที่ไม่มี marker จะไปต่อท้ายเนื้อหา
 * glossary: [{ term, meaning_md }] 3-8 คำ · tldr_md: 2-4 bullet ภาษาคน
 */

export const VISUAL_TYPES = ["bars", "compare", "flow", "scale", "timeline"];
export const MAX_VISUALS = 4;
export const MARKER_RE = /^\s*\[\[visual:([a-z0-9-]+)\]\]\s*$/gm;

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** ตัวเลขทั้งหมดที่ภาพอ้าง — ใช้ตรวจว่ามีในเนื้อหาจริง (ไม่รวมแกน min/max ของ scale เพราะเป็นแค่ขอบเขตวาด) */
function numbersOf(v) {
  const out = [];
  if (v.type === "bars") for (const it of v.items ?? []) out.push(it.value);
  if (v.type === "compare") for (const it of v.items ?? []) out.push(it.before, it.after);
  if (v.type === "scale") for (const m of v.markers ?? []) out.push(m.value);
  if (v.type === "timeline") for (const it of v.items ?? []) if (it.value != null) out.push(it.value);
  return out.filter((n) => typeof n === "number" && Number.isFinite(n));
}

/** "108.5" / "220" / "0.9" — ตัดศูนย์ท้าย เลขติดลบใช้ค่าสัมบูรณ์ (ในข้อความมักเขียน "-$5.9B" หรือ "ติดลบ 5.9") */
function numToText(n) {
  const a = Math.abs(n);
  return Number.isInteger(a) ? String(a) : String(Number(a.toFixed(4)));
}

/** เนื้อหาที่ถือว่าเป็น "แหล่งตัวเลข" ของภาพ — ลบ comma คั่นหลักออกก่อนเทียบ (1,650 ↔ 1650) */
export function corpusOf(hint) {
  const stats = Array.isArray(hint.stats) ? hint.stats : parseMaybe(hint.stats_json) ?? [];
  const parts = [hint.title, hint.dek, hint.content_md, hint.opinion_md];
  for (const s of stats) parts.push(s?.label, s?.value, s?.note);
  return parts
    .filter(Boolean)
    .join("\n")
    .replace(/(\d),(?=\d{3})/g, "$1");
}

function parseMaybe(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasNumber(corpus, n) {
  const t = numToText(n).replace(".", "\\.");
  // ต้องไม่มีเลขติดหน้า/หลัง กัน "28" ไปเจอใน "2028" หรือ "121" ใน "1210"
  return new RegExp(`(?<![\\d.])${t}(?![\\d])(?!\\.\\d)`).test(corpus);
}

/**
 * ตรวจสเปกภาพ + glossary + tldr ของ hint หนึ่งรายการ
 * @returns string[] รายการปัญหา (ว่าง = ผ่าน)
 */
export function validateHintExtras(hint) {
  const errors = [];
  const visuals = hint.visuals;
  const glossary = hint.glossary;
  const corpus = corpusOf(hint);

  if (visuals != null) {
    if (!Array.isArray(visuals)) errors.push("visuals ต้องเป็น array");
    else {
      if (visuals.length > MAX_VISUALS) errors.push(`visuals มี ${visuals.length} ภาพ — จำกัด ${MAX_VISUALS} เลือกเฉพาะที่ช่วยจริง`);
      const ids = new Set();
      visuals.forEach((v, i) => {
        const at = `visuals[${i}]`;
        if (!v || typeof v !== "object") return errors.push(`${at} ไม่ใช่ object`);
        if (!ID_RE.test(v.id ?? "")) errors.push(`${at}.id ต้องเป็น kebab-case (ได้ "${v.id}")`);
        else if (ids.has(v.id)) errors.push(`${at}.id "${v.id}" ซ้ำ`);
        ids.add(v.id);
        if (!VISUAL_TYPES.includes(v.type)) errors.push(`${at}.type "${v.type}" ไม่ใช่หนึ่งใน ${VISUAL_TYPES.join("/")}`);
        if (!v.title?.trim()) errors.push(`${at}.title ว่าง`);
        if (!v.read_md?.trim() || v.read_md.trim().length < 20)
          errors.push(`${at}.read_md ("อ่านภาพ") ต้องบอกว่าภาพทำให้เห็นอะไรที่ย่อหน้าไม่ได้บอก — เขียนไม่ออก = ตัดภาพนี้ทิ้ง`);
        errors.push(...validateShape(v, at));
        for (const n of numbersOf(v)) {
          if (!hasNumber(corpus, n)) errors.push(`${at} ใช้ตัวเลข ${numToText(n)} ที่ไม่มีในเนื้อหา/stats ของรายงาน — ภาพต้องใช้เฉพาะตัวเลขที่รายงานมีอยู่แล้ว`);
        }
      });
      // marker ในเนื้อหาต้องชี้ไปที่ภาพที่มีจริง
      for (const m of String(hint.content_md ?? "").matchAll(MARKER_RE)) {
        if (!ids.has(m[1])) errors.push(`content_md มี marker [[visual:${m[1]}]] แต่ไม่มีภาพ id นี้`);
      }
    }
  } else {
    for (const m of String(hint.content_md ?? "").matchAll(MARKER_RE)) {
      errors.push(`content_md มี marker [[visual:${m[1]}]] แต่ไม่มี visuals`);
    }
  }

  if (glossary != null) {
    if (!Array.isArray(glossary)) errors.push("glossary ต้องเป็น array");
    else {
      if (glossary.length > 8) errors.push(`glossary มี ${glossary.length} คำ — จำกัด 8 เอาเฉพาะคำที่ถ้าไม่รู้แล้วอ่านต่อไม่ได้`);
      const seen = new Set();
      glossary.forEach((g, i) => {
        if (!g?.term?.trim()) errors.push(`glossary[${i}].term ว่าง`);
        if (!g?.meaning_md?.trim()) errors.push(`glossary[${i}].meaning_md ว่าง`);
        if (g?.meaning_md && g.meaning_md.length > 320) errors.push(`glossary[${i}] "${g.term}" อธิบายยาวเกิน (จำกัด ~320 ตัวอักษร — ต้องอ่านจบใน tooltip)`);
        const key = g?.term?.trim().toLowerCase();
        if (key && seen.has(key)) errors.push(`glossary "${g.term}" ซ้ำ`);
        seen.add(key);
        if (key && !corpus.toLowerCase().includes(key)) errors.push(`glossary "${g.term}" ไม่ปรากฏในเนื้อหาเลย — ใส่เฉพาะคำที่ผู้อ่านจะเจอจริง`);
      });
    }
  }

  if (hint.tldr_md != null) {
    const bullets = String(hint.tldr_md).split("\n").filter((l) => /^\s*[-*]\s+/.test(l));
    if (bullets.length < 2 || bullets.length > 4) errors.push(`tldr_md ต้องเป็น bullet 2-4 ข้อ (ได้ ${bullets.length})`);
    if (/<[a-z][\s\S]*>/i.test(hint.tldr_md)) errors.push("tldr_md ห้ามมี HTML");
  }

  return errors;
}

function validateShape(v, at) {
  const e = [];
  const num = (x) => typeof x === "number" && Number.isFinite(x);
  switch (v.type) {
    case "bars": {
      if (!Array.isArray(v.items) || v.items.length < 2 || v.items.length > 8) e.push(`${at}.items ต้องมี 2-8 แท่ง`);
      else
        v.items.forEach((it, i) => {
          if (!it?.label?.trim()) e.push(`${at}.items[${i}].label ว่าง`);
          if (!num(it?.value)) e.push(`${at}.items[${i}].value ต้องเป็นตัวเลข`);
          if (it?.kind && !["base", "hot", "est"].includes(it.kind)) e.push(`${at}.items[${i}].kind ต้องเป็น base|hot|est`);
        });
      break;
    }
    case "compare": {
      if (!v.before_label?.trim() || !v.after_label?.trim()) e.push(`${at} ต้องมี before_label และ after_label`);
      if (!Array.isArray(v.items) || v.items.length < 1 || v.items.length > 8) e.push(`${at}.items ต้องมี 1-8 หมวด`);
      else
        v.items.forEach((it, i) => {
          if (!it?.label?.trim()) e.push(`${at}.items[${i}].label ว่าง`);
          if (!num(it?.before) || !num(it?.after)) e.push(`${at}.items[${i}] before/after ต้องเป็นตัวเลข`);
        });
      break;
    }
    case "flow": {
      const nodes = Array.isArray(v.nodes) ? v.nodes : [];
      if (nodes.length < 2 || nodes.length > 8) e.push(`${at}.nodes ต้องมี 2-8 กล่อง`);
      const nid = new Set();
      const cells = new Set();
      nodes.forEach((n, i) => {
        if (!ID_RE.test(n?.id ?? "")) e.push(`${at}.nodes[${i}].id ต้องเป็น kebab-case`);
        if (nid.has(n?.id)) e.push(`${at}.nodes id "${n.id}" ซ้ำ`);
        nid.add(n?.id);
        if (!n?.label?.trim()) e.push(`${at}.nodes[${i}].label ว่าง`);
        if (n?.label && n.label.length > 28) e.push(`${at}.nodes[${i}].label ยาวเกิน 28 ตัวอักษร ("${n.label}") — กล่องจะล้น`);
        if (n?.sub && n.sub.length > 34) e.push(`${at}.nodes[${i}].sub ยาวเกิน 34 ตัวอักษร`);
        if (!Number.isInteger(n?.col) || n.col < 1 || n.col > 4) e.push(`${at}.nodes[${i}].col ต้องเป็น 1-4`);
        if (!Number.isInteger(n?.row) || n.row < 1 || n.row > 3) e.push(`${at}.nodes[${i}].row ต้องเป็น 1-3`);
        const cell = `${n?.col},${n?.row}`;
        if (cells.has(cell)) e.push(`${at}.nodes "${n?.id}" ซ้อนช่อง (${cell}) กับกล่องอื่น`);
        cells.add(cell);
        if (n?.kind && !["actor", "money", "pressure", "neutral"].includes(n.kind)) e.push(`${at}.nodes[${i}].kind ไม่ถูกต้อง`);
      });
      const edges = Array.isArray(v.edges) ? v.edges : [];
      if (edges.length < 1) e.push(`${at}.edges ต้องมีอย่างน้อย 1 เส้น`);
      const eid = new Set();
      edges.forEach((ed, i) => {
        if (!nid.has(ed?.from)) e.push(`${at}.edges[${i}].from "${ed?.from}" ไม่มีใน nodes`);
        if (!nid.has(ed?.to)) e.push(`${at}.edges[${i}].to "${ed?.to}" ไม่มีใน nodes`);
        if (ed?.from === ed?.to) e.push(`${at}.edges[${i}] ชี้หาตัวเอง`);
        if (ed?.label && ed.label.length > 26) e.push(`${at}.edges[${i}].label ยาวเกิน 26 ตัวอักษร`);
        eid.add(`${ed?.from}>${ed?.to}`);
      });
      if (v.steps != null) {
        if (!Array.isArray(v.steps) || v.steps.length < 2 || v.steps.length > 6) e.push(`${at}.steps ต้องมี 2-6 ขั้น`);
        else
          v.steps.forEach((s, i) => {
            if (!s?.title?.trim()) e.push(`${at}.steps[${i}].title ว่าง`);
            if (!s?.caption_md?.trim()) e.push(`${at}.steps[${i}].caption_md ว่าง`);
            if (!Array.isArray(s?.edges) || s.edges.length < 1) e.push(`${at}.steps[${i}].edges ต้องระบุอย่างน้อย 1 เส้น ("from>to")`);
            else for (const k of s.edges) if (!eid.has(k)) e.push(`${at}.steps[${i}] อ้างเส้น "${k}" ที่ไม่มีใน edges`);
          });
      }
      break;
    }
    case "scale": {
      if (!num(v.min) || !num(v.max) || v.min >= v.max) e.push(`${at} ต้องมี min < max`);
      if (!Array.isArray(v.markers) || v.markers.length < 1 || v.markers.length > 6) e.push(`${at}.markers ต้องมี 1-6 จุด`);
      else
        v.markers.forEach((m, i) => {
          if (!m?.label?.trim()) e.push(`${at}.markers[${i}].label ว่าง`);
          if (!num(m?.value)) e.push(`${at}.markers[${i}].value ต้องเป็นตัวเลข`);
          else if (num(v.min) && num(v.max) && (m.value < v.min || m.value > v.max)) e.push(`${at}.markers[${i}] ค่า ${m.value} อยู่นอกช่วง min-max`);
          if (m?.kind && !["now", "past", "threshold"].includes(m.kind)) e.push(`${at}.markers[${i}].kind ไม่ถูกต้อง`);
        });
      if (v.zones != null)
        (Array.isArray(v.zones) ? v.zones : []).forEach((z, i) => {
          if (!num(z?.from) || !num(z?.to) || z.from >= z.to) e.push(`${at}.zones[${i}] ต้องมี from < to`);
          if (!z?.label?.trim()) e.push(`${at}.zones[${i}].label ว่าง`);
          if (z?.tone && !["ok", "warn", "bad"].includes(z.tone)) e.push(`${at}.zones[${i}].tone ไม่ถูกต้อง`);
        });
      break;
    }
    case "timeline": {
      if (!Array.isArray(v.items) || v.items.length < 2 || v.items.length > 10) e.push(`${at}.items ต้องมี 2-10 เหตุการณ์`);
      else {
        let prev = "";
        v.items.forEach((it, i) => {
          if (!/^\d{4}-\d{2}(-\d{2})?$/.test(it?.date ?? "")) e.push(`${at}.items[${i}].date ต้องเป็น YYYY-MM หรือ YYYY-MM-DD`);
          else {
            if (it.date < prev) e.push(`${at}.items[${i}] วันที่ไม่เรียงจากเก่าไปใหม่`);
            prev = it.date;
          }
          if (!it?.label?.trim()) e.push(`${at}.items[${i}].label ว่าง`);
          if (it?.value != null && !num(it.value)) e.push(`${at}.items[${i}].value ต้องเป็นตัวเลข`);
        });
      }
      break;
    }
    default:
      break;
  }
  return e;
}

/** content_md เดิม (ตัด marker ออก) ต้องเท่ากับต้นฉบับทุกตัวอักษร — illustrator แทรกได้แค่บรรทัด marker */
export function stripMarkers(md) {
  return String(md ?? "")
    .replace(MARKER_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sameContentExceptMarkers(original, edited) {
  return stripMarkers(original) === stripMarkers(edited);
}
