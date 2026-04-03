import { describe, it, expect, afterEach } from 'vitest';
import { analyzeTypeScriptSafety } from '../src/typescript-safety.js';
import fs from 'fs/promises';
import path from 'path';

describe('analyzeTypeScriptSafety', () => {
    const testFilePath = path.join(process.cwd(), 'temp_safety_test.ts');

    afterEach(async () => {
        try {
            await fs.unlink(testFilePath);
        } catch (e) {}
    });

    it('should detect basic type coverage', async () => {
        const content = `
const a: number = 1;
function b(x: string): void {}
let c = 'inferred';
`;
        await fs.writeFile(testFilePath, content);
        const metrics = await analyzeTypeScriptSafety(testFilePath);

        expect(parseFloat(metrics.typeCoverage)).toBeGreaterThan(0);
        expect(metrics.totalTypeableNodes).toBeGreaterThan(0);
        expect(metrics.anyTypeCount).toBe(0);
    });

    it('should detect "any" usage', async () => {
        const content = `
const a: any = 1;
function b(x: any): void {}
`;
        await fs.writeFile(testFilePath, content);
        const metrics = await analyzeTypeScriptSafety(testFilePath);

        expect(metrics.anyTypeCount).toBe(2);
    });

    it('should detect type assertions', async () => {
        const content = `
const a = 1 as any;
const b = <string>"foo";
`;
        await fs.writeFile(testFilePath, content);
        const metrics = await analyzeTypeScriptSafety(testFilePath);

        expect(metrics.typeAssertions).toBeGreaterThan(0);
    });
});
