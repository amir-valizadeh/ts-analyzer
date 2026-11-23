import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { analyzeProject } from '../src/index.js';
import fs from 'fs/promises';
import path from 'path';

describe('analyzeProject', () => {
    const testDir = path.join(process.cwd(), 'temp_index_test_dir');

    beforeAll(async () => {
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(path.join(testDir, 'file1.ts'), 'const a = 1;\nconsole.log(a);');
        await fs.writeFile(path.join(testDir, 'file1_duplicate.ts'), 'const b = 2;');
        await fs.writeFile(path.join(testDir, 'file2.js'), '// comment\nlet b = 2;');
        await fs.writeFile(path.join(testDir, 'ignored.txt'), 'not counted');
        
        const subDir = path.join(testDir, 'subdir');
        await fs.mkdir(subDir, { recursive: true });
        await fs.writeFile(path.join(subDir, 'file3.css'), 'body { margin: 0; }');
        
        const ignoreDir = path.join(testDir, 'node_modules');
        await fs.mkdir(ignoreDir, { recursive: true });
        await fs.writeFile(path.join(ignoreDir, 'lib.ts'), 'const ignored = true;');
    });

    afterAll(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should correctly analyze a project directory with default options', async () => {
        const stats = await analyzeProject(testDir, {
            analyzeSafety: false,
            analyzeComplexity: false
        });

        expect(stats.files).toBe(4); // file1.ts, file1_duplicate.ts, file2.js, file3.css
        expect(stats.fileTypes['.ts']).toBeDefined();
        expect(stats.fileTypes['.js']).toBeDefined();
        expect(stats.fileTypes['.css']).toBeDefined();
        expect(stats.typescriptSafety).toBeNull();
        expect(stats.codeComplexity).toBeNull();
    });

    it('should include safety and complexity when requested', async () => {
        const stats = await analyzeProject(testDir, {
            analyzeSafety: true,
            analyzeComplexity: true
        });

        expect(stats.typescriptSafety).not.toBeNull();
        expect(stats.codeComplexity).not.toBeNull();
    });

    it('should respect custom ignore options and extra extensions', async () => {
        const stats = await analyzeProject(testDir, {
            excludePatterns: ['subdir'],
            additionalExtensions: ['.txt'],
            analyzeSafety: false,
            analyzeComplexity: false
        });

        expect(stats.files).toBe(4); // file1.ts, file1_duplicate.ts, file2.js, ignored.txt 
        // subdir is excluded, so file3.css is skipped
        expect(stats.fileTypes['.css']).toBeUndefined();
        expect(stats.fileTypes['.txt']).toBeDefined();
    });

    it('should forward entryPoints and ignoreTypeCycles and populate hotspot fields on ProjectStats', async () => {
        const v21Dir = path.join(testDir, 'v21_features');
        await fs.mkdir(v21Dir, { recursive: true });

        await fs.writeFile(path.join(v21Dir, 'entry.ts'), `
            import type { HelperType } from './helper';
            export interface EntryType { h?: HelperType; }
            export function complexEntry(x: number, y: any): number {
                if (x > 0) {
                    return x + Number(y);
                }
                return 0;
            }
        `);
        await fs.writeFile(path.join(v21Dir, 'helper.ts'), `
            import type { EntryType } from './entry';
            export interface HelperType { e?: EntryType; }
            export const unusedHelper = 42;
        `);

        const defaultStats = await analyzeProject(v21Dir);
        expect(defaultStats.dependencies?.circularDependencyCount).toBe(1);
        expect(defaultStats.dependencies?.circularDependencies[0].isTypeOnly).toBe(true);
        expect(defaultStats.typescriptSafety?.worstFiles).toBeDefined();
        expect(defaultStats.typescriptSafety?.worstFiles?.length).toBeGreaterThan(0);
        expect(defaultStats.codeComplexity?.topComplexFunctions).toBeDefined();
        expect(defaultStats.codeComplexity?.topComplexFunctions?.some(f => f.name === 'complexEntry')).toBe(true);
        expect(defaultStats.codeComplexity?.godFileList).toBeDefined();

        const filteredStats = await analyzeProject(v21Dir, {
            entryPoints: ['entry.ts'],
            ignoreTypeCycles: true
        });
        expect(filteredStats.dependencies?.circularDependencyCount).toBe(0);
        expect(filteredStats.dependencies?.entryPoints).toContain('entry.ts');
        const unused = filteredStats.dependencies?.unusedExports.map(e => `${e.file}:${e.exportName}`) || [];
        expect(unused).not.toContain('entry.ts:complexEntry');
        expect(unused).toContain('helper.ts:unusedHelper');
    });
});
