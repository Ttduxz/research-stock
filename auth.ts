import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { logAccess } from "@/lib/access-log";

/**
 * Login ด้วย Google — ทุกบัญชี Google เข้าได้ (ไม่มี whitelist) จุดประสงค์คือรู้ว่าใครเข้ามาเมื่อไหร่
 * session แบบ JWT ใน cookie ไม่ต้องมีตาราง user/session ใน DB
 * env: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET (Auth.js อ่านเองอัตโนมัติ)
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  events: {
    async signIn({ user }) {
      if (user.email) await logAccess({ email: user.email, name: user.name, event: "login" });
    },
    async signOut(message) {
      const email = "token" in message ? message.token?.email : null;
      if (email) await logAccess({ email, event: "logout" });
    },
  },
});
