import fs from 'fs/promises';
import path from 'path';

import { calculateProjectTypeSafety, TypeScriptSafetyMetrics } from './typescript-safety.js';
import { calculateProjectComplexity, CodeComplexityMetrics } from './code-complexity.js';
import { generateContextOutline } from './context-mapper.js';
import { generateRules, RulesGeneratorOptions } from './rules-generator.js';

export { generateContextOutline, generateRules, RulesGeneratorOptions };

export const REACT_EXTENSIONS = [
    '.js', '.jsx', '.ts', '.tsx',
    '.css', '.scss', '.sass',
    '.html', '.json'
];

export const DEFAULT_IGNORE = [
    'node_modules',
    'build',
    'dist',
    '.git',
    'coverage',
    '.next',
    'out'
];

export interface LineCount {
    total: number;
    nonEmpty: number;
    code: number;
    comments: number;
    empty: number;
}

export interface FileTypeData {
    files: number;
    totalLines: number;
    codeLines: number;
    commentLines: number;
    emptyLines: number;
}

export interface FileTypeFormatted {
    'Extension': string;
    'Files': string;
    'Total Lines': string;
    'Code Lines': string;
    'Comment Lines': string;
    'Empty Lines': string;
    '% of Codebase': string;
}

export interface ProjectOptions {
    excludePatterns?: string[];
    additionalExtensions?: string[];
    analyzeSafety?: boolean;
    analyzeComplexity?: boolean;
}

export interface ProjectStats {
    files: number;
    totalLines: number;
    codeLines: number;
    commentLines: number;
    emptyLines: number;
    fileTypes: Record<string, FileTypeData>;
    formattedFileTypes?: FileTypeFormatted[];
    typescriptSafety: TypeScriptSafetyMetrics | null;
    codeComplexity: CodeComplexityMetrics | null;
    formatNumber: (num: number) => string;
    allFilePaths?: string[];
}

export async function countLines(filePath: string): Promise<LineCount> {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const lines: string[] = content.split('\n');
        const nonEmptyLines = lines.filter(line => line.trim().length > 0);
        const nonCommentLines = nonEmptyLines.filter(line => {
            const trimmed = line.trim();
            return !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
        });

        return {
            total: lines.length,
            nonEmpty: nonEmptyLines.length,
            code: nonCommentLines.length,
            comments: nonEmptyLines.length - nonCommentLines.length,
            empty: lines.length - nonEmptyLines.length
        };
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return { total: 0, nonEmpty: 0, code: 0, comments: 0, empty: 0 };
    }
}

export async function analyzeProject(projectPath = '.', options: ProjectOptions = {}): Promise<ProjectStats> {
    const stats: ProjectStats = {
        files: 0,
        totalLines: 0,
        codeLines: 0,
        commentLines: 0,
        emptyLines: 0,
        fileTypes: {},
        typescriptSafety: null,
        codeComplexity: null,
        formatNumber: (num: number) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    };

    const extensions = [...REACT_EXTENSIONS, ...(options.additionalExtensions || [])];
    const ignorePatterns = [...DEFAULT_IGNORE, ...(options.excludePatterns || [])];

    const allFilePaths: string[] = [];

    async function traverse(currentPath: string): Promise<void> {
        const files = await fs.readdir(currentPath);

        for (const file of files) {
            const fullPath = path.join(currentPath, file);
            const stat = await fs.stat(fullPath);

            if (stat.isDirectory()) {
                if (!ignorePatterns.includes(file)) {
                    await traverse(fullPath);
                }
                continue;
            }

            const ext = path.extname(file);
            if (!extensions.includes(ext)) continue;

            stats.files++;
            const relativePath = path.relative(projectPath, fullPath);
            allFilePaths.push(relativePath);

            if (!stats.fileTypes[ext]) {
                stats.fileTypes[ext] = {
                    files: 0,
                    totalLines: 0,
                    codeLines: 0,
                    commentLines: 0,
                    emptyLines: 0
                };
            }

            const { total, code, comments, empty } = await countLines(fullPath);

            stats.totalLines += total;
            stats.codeLines += code;
            stats.commentLines += comments;
            stats.emptyLines += empty;

            stats.fileTypes[ext].files++;
            stats.fileTypes[ext].totalLines += total;
            stats.fileTypes[ext].codeLines += code;
            stats.fileTypes[ext].commentLines += comments;
            stats.fileTypes[ext].emptyLines += empty;
        }
    }

    await traverse(projectPath);

    stats.allFilePaths = allFilePaths;

    stats.formattedFileTypes = Object.entries(stats.fileTypes)
        .sort(([, a], [, b]) => b.files - a.files)
        .map(([ext, data]) => ({
            'Extension': ext,
            'Files': stats.formatNumber(data.files),
            'Total Lines': stats.formatNumber(data.totalLines),
            'Code Lines': stats.formatNumber(data.codeLines),
            'Comment Lines': stats.formatNumber(data.commentLines),
            'Empty Lines': stats.formatNumber(data.emptyLines),
            '% of Codebase': `${((data.codeLines / stats.codeLines) * 100).toFixed(1)}%`
        }));

    // Now analyze TypeScript safety and code complexity if requested
    if (options.analyzeSafety !== false) {
        stats.typescriptSafety = await calculateProjectTypeSafety(projectPath, allFilePaths);
    }

    if (options.analyzeComplexity !== false) {
        stats.codeComplexity = await calculateProjectComplexity(projectPath, allFilePaths);
    }

    return stats;
}