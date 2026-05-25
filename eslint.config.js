import js from "@eslint/js";
import globals from "globals";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

const browserGlobals = {
  ...globals.browser,
  ...globals.es2024,
};

export default tseslint.config(
  {
    ignores: [
      ".astro/**",
      ".pi/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "static/**",
      "storybook-server/**",
      "storybook-static/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,astro}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals,
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["*.config.{js,ts}", "astro.config.ts", "vitest.config.ts", "bin/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}", "vitest.setup.ts"],
    languageOptions: {
      globals: {
        ...browserGlobals,
        ...globals.node,
      },
    },
  },
);
