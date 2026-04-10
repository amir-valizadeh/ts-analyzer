import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { analyzeFileComplexity, calculateProjectComplexity } from '../src/code-complexity.js';
import fs from 'fs/promises';
import path from 'path';

describe('analyzeFileComplexity', () => {
    const testFilePath = path.join(process.cwd(), 'temp_complexity_test.ts');

    afterEach(async () => {
        try {
            await fs.unlink(testFilePath);
        } catch (e) {}
    });

    it('should calculate basic cyclomatic complexity', async () => {
        const content = `
function complexFunc(a: number) {
    if (a > 0) {
        return 1;
    } else {
        return 0;
    }
}
`;
        await fs.writeFile(testFilePath, content);
        const metrics = await analyzeFileComplexity(testFilePath);

        expect(metrics.maxComplexity).toBe(2); // One if statement
        expect(metrics.functionCount).toBe(1);
    });

    it('should detect callback hell (nesting depth)', async () => {
        const content = `
function nestedFunc() {
    if (a) {
        if (b) {
            if (c) {
                if (d) {
                    console.log('Deeply nested');
                }
            }
        }
    }
}
`;
        await fs.writeFile(testFilePath, content);
        const metrics = await analyzeFileComplexity(testFilePath);

        expect(metrics.maxNestingDepth).toBeGreaterThanOrEqual(4);
        expect(metrics.codeSmells.callbackHell).toBe(1);
    });

    it('should detect magic numbers', async () => {
        const content = `
const a = 1234; // Magic number (> 10)
const b = -5678; // Magic number (< -10)
const c = 5; // Not a magic number
`;
        await fs.writeFile(testFilePath, content);
        const metrics = await analyzeFileComplexity(testFilePath);

        expect(metrics.codeSmells.magicNumbers).toBe(2);
    });

    it('should detect excessive parameters', async () => {
        const content = `
function manyParams(a, b, c, d, e, f) {
    return a + b + c + d + e + f;
}
`;
        await fs.writeFile(testFilePath, content);
        const metrics = await analyzeFileComplexity(testFilePath);

        expect(metrics.codeSmells.excessiveParameters).toBe(1);
    });
});

describe('calculateProjectComplexity', () => {
    const testDir = path.join(process.cwd(), 'temp_complexity_project_test_dir');

    beforeAll(async () => {
        await fs.mkdir(testDir, { recursive: true });
        
        const file1Content = `
export function helperFunc1(a: number, b: number) {
    if (a > b) {
        return a * 2;
    }
    return b * 2;
}
`;
        
        // Exact duplicate
        const file2Content = `
export function redundantFunc(a: number, b: number) {
    if (a > b) {
        return a * 2;
    }
    return b * 2;
}
`;

        await fs.writeFile(path.join(testDir, 'file1.ts'), file1Content);
        await fs.writeFile(path.join(testDir, 'file2.ts'), file2Content);
    });

    afterAll(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should detect duplicate code across files', async () => {
        const metrics = await calculateProjectComplexity(testDir, ['file1.ts', 'file2.ts']);
        
        expect(metrics).not.toBeNull();
        expect(metrics.duplicateCode.totalClones).toBeGreaterThan(0);
        expect(metrics.duplicateCode.totalDuplicateLines).toBeGreaterThan(4);
    });
});
