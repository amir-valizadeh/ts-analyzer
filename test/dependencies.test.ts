import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { analyzeDependencies } from '../src/dependency-analysis.js';
import { analyzeProject } from '../src/index.js';

describe('Dependency Analysis', () => {
    const baseDir = path.join(process.cwd(), 'temp_dep_test_dir');

    beforeAll(async () => {
        await fs.mkdir(baseDir, { recursive: true });
    });

    afterAll(async () => {
        await fs.rm(baseDir, { recursive: true, force: true });
    });

    describe('Circular Dependency Detection', () => {
        it('should detect direct circular dependency (A -> B -> A) and deduplicate symmetric cycles', async () => {
            const dir = path.join(baseDir, 'direct_cycle');
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(path.join(dir, 'a.ts'), "import { b } from './b';\nexport const a = 1;");
            await fs.writeFile(path.join(dir, 'b.ts'), "import { a } from './a';\nexport const b = 2;");

            const result = await analyzeDependencies(dir, ['a.ts', 'b.ts']);

            expect(result.circularDependencyCount).toBe(1);
            expect(result.circularDependencies).toHaveLength(1);

            const cycle = result.circularDependencies[0].cycle;
            expect(cycle[0]).toBe(cycle[cycle.length - 1]);
            expect(cycle).toEqual(['a.ts', 'b.ts', 'a.ts']);
            expect(result.circularDependencies[0].formattedCycle).toBe('a.ts -> b.ts -> a.ts');
        });

        it('should detect multi-hop circular dependency (A -> B -> C -> A)', async () => {
            const dir = path.join(baseDir, 'multihop_cycle');
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(path.join(dir, 'a.ts'), "import { b } from './b';\nexport const a = 1;");
            await fs.writeFile(path.join(dir, 'b.ts'), "import { c } from './c';\nexport const b = 2;");
            await fs.writeFile(path.join(dir, 'c.ts'), "import { a } from './a';\nexport const c = 3;");

            const result = await analyzeDependencies(dir, ['a.ts', 'b.ts', 'c.ts']);

            expect(result.circularDependencyCount).toBe(1);
            expect(result.circularDependencies).toHaveLength(1);

            const cycle = result.circularDependencies[0].cycle;
            expect(cycle).toEqual(['a.ts', 'b.ts', 'c.ts', 'a.ts']);
            expect(result.circularDependencies[0].length).toBe(3);
        });

        it('should not report false positives for acyclic dependency graphs (including diamond dependencies)', async () => {
            const dir = path.join(baseDir, 'acyclic');
            await fs.mkdir(dir, { recursive: true });

            // Diamond structure: D -> B, D -> C, B -> A, C -> A
            await fs.writeFile(path.join(dir, 'a.ts'), 'export const a = 1;');
            await fs.writeFile(path.join(dir, 'b.ts'), "import { a } from './a';\nexport const b = a + 1;");
            await fs.writeFile(path.join(dir, 'c.ts'), "import { a } from './a';\nexport const c = a + 2;");
            await fs.writeFile(path.join(dir, 'd.ts'), "import { b } from './b';\nimport { c } from './c';\nexport const d = b + c;");

            const result = await analyzeDependencies(dir, ['a.ts', 'b.ts', 'c.ts', 'd.ts']);

            expect(result.circularDependencies).toEqual([]);
            expect(result.circularDependencyCount).toBe(0);
            expect(result.dependencyGraph['d.ts']).toEqual(expect.arrayContaining(['b.ts', 'c.ts']));
            expect(result.dependencyGraph['b.ts']).toEqual(['a.ts']);
            expect(result.dependencyGraph['c.ts']).toEqual(['a.ts']);
            expect(result.dependencyGraph['a.ts']).toEqual([]);
        });
    });

    describe('Relative Path and Module Resolution', () => {
        it('should resolve extensions, index files, and .js to .ts imports', async () => {
            const dir = path.join(baseDir, 'resolution');
            await fs.mkdir(path.join(dir, 'sub'), { recursive: true });

            await fs.writeFile(path.join(dir, 'sub', 'index.ts'), 'export const subVal = 42;');
            await fs.writeFile(path.join(dir, 'helper.ts'), 'export const helpVal = 99;');
            // Import without extension, import with .js (TS ESM), and folder import (index.ts)
            await fs.writeFile(path.join(dir, 'main.ts'), `
                import { helpVal } from './helper.js';
                import { subVal } from './sub';
                export const mainVal = helpVal + subVal;
            `);

            const result = await analyzeDependencies(dir, ['main.ts', 'helper.ts', 'sub/index.ts']);

            expect(result.dependencyGraph['main.ts']).toContain('helper.ts');
            expect(result.dependencyGraph['main.ts']).toContain('sub/index.ts');
            expect(result.circularDependencies).toEqual([]);
        });
    });

    describe('Unused Export Detection', () => {
        it('should detect unused exports and keep referenced exports clean', async () => {
            const dir = path.join(baseDir, 'unused_exports');
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(path.join(dir, 'utils.ts'), `
                export function usedHelper() { return 'used'; }
                export function unusedHelper() { return 'unused'; }
                export const unusedConstant = 123;
                export interface UnusedType { foo: string; }
            `);

            await fs.writeFile(path.join(dir, 'app.ts'), `
                import { usedHelper } from './utils';
                export const appEntry = usedHelper();
            `);

            const result = await analyzeDependencies(dir, ['utils.ts', 'app.ts']);

            const unusedNames = result.unusedExports.map(e => `${e.file}:${e.exportName}`);
            expect(unusedNames).toContain('utils.ts:unusedHelper');
            expect(unusedNames).toContain('utils.ts:unusedConstant');
            expect(unusedNames).toContain('utils.ts:UnusedType');
            expect(unusedNames).toContain('app.ts:appEntry');

            // usedHelper should NOT be in unused exports
            expect(unusedNames).not.toContain('utils.ts:usedHelper');
        });

        it('should consider all exports referenced when imported via wildcard import or re-export', async () => {
            const dir = path.join(baseDir, 'wildcard_exports');
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(path.join(dir, 'lib.ts'), `
                export const item1 = 1;
                export const item2 = 2;
                export default function def() {}
            `);

            await fs.writeFile(path.join(dir, 'barrel.ts'), `
                export * from './lib';
            `);

            await fs.writeFile(path.join(dir, 'consumer.ts'), `
                import * as lib from './barrel';
                console.log(lib);
            `);

            const result = await analyzeDependencies(dir, ['lib.ts', 'barrel.ts', 'consumer.ts']);

            const libUnused = result.unusedExports.filter(e => e.file === 'lib.ts');
            expect(libUnused).toHaveLength(0);
        });

        it('should detect unreferenced default exports correctly', async () => {
            const dir = path.join(baseDir, 'default_exports');
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(path.join(dir, 'referencedDefault.ts'), 'export default function ref() {}');
            await fs.writeFile(path.join(dir, 'unreferencedDefault.ts'), 'export default function unref() {}');
            await fs.writeFile(path.join(dir, 'importer.ts'), "import ref from './referencedDefault';\nconsole.log(ref);");

            const result = await analyzeDependencies(dir, ['referencedDefault.ts', 'unreferencedDefault.ts', 'importer.ts']);

            const unused = result.unusedExports.map(e => `${e.file}:${e.exportName}`);
            expect(unused).toContain('unreferencedDefault.ts:default');
            expect(unused).not.toContain('referencedDefault.ts:default');
        });
    });

    describe('Integration with analyzeProject', () => {
        it('should include dependencies in ProjectStats by default', async () => {
            const dir = path.join(baseDir, 'project_integration');
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(path.join(dir, 'modA.ts'), "import { b } from './modB';\nexport const a = 1;");
            await fs.writeFile(path.join(dir, 'modB.ts'), "import { a } from './modA';\nexport const b = 2;");

            const stats = await analyzeProject(dir, {
                analyzeSafety: false,
                analyzeComplexity: false
            });

            expect(stats.dependencies).not.toBeNull();
            expect(stats.dependencies?.circularDependencyCount).toBe(1);
            expect(stats.dependencies?.circularDependencies[0].cycle).toEqual(['modA.ts', 'modB.ts', 'modA.ts']);
        });

        it('should skip dependency analysis when analyzeDependencies is false', async () => {
            const dir = path.join(baseDir, 'project_integration_disabled');
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(path.join(dir, 'mod.ts'), 'export const x = 1;');

            const stats = await analyzeProject(dir, {
                analyzeSafety: false,
                analyzeComplexity: false,
                analyzeDependencies: false
            });

            expect(stats.dependencies).toBeNull();
        });
    });
});
