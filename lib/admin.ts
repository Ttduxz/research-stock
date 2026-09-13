/** อีเมลที่ดูหน้า /admin ได้ — ตั้งใน env ADMIN_EMAILS (คั่นด้วย comma) ไม่ hardcode ในโค้ด */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}
