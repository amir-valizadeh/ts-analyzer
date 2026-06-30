import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateRules } from '../src/rules-generator.js';
import { ProjectStats } from '../src/index.js';
import fs from 'fs/promises';
import path from 'path';

describe('rules-generator', () => {
    const testDir = path.join(process.cwd(), 'temp_rules_test_dir');

    beforeAll(async () => {
        await fs.mkdir(testDir, { recursive: true });
    });

    afterAll(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should generate customized AI rules based on project stats', async () => {
        const dummyStats: ProjectStats = {
            files: 10,
            totalLines: 1500,
            codeLines: 1200,
            commentLines: 200,
            emptyLines: 100,
            fileTypes: {
                '.ts': { files: 8, totalLines: 1200, codeLines: 1000, commentLines: 150, emptyLines: 50 },
                '.tsx': { files: 2, totalLines: 300, codeLines: 200, commentLines: 50, emptyLines: 50 }
            },
            typescriptSafety: {
                tsFileCount: 10,
                tsPercentage: '100.0',
                avgTypeCoverage: '72.5',
                totalAnyCount: 15,
                totalAssertions: 8,
                totalNonNullAssertions: 3,
                avgTypeSafetyScore: 65,
                overallComplexity: 'Medium'
            },
            codeComplexity: {
                analyzedFiles: 10,
                avgComplexity: '8.4',
                maxComplexity: 15,
                avgNestingDepth: '4.2',
                maxNestingDepth: 6,
                avgFunctionSize: '24.5',
                totalFunctions: 40,
                complexFiles: 3,
                overallComplexity: 'High',
                codeSmells: {
                    magicNumbers: 23,
                    callbackHell: 4,
                    godFiles: 1,
                    excessiveParameters: 3
                },
                duplicateCode: {
                    totalClones: 2,
                    totalDuplicateLines: 45,
                    clones: []
                }
            },
            formatNumber: (n) => n.toString()
        };

        const result = await generateRules(testDir, dummyStats, { outputFormat: 'both' });

        expect(result.content).toBeDefined();
        expect(result.cursorrulesPath).toBeDefined();
        expect(result.claudepromptPath).toBeDefined();

        // Check if rules are customized based on the metrics:
        // 1. Should have react rules due to .tsx files
        expect(result.content).toContain('React');
        
        // 2. Type safety score warning
        expect(result.content).toContain('Current Project Type Safety Score is 65/100');
        expect(result.content).toContain("No 'any' Types");
        expect(result.content).toContain("Avoid Type Assertions");
        
        // 3. Complexity warning
        expect(result.content).toContain('Average Function Cyclomatic Complexity is high (8.4)');
        expect(result.content).toContain('Nesting Limit');
        expect(result.content).toContain('God Files / Size Limit');
        expect(result.content).toContain('DRY Principle');
        
        // Verify files were actually written
        const cursorrulesExists = await fs.access(result.cursorrulesPath!).then(() => true).catch(() => false);
        const claudepromptExists = await fs.access(result.claudepromptPath!).then(() => true).catch(() => false);
        expect(cursorrulesExists).toBe(true);
        expect(claudepromptExists).toBe(true);

        const cursorrulesContent = await fs.readFile(result.cursorrulesPath!, 'utf8');
        expect(cursorrulesContent).toBe(result.content);
    });
});
