# ts-analyzer

A comprehensive TypeScript codebase analyzer that provides detailed metrics on type safety, code complexity, and quality. Get actionable insights to improve your TypeScript projects.

![NPM Version](https://img.shields.io/npm/v/ts-analyzer)
![License](https://img.shields.io/npm/l/ts-analyzer)

> **Note**: This is the new and improved version of the previous `react-loc-analyzer` package, with enhanced TypeScript safety analysis, code complexity metrics, and better reports.

## Features

- 🧪 **TypeScript Safety Analysis** with detailed type coverage metrics
- 📊 **Code Complexity Evaluation** for better maintainability
- 📏 **Detailed Code Statistics** with file type breakdown
- 📝 **Actionable Quality Recommendations** based on analysis
- 🎯 **Framework-Agnostic** works with any TypeScript project (React, Vue, Angular, Node.js)
- 🎨 **Beautiful Formatted Output** with colored terminal support
- ⚡ **Fast Performance** with asynchronous file processing
- ⚙️ **Highly Configurable** with customizable options

## Installation

You can use it directly with npx (no installation required):

```bash
npx ts-analyzer
```

Or install it globally:

```bash
npm install -g ts-analyzer
```

## Usage

### Basic Usage

Analyze the current directory:
```bash
npx ts-analyzer
```

Analyze a specific directory:
```bash
npx ts-analyzer /path/to/your/typescript/project
```

### Options

```bash
npx ts-analyzer [directory] [options]

Options:
  -V, --version              output version number
  -e, --exclude <patterns>   additional patterns to exclude (comma-separated)
  -i, --include <extensions> additional file extensions to include (comma-separated)
  --no-color                 disable colored output
  --no-safety                disable TypeScript safety analysis
  --no-complexity            disable code complexity analysis
  -h, --help                 display help for command
```

### Examples

Analyze with additional exclude patterns:
```bash
npx ts-analyzer --exclude .cache,public,static
```

Include additional file extensions:
```bash
npx ts-analyzer --include .vue,.svelte
```

Disable TypeScript safety analysis:
```bash
npx ts-analyzer --no-safety
```

## Output

The analyzer provides four main sections of output:

### 1. Project Summary
Shows overall statistics including:
- Total Files
- Total Lines
- Code Lines
- Comment Lines
- Empty Lines

### 2. Files by Type
Detailed breakdown for each file extension:
- Number of files
- Total lines
- Code lines
- Comment lines
- Empty lines
- Percentage of codebase

### 3. TypeScript Safety Analysis
Comprehensive TypeScript safety metrics:
- TypeScript Files Count
- Type Coverage Percentage
- Any Type Usage Count
- Type Assertions Count
- Type Safety Score
- Type Safety Rating

### 4. Code Complexity Analysis
Detailed complexity metrics:
- Function Count
- Cyclomatic Complexity
- Nesting Depth
- Function Size
- Overall Complexity Rating

### 5. Code Quality Recommendations
Actionable suggestions to improve your code quality.

## Example Output

```
Project Summary:
┌───────────────┬────────────┐
│    Metric     │   Value    │
├───────────────┼────────────┤
│ Total Files   │      156   │
│ Total Lines   │   15,234   │
│ Code Lines    │   12,845   │
│ Comment Lines │    1,523   │
│ Empty Lines   │      866   │
└───────────────┴────────────┘

Files by Type:
┌────────────┬───────┬─────────────┬────────────┬───────────────┐
│ Extension  │ Files │ Total Lines │ Code Lines │ % of Codebase │
├────────────┼───────┼─────────────┼────────────┼───────────────┤
│ .ts        │    87 │      8,456  │     7,234  │        56.3%  │
│ .tsx       │    45 │      4,234  │     3,845  │        29.9%  │
│ .js        │    23 │      2,456  │     1,923  │        15.0%  │
└────────────┴───────┴─────────────┴────────────┴───────────────┘

TypeScript Safety:
┌─────────────────────┬───────────────────────┐
│ metric              │ value                 │
├─────────────────────┼───────────────────────┤
│ TypeScript Files    │ 132 (84.6% of codebase)│
│ Type Coverage       │ 92.3% (Good)          │
│ Any Type Usage      │ 12                    │
│ Type Assertions     │ 5                     │
│ Non-Null Assertions │ 0                     │
│ Type Safety Score   │ 85/100 (Good ✓)       │
│ Type Safety Rating  │ Low                   │
└─────────────────────┴───────────────────────┘

Code Complexity:
┌───────────────────────────┬────────────┐
│ metric                    │ value      │
├───────────────────────────┼────────────┤
│ Analyzed Files            │ 110        │
│ Total Functions           │ 345        │
│ Avg Cyclomatic Complexity │ 3.2        │
│ Max Cyclomatic Complexity │ 12         │
│ Avg Nesting Depth         │ 2.1        │
│ Max Nesting Depth         │ 6          │
│ Avg Function Size         │ 12.5 lines │
│ Complex Files             │ 3          │
│ Overall Complexity        │ Simple ✓   │
└───────────────────────────┴────────────┘

📝 Code Quality Recommendations:
• Reduce usage of 'any' type (found 12 instances) by using more specific types
• Consider refactoring functions with high complexity (max: 12) to improve maintainability
```

## TypeScript Safety Analysis

### How TypeScript Safety Analysis Works

The TypeScript safety analyzer evaluates your TypeScript code quality by calculating several metrics. Here's how it works:

```
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

### Type Coverage Calculation

Type coverage measures what percentage of your code has proper type information, either through explicit type annotations or TypeScript's type inference.

```typescript
// Example TypeScript code with various levels of typing

// Explicitly typed (counts as typed)
const userName: string = "John";

// Implicitly typed through inference (counts as typed)
const userAge = 30; // TypeScript infers 'number'

// Object with explicit interface (counts as typed)
interface User {
  id: number;
  name: string;
  active: boolean;
}
const user: User = { id: 1, name: "Alice", active: true };

// Function with explicit type annotations (counts as typed)
function calculateTotal(prices: number[]): number {
  return prices.reduce((sum, price) => sum + price, 0);
}

// Any type usage (counts as typed, but with penalty)
const userData: any = fetchUserData();

// No type annotation or clear inference (counts as untyped)
let someData;

// Type assertion (counts as typed, but with penalty)
const userInput = document.getElementById("user-input") as HTMLInputElement;
```

### Type Safety Score Formula

The type safety score (0-100) is calculated using the following formula:

```
Type Safety Score = Coverage Score - Any Type Penalty - Type Assertion Penalty
```

Where:
- **Coverage Score** = Type Coverage Percentage × 0.6 (60% weight)
- **Any Type Penalty** = (Any Type Count / Total Nodes) × 100 × 0.2 (20% weight)
- **Type Assertion Penalty** = (Type Assertions / Total Nodes) × 100 × 0.2 (20% weight)

### TypeScript Configuration Impact

The analyzer checks your `tsconfig.json` for strict type checking options and awards bonus points:

| Configuration Option | Points |
|----------------------|--------|
| `strict: true`       | 5      |
| `noImplicitAny: true`| 3      |
| `strictNullChecks: true` | 3  |
| `noImplicitReturns: true` | 2 |

### Rating Scale

| Type Safety Score | Rating | Description |
|-------------------|--------|-------------|
| ≥ 80              | Good   | Your TypeScript code is well-typed and maintains high type safety |
| 50-79             | Moderate | Your code has reasonable type safety but could be improved |
| < 50              | Poor   | Your code has significant type safety issues that should be addressed |

### Type Coverage Benchmarks

| Type Coverage | Rating | Description |
|---------------|--------|-------------|
| ≥ 95%         | Excellent | Top-tier type safety, comparable to well-maintained libraries |
| 85-94%        | Good   | Strong type safety, suitable for production applications |
| 70-84%        | Moderate | Acceptable type safety, but has room for improvement |
| < 70%         | Needs Improvement | Type coverage is too low for reliable code |

## Code Complexity Analysis

### How Code Complexity Analysis Works

The complexity analyzer evaluates several aspects of your code structure to determine maintainability:

1. **Cyclomatic Complexity**: Measures the number of independent paths through code
2. **Nesting Depth**: Measures how deeply code blocks are nested
3. **Function Size**: Measures average lines of code per function
4. **Parameter Count**: Analyzes how many parameters functions receive

### Complexity Rating Scale

| Complexity Score | Rating | Description |
|------------------|--------|-------------|
| < 30             | Simple | Your code is clean and easily maintainable |
| 30-60            | Moderate | Your code has reasonable complexity but watch for complex areas |
| > 60             | Complex | Your code may be difficult to maintain and test |

## Why This Is Better Than react-loc-analyzer

The `ts-analyzer` is a significant improvement over the previous `react-loc-analyzer`:

1. **TypeScript Specialization**: Built specifically for analyzing TypeScript codebases with deep type safety insights
2. **Framework Agnostic**: Works with any TypeScript project, not just React
3. **Advanced Metrics**: Provides sophisticated type coverage and code complexity metrics
4. **Actionable Insights**: Generates specific recommendations to improve your code quality
5. **Modern Implementation**: Fully written in TypeScript with strong typing throughout
6. **Better Performance**: Optimized for faster analysis of large TypeScript projects

## Default Configuration

### Included File Extensions
- `.js`, `.jsx`, `.ts`, `.tsx`
- `.css`, `.scss`, `.sass`
- `.html`, `.json`

### Default Ignore Patterns
- `node_modules`
- `build`
- `dist`
- `.git`
- `coverage`
- `.next`
- `out`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT License - see the [LICENSE](LICENSE) file for details