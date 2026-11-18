import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript pragmas
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    // idiomatic in class components (ErrorBoundary etc.)
    "@typescript-eslint/no-this-alias": "off",

    // React pragmas
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    // shadcn/ui generated code is not react-compiler-clean
    "react-compiler/react-compiler": "off",

    // Next.js pragmas
    "@next/next/no-img-element": "off",
  },
}, {
  ignores: ["node_modules/**", ".venv/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "public/**", "scripts/**", "mini-services/**", "docs/**", "data/**"]
}];

export default eslintConfig;
