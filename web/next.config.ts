import type { NextConfig } from "next";

// No custom turbopack/outputFileTracingRoot config needed — this app's only
// external dependency (@gomarg/shared-schemas) is now a real published npm
// package, installed into node_modules like any other, not a sibling
// file: path resolving outside the project root (see
// gmleads-shared/packages/shared-schemas/README.md for why that changed).
const nextConfig: NextConfig = {};

export default nextConfig;
