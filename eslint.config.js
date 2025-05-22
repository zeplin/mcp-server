import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import globals from "globals";
import js from "@eslint/js";

export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "import": importPlugin
    },
    rules: {
      // Basic ESLint rules
      "no-trailing-spaces": "error",
      "eol-last": "error",
      "object-curly-spacing": ["error", "always"],
      "eqeqeq": ["error", "always"],
      "comma-spacing": ["error", { "before": false, "after": true }],
      "no-multi-spaces": "error",
      "space-in-parens": ["error", "never"],
      "key-spacing": "error",
      "no-duplicate-imports": "error",

      // TypeScript rules from tseslint.configs.recommended
      ...tseslint.configs.recommended.rules,
      
      // Override some TypeScript rules
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/ban-types": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        "ignoreRestSiblings": true,
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      
      // Import rules
      "import/order": ["error", {
        "newlines-between": "always",
        "groups": [
          ["builtin", "external"],
          "parent",
          "sibling",
          "index"
        ],
        "alphabetize": {
          "order": "asc",
          "caseInsensitive": true,
        },
      }],
      "import/no-duplicates": "error"
    }
  },
  {
    files: ["**/tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
];