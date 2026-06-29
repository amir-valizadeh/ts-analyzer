import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateContextOutline, analyzeFileContext } from '../src/context-mapper.js';
import fs from 'fs/promises';
import path from 'path';

describe('context-mapper', () => {
    const testDir = path.join(process.cwd(), 'temp_context_test_dir');

    beforeAll(async () => {
        await fs.mkdir(testDir, { recursive: true });
        
        // File 1: TS with various exports
        await fs.writeFile(
            path.join(testDir, 'utils.ts'), 
            `export function formatMessage(msg: string): string { return msg.trim(); }
             export class Logger {
                 constructor(public prefix: string) {}
                 log(val: any): void { console.log(this.prefix, val); }
             }
             export interface LogConfig {
                 debug?: boolean;
             }
             const defaultLimit = 10;
             export const MAX_RETRY = 3;
             export type MyAlias = string | number;
             export enum Status { Active, Inactive }`
        );
        
        // File 2: TS without exports
        await fs.writeFile(
            path.join(testDir, 'internal.ts'),
            `const privateKey = 'secret';
             function doSecretStuff() { return privateKey; }`
        );

        // File 3: In subdirectory
        const sub = path.join(testDir, 'components');
        await fs.mkdir(sub, { recursive: true });
        await fs.writeFile(
            path.join(sub, 'Button.tsx'),
            `export default function Button(props: { label: string }) {
                 return { type: 'button', props };
             }`
        );
    });

    afterAll(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should correctly analyze file exports and signatures', async () => {
        const filePath = path.join(testDir, 'utils.ts');
        const ctx = await analyzeFileContext(filePath);

        expect(ctx.exports).toBeDefined();
        
        const funcExport = ctx.exports.find(e => e.name === 'formatMessage');
        expect(funcExport).toBeDefined();
        expect(funcExport?.kind).toBe('function');
        expect(funcExport?.signature).toContain('function formatMessage(msg: string): string');

        const classExport = ctx.exports.find(e => e.name === 'Logger');
        expect(classExport).toBeDefined();
        expect(classExport?.kind).toBe('class');
        expect(classExport?.signature).toContain('class Logger');
        expect(classExport?.members).toContain('log(val: any): void');

        const interfaceExport = ctx.exports.find(e => e.name === 'LogConfig');
        expect(interfaceExport).toBeDefined();
        expect(interfaceExport?.kind).toBe('interface');
        expect(interfaceExport?.members).toContain('debug?: boolean');

        const varExport = ctx.exports.find(e => e.name === 'MAX_RETRY');
        expect(varExport).toBeDefined();
        expect(varExport?.kind).toBe('variable');
        expect(varExport?.signature).toContain('const MAX_RETRY');

        const typeExport = ctx.exports.find(e => e.name === 'MyAlias');
        expect(typeExport).toBeDefined();
        expect(typeExport?.kind).toBe('type');

        const enumExport = ctx.exports.find(e => e.name === 'Status');
        expect(enumExport).toBeDefined();
        expect(enumExport?.kind).toBe('enum');
    });

    it('should return empty exports for a file with no exports', async () => {
        const filePath = path.join(testDir, 'internal.ts');
        const ctx = await analyzeFileContext(filePath);
        expect(ctx.exports.length).toBe(0);
    });

    it('should generate a formatted context outline with directory tree', async () => {
        const filePaths = ['utils.ts', 'internal.ts', 'components/Button.tsx'];
        const outline = await generateContextOutline(testDir, filePaths);

        expect(outline).toContain('# Project Context Map');
        expect(outline).toContain('Directory Structure');
        expect(outline).toContain('utils.ts');
        expect(outline).toContain('internal.ts');
        expect(outline).toContain('components/');
        expect(outline).toContain('Button.tsx');
        expect(outline).toContain('Export Outlines');
        expect(outline).toContain('formatMessage');
        expect(outline).toContain('*(No public exports)*'); // for internal.ts
        expect(outline).toContain('default'); // for Button.tsx
    });
});
