import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const parentPkg = path.join(__dirname, "..", "package.json");
const isMonorepo = fs.existsSync(parentPkg);

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    // Bake live backend URL into client bundle for production images.
    // Local `next dev` still overridden by .env.local / hostname check.
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || "https://crm-server.dartcodes.cloud",
  },
  ...(isMonorepo
    ? {
        turbopack: {
          root: path.join(__dirname, ".."),
        },
      }
    : {}),
};

export default nextConfig;
