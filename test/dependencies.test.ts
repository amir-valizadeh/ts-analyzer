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

    describe('tsconfig.json paths & baseUrl Resolution', () => {
        it('should resolve tsconfig paths wildcards, exact aliases, comments, and trailing commas', async () => {
            const dir = path.join(baseDir, 'tsconfig_paths');
            await fs.mkdir(path.join(dir, 'src', 'utils'), { recursive: true });
            await fs.mkdir(path.join(dir, 'src', 'components'), { recursive: true });

            // tsconfig.json with JSONC comments and trailing commas
            await fs.writeFile(path.join(dir, 'tsconfig.json'), `{
                // Path aliases for app
                "compilerOptions": {
                    "baseUrl": ".",
                    "paths": {
                        "@/*": ["src/*",],
                        "@config": ["src/config.ts"],
                    },
                },
            }`);

            await fs.writeFile(path.join(dir, 'src', 'config.ts'), 'export const API_URL = "https://example.com";');
            await fs.writeFile(path.join(dir, 'src', 'utils', 'math.ts'), `
                import { API_URL } from '@config';
                export const add = (a: number, b: number) => a + b + API_URL.length;
                export const unusedMath = 0;
            `);
            await fs.writeFile(path.join(dir, 'src', 'components', 'App.ts'), `
                import { add } from '@/utils/math';
                import React from 'react';
                export const result = add(1, 2);
            `);

            const result = await analyzeDependencies(dir, [
                'src/config.ts',
                'src/utils/math.ts',
                'src/components/App.ts'
            ]);

            expect(result.dependencyGraph['src/components/App.ts']).toEqual(['src/utils/math.ts']);
            expect(result.dependencyGraph['src/utils/math.ts']).toEqual(['src/config.ts']);

            // Exports imported via aliases should NOT be flagged as unused
            const unused = result.unusedExports.map(e => `${e.file}:${e.exportName}`);
            expect(unused).not.toContain('src/config.ts:API_URL');
            expect(unused).not.toContain('src/utils/math.ts:add');
            expect(unused).toContain('src/utils/math.ts:unusedMath');
        });

        it('should resolve bare imports via tsconfig baseUrl and detect cycles through aliases', async () => {
            const dir = path.join(baseDir, 'tsconfig_baseurl');
            await fs.mkdir(path.join(dir, 'src', 'services'), { recursive: true });

            await fs.writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({
                compilerOptions: {
                    baseUrl: 'src'
                }
            }));

            await fs.writeFile(path.join(dir, 'src', 'services', 'auth.ts'), `
                import { fetchUser } from 'services/user';
                export const checkAuth = () => fetchUser();
            `);
            await fs.writeFile(path.join(dir, 'src', 'services', 'user.ts'), `
                import { checkAuth } from 'services/auth';
                export const fetchUser = () => checkAuth();
            `);

            const result = await analyzeDependencies(dir, [
                'src/services/auth.ts',
                'src/services/user.ts'
            ]);

            expect(result.dependencyGraph['src/services/auth.ts']).toContain('src/services/user.ts');
            expect(result.dependencyGraph['src/services/user.ts']).toContain('src/services/auth.ts');
            expect(result.circularDependencyCount).toBe(1);
            expect(result.circularDependencies[0].cycle).toEqual([
                'src/services/auth.ts',
                'src/services/user.ts',
                'src/services/auth.ts'
            ]);
        });

        it('should gracefully handle invalid tsconfig.json without throwing', async () => {
            const dir = path.join(baseDir, 'tsconfig_invalid');
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(path.join(dir, 'tsconfig.json'), '{ invalid json !!!');
            await fs.writeFile(path.join(dir, 'a.ts'), "import { b } from './b';\nexport const a = b;");
            await fs.writeFile(path.join(dir, 'b.ts'), 'export const b = 1;');

            const result = await analyzeDependencies(dir, ['a.ts', 'b.ts']);

            expect(result.dependencyGraph['a.ts']).toEqual(['b.ts']);
            expect(result.circularDependencyCount).toBe(0);
        });
    });

    describe('Entry-Point-Aware Unused Export Detection', () => {
        it('should auto-detect entry points from package.json (main, module, bin, exports) and exclude them from unused exports', async () => {
            const dir = path.join(baseDir, 'pkg_entry_points');
            await fs.mkdir(path.join(dir, 'src'), { recursive: true });
            await fs.mkdir(path.join(dir, 'bin'), { recursive: true });

            await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
                name: 'sample-lib',
                main: 'dist/index.js',
                module: 'dist/esm/index.mjs',
                bin: {
                    'sample-cli': 'dist/bin/cli.js'
                },
                exports: {
                    '.': {
                        import: './dist/index.js',
                        types: './dist/index.d.ts'
                    },
                    './helpers': './dist/helpers.js'
                }
            }));

            await fs.writeFile(path.join(dir, 'src', 'index.ts'), `
                import { usedInternal } from './internal';
                export const publicApi = () => usedInternal();
            `);
            await fs.writeFile(path.join(dir, 'src', 'helpers.ts'), `
                export const publicHelper = () => 42;
            `);
            await fs.writeFile(path.join(dir, 'bin', 'cli.ts'), `
                export const runCli = () => {};
            `);
            await fs.writeFile(path.join(dir, 'src', 'internal.ts'), `
                export const usedInternal = () => 1;
                export const deadInternal = () => 2;
            `);

            const result = await analyzeDependencies(dir, [
                'src/index.ts',
                'src/helpers.ts',
                'bin/cli.ts',
                'src/internal.ts'
            ]);

            expect(result.entryPoints).toEqual(
                expect.arrayContaining(['src/index.ts', 'src/helpers.ts', 'bin/cli.ts'])
            );

            const unused = result.unusedExports.map(e => `${e.file}:${e.exportName}`);
            expect(unused).toEqual(['src/internal.ts:deadInternal']);
            expect(result.unusedExportCount).toBe(1);
        });

        it('should exclude custom entryPoints (relative paths and globs) from unused exports', async () => {
            const dir = path.join(baseDir, 'custom_entry_points');
            await fs.mkdir(path.join(dir, 'src', 'pages', 'blog'), { recursive: true });
            await fs.mkdir(path.join(dir, 'src', 'lib'), { recursive: true });

            await fs.writeFile(path.join(dir, 'src', 'pages', 'Home.tsx'), 'export default function Home() {}');
            await fs.writeFile(path.join(dir, 'src', 'pages', 'blog', 'Post.tsx'), 'export const PostPage = () => null;');
            await fs.writeFile(path.join(dir, 'src', 'worker.ts'), 'export const startWorker = () => {};');
            await fs.writeFile(path.join(dir, 'src', 'lib', 'orphan.ts'), 'export const orphanFn = () => {};');

            const result = await analyzeDependencies(
                dir,
                [
                    'src/pages/Home.tsx',
                    'src/pages/blog/Post.tsx',
                    'src/worker.ts',
                    'src/lib/orphan.ts'
                ],
                {
                    entryPoints: ['src/pages/**', 'src/worker.ts']
                }
            );

            expect(result.entryPoints).toEqual([
                'src/pages/Home.tsx',
                'src/pages/blog/Post.tsx',
                'src/worker.ts'
            ]);
            const unused = result.unusedExports.map(e => `${e.file}:${e.exportName}`);
            expect(unused).toEqual(['src/lib/orphan.ts:orphanFn']);
        });
    });

    describe('Type-Only Import/Export Cycle Distinction', () => {
        it('should mark import type / export type cycles as isTypeOnly and exclude them when ignoreTypeCycles is true', async () => {
            const dir = path.join(baseDir, 'type_only_cycles');
            await fs.mkdir(dir, { recursive: true });

            // Pure type-only cycle via `import type` and inline `import { type ... }`
            await fs.writeFile(path.join(dir, 'typeA.ts'), `
                import type { TypeB } from './typeB';
                export interface TypeA { b?: TypeB; }
            `);
            await fs.writeFile(path.join(dir, 'typeB.ts'), `
                import { type TypeA } from './typeA';
                export interface TypeB { a?: TypeA; }
            `);

            // Mixed cycle: runtime in one direction, type-only in the other (erased at runtime)
            await fs.writeFile(path.join(dir, 'mixedA.ts'), `
                import { mixedBVal } from './mixedB';
                export interface MixedAType { x: number; }
                export const mixedAVal = mixedBVal + 1;
            `);
            await fs.writeFile(path.join(dir, 'mixedB.ts'), `
                export type { MixedAType } from './mixedA';
                export const mixedBVal = 10;
            `);

            // True runtime cycle (including inline mixed `import { type ..., value }`)
            await fs.writeFile(path.join(dir, 'runA.ts'), `
                import { type RunBType, runB } from './runB';
                export interface RunAType { b?: RunBType; }
                export const runA = () => runB();
            `);
            await fs.writeFile(path.join(dir, 'runB.ts'), `
                import { runA } from './runA';
                export interface RunBType { id: string; }
                export const runB = () => runA();
            `);

            const files = ['typeA.ts', 'typeB.ts', 'mixedA.ts', 'mixedB.ts', 'runA.ts', 'runB.ts'];

            // Default: all 3 cycles reported, with accurate isTypeOnly flags
            const defaultResult = await analyzeDependencies(dir, files);
            expect(defaultResult.circularDependencyCount).toBe(3);

            const byStart = new Map(defaultResult.circularDependencies.map(c => [c.cycle[0], c]));
            expect(byStart.get('typeA.ts')?.isTypeOnly).toBe(true);
            expect(byStart.get('mixedA.ts')?.isTypeOnly).toBe(true);
            expect(byStart.get('runA.ts')?.isTypeOnly).toBe(false);

            // With ignoreTypeCycles: only the runtime cycle remains
            const filteredResult = await analyzeDependencies(dir, files, { ignoreTypeCycles: true });
            expect(filteredResult.circularDependencyCount).toBe(1);
            expect(filteredResult.circularDependencies).toHaveLength(1);
            expect(filteredResult.circularDependencies[0].cycle).toEqual(['runA.ts', 'runB.ts', 'runA.ts']);
            expect(filteredResult.circularDependencies[0].isTypeOnly).toBe(false);
        });
    });
});
