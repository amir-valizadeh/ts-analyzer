import { describe, it, expect } from 'vitest';
import {
    evaluateQualityGate,
    QualityGateThresholds,
    ProjectStats
} from '../src/index.js';

function createMockStats(overrides: Partial<ProjectStats> = {}): ProjectStats {
    return {
        files: 10,
        totalLines: 1000,
        codeLines: 800,
        commentLines: 100,
        emptyLines: 100,
        fileTypes: {},
        formatNumber: (n: number) => n.toString(),
        typescriptSafety: {
            tsFileCount: 10,
            tsPercentage: '100',
            avgTypeCoverage: '90.5',
            totalAnyCount: 2,
            totalAssertions: 1,
            totalNonNullAssertions: 0,
            avgTypeSafetyScore: 88,
            overallComplexity: 'Low'
        },
        codeComplexity: {
            analyzedFiles: 10,
            avgComplexity: '2.5',
            maxComplexity: 8,
            avgNestingDepth: '1.5',
            maxNestingDepth: 3,
            avgFunctionSize: '15',
            totalFunctions: 30,
            complexFiles: 0,
            overallComplexity: 'Low',
            codeSmells: {
                magicNumbers: 0,
                callbackHell: 0,
                godFiles: 0,
                excessiveParameters: 0
            },
            duplicateCode: {
                totalClones: 0,
                totalDuplicateLines: 0,
                clones: []
            }
        },
        dependencies: {
            circularDependencies: [],
            unusedExports: [],
            dependencyGraph: {},
            totalFilesAnalyzed: 10,
            circularDependencyCount: 0,
            unusedExportCount: 0
        },
        qualityGateResult: null,
        ...overrides
    };
}

