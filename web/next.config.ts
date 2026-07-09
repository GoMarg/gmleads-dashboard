import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @gmleads/shared is a `file:../../gmleads-shared` sibling dependency
  // (true sibling of gmleads-dashboard, not nested inside it — see every
  // other service's package.json). Its node_modules symlink therefore
  // resolves to a real path outside this app entirely, and outside
  // gmleads-dashboard/ too. Turbopack refuses to bundle a resolved module
  // whose real path falls outside its root, so the root must be the common
  // ancestor of this app and every sibling repo it depends on (one level
  // above gmleads-dashboard/) — not just this directory. See KAN-100's
  // decisions.md entry.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
