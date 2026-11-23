import { describe, it, expect, afterEach } from 'vitest';
import { analyzeTypeScriptSafety, calculateProjectTypeSafety, getTsconfigScore } from '../src/typescript-safety.js';
import fs from 'fs/promises';
import path from 'path';

describe('analyzeTypeScriptSafety', () => {
    const testFilePath = path.join(process.cwd(), 'temp_safety_test.ts');

    afterEach(async () => {
        try {
            await fs.unlink(testFilePath);
        } catch (e) {}
    });

    it('should detect basic type coverage and score 90-100 for well-typed code', async () => {
        const content = `
const a: number = 1;
function b(x: string): void {}
const c: boolean = true;
`;
        await fs.writeFile(testFilePath, content);
        const metrics = await analyzeTypeScriptSafety(testFilePath);

        expect(parseFloat(metrics.typeCoverage)).toBeGreaterThan(90);
        expect(metrics.totalTypeableNodes).toBeGreaterThan(0);
        expect(metrics.anyTypeCount).toBe(0);
        expect(metrics.typeSafetyScore).toBeGreaterThanOrEqual(90);
        expect(metrics.typeSafetyScore).toBeLessThanOrEqual(100);
        expect(metrics.typeComplexity).toBe('Low');
    });

    it('should detect "any" usage and penalize typeSafetyScore', async () => {
        const cleanContent = `
const a: number = 1;
function b(x: string): void {}
`;
        await fs.writeFile(testFilePath, cleanContent);
        const cleanMetrics = await analyzeTypeScriptSafety(testFilePath);

        const anyContent = `
const a: any = 1;
function b(x: any): void {}
`;
        await fs.writeFile(testFilePath, anyContent);
        const anyMetrics = await analyzeTypeScriptSafety(testFilePath);

        expect(anyMetrics.anyTypeCount).toBe(2);
        expect(anyMetrics.typeSafetyScore).toBeLessThan(cleanMetrics.typeSafetyScore);
    });

    it('should detect type assertions and penalize typeSafetyScore', async () => {
        const content = `
const a: number = 1 as any;
const b: string = <string>"foo";
`;
        await fs.writeFile(testFilePath, content);
        const metrics = await analyzeTypeScriptSafety(testFilePath);

        expect(metrics.typeAssertions).toBeGreaterThan(0);
        expect(metrics.typeSafetyScore).toBeLessThan(95);
    });

    it('should apply penalty for non-null assertions (!)', async () => {
        const withoutNonNull = `
interface Box { value?: string; }
const box: Box = { value: 'ok' };
const v1: string | undefined = box.value;
`;
        await fs.writeFile(testFilePath, withoutNonNull);
        const cleanMetrics = await analyzeTypeScriptSafety(testFilePath);

        const withNonNull = `
interface Box { value?: string; }
const box: Box = { value: 'ok' };
const v1: string = box.value!;
const v2: string = box.value!;
const v3: string = box.value!;
`;
        await fs.writeFile(testFilePath, withNonNull);
        const nonNullMetrics = await analyzeTypeScriptSafety(testFilePath);

        expect(nonNullMetrics.nonNullAssertions).toBe(3);
        expect(nonNullMetrics.typeSafetyScore).toBeLessThan(cleanMetrics.typeSafetyScore);
    });

    it('should detect complex types, interfaces, non-null assertions, and generics', async () => {
        const content = `
interface MyInterface<T> {
  value?: T;
}
const arr: Array<string> = [];
const obj: MyInterface<number> = {};
const val = obj.value!;
const func = <U>(arg: U) => arg;
class MyClass {
  prop = 123;
  method() { return this.prop; }
}
export type MyType = string | number;
import { something } from "somewhere";
`;
        await fs.writeFile(testFilePath, content);
        const metrics = await analyzeTypeScriptSafety(testFilePath);

        expect(metrics.nonNullAssertions).toBeGreaterThan(0);
        expect(metrics.optionalProperties).toBeGreaterThan(0);
        expect(metrics.genericsCount).toBeGreaterThan(0);
    });

    it('should handle tsconfig.json with comments and trailing commas via getTsconfigScore', async () => {
        const tempDir = path.join(process.cwd(), 'temp_tsconfig_test_dir');
        await fs.mkdir(tempDir, { recursive: true });
        try {
            await fs.writeFile(
                path.join(tempDir, 'tsconfig.json'),
                `{
                    // Comment in tsconfig
                    "compilerOptions": {
                        "strict": true,
                        "noImplicitAny": true,
                        "strictNullChecks": true,
                        "noImplicitReturns": true,
                    },
                }`
            );
            const score = getTsconfigScore(tempDir);
            expect(score).toBe(13);
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    it('should handle un-parseable or missing files gracefully', async () => {
        const metrics = await analyzeTypeScriptSafety('/non/existent/path/this/should/throw/error.ts');
        expect(metrics.typeCoverage).toBe('0.0');
    });
});

describe('calculateProjectTypeSafety', () => {
    it('should return default zero metrics for no TS files', async () => {
        const metrics = await calculateProjectTypeSafety('.', ['index.js', 'style.css']);
        expect(metrics.tsFileCount).toBe(0);
        expect(metrics.avgTypeSafetyScore).toBe(0);
        expect(metrics.worstFiles).toEqual([]);
    });

    it('should calculate averages and populate sorted worstFiles hotspots across multiple files', async () => {
        const tempPath1 = path.join(process.cwd(), 'temp_s_test1.ts');
        const tempPath2 = path.join(process.cwd(), 'temp_s_test2.tsx');

        await fs.writeFile(tempPath1, 'const x: number = 1;\nfunction clean(a: string): string { return a; }');
        await fs.writeFile(tempPath2, 'const y: any = 2;\nconst z: any = (y as any)!;');

        try {
            const metrics = await calculateProjectTypeSafety(process.cwd(), ['temp_s_test1.ts', 'temp_s_test2.tsx']);
            expect(metrics.tsFileCount).toBe(2);
            expect(metrics.totalAnyCount).toBe(2);
            expect(metrics.tsPercentage).toBe('100.0');
            expect(metrics.worstFiles).toBeDefined();
            expect(metrics.worstFiles).toHaveLength(2);
            // Worst file (lowest safety score) should be first
            expect(metrics.worstFiles![0].file).toBe('temp_s_test2.tsx');
            expect(metrics.worstFiles![0].anyCount).toBe(2);
            expect(metrics.worstFiles![0].typeAssertions).toBe(1);
            expect(metrics.worstFiles![0].nonNullAssertions).toBe(1);
            expect(metrics.worstFiles![0].typeSafetyScore).toBeLessThan(metrics.worstFiles![1].typeSafetyScore);
            expect(metrics.worstFiles![1].file).toBe('temp_s_test1.ts');
        } finally {
            try { await fs.unlink(tempPath1); } catch (e) {}
            try { await fs.unlink(tempPath2); } catch (e) {}
        }
    });
});