describe('Quality Gate Module', () => {
    it('should pass when all metrics satisfy thresholds', () => {
        const stats = createMockStats();
        const thresholds: QualityGateThresholds = {
            minTypeSafetyScore: 80,
            minTypeCoverage: 85,
            maxAvgComplexity: 5,
            maxFunctionComplexity: 10,
            failOnCircular: true,
            failOnDeadCode: true,
            maxDuplicateLines: 10,
            maxDuplicateClones: 2,
            maxGodFiles: 1,
            maxCallbackHell: 1
        };

        const result = evaluateQualityGate(stats, thresholds);

        expect(result.passed).toBe(true);
        expect(result.violations).toHaveLength(0);
        expect(result.summaryMarkdown).toContain('PASSED ✅');
        expect(result.summaryMarkdown).toContain('minTypeSafetyScore');
        expect(result.summaryMarkdown).toContain('failOnCircular');
    });

    it('should fail when type safety score is below threshold', () => {
        const stats = createMockStats();
        const thresholds: QualityGateThresholds = {
            minTypeSafetyScore: 95
        };

        const result = evaluateQualityGate(stats, thresholds);

        expect(result.passed).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].rule).toBe('minTypeSafetyScore');
        expect(result.violations[0].expected).toBe('>= 95');
        expect(result.violations[0].actual).toBe('88');
        expect(result.violations[0].severity).toBe('error');
        expect(result.summaryMarkdown).toContain('FAILED ❌');
        expect(result.summaryMarkdown).toContain('Violations Detail');
    });

    it('should fail when type coverage is below threshold', () => {
        const stats = createMockStats();
        const thresholds: QualityGateThresholds = {
            minTypeCoverage: 95
        };

        const result = evaluateQualityGate(stats, thresholds);

        expect(result.passed).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].rule).toBe('minTypeCoverage');
        expect(result.violations[0].expected).toBe('>= 95%');
        expect(result.violations[0].actual).toBe('90.5%');
    });

    it('should fail when cyclomatic complexity exceeds threshold', () => {
        const stats = createMockStats();
        const thresholds: QualityGateThresholds = {
            maxAvgComplexity: 2.0,
            maxFunctionComplexity: 5
        };

        const result = evaluateQualityGate(stats, thresholds);

        expect(result.passed).toBe(false);
        expect(result.violations).toHaveLength(2);
        expect(result.violations.map(v => v.rule)).toEqual(['maxAvgComplexity', 'maxFunctionComplexity']);
    });

    it('should fail on circular dependencies when failOnCircular is true', () => {
        const stats = createMockStats({
            dependencies: {
                circularDependencies: [
                    { cycle: ['a.ts', 'b.ts', 'a.ts'], length: 2 }
                ],
                unusedExports: [],
                dependencyGraph: {},
                totalFilesAnalyzed: 2,
                circularDependencyCount: 1,
                unusedExportCount: 0
            }
        });

        const thresholds: QualityGateThresholds = {
            failOnCircular: true
        };

        const result = evaluateQualityGate(stats, thresholds);

        expect(result.passed).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].rule).toBe('failOnCircular');
        expect(result.violations[0].actual).toContain('1 circular dependencies');
    });

    it('should fail on dead code when failOnDeadCode is true', () => {
        const stats = createMockStats({
            dependencies: {
                circularDependencies: [],
                unusedExports: [
                    { file: 'a.ts', exportName: 'unusedFn', line: 12 }
                ],
                dependencyGraph: {},
                totalFilesAnalyzed: 2,
                circularDependencyCount: 0,
                unusedExportCount: 1
            }
        });

        const thresholds: QualityGateThresholds = {
            failOnDeadCode: true
        };

        const result = evaluateQualityGate(stats, thresholds);

        expect(result.passed).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].rule).toBe('failOnDeadCode');
        expect(result.violations[0].actual).toContain('1 unused exports');
    });

    it('should fail when code smells and duplicates exceed thresholds', () => {
        const stats = createMockStats({
            codeComplexity: {
                analyzedFiles: 5,
                avgComplexity: '2.0',
                maxComplexity: 5,
                avgNestingDepth: '1.0',
                maxNestingDepth: 2,
                avgFunctionSize: '10',
                totalFunctions: 10,
                complexFiles: 0,
                overallComplexity: 'Low',
                codeSmells: {
                    magicNumbers: 0,
                    callbackHell: 3,
                    godFiles: 2,
                    excessiveParameters: 0
                },
                duplicateCode: {
                    totalClones: 4,
                    totalDuplicateLines: 80,
                    clones: []
                }
            }
        });

        const thresholds: QualityGateThresholds = {
            maxDuplicateLines: 50,
            maxDuplicateClones: 2,
            maxGodFiles: 1,
            maxCallbackHell: 1
        };

        const result = evaluateQualityGate(stats, thresholds);

        expect(result.passed).toBe(false);
        expect(result.violations).toHaveLength(4);
        expect(result.violations.map(v => v.rule)).toEqual([
            'maxDuplicateLines',
            'maxDuplicateClones',
            'maxGodFiles',
            'maxCallbackHell'
        ]);
    });

    it('should handle null stats metrics gracefully without throwing', () => {
        const emptyStats: ProjectStats = {
            files: 0,
            totalLines: 0,
            codeLines: 0,
            commentLines: 0,
            emptyLines: 0,
            fileTypes: {},
            formatNumber: (n: number) => n.toString(),
            typescriptSafety: null,
            codeComplexity: null,
            dependencies: null
        };

        const thresholds: QualityGateThresholds = {
            minTypeSafetyScore: 80,
            minTypeCoverage: 80,
            maxAvgComplexity: 5,
            failOnCircular: true,
            failOnDeadCode: true
        };

        const result = evaluateQualityGate(emptyStats, thresholds);

        // Missing safety metrics default to 0, which fails minTypeSafetyScore and minTypeCoverage
        expect(result.passed).toBe(false);
        expect(result.violations.some(v => v.rule === 'minTypeSafetyScore')).toBe(true);
        // Dependencies are null so count is 0, which passes failOnCircular & failOnDeadCode
        expect(result.violations.some(v => v.rule === 'failOnCircular')).toBe(false);
    });

    it('should generate properly formatted GitHub Step Summary markdown', () => {
        const stats = createMockStats();
        const thresholds: QualityGateThresholds = {
            minTypeSafetyScore: 80,
            maxAvgComplexity: 4
        };

        const result = evaluateQualityGate(stats, thresholds);
        expect(result.summaryMarkdown).toContain('## 🛡️ ts-analyzer Quality Gate: PASSED ✅');
        expect(result.summaryMarkdown).toContain('| `minTypeSafetyScore` | >= 80 | 88 | ✅ Pass |');
        expect(result.summaryMarkdown).toContain('| `maxAvgComplexity` | <= 4 | 2.5 | ✅ Pass |');
    });
});
