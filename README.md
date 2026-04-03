# ts-analyzer

ts-analyzer is a static analysis tool for checking TypeScript code quality, focusing on type safety and structural complexity.

## Features

- TypeScript safety metrics (type coverage, any usage, assertions).
- Cyclomatic complexity and nesting depth analysis.
- Detection of anti-patterns like magic numbers, callback hell, and god files.
- Formatted output in Text, JSON, and HTML.

## Quick Start

```bash
npx ts-analyzer
```

## Usage

Analyze a specific directory:
```bash
ts-analyzer /path/to/project
```

Available options:
- `-f, --format <type>`: `text`, `json`, or `html`.
- `-e, --exclude <patterns>`: Comma-separated ignore patterns.
- `--no-safety`: Skip type-safety analysis.
- `--no-complexity`: Skip complexity analysis.

## Development

Run tests:
```bash
npm test
```

Generate coverage:
```bash
npm run test:coverage
```

## License
MIT