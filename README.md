# ts-analyzer

![npm](https://img.shields.io/npm/v/ts-analyzer)
![coverage](https://img.shields.io/badge/coverage-88%25-brightgreen)
![license](https://img.shields.io/npm/l/ts-analyzer)

`ts-analyzer` is a comprehensive static analysis tool for checking TypeScript and JavaScript code quality, focusing on type safety, structural complexity, and identifying potential anti-patterns.

---

## ✨ Features

- **TypeScript Safety Metrics**: Calculates true type coverage (tracking `any` usage, explicit generics, assertions, etc.).
- **Code Complexity Analysis**: Measures Cyclomatic Complexity and Nesting Depth for maintainability.
- **Anti-Pattern Detection**: Highlights code smells such as Magic Numbers, Callback Hell, God Files (>500 lines), and excessive parameters.
- **Flexible Reporting**: Output formats in HTML, JSON, or Text.
- **Reliable**: Supported by **~88% test coverage** using Vitest.

---

## 🔍 How It Works

### Type Safety Analysis
Evaluates AST nodes to determine whether variables, parameters, and return types are explicitly or implicitly typed vs left as `any`.
* **Score Formula**: `(Coverage% × 0.6) - (Any Type Penalty × 0.2) - (Assertion Penalty × 0.2)`
* **tsconfig Impact**: Bonus points awarded if `strict`, `noImplicitAny`, etc., are enabled.

### Code Complexity Analysis
Evaluates the structure of functions to determine their complexity footprint:
1. **Cyclomatic Complexity**: Number of independent paths.
2. **Nesting Depth**: Deeply nested blocks (Callback Hell).
3. **Function / Param Size**: Lines per function and parameter counts.
* **Rating**: <30 (Simple) | 30-60 (Moderate) | >60 (Complex)

### Why switch to `ts-analyzer`?
It is the highly-optimized, TypeScript-tailored evolution of `react-loc-analyzer`. It goes beyond simple line counting to provide deep, actionable insights on AST-level patterns.

---

## 🚀 Quick Start

Run it directly using `npx`:

```bash
npx ts-analyzer /path/to/project
```

Available CLI Options:
- `-f, --format <type>`: `text`, `json`, or `html`
- `-e, --exclude <patterns>`: Comma-separated ignore patterns
- `--no-safety` / `--no-complexity`: Skip specific analyses

## ⚙️ Configuration File
Persist settings by creating a `ts-analyzer.config.json` in your project root:
```json
{
  "safety": true,
  "complexity": true,
  "format": "text",
  "exclude": ["node_modules", "dist", ".next"],
  "include": [".js", ".ts", ".tsx"]
}
```

## 🛠 Development
Install tools and run the high-coverage test suite:
```bash
npm install
npm test
npm run test:coverage
```

## 📝 License
MIT