import { describe, it, expect } from 'vitest';
import { generateHtmlReport } from '../src/html-formatter.js';
import { ProjectStats } from '../src/index.js';

describe('generateHtmlReport', () => {
    it('should generate an HTML string with stats', () => {
        const mockStats: Partial<ProjectStats> = {
            files: 10,
            totalLines: 1000,
            codeLines: 800,
            commentLines: 100,
            emptyLines: 100,
            formatNumber: (n) => n.toString(),
            formattedFileTypes: [
                {
                    'Extension': '.ts',
                    'Files': '10',
                    'Total Lines': '1000',
                    'Code Lines': '800',
                    'Comment Lines': '100',
                    'Empty Lines': '100',
                    '% of Codebase': '80%'
                }
            ],
            typescriptSafety: {
                tsFileCount: 10,
                tsPercentage: '100',
                avgTypeCoverage: '90',
                totalAnyCount: 5,
                totalAssertions: 2,
                totalNonNullAssertions: 1,
                avgTypeSafetyScore: 85,
                overallComplexity: 'Low'
            },
            codeComplexity: {
                analyzedFiles: 10,
                avgComplexity: '2',
                maxComplexity: 5,
                avgNestingDepth: '1.5',
                maxNestingDepth: 3,
                avgFunctionSize: '20',
                totalFunctions: 50,
                complexFiles: 0,
                overallComplexity: 'Low',
                codeSmells: {
                    magicNumbers: 0,
                    callbackHell: 0,
                    godFiles: 0,
                    excessiveParameters: 0
                }
            }
        };

        const html = generateHtmlReport(mockStats as ProjectStats);

        expect(typeof html).toBe('string');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('TS Analyzer Report');
        expect(html).toContain('TypeScript Safety');
        expect(html).toContain('Code Complexity');
    });
    it('should generate an HTML string without optional stats (branch coverage)', () => {
        const mockStats: Partial<ProjectStats> = {
            files: 0,
            totalLines: 0,
            codeLines: 0,
            commentLines: 0,
            emptyLines: 0,
            formatNumber: (n) => n.toString(),
            formattedFileTypes: []
        };
        const html = generateHtmlReport(mockStats as ProjectStats);
        expect(html).not.toContain('TypeScript Safety');
        expect(html).not.toContain('Code Complexity');
    });

    it('should cover warning and danger branches for stats', () => {
        const mockStats: Partial<ProjectStats> = {
            files: 10,
            totalLines: 1000,
            codeLines: 800,
            commentLines: 100,
            emptyLines: 100,
            formatNumber: (n) => n.toString(),
            formattedFileTypes: [],
            typescriptSafety: {
                tsFileCount: 1, tsPercentage: '100', avgTypeCoverage: '50', // < 80 triggers warning
                totalAnyCount: 15, // > 10 triggers danger
                totalAssertions: 0, totalNonNullAssertions: 0, avgTypeSafetyScore: 50, overallComplexity: 'High'
            },
            codeComplexity: {
                analyzedFiles: 1, avgComplexity: '10', // > 5 triggers warning
                maxComplexity: 20, // > 15 triggers danger
                avgNestingDepth: '1.5', maxNestingDepth: 3, avgFunctionSize: '20', totalFunctions: 1,
                complexFiles: 1, // > 0 triggers danger
                overallComplexity: 'High',
                codeSmells: {
                    magicNumbers: 5, // > 0
                    callbackHell: 5, // > 0
                    godFiles: 5,     // > 0
                    excessiveParameters: 5 // > 0
                }
            }
        };

        const html = generateHtmlReport(mockStats as ProjectStats);
        expect(html).toContain('warning');
        expect(html).toContain('#ffc107'); // magicNumbers uses warning color
        expect(html).toContain('#dc3545'); // danger color
    });

    it('should include dependencies section and display warnings when dependencies are present', () => {
        const mockStats: Partial<ProjectStats> = {
            files: 3,
            totalLines: 150,
            codeLines: 100,
            commentLines: 20,
            emptyLines: 30,
            formatNumber: (n) => n.toString(),
            formattedFileTypes: [],
            dependencies: {
                totalFilesAnalyzed: 3,
                circularDependencyCount: 1,
                circularDependencies: [
                    {
                        cycle: ['a.ts', 'b.ts', 'a.ts'],
                        formattedCycle: 'a.ts -> b.ts -> a.ts',
                        length: 2
                    }
                ],
                unusedExportCount: 2,
                unusedExports: [
                    { file: 'a.ts', exportName: 'unusedFn', line: 10 },
                    { file: 'b.ts', exportName: 'deadVar', line: 5 }
                ],
                dependencyGraph: {
                    'a.ts': ['b.ts'],
                    'b.ts': ['a.ts']
                }
            }
        };

        const html = generateHtmlReport(mockStats as ProjectStats);
        expect(html).toContain('Dependencies & Architecture Health');
        expect(html).toContain('Circular Dependency Cycles');
        expect(html).toContain('a.ts -> b.ts -> a.ts');
        expect(html).toContain('Unused / Dead Exports');
        expect(html).toContain('unusedFn');
        expect(html).toContain('deadVar');
        expect(html).toContain('Actionable Guidance');
    });

    it('should display PASSED quality gate status banner when qualityGateResult.passed is true', () => {
        const mockStats: Partial<ProjectStats> = {
            files: 2,
            totalLines: 100,
            codeLines: 80,
            commentLines: 10,
            emptyLines: 10,
            formatNumber: (n) => n.toString(),
            formattedFileTypes: [],
            qualityGateResult: {
                passed: true,
                thresholds: { minTypeSafetyScore: 80 },
                violations: [],
                summaryMarkdown: '# Passed'
            }
        };

        const html = generateHtmlReport(mockStats as ProjectStats);
        expect(html).toContain('Quality Gate: PASSED');
        expect(html).toContain('quality-gate-passed');
        expect(html).toContain('All quality gate checks passed successfully');
    });

    it('should display FAILED quality gate status banner with violations when qualityGateResult.passed is false', () => {
        const mockStats: Partial<ProjectStats> = {
            files: 2,
            totalLines: 100,
            codeLines: 80,
            commentLines: 10,
            emptyLines: 10,
            formatNumber: (n) => n.toString(),
            formattedFileTypes: [],
            qualityGateResult: {
                passed: false,
                thresholds: { minTypeSafetyScore: 90, failOnCircular: true },
                violations: [
                    {
                        rule: 'minTypeSafetyScore',
                        expected: '>= 90',
                        actual: '75',
                        severity: 'error'
                    },
                    {
                        rule: 'failOnCircular',
                        expected: '0 circular dependencies',
                        actual: '2 circular dependencies',
                        severity: 'error'
                    }
                ],
                summaryMarkdown: '# Failed'
            }
        };

        const html = generateHtmlReport(mockStats as ProjectStats);
        expect(html).toContain('Quality Gate: FAILED');
        expect(html).toContain('quality-gate-failed');
        expect(html).toContain('minTypeSafetyScore');
        expect(html).toContain('failOnCircular');
        expect(html).toContain('2</strong> quality gate violation(s) detected');
    });
});



