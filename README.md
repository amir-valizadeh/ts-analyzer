# ts-analyzer

![npm](https://img.shields.io/npm/v/ts-analyzer)
![coverage](https://img.shields.io/badge/coverage-88%25-brightgreen)
![license](https://img.shields.io/npm/l/ts-analyzer)

`ts-analyzer` is a code analysis tool that checks your TypeScript and JavaScript projects. It looks at how safe your types are, how complex your code is, and finds common mistakes.

---

## Features

- **Type Safety Checks**: It calculates your real type coverage. It tracks things like `any` usage, generics, and assertions.
- **Code Complexity**: It checks how hard your code is to read by measuring cyclomatic complexity and nested blocks.
- **Anti-patterns**: It spots bad practices like Magic Numbers, Callback Hell, Duplicate Code, huge files, and functions with too many parameters.
- **Reports**: You can view the results as a nice HTML page, JSON, or just plain text in your terminal.
- **Tested**: The project has around 88% test coverage using Vitest.

---

## How It Works

### Type Safety
The tool looks at your code to see if your variables and parameters actually have types, or if they are just left as `any`.

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

* **Score**: It calculates a score based on your type coverage percentage, minus a penalty if you use `any` or type assertions too much.
* **tsconfig**: You get extra bonus points if your `tsconfig.json` has strict settings enabled.

### Code Complexity
It looks at your functions to see how complicated they are:
1. **Cyclomatic Complexity**: How many different paths your code can take.
2. **Nesting Depth**: How many blocks are inside each other (to avoid Callback Hell).
3. **Size**: How many lines and parameters your functions have.
4. **Duplicate Code**: It checks for structural clones and exactly repeated function logic across multiple files in your codebase.

Based on this, it gives a rating: <30 is simple, 30-60 is moderate, and >60 means it's too complex.

### Why switch to `ts-analyzer`?
This tool is an upgrade from `react-loc-analyzer`. Instead of just counting lines, it actually understands your TypeScript code and gives you useful feedback to improve it.

---

## Quick Start

You can run it directly using npx:

```bash
npx ts-analyzer /path/to/project
```

Some options you can use:
- `-f, --format <type>`: Choose between `text`, `json`, or `html`
- `-e, --exclude <patterns>`: Folders to ignore, separated by commas
- `--no-safety` / `--no-complexity`: Skip specific checks to run faster

## Example Reports

### JSON Output
When you run `npx ts-analyzer /path -f json`, it generates structured data you can use in your CI/CD pipelines:

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

### HTML Output
When you run `npx ts-analyzer /path -f html`, it creates a `ts-analyzer-report.html` file. This acts as a beautiful visual dashboard with:
- **Project Summary Cards**: Big, clear numbers for your total lines and code lines.
- **Color-coded Progress Bars**: Visual bars for Type Coverage percentages (turns red if too low).
- **Red/Green Indicators**: Fast visual checks for code smells like Callback Hell and God Files.

## Config File
You don't have to type arguments every time. Just create a `ts-analyzer.config.json` in your project folder:
```json
{
  "safety": true,
  "complexity": true,
  "format": "text",
  "exclude": ["node_modules", "dist", ".next"],
  "include": [".js", ".ts", ".tsx"]
}
```

## Development
To work on this project, install the dependencies and run the tests:
```bash
npm install
npm test
npm run test:coverage
```

## License
MIT