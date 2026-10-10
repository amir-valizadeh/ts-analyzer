import { describe, it, expect } from 'vitest';
import {
    compareWithBaseline,
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
            avgTypeCoverage: '90.0',
            totalAnyCount: 5,
            totalAssertions: 2,
            totalNonNullAssertions: 1,
            avgTypeSafetyScore: 85,
            overallComplexity: 'Low'
        },
        codeComplexity: {
            analyzedFiles: 10,
            avgComplexity: '3.0',
            maxComplexity: 10,
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
                totalClones: 2,
                totalDuplicateLines: 20,
                clones: []
            }
        },
        dependencies: {
            circularDependencies: [],
            unusedExports: [],
            dependencyGraph: {},
            totalFilesAnalyzed: 10,
            circularDependencyCount: 1,
            unusedExportCount: 2
        },
        qualityGateResult: null,
        ...overrides
    };
}

describe('Baseline Diff Module', () => {
    it('should accurately detect improvements when metrics get better', () => {
        // Current has better safety, better coverage, lower complexity, fewer cycles/unused/clones
        const current = createMockStats({
            codeLines: 850,
            typescriptSafety: {
                tsFileCount: 10,
                tsPercentage: '100',
                avgTypeCoverage: '95.0',
                totalAnyCount: 2,
                totalAssertions: 1,
                totalNonNullAssertions: 0,
                avgTypeSafetyScore: 92,
                overallComplexity: 'Low'
            },
            codeComplexity: {
                analyzedFiles: 10,
                avgComplexity: '2.0',
                maxComplexity: 8,
                avgNestingDepth: '1.2',
                maxNestingDepth: 2,
                avgFunctionSize: '12',
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
            }
        });

        const baseline: Partial<ProjectStats> = {
            codeLines: 800,
            typescriptSafety: {
                tsFileCount: 10,
                tsPercentage: '100',
                avgTypeCoverage: '90.0',
                totalAnyCount: 5,
                totalAssertions: 2,
                totalNonNullAssertions: 1,
                avgTypeSafetyScore: 85,
                overallComplexity: 'Low'
            },
            codeComplexity: {
                analyzedFiles: 10,
                avgComplexity: '3.0',
                maxComplexity: 10,
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
                    totalClones: 2,
                    totalDuplicateLines: 20,
                    clones: []
                }
            },
            dependencies: {
                circularDependencies: [],
                unusedExports: [],
                dependencyGraph: {},
                totalFilesAnalyzed: 10,
                circularDependencyCount: 1,
                unusedExportCount: 2
            }
        };

        const diff = compareWithBaseline(current, baseline);

        expect(diff.typeSafetyScoreDelta).toBe(7); // 92 - 85
        expect(diff.typeCoverageDelta).toBe(5);     // 95 - 90
        expect(diff.avgComplexityDelta).toBe(-1);   // 2 - 3
        expect(diff.circularDependencyDelta).toBe(-1); // 0 - 1
        expect(diff.unusedExportsDelta).toBe(-2);   // 0 - 2
        expect(diff.duplicateLinesDelta).toBe(-20); // 0 - 20
        expect(diff.codeLinesDelta).toBe(50);      // 850 - 800

        expect(diff.regressions).toHaveLength(0);
        expect(diff.improvements.length).toBeGreaterThanOrEqual(6);
        expect(diff.improvements.some(i => i.includes('Type Safety Score increased by 7'))).toBe(true);
        expect(diff.improvements.some(i => i.includes('Type Coverage increased by 5%'))).toBe(true);
        expect(diff.improvements.some(i => i.includes('Average Complexity decreased by 1'))).toBe(true);
        expect(diff.improvements.some(i => i.includes('Circular Dependencies decreased by 1'))).toBe(true);
        expect(diff.improvements.some(i => i.includes('Unused Exports decreased by 2'))).toBe(true);
        expect(diff.improvements.some(i => i.includes('Duplicate Lines decreased by 20'))).toBe(true);
    });

    it('should accurately detect regressions when metrics degrade', () => {
        const current = createMockStats({
            codeLines: 1200,
            typescriptSafety: {
                tsFileCount: 10,
                tsPercentage: '100',
                avgTypeCoverage: '78.5',
                totalAnyCount: 15,
                totalAssertions: 8,
                totalNonNullAssertions: 4,
                avgTypeSafetyScore: 72,
                overallComplexity: 'Medium'
            },
            codeComplexity: {
                analyzedFiles: 10,
                avgComplexity: '5.5',
                maxComplexity: 18,
                avgNestingDepth: '2.5',
                maxNestingDepth: 5,
                avgFunctionSize: '25',
                totalFunctions: 40,
                complexFiles: 2,
                overallComplexity: 'High',
                codeSmells: {
                    magicNumbers: 2,
                    callbackHell: 1,
                    godFiles: 1,
                    excessiveParameters: 2
                },
                duplicateCode: {
                    totalClones: 5,
                    totalDuplicateLines: 65,
                    clones: []
                }
            },
            dependencies: {
                circularDependencies: [],
                unusedExports: [],
                dependencyGraph: {},
                totalFilesAnalyzed: 10,
                circularDependencyCount: 3,
                unusedExportCount: 6
            }
        });

        const baseline: Partial<ProjectStats> = {
            codeLines: 1000,
            typescriptSafety: {
                tsFileCount: 10,
                tsPercentage: '100',
                avgTypeCoverage: '85.0',
                totalAnyCount: 5,
                totalAssertions: 2,
                totalNonNullAssertions: 1,
                avgTypeSafetyScore: 82,
                overallComplexity: 'Low'
            },
            codeComplexity: {
                analyzedFiles: 10,
                avgComplexity: '3.5',
                maxComplexity: 10,
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
                    totalClones: 1,
                    totalDuplicateLines: 15,
                    clones: []
                }
            },
            dependencies: {
                circularDependencies: [],
                unusedExports: [],
                dependencyGraph: {},
                totalFilesAnalyzed: 10,
                circularDependencyCount: 0,
                unusedExportCount: 1
            }
        };

        const diff = compareWithBaseline(current, baseline);

        expect(diff.typeSafetyScoreDelta).toBe(-10); // 72 - 82
        expect(diff.typeCoverageDelta).toBe(-6.5);   // 78.5 - 85.0
        expect(diff.avgComplexityDelta).toBe(2);      // 5.5 - 3.5
        expect(diff.circularDependencyDelta).toBe(3); // 3 - 0
        expect(diff.unusedExportsDelta).toBe(5);     // 6 - 1
        expect(diff.duplicateLinesDelta).toBe(50);   // 65 - 15
        expect(diff.codeLinesDelta).toBe(200);

        expect(diff.improvements).toHaveLength(0);
        expect(diff.regressions.length).toBeGreaterThanOrEqual(6);
        expect(diff.regressions.some(r => r.includes('Type Safety Score decreased by 10'))).toBe(true);
        expect(diff.regressions.some(r => r.includes('Type Coverage decreased by 6.5%'))).toBe(true);
        expect(diff.regressions.some(r => r.includes('Average Complexity increased by 2'))).toBe(true);
        expect(diff.regressions.some(r => r.includes('Circular Dependencies increased by 3'))).toBe(true);
        expect(diff.regressions.some(r => r.includes('Unused Exports increased by 5'))).toBe(true);
        expect(diff.regressions.some(r => r.includes('Duplicate Lines increased by 50'))).toBe(true);
    });

    it('should handle empty baseline gracefully with zero deltas', () => {
        const current = createMockStats();
        const diff = compareWithBaseline(current, {});

        expect(diff.typeSafetyScoreDelta).toBe(0);
        expect(diff.typeCoverageDelta).toBe(0);
        expect(diff.avgComplexityDelta).toBe(0);
        expect(diff.circularDependencyDelta).toBe(0);
        expect(diff.unusedExportsDelta).toBe(0);
        expect(diff.duplicateLinesDelta).toBe(0);
        expect(diff.codeLinesDelta).toBe(0);
        expect(diff.regressions).toHaveLength(0);
        expect(diff.improvements).toHaveLength(0);
    });

    it('should handle partial baseline with only some fields present', () => {
        const current = createMockStats({
            codeLines: 500,
            typescriptSafety: {
                tsFileCount: 5,
                tsPercentage: '100',
                avgTypeCoverage: '80.0',
                totalAnyCount: 0,
                totalAssertions: 0,
                totalNonNullAssertions: 0,
                avgTypeSafetyScore: 90,
                overallComplexity: 'Low'
            }
        });

        const partialBaseline: Partial<ProjectStats> = {
            codeLines: 400,
            typescriptSafety: {
                tsFileCount: 5,
                tsPercentage: '100',
                avgTypeCoverage: '80.0',
                totalAnyCount: 0,
                totalAssertions: 0,
                totalNonNullAssertions: 0,
                avgTypeSafetyScore: 80,
                overallComplexity: 'Low'
            }
            // codeComplexity and dependencies omitted
        };

        const diff = compareWithBaseline(current, partialBaseline);

        expect(diff.codeLinesDelta).toBe(100);
        expect(diff.typeSafetyScoreDelta).toBe(10);
        expect(diff.typeCoverageDelta).toBe(0);
        expect(diff.avgComplexityDelta).toBe(0);
        expect(diff.circularDependencyDelta).toBe(0);
        expect(diff.unusedExportsDelta).toBe(0);
        expect(diff.duplicateLinesDelta).toBe(0);
        expect(diff.improvements).toEqual([
            'Type Safety Score increased by 10 (from 80 to 90)'
        ]);
        expect(diff.regressions).toHaveLength(0);
    });
});
