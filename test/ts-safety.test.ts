import { describe, it, expect, afterEach } from 'vitest';
import { analyzeTypeScriptSafety, calculateProjectTypeSafety } from '../src/typescript-safety.js';
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
    });

    it('should calculate averages across multiple files', async () => {
        // We will pass the src directory and check if it handles it. 
        // We can just rely on the existing files in the project or mock files.
        // Let's create two temp files
        const tempPath1 = path.join(process.cwd(), 'temp_s_test1.ts');
        const tempPath2 = path.join(process.cwd(), 'temp_s_test2.tsx');
        
        await fs.writeFile(tempPath1, 'const x: number = 1;');
        await fs.writeFile(tempPath2, 'const y: any = 2;');
        
        try {
            const metrics = await calculateProjectTypeSafety(process.cwd(), ['temp_s_test1.ts', 'temp_s_test2.tsx']);
            expect(metrics.tsFileCount).toBe(2);
            expect(metrics.totalAnyCount).toBe(1);
            expect(metrics.tsPercentage).toBe('100.0');
        } finally {
            try { await fs.unlink(tempPath1); } catch(e) {}
            try { await fs.unlink(tempPath2); } catch(e) {}
        }
    });
});

