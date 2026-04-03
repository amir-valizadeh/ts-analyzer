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
});
