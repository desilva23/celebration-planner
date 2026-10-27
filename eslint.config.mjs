import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // React accepts async event handlers, and `useAiCall` never rejects.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      // Next's config API and mock implementations are async by contract.
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-deprecated": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // User content must never reach the logs; errors are logged deliberately.
      "no-console": ["error", { allow: ["error"] }],
      eqeqeq: "error",
      // Zod must be configured for the Content-Security-Policy before any schema is built.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "zod", message: "Import z from src/lib/zod.ts, which configures it.", allowTypeImports: true },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/zod.ts"],
    rules: { "@typescript-eslint/no-restricted-imports": "off" },
  },
  {
    // Keep every unit small enough to read in one go.
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      complexity: ["error", 10],
      "max-depth": ["error", 3],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.test-helpers.ts", "src/test/**"],
    rules: {
      "max-params": ["error", 4],
      "max-nested-callbacks": ["error", 3],
      "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**"],
    rules: {
      // Mocks and `Response.json()` are untyped by nature.
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "reports/**",
    ".stryker-tmp/**",
    "next-env.d.ts",
  ]),
]);
