import { signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  // รับเฉพาะ path ภายในเว็บ กัน open redirect
  const redirectTo = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";

  return (
    <div className="login-box">
      <h1>เข้าสู่ระบบ</h1>
      <p className="login-sub">ใช้บัญชี Google เพื่อเข้าอ่านรายงานวิเคราะห์หุ้น</p>
      {error && <p className="login-error">เข้าสู่ระบบไม่สำเร็จ ({error}) ลองใหม่อีกครั้ง</p>}
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo });
        }}
      >
        <button type="submit" className="login-btn">
          เข้าสู่ระบบด้วย Google
        </button>
      </form>
    </div>
  );
}
