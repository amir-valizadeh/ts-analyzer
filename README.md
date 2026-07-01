# ts-analyzer — TypeScript Static Code Analysis & Type Safety Metrics

[![npm version](https://img.shields.io/npm/v/ts-analyzer)](https://www.npmjs.com/package/ts-analyzer)
[![test coverage](https://img.shields.io/badge/coverage-88%25-brightgreen)](https://github.com/amir-valizadeh/ts-analyzer)
[![license](https://img.shields.io/npm/l/ts-analyzer)](https://github.com/amir-valizadeh/ts-analyzer/blob/main/LICENSE)

`ts-analyzer` is a high-performance **static code analysis tool** designed to inspect, measure, and optimize **TypeScript** and **JavaScript** codebases. By performing AST (Abstract Syntax Tree) analysis on your source files, it calculates your **type coverage**, computes a custom **type safety score**, measures **cyclomatic complexity**, identifies **duplicate code**, and flags **code smells / anti-patterns**.

Upgrade your code quality tracking beyond simple line counting to comprehensive structural analysis.

---

## Table of Contents
- [Key Features](#key-features)
- [Why ts-analyzer? (Comparison)](#why-ts-analyzer-comparison)
- [How It Works](#how-it-works)
  - [Type Safety Score Calculation](#type-safety-score-calculation)
  - [Code Complexity Metrics](#code-complexity-metrics)
- [Quick Start Guide](#quick-start-guide)
  - [CLI Command Options](#cli-command-options)
- [Configuration (`ts-analyzer.config.json`)](#configuration-ts-analyzerconfigjson)
- [Example Report Formats](#example-report-formats)
  - [JSON Report](#json-report)
  - [HTML Dashboard](#html-dashboard)
- [CI/CD Pipeline Integration](#cicd-pipeline-integration)
- [Development & Testing](#development--testing)
- [Frequently Asked Questions (FAQ)](#frequently-asked-questions-faq)
- [License](#license)

---

## Key Features

- 📊 **Type Safety & Coverage Analysis**: Computes your actual type coverage, penalizing overused `any` declarations, generic safety lapses, and raw type assertions.
- 📉 **Cyclomatic Complexity Measurement**: Analyzes structural paths in your control flow graph to rate how maintainable and testable your functions are.
- 🔍 **Code Smell & Anti-Pattern Detection**: Automatically flags Callback Hell, Magic Numbers, Excessive Parameters (>4), and "God Files" (>500 lines).
- 👯 **Duplicate Code Finder**: Scans files for structural duplicates and cloned logic blocks across your codebase.
- 📋 **Multiple Output Formats**: Supports clean terminal tables (`text`), structured data (`json`), or interactive HTML dashboards (`html`).
- ⚡ **Strict tsconfig Checker**: Evaluates configuration flags (`strict`, `noImplicitAny`, etc.) and awards bonus points for stricter setups.

---

## Why ts-analyzer? (Comparison)

Standard linting tools like ESLint and formatting tools like Prettier check code formatting and basic rules, but don't give you a unified health score or complexity map.

| Feature / Metric | `ts-analyzer` | ESLint | react-loc-analyzer |
| :--- | :---: | :---: | :---: |
| **AST-Based Type Coverage** | Yes | No | No |
| **Cyclomatic Complexity Rating** | Yes | Yes (Rules) | No |
| **Unified Type Safety Score** | Yes | No | No |
| **Duplicate Code Scan** | Yes | No | No |
| **Interactive HTML Reports** | Yes | No | No |
| **Line Counter** | Yes | No | Yes |

---

## How It Works

### Type Safety Score Calculation

The tool utilizes TypeScript's compiler API to parse files into AST nodes, separating explicit types from implicit/inferred ones.

```text
┌─────────────────────┐
│ TypeScript Files    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐    ┌─────────────────────┐
│ AST Analysis        │───>│ Node Classification │
└─────────┬───────────┘    └─────────┬───────────┘
          │                          │
          ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│ Explicitly Typed    │    │ Implicitly Typed    │
│ Nodes               │    │ Nodes               │
└─────────┬───────────┘    └─────────┬───────────┘
          │                          │
          └──────────┬──────────────┘
                     │
                     ▼
┌─────────────────────┐    ┌─────────────────────┐
│ Type Coverage       │<───│ tsconfig.json       │
│ Calculation         │    │ Analysis            │
└─────────┬───────────┘    └─────────────────────┘
          │
          ▼
┌─────────────────────┐
│ "any" & Assertion   │
│ Penalty Calculation │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Final Type Safety   │
│ Score & Rating      │
└─────────────────────┘
```

* **Formula**: The final score is based on the percentage of typed nodes, minus penalty weights for every instance of `any`, `as Type` assertions, and non-null assertions (`!`).
* **tsconfig.json Influence**: Active compiler configurations such as `strict: true` or `noImplicitAny: true` boost the overall rating.

### Code Complexity Metrics

`ts-analyzer` calculates a score for function and structural complexity:
1. **Cyclomatic Complexity**: Measures independent execution paths (conditions, loops). Ratings: `<30` (Simple), `30-60` (Moderate), `>60` (High Complexity).
2. **Nesting Depth**: Highlights highly nested code blocks to help developers avoid "Callback Hell".
3. **Function Arguments**: Flags functions with more than 4 parameters.
4. **Duplicate Code Detection**: Identifies structurally identical sequences of code in different files.

---

## Quick Start Guide

You can run `ts-analyzer` directly using `npx` without local installation:

```bash
npx ts-analyzer /path/to/project
```

Or install it globally:

```bash
npm install -g ts-analyzer
ts-analyzer /path/to/project
```

### CLI Command Options

| Option | Shortcut | Description |
| :--- | :---: | :--- |
| `--format <type>` | `-f` | Output format: `text`, `json`, `html`, or `context` |
| `--exclude <folders>` | `-e` | Folders to ignore, comma-separated (e.g. `node_modules,dist,.next`) |
| `--no-safety` | | Skip TypeScript type safety calculations for faster runs |
| `--no-complexity` | | Skip code complexity and anti-pattern analysis |
| `--init-rules [type]` | | Generate customized AI coding rules (`cursorrules`, `claudeprompt`, or `both`) |

---

## Configuration (`ts-analyzer.config.json`)

To standardize run settings in your repository, create a `ts-analyzer.config.json` file in your project root:

```json
{
  "safety": true,
  "complexity": true,
  "format": "text",
  "exclude": ["node_modules", "dist", ".next", "coverage"],
  "include": [".js", ".jsx", ".ts", ".tsx"]
}
```

---

## Example Report Formats

### JSON Report
Generate structured analysis data using `-f json`:

```json
{
  "files": 156,
  "totalLines": 15234,
  "codeLines": 12845,
  "typescriptSafety": {
    "tsPercentage": "84.6",
    "avgTypeCoverage": "92.3",
    "totalAnyCount": 12,
    "avgTypeSafetyScore": 85,
    "overallComplexity": "Low"
  },
  "codeComplexity": {
    "avgComplexity": "3.2",
    "maxComplexity": 12,
    "overallComplexity": "Low",
    "codeSmells": {
      "magicNumbers": 0,
      "callbackHell": 0,
      "excessiveParameters": 0,
      "godFiles": 0
    },
    "duplicateCode": {
      "totalClones": 2,
      "totalDuplicateLines": 24,
      "clones": []
    }
  }
}
```

### HTML Dashboard
Generate a responsive web dashboard using `-f html` which saves as `ts-analyzer-report.html`. It provides:
- **Project Summary Cards**: Visual highlights of total files, line counts, and comments.
- **Type Safety Score Progress Bars**: Quick visual representation of code safety levels.
- **Code Smell Warning Badges**: Colored status flags indicating potential structural design issues.

### AI Context Map
Generate a condensed outline of the project's types, exports, and relationships using `-f context`. This outline tree is optimized to give chat LLMs (such as Cursor, Claude, or Gemini) deep system context in a single small file, avoiding token bloat:
```bash
ts-analyzer -f context > project-context.md
```

### AI Rules Generator
Create custom editor rule files (`.cursorrules` or `.claudeprompt`) tailored specifically to the metrics and health of your codebase:
```bash
ts-analyzer --init-rules both
```
This command analyzes your code quality metrics (e.g., cyclomatic complexity, nesting depth, type safety score) and builds strict, contextual prompts guiding your AI editor to write clean, type-safe, and low-complexity code from day one.

---

## CI/CD Pipeline Integration

Add static analysis checks directly to your GitHub Action workflows:

```yaml
name: Code Quality Check
on: [push, pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Run ts-analyzer
        run: npx ts-analyzer . --format text
```

---

## Development & Testing

We welcome community contributions. To set up the project locally:

```bash
# Clone the repository
git clone https://github.com/amir-valizadeh/ts-analyzer.git
cd ts-analyzer

# Install dependencies
npm install

# Run unit and integration tests (Vitest)
npm test

# Generate test coverage
npm run test:coverage
```

---

## Frequently Asked Questions (FAQ)

### What is the difference between Type Coverage and Type Safety Score?
* **Type Coverage** is the percentage of AST nodes that have an explicit or successfully inferred type associated with them.
* **Type Safety Score** starts at your coverage rate and subtracts penalties for "unsafe" practices like raw `any` types, `as` type assertions, and non-null assertions (`!`). It also factors in your `tsconfig.json` compiler flags.

### How does `ts-analyzer` calculate Cyclomatic Complexity?
It traverses the Abstract Syntax Tree (AST) of each function and adds weight for every branching point (e.g. `if`, `else`, `switch` cases, loops like `for`/`while`, and conditional expressions).

### Can I run `ts-analyzer` on JavaScript projects?
Yes! `ts-analyzer` fully supports JavaScript projects. It parses `.js` and `.jsx` files and calculates metrics like cyclomatic complexity, nested blocks, and duplicate code. The TypeScript-specific checks (e.g., type safety score) are skipped automatically.

### Why is static analysis important for TypeScript?
TypeScript compiles down to plain JavaScript, stripping away type declarations at runtime. Static analysis using `ts-analyzer` helps you catch structural design bugs and check type safety *before* compilation, ensuring high runtime safety.

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](https://github.com/amir-valizadeh/ts-analyzer/blob/main/LICENSE) file for more information.