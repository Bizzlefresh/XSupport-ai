import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

// Next.js preset (React, hooks, core web vitals, TypeScript) plus the full jsx-a11y recommended rules.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "e2e-artifacts/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Next enables only a few jsx-a11y rules; use the plugin's full recommended set (the plugin ships with eslint-config-next).
  ...compat.extends("plugin:jsx-a11y/recommended"),
];

export default config;
