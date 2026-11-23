# ts-analyzer — TypeScript Static Code Analysis, Type Coverage, Dead Code & Complexity CLI

[![npm version](https://img.shields.io/npm/v/ts-analyzer)](https://www.npmjs.com/package/ts-analyzer)
[![test coverage](https://img.shields.io/badge/coverage-88%25-brightgreen)](https://github.com/amir-valizadeh/ts-analyzer)
[![license](https://img.shields.io/npm/l/ts-analyzer)](https://github.com/amir-valizadeh/ts-analyzer/blob/main/LICENSE)

`ts-analyzer` is a zero-config **TypeScript & JavaScript static code analysis CLI**, **CI/CD Quality Gate**, and **AI Context generator**. Using the TypeScript Compiler AST, it measures **type coverage** and **type safety score**, pinpoints **cyclomatic complexity hotspots**, detects **circular dependencies** (with `tsconfig.json` `paths` alias & `import type` awareness), finds **unused exports / dead code** (with automatic `package.json` entry-point detection), and flags **duplicate code clones** and **code smells**.

Replace stitching together 4 separate CLI tools (`type-coverage`, `madge`, `knip`, and complexity linters) with one fast, unified health check and interactive HTML dashboard.

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

- 📊 **Type Safety & Coverage Analysis**: Computes actual AST type coverage and a 0–100 Type Safety Score, penalizing `any` declarations, `as` type assertions, and non-null assertions (`!`).
- 🔥 **Actionable Hotspot Drilldowns (`--hotspots` / `--top <n>`)**: Pinpoints exact `file:line` locations for the most complex functions, lowest type-safety files, God files (>500 lines), and duplicate code clones.
- 📉 **Cyclomatic Complexity Measurement**: Analyzes top-level functions, class methods, and nested closures/hooks to rate maintainability and testability.
- 🔍 **Code Smell & Anti-Pattern Detection**: Automatically flags Callback Hell (deep nesting), Magic Numbers, Excessive Parameters (>4), and God Files (>500 lines).
- 👯 **Duplicate Code Finder**: Scans files for structural duplicates and cloned functions across your codebase.
- 🕸 **Smart Circular Dependency Detection**: Parses module import graphs (including `tsconfig.json` `baseUrl` and `paths` aliases like `@/*`), distinguishes runtime cycles from `import type` cycles (`--ignore-type-cycles`), and prevents initialization bugs.
- 🧟 **Entry-Point-Aware Dead Code & Unused Exports**: Finds exported functions, types, and variables never imported in the project while automatically respecting `package.json` (`main`, `module`, `bin`, `exports`) and custom `--entry` globs.
- 🛡️ **CI/CD Quality Gate & Baseline Diffing**: Enforce thresholds in CI (`--check`), compare against a baseline JSON (`--compare`), and publish GitHub Actions `$GITHUB_STEP_SUMMARY` reports (`--github-summary`).
- 📋 **Multiple Output Formats & AI Tooling**: Supports terminal ASCII tables (`text`), structured JSON (`json`), interactive HTML dashboards (`html`), compact LLM context maps (`context`), and tailored AI editor rules (`--init-rules`).

---

## Why ts-analyzer? (Comparison)

Most teams stitch together separate tools for type coverage, circular dependencies, unused exports, and complexity. `ts-analyzer` unifies them in a single AST pass:

| Feature / Capability | `ts-analyzer` | `knip` | `madge` | `type-coverage` | `ESLint` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **AST Type Coverage & Safety Score (0–100)** | ✅ Yes | ❌ No | ❌ No | ✅ Coverage only | ❌ No |
| **Cyclomatic Complexity & Function Hotspots** | ✅ Yes | ❌ No | ❌ No | ❌ No | ⚠️ Rule-only |
| **Circular Dependency Detection (`tsconfig` paths)** | ✅ Yes (`--ignore-type-cycles`) | ❌ No | ✅ Yes | ❌ No | ⚠️ Slow (`import/no-cycle`) |
| **Unused Exports / Dead Code (`package.json` aware)** | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Duplicate Code Clone Detection** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Built-in CI Quality Gate & Baseline Regression Diff** | ✅ Yes | ❌ No | ❌ No | ⚠️ Threshold only | ❌ No |
| **Interactive HTML Dashboard & AI Context Map** | ✅ Yes | ❌ No | ⚠️ Graph image | ❌ No | ❌ No |

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
| `--hotspots` | | Display detailed file/function hotspot drilldown tables (top complex functions, lowest type-safety files, God files, and duplicate code clones) |
| `--top <n>` | | Maximum number of items to display per hotspot table (default `10`; implies `--hotspots`) |
| `--entry <patterns>` | | Comma-separated entry point paths or globs (e.g. `src/index.ts,src/pages/**`) to exclude from unused export checks (merged with auto-detected `package.json` entry points) |
| `--ignore-type-cycles` | | Exclude type-only (`import type` / `export type`) circular dependencies from cycle counts and quality gate failures |
| `--check` | | Run standard CI/CD Quality Gate checks |
| `--min-safety <score>` | | Minimum Type Safety Score required (0-100) |
| `--min-coverage <percent>` | | Minimum Type Coverage percentage required (0-100) |
| `--max-complexity <num>` | | Maximum average cyclomatic complexity allowed |
| `--fail-on-circular` | | Fail quality gate if any circular dependencies exist |
| `--fail-on-dead-code` | | Fail quality gate if any unused exports exist |
| `--max-clones <num>` | | Maximum duplicate code clones allowed |
| `--compare <path>` | | Compare current run against a baseline JSON file and display diffs/regressions |
| `--github-summary` | | Write GitHub Actions `$GITHUB_STEP_SUMMARY` markdown report and workflow annotations |
| `--format <type>` | `-f` | Output format: `text`, `json`, `html`, or `context` |
| `--exclude <folders>` | `-e` | Folders to ignore, comma-separated (e.g. `node_modules,dist,.next`) |
| `--no-safety` | | Skip TypeScript type safety calculations for faster runs |
| `--no-complexity` | | Skip code complexity and anti-pattern analysis |
| `--no-dependencies` | | Skip circular dependency and dead code/unused export analysis |
| `--init-rules [type]` | | Generate customized AI coding rules (`cursorrules`, `claudeprompt`, or `both`) |

---

## Configuration (`ts-analyzer.config.json`)

To standardize run settings, custom entry points, and Quality Gate thresholds in your repository, configure `ts-analyzer.config.json`:

```json
{
  "safety": true,
  "complexity": true,
  "format": "text",
  "exclude": ["node_modules", "dist", ".next", "coverage"],
  "include": [".js", ".jsx", ".ts", ".tsx"],
  "entryPoints": ["src/index.ts", "src/pages/**", "src/app/**"],
  "ignoreTypeCycles": true,
  "qualityGate": {
    "minTypeSafetyScore": 80,
    "minTypeCoverage": 85,
    "maxAvgComplexity": 8,
    "maxFunctionComplexity": 15,
    "failOnCircular": true,
    "failOnDeadCode": true,
    "maxDuplicateLines": 50,
    "maxGodFiles": 0
  }
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