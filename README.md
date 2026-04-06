# ts-analyzer

![npm](https://img.shields.io/npm/v/ts-analyzer)
![coverage](https://img.shields.io/badge/coverage-88%25-brightgreen)
![license](https://img.shields.io/npm/l/ts-analyzer)

`ts-analyzer` is a comprehensive static analysis tool for checking TypeScript and JavaScript code quality, focusing on type safety, structural complexity, and identifying potential anti-patterns.

## ✨ Features

- **TypeScript Safety Metrics**: Calculates your project's true type coverage by tracking `any` usage, explicit generics, optional properties, type assertions, and non-null assertions.
- **Code Complexity Analysis**: Measures Cyclomatic Complexity and Nesting Depth to ensure your code remains readable and maintainable.
- **Anti-Pattern & Code Smell Detection**: Highlights potential red flags such as "Magic Numbers", "Callback Hell", "God Files" (>500 lines), and overly complex functions (excessive parameters).
- **Flexible Reporting**: Generate beautiful HTML dashboards, parsable JSON payloads, or read insights directly in your terminal.
- **High Reliability**: The tool is extensively tested with a robust **~88% test coverage** powered by Vitest, ensuring calculations remain accurate.

## 🚀 Quick Start

Run it directly on any project using `npx`:

```bash
npx ts-analyzer
```

## 📦 Usage

Analyze a specific directory:
```bash
ts-analyzer /path/to/project
```

Available options:
- `-f, --format <type>`: Select report format (`text`, `json`, or `html`).
- `-e, --exclude <patterns>`: Comma-separated ignore patterns (e.g. `node_modules,dist`).
- `--no-safety`: Skip type-safety analysis to speed up processing.
- `--no-complexity`: Skip structural complexity analysis.

## 🛠 Development

The repository uses modern open-source tooling, and features comprehensive test suites.

Install dependencies:
```bash
npm install
```

Run tests (powered by Vitest):
```bash
npm test
```

Generate coverage reports:
```bash
npm run test:coverage
```

## 📝 License
MIT