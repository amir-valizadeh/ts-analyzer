import type { ProjectStats } from './index.js';

export interface QualityGateThresholds {
    minTypeSafetyScore?: number;
    minTypeCoverage?: number;
    maxAvgComplexity?: number;
    maxFunctionComplexity?: number;
    failOnCircular?: boolean;
    failOnDeadCode?: boolean;
    maxDuplicateLines?: number;
    maxDuplicateClones?: number;
    maxGodFiles?: number;
    maxCallbackHell?: number;
}

export interface QualityGateViolation {
    rule: string;
    expected: string;
    actual: string;
    severity: 'error' | 'warning';
}

export interface QualityGateResult {
    passed: boolean;
    thresholds: QualityGateThresholds;
    violations: QualityGateViolation[];
    summaryMarkdown: string; // Formatted for $GITHUB_STEP_SUMMARY
}

interface RuleCheck {
    rule: keyof QualityGateThresholds;
    expected: string;
    actual: string;
    passed: boolean;
}

export function evaluateQualityGate(
    stats: ProjectStats,
    thresholds: QualityGateThresholds = {}
): QualityGateResult {
    const violations: QualityGateViolation[] = [];
    const checks: RuleCheck[] = [];

    // 1. minTypeSafetyScore
    if (thresholds.minTypeSafetyScore !== undefined) {
        const actualScore = stats.typescriptSafety?.avgTypeSafetyScore ?? 0;
        const passed = actualScore >= thresholds.minTypeSafetyScore;
        const expected = `>= ${thresholds.minTypeSafetyScore}`;
        const actual = `${actualScore}`;
        checks.push({ rule: 'minTypeSafetyScore', expected, actual, passed });
        if (!passed) {
            violations.push({
                rule: 'minTypeSafetyScore',
                expected,
                actual,
                severity: 'error'
            });
        }
    }

    // 2. minTypeCoverage
    if (thresholds.minTypeCoverage !== undefined) {
        const actualCoverage = stats.typescriptSafety ? parseFloat(stats.typescriptSafety.avgTypeCoverage) : 0;
        const passed = actualCoverage >= thresholds.minTypeCoverage;
        const expected = `>= ${thresholds.minTypeCoverage}%`;
        const actual = `${actualCoverage}%`;
        checks.push({ rule: 'minTypeCoverage', expected, actual, passed });
        if (!passed) {
            violations.push({
                rule: 'minTypeCoverage',
                expected,
                actual,
                severity: 'error'
            });
        }
    }

    // 3. maxAvgComplexity
    if (thresholds.maxAvgComplexity !== undefined) {
        const actualAvgComp = stats.codeComplexity ? parseFloat(stats.codeComplexity.avgComplexity) : 0;
        const passed = actualAvgComp <= thresholds.maxAvgComplexity;
        const expected = `<= ${thresholds.maxAvgComplexity}`;
        const actual = `${actualAvgComp}`;
        checks.push({ rule: 'maxAvgComplexity', expected, actual, passed });
        if (!passed) {
            violations.push({
                rule: 'maxAvgComplexity',
                expected,
                actual,
                severity: 'error'
            });
        }
    }

    // 4. maxFunctionComplexity
    if (thresholds.maxFunctionComplexity !== undefined) {
        const actualMaxComp = stats.codeComplexity?.maxComplexity ?? 0;
        const passed = actualMaxComp <= thresholds.maxFunctionComplexity;
        const expected = `<= ${thresholds.maxFunctionComplexity}`;
        const actual = `${actualMaxComp}`;
        checks.push({ rule: 'maxFunctionComplexity', expected, actual, passed });
        if (!passed) {
            violations.push({
                rule: 'maxFunctionComplexity',
                expected,
                actual,
                severity: 'error'
            });
        }
    }

    // 5. failOnCircular
    if (thresholds.failOnCircular !== undefined) {
        const circularCount = stats.dependencies?.circularDependencyCount ?? 0;
        const passed = thresholds.failOnCircular ? circularCount === 0 : true;
        const expected = '0 circular dependencies';
        const actual = `${circularCount} circular dependencies`;
        checks.push({ rule: 'failOnCircular', expected, actual, passed });
        if (!passed) {
            violations.push({
                rule: 'failOnCircular',
                expected,
                actual,
                severity: 'error'
            });
        }
    }

    // 6. failOnDeadCode
    if (thresholds.failOnDeadCode !== undefined) {
        const unusedCount = stats.dependencies?.unusedExportCount ?? 0;
        const passed = thresholds.failOnDeadCode ? unusedCount === 0 : true;
        const expected = '0 unused exports';
        const actual = `${unusedCount} unused exports`;
        checks.push({ rule: 'failOnDeadCode', expected, actual, passed });
        if (!passed) {
            violations.push({
                rule: 'failOnDeadCode',
                expected,
                actual,
                severity: 'error'
            });
        }
    }

    // 7. maxDuplicateLines
    if (thresholds.maxDuplicateLines !== undefined) {
        const dupLines = stats.codeComplexity?.duplicateCode?.totalDuplicateLines ?? 0;
        const passed = dupLines <= thresholds.maxDuplicateLines;
        const expected = `<= ${thresholds.maxDuplicateLines}`;
        const actual = `${dupLines}`;
        checks.push({ rule: 'maxDuplicateLines', expected, actual, passed });
        if (!passed) {
            violations.push({
                rule: 'maxDuplicateLines',
                expected,
                actual,
                severity: 'error'
            });
        }
    }

    // 8. maxDuplicateClones
    if (thresholds.maxDuplicateClones !== undefined) {
        const dupClones = stats.codeComplexity?.duplicateCode?.totalClones ?? 0;
        const passed = dupClones <= thresholds.maxDuplicateClones;
        const expected = `<= ${thresholds.maxDuplicateClones}`;
        const actual = `${dupClones}`;
        checks.push({ rule: 'maxDuplicateClones', expected, actual, passed });
        if (!passed) {
            violations.push({
                rule: 'maxDuplicateClones',
                expected,
                actual,
                severity: 'error'
            });
        }
    }

    // 9. maxGodFiles
    if (thresholds.maxGodFiles !== undefined) {
        const godFiles = stats.codeComplexity?.codeSmells?.godFiles ?? 0;
        const passed = godFiles <= thresholds.maxGodFiles;
        const expected = `<= ${thresholds.maxGodFiles}`;
        const actual = `${godFiles}`;
        checks.push({ rule: 'maxGodFiles', expected, actual, passed });
        if (!passed) {
            violations.push({
                rule: 'maxGodFiles',
                expected,
                actual,
                severity: 'error'
            });
        }
    }

    // 10. maxCallbackHell
    if (thresholds.maxCallbackHell !== undefined) {
        const callbackHell = stats.codeComplexity?.codeSmells?.callbackHell ?? 0;
        const passed = callbackHell <= thresholds.maxCallbackHell;
        const expected = `<= ${thresholds.maxCallbackHell}`;
        const actual = `${callbackHell}`;
        checks.push({ rule: 'maxCallbackHell', expected, actual, passed });
        if (!passed) {
            violations.push({
                rule: 'maxCallbackHell',
                expected,
                actual,
                severity: 'error'
            });
        }
    }

    const passed = violations.length === 0;
    const summaryMarkdown = buildSummaryMarkdown(passed, checks, violations);

    return {
        passed,
        thresholds,
        violations,
        summaryMarkdown
    };
}

