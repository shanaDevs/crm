import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const parentPkg = path.join(__dirname, "..", "package.json");
const isMonorepo = fs.existsSync(parentPkg);

const nextConfig: NextConfig = {
  output: "standalone",
  ...(isMonorepo
    ? {
        turbopack: {
          root: path.join(__dirname, ".."),
        },
      }
    : {}),
};

export default nextConfig;
