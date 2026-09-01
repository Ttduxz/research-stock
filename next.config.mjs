/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@libsql/client"],
  // แนบ snapshot ไปกับ serverless functions (โหมดไม่มี Turso)
  outputFileTracingIncludes: {
    "/**": ["./data/export.json"],
  },
};

export default nextConfig;