function buildSummaryMarkdown(
    passed: boolean,
    checks: RuleCheck[],
    violations: QualityGateViolation[]
): string {
    const title = passed
        ? '## 🛡️ ts-analyzer Quality Gate: PASSED ✅'
        : '## 🛡️ ts-analyzer Quality Gate: FAILED ❌';

    const statusLine = passed
        ? '> **Status**: All quality gate thresholds passed successfully.'
        : `> **Status**: Quality gate failed with **${violations.length}** violation(s).`;

    let table = '| Rule | Expected | Actual | Status |\n| :--- | :--- | :--- | :---: |\n';
    for (const check of checks) {
        const icon = check.passed ? '✅ Pass' : '❌ Fail';
        table += `| \`${check.rule}\` | ${check.expected} | ${check.actual} | ${icon} |\n`;
    }

    let violationsSection = '';
    if (violations.length > 0) {
        violationsSection = '\n### ⚠️ Violations Detail\n\n' +
            '| Rule | Expected | Actual | Severity |\n| :--- | :--- | :--- | :---: |\n' +
            violations.map(v => `| \`${v.rule}\` | ${v.expected} | ${v.actual} | **${v.severity.toUpperCase()}** |`).join('\n') +
            '\n';
    }

    return `${title}\n\n${statusLine}\n\n### Evaluated Quality Rules\n\n${table}${violationsSection}`;
}
