import * as ts from 'typescript';
import fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'path';

export interface DependencyAnalysisOptions {
    entryPoints?: string[];
    ignoreTypeCycles?: boolean;
}

export interface CircularDependencyCycle {
    cycle: string[];
    formattedCycle?: string;
    length?: number;
    isTypeOnly?: boolean;
}

export interface UnusedExport {
    file: string;
    exportName: string;
    line: number;
    name?: string;
}

export interface DependencyAnalysisResult {
    circularDependencies: CircularDependencyCycle[];
    unusedExports: UnusedExport[];
    dependencyGraph: Record<string, string[]>;
    totalFilesAnalyzed: number;
    circularDependencyCount: number;
    unusedExportCount: number;
    entryPoints?: string[];
}

interface TsConfigResolution {
    baseUrl?: string;
    pathsBaseDir: string;
    exactPaths: Map<string, string[]>;
    wildcardPaths: Array<{ prefix: string; suffix: string; targets: string[] }>;
}

const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const SCRIPT_EXT_SET = new Set(SCRIPT_EXTENSIONS);
const BUILD_DIR_PREFIXES = ['dist/', 'build/', 'out/', 'lib/'];

/**
 * Normalizes file path to forward slashes and removes leading './'.
 */
function normalizePath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Loads tsconfig.json baseUrl and paths once per project using TypeScript's config parser.
 */
function loadTsConfigResolution(projectPath: string): TsConfigResolution | null {
    const tsconfigPath = path.resolve(projectPath, 'tsconfig.json');
    if (!existsSync(tsconfigPath)) {
        return null;
    }

    try {
        const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
        if (readResult.error || !readResult.config) {
            return null;
        }

        const tsconfigDir = path.dirname(tsconfigPath);
        const parseHost: ts.ParseConfigHost = {
            useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
            readDirectory: () => [],
            fileExists: ts.sys.fileExists,
            readFile: ts.sys.readFile
        };
        const parsed = ts.parseJsonConfigFileContent(readResult.config, parseHost, tsconfigDir);
        const { baseUrl, paths } = parsed.options;

        if (!baseUrl && !paths) {
            return null;
        }

        const exactPaths = new Map<string, string[]>();
        const wildcardPaths: Array<{ prefix: string; suffix: string; targets: string[] }> = [];

        if (paths) {
            for (const [pattern, targets] of Object.entries(paths)) {
                if (!Array.isArray(targets) || targets.length === 0) continue;
                const starIdx = pattern.indexOf('*');
                if (starIdx === -1) {
                    exactPaths.set(pattern, targets);
                } else {
                    wildcardPaths.push({
                        prefix: pattern.slice(0, starIdx),
                        suffix: pattern.slice(starIdx + 1),
                        targets
                    });
                }
            }
            // TypeScript prefers the wildcard pattern with the longest matching prefix
            wildcardPaths.sort((a, b) => b.prefix.length - a.prefix.length);
        }

        return {
            baseUrl,
            pathsBaseDir: baseUrl || tsconfigDir,
            exactPaths,
            wildcardPaths
        };
    } catch {
        return null;
    }
}

/**
 * Resolves a project-relative candidate path (handling extensions, .js->.ts, index files, and disk fallback).
 */
function resolveCandidatePath(
    targetBase: string,
    projectPath: string,
    fileSet: Set<string>,
    allowDiskFallback: boolean = true
): string | null {
    // 1. Direct match in known files
    if (fileSet.has(targetBase)) {
        return targetBase;
    }

    // 2. If specifier has JS/declaration extension, try TS alternatives
    if (targetBase.endsWith('.d.ts')) {
        const tsVariant = targetBase.replace(/\.d\.ts$/, '.ts');
        if (fileSet.has(tsVariant)) return tsVariant;
        const tsxVariant = targetBase.replace(/\.d\.ts$/, '.tsx');
        if (fileSet.has(tsxVariant)) return tsxVariant;
    }
    if (/\.(js|mjs|cjs)$/.test(targetBase)) {
        const tsVariant = targetBase.replace(/\.(js|mjs|cjs)$/, '.ts');
        if (fileSet.has(tsVariant)) return tsVariant;
        const tsxVariant = targetBase.replace(/\.(js|mjs|cjs)$/, '.tsx');
        if (fileSet.has(tsxVariant)) return tsxVariant;
    }
    if (targetBase.endsWith('.jsx')) {
        const tsxVariant = targetBase.replace(/\.jsx$/, '.tsx');
        if (fileSet.has(tsxVariant)) return tsxVariant;
    }

    // 3. Try appending known script extensions
    for (const ext of SCRIPT_EXTENSIONS) {
        const withExt = targetBase + ext;
        if (fileSet.has(withExt)) {
            return withExt;
        }
    }

    // 4. Try directory index resolution
    for (const ext of SCRIPT_EXTENSIONS) {
        const indexFile = normalizePath(path.join(targetBase, `index${ext}`));
        if (fileSet.has(indexFile)) {
            return indexFile;
        }
    }

    if (!allowDiskFallback) {
        return null;
    }

    // 5. Fallback: check on disk if file exists in project directory
    const candidates = [
        targetBase,
        ...(targetBase.endsWith('.js')
            ? [targetBase.replace(/\.js$/, '.ts'), targetBase.replace(/\.js$/, '.tsx')]
            : []),
        ...SCRIPT_EXTENSIONS.map(ext => targetBase + ext),
        ...SCRIPT_EXTENSIONS.map(ext => normalizePath(path.join(targetBase, `index${ext}`)))
    ];

    for (const cand of candidates) {
        const absolutePath = path.resolve(projectPath, cand);
        if (existsSync(absolutePath)) {
            try {
                if (!statSync(absolutePath).isFile()) continue;
            } catch {
                continue;
            }
            const rel = normalizePath(path.relative(projectPath, absolutePath));
            fileSet.add(rel);
            return rel;
        }
    }

    return null;
}

/**
 * Resolves a module specifier to a project-relative file path (supporting relative, tsconfig paths, and baseUrl).
 */
function resolveImportPath(
    importingFile: string,
    specifier: string,
    projectPath: string,
    fileSet: Set<string>,
    tsConfig: TsConfigResolution | null
): string | null {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
        const importingDir = path.dirname(importingFile);
        const targetBase = specifier.startsWith('/')
            ? normalizePath(specifier)
            : normalizePath(path.join(importingDir, specifier));
        return resolveCandidatePath(targetBase, projectPath, fileSet);
    }

    if (!tsConfig) {
        return null;
    }

    const tryTargets = (targets: string[], wildcardMatch?: string): string | null => {
        for (const target of targets) {
            const substituted = wildcardMatch !== undefined ? target.replace('*', wildcardMatch) : target;
            const resolvedAbs = path.resolve(tsConfig.pathsBaseDir, substituted);
            const rel = normalizePath(path.relative(projectPath, resolvedAbs));
            const match = resolveCandidatePath(rel, projectPath, fileSet);
            if (match) return match;
        }
        return null;
    };

    // 1. Exact tsconfig paths match
    const exactTargets = tsConfig.exactPaths.get(specifier);
    if (exactTargets) {
        const match = tryTargets(exactTargets);
        if (match) return match;
    }

    // 2. Wildcard tsconfig paths match (sorted by longest prefix)
    for (const entry of tsConfig.wildcardPaths) {
        if (
            specifier.startsWith(entry.prefix) &&
            specifier.endsWith(entry.suffix) &&
            specifier.length >= entry.prefix.length + entry.suffix.length
        ) {
            const matched = specifier.slice(entry.prefix.length, specifier.length - entry.suffix.length);
            const match = tryTargets(entry.targets, matched);
            if (match) return match;
        }
    }

    // 3. tsconfig baseUrl resolution
    if (tsConfig.baseUrl) {
        const resolvedAbs = path.resolve(tsConfig.baseUrl, specifier);
        const rel = normalizePath(path.relative(projectPath, resolvedAbs));
        const match = resolveCandidatePath(rel, projectPath, fileSet);
        if (match) return match;
    }

    return null;
}

/**
 * Converts a simple glob pattern (supporting *, **, ?) to a RegExp.
 */
function globToRegExp(pattern: string): RegExp {
    const normalized = normalizePath(pattern);
    let regex = '^';
    for (let i = 0; i < normalized.length; i++) {
        const ch = normalized[i];
        if (ch === '*') {
            if (normalized[i + 1] === '*') {
                if (normalized[i + 2] === '/') {
                    regex += '(?:.*/)?';
                    i += 2;
                } else {
                    regex += '.*';
                    i += 1;
                }
            } else {
                regex += '[^/]*';
            }
        } else if (ch === '?') {
            regex += '[^/]';
        } else if (/[.+^${}()|[\]\\]/.test(ch)) {
            regex += '\\' + ch;
        } else {
            regex += ch;
        }
    }
    regex += '$';
    return new RegExp(regex);
}

/**
 * Recursively extracts string target paths from package.json `exports` field.
 */
function collectExportTargets(value: unknown, out: string[]): void {
    if (typeof value === 'string') {
        out.push(value);
    } else if (Array.isArray(value)) {
        for (const item of value) {
            collectExportTargets(item, out);
        }
    } else if (value && typeof value === 'object') {
        for (const val of Object.values(value as Record<string, unknown>)) {
            collectExportTargets(val, out);
        }
    }
}

/**
 * Maps a package.json entry target (e.g. dist/index.js, dist/src/index.js, src/cli.ts) to a matching source file.
 */
function resolvePackageEntryToSource(
    rawTarget: string,
    projectPath: string,
    fileSet: Set<string>,
    isMainField: boolean = false
): string | null {
    const normalized = normalizePath(rawTarget);
    if (!normalized) return null;

    // 1. Direct match (e.g. src/index.ts or index.js)
    const direct = resolveCandidatePath(normalized, projectPath, fileSet, false);
    if (direct) return direct;

    // 2. Strip build output directory prefix (dist/, build/, out/, lib/) and try root or src/
    for (const prefix of BUILD_DIR_PREFIXES) {
        if (normalized.startsWith(prefix)) {
            const stripped = normalized.slice(prefix.length);
            const fromStripped = resolveCandidatePath(stripped, projectPath, fileSet, false);
            if (fromStripped) return fromStripped;

            const fromSrc = resolveCandidatePath(`src/${stripped}`, projectPath, fileSet, false);
            if (fromSrc) return fromSrc;

            // Fallback when main points to dist/.../index.js -> src/index.ts or index.ts
            if (isMainField && /(^|\/)index\.(js|mjs|cjs)$/.test(stripped)) {
                const srcIndex = resolveCandidatePath('src/index', projectPath, fileSet, false);
                if (srcIndex) return srcIndex;
                const rootIndex = resolveCandidatePath('index', projectPath, fileSet, false);
                if (rootIndex) return rootIndex;
            }
        }
    }

    return null;
}

/**
 * Detects project entry points from package.json and user-provided entryPoints options.
 */
async function detectEntryPoints(
    projectPath: string,
    normalizedFiles: string[],
    fileSet: Set<string>,
    configuredEntryPoints?: string[]
): Promise<Set<string>> {
    const entryPoints = new Set<string>();

    // 1. Auto-detect from package.json
    const pkgPath = path.resolve(projectPath, 'package.json');
    if (existsSync(pkgPath)) {
        try {
            const raw = await fs.readFile(pkgPath, 'utf8');
            const pkg = JSON.parse(raw) as Record<string, unknown>;

            const candidates: Array<{ target: string; isMain: boolean }> = [];
            if (typeof pkg.main === 'string') {
                candidates.push({ target: pkg.main, isMain: true });
            }
            if (typeof pkg.module === 'string') {
                candidates.push({ target: pkg.module, isMain: true });
            }
            if (typeof pkg.bin === 'string') {
                candidates.push({ target: pkg.bin, isMain: false });
            } else if (pkg.bin && typeof pkg.bin === 'object') {
                for (const val of Object.values(pkg.bin as Record<string, unknown>)) {
                    if (typeof val === 'string') {
                        candidates.push({ target: val, isMain: false });
                    }
                }
            }
            if (pkg.exports !== undefined) {
                const exportTargets: string[] = [];
                collectExportTargets(pkg.exports, exportTargets);
                for (const target of exportTargets) {
                    candidates.push({ target, isMain: false });
                }
            }

            for (const { target, isMain } of candidates) {
                const resolved = resolvePackageEntryToSource(target, projectPath, fileSet, isMain);
                if (resolved) {
                    entryPoints.add(resolved);
                }
            }
        } catch {
            // Ignore malformed package.json
        }
    }

    // 2. Match user-configured entryPoints (relative paths or simple globs)
    if (configuredEntryPoints && configuredEntryPoints.length > 0) {
        for (const pattern of configuredEntryPoints) {
            const normalizedPattern = normalizePath(pattern);
            if (!normalizedPattern) continue;

            if (/[*?]/.test(normalizedPattern)) {
                const regex = globToRegExp(normalizedPattern);
                for (const file of normalizedFiles) {
                    if (regex.test(file)) {
                        entryPoints.add(file);
                    }
                }
            } else {
                const resolved = resolveCandidatePath(normalizedPattern, projectPath, fileSet, false);
                if (resolved) {
                    entryPoints.add(resolved);
                }
            }
        }
    }

    return entryPoints;
}

/**
 * Checks whether an ImportDeclaration is purely type-only (erased at runtime).
 */
function isTypeOnlyImportDeclaration(node: ts.ImportDeclaration): boolean {
    if (!node.importClause) {
        // Side-effect import: import './polyfill'
        return false;
    }
    if (node.importClause.isTypeOnly) {
        return true;
    }
    if (node.importClause.name) {
        // Has a runtime default import
        return false;
    }
    if (!node.importClause.namedBindings) {
        return false;
    }
    if (ts.isNamespaceImport(node.importClause.namedBindings)) {
        return false;
    }
    if (ts.isNamedImports(node.importClause.namedBindings)) {
        const elements = node.importClause.namedBindings.elements;
        return elements.length > 0 && elements.every(elem => elem.isTypeOnly);
    }
    return false;
}

/**
 * Checks whether an ExportDeclaration (with moduleSpecifier) is purely type-only.
 */
function isTypeOnlyExportDeclaration(node: ts.ExportDeclaration): boolean {
    if (node.isTypeOnly) {
        return true;
    }
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        const elements = node.exportClause.elements;
        return elements.length > 0 && elements.every(elem => elem.isTypeOnly);
    }
    return false;
}

/**
 * Checks if a TypeScript AST node has a given modifier keyword.
 */
function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    const modifiers = ts.canHaveModifiers?.(node) ? ts.getModifiers(node) : (node as any).modifiers;
    return !!modifiers?.some((m: any) => m.kind === kind);
}

/**
 * Extracts binding identifier names from an identifier or pattern.
 */
function extractBindingNames(nameNode: ts.BindingName): Array<{ name: string; node: ts.Node }> {
    if (ts.isIdentifier(nameNode)) {
        return [{ name: nameNode.text, node: nameNode }];
    }
    const results: Array<{ name: string; node: ts.Node }> = [];
    if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
        for (const elem of nameNode.elements) {
            if (ts.isBindingElement(elem)) {
                results.push(...extractBindingNames(elem.name));
            }
        }
    }
    return results;
}

const MAX_CYCLES = 500;
const MAX_CYCLE_LENGTH = 50;

/**
 * Detects all elementary (simple) cycles in a directed graph with Johnson's algorithm
 * (D. B. Johnson, "Finding all the elementary circuits of a directed graph", 1975), which runs in
 * O((V + E)(C + 1)) for C cycles. A plain DFS from every node is exponential in the number of
 * paths, which on real import graphs with few cycles but many paths can take tens of minutes.
 *
 * Each cycle is reported once, rotated to start at its smallest vertex and closed (the first
 * vertex repeated). At most MAX_CYCLES cycles of at most MAX_CYCLE_LENGTH vertices are returned,
 * sorted by first vertex, then length, then formatted text.
 */
export function detectCycles(
    graph: Record<string, string[]>,
    runtimeEdges: Set<string>
): CircularDependencyCycle[] {
    const nodes = Object.keys(graph).sort();
    const index = new Map(nodes.map((name, i) => [name, i]));
    // Adjacency by vertex index, de-duplicated, ignoring edges to files outside the graph.
    const adjacency: number[][] = nodes.map(name => {
        const targets = new Set<number>();
        for (const neighbor of graph[name] || []) {
            const target = index.get(neighbor);
            if (target !== undefined) targets.add(target);
        }
        return [...targets];
    });

    const found: number[][] = [];

    // Tarjan: the strongly connected component containing `start` within the subgraph induced
    // by vertices >= start, or undefined if `start` is in no cycle there.
    function componentOf(start: number): Set<number> | undefined {
        let counter = 0;
        const order: number[] = new Array(nodes.length).fill(-1);
        const low: number[] = new Array(nodes.length).fill(-1);
        const onStack = new Set<number>();
        const stack: number[] = [];
        let result: Set<number> | undefined;
        function strongConnect(v: number): void {
            order[v] = counter;
            low[v] = counter;
            counter++;
            stack.push(v);
            onStack.add(v);
            for (const w of adjacency[v]) {
                if (w < start) continue;
                if (order[w] === -1) {
                    strongConnect(w);
                    low[v] = Math.min(low[v], low[w]);
                } else if (onStack.has(w)) {
                    low[v] = Math.min(low[v], order[w]);
                }
            }
            if (low[v] === order[v]) {
                const component = new Set<number>();
                for (let w = stack.pop(); w !== undefined; w = stack.pop()) {
                    onStack.delete(w);
                    component.add(w);
                    if (w === v) break;
                }
                if (component.has(start)) result = component;
            }
        }
        strongConnect(start);
        return result;
    }

    for (let start = 0; start < nodes.length && found.length < MAX_CYCLES; start++) {
        const component = componentOf(start);
        if (!component) continue;
        if (component.size === 1 && !adjacency[start].includes(start)) continue;

        const blocked = new Set<number>();
        const blockedBy = new Map<number, Set<number>>();
        const path: number[] = [];

        const unblock = (u: number): void => {
            blocked.delete(u);
            const waiting = blockedBy.get(u);
            if (!waiting) return;
            blockedBy.delete(u);
            for (const w of waiting) if (blocked.has(w)) unblock(w);
        };

        const circuit = (v: number): boolean => {
            let closed = false;
            path.push(v);
            blocked.add(v);
            for (const w of adjacency[v]) {
                if (found.length >= MAX_CYCLES) break;
                if (!component.has(w)) continue;
                if (w === start) {
                    if (path.length <= MAX_CYCLE_LENGTH) found.push([...path]);
                    closed = true;
                } else if (!blocked.has(w) && path.length < MAX_CYCLE_LENGTH) {
                    if (circuit(w)) closed = true;
                }
            }
            if (closed) {
                unblock(v);
            } else {
                for (const w of adjacency[v]) {
                    if (!component.has(w)) continue;
                    let waiting = blockedBy.get(w);
                    if (!waiting) blockedBy.set(w, (waiting = new Set()));
                    waiting.add(v);
                }
            }
            path.pop();
            return closed;
        };

        circuit(start);
    }

    // Johnson's algorithm starts each cycle at its smallest vertex (vertices are visited in
    // sorted order), so no rotation is needed.
    const cycles: CircularDependencyCycle[] = found.map(vertices => {
        const cycle = [...vertices.map(i => nodes[i]), nodes[vertices[0]]];
        let isTypeOnly = false;
        for (let i = 0; i < cycle.length - 1; i++) {
            if (!runtimeEdges.has(`${cycle[i]}\0${cycle[i + 1]}`)) {
                isTypeOnly = true;
                break;
            }
        }
        return {
            cycle,
            formattedCycle: cycle.join(' -> '),
            length: vertices.length,
            isTypeOnly
        };
    });

    cycles.sort((a, b) => {
        if (a.cycle[0] !== b.cycle[0]) {
            return a.cycle[0].localeCompare(b.cycle[0]);
        }
        return a.cycle.length - b.cycle.length || a.cycle.join(' -> ').localeCompare(b.cycle.join(' -> '));
    });

    return cycles;
}

/**
 * Analyzes dependencies and exports across project files.
 */
export async function analyzeDependencies(
    projectPath: string = '.',
    fileList: string[] = [],
    options?: DependencyAnalysisOptions
): Promise<DependencyAnalysisResult> {
    const normalizedFiles: string[] = [];
    const fileSet = new Set<string>();

    for (const rawFile of fileList) {
        const relative = path.isAbsolute(rawFile)
            ? path.relative(projectPath, rawFile)
            : rawFile;
        const normalized = normalizePath(relative);
        const ext = path.extname(normalized).toLowerCase();
        if (SCRIPT_EXT_SET.has(ext)) {
            normalizedFiles.push(normalized);
            fileSet.add(normalized);
        }
    }

    const tsConfig = loadTsConfigResolution(projectPath);
    const entryPointSet = await detectEntryPoints(
        projectPath,
        normalizedFiles,
        fileSet,
        options?.entryPoints
    );

    const dependencyGraph: Record<string, string[]> = {};
    for (const file of normalizedFiles) {
        dependencyGraph[file] = [];
    }
    const runtimeEdges = new Set<string>();

    // Track exports: file -> array of { exportName, line }
    const exportsByFile = new Map<string, Array<{ exportName: string; line: number }>>();
    // Track imports: targetFile -> Set of imported names (e.g. 'foo', 'default', '*')
    const importedSymbols = new Map<string, Set<string>>();

    for (const file of normalizedFiles) {
        exportsByFile.set(file, []);
        importedSymbols.set(file, new Set<string>());
    }

    function recordExport(file: string, exportName: string, line: number) {
        const existing = exportsByFile.get(file);
        if (existing && !existing.some(e => e.exportName === exportName)) {
            existing.push({ exportName, line });
        }
    }

    function recordImportedSymbol(targetFile: string, symbol: string) {
        if (!importedSymbols.has(targetFile)) {
            importedSymbols.set(targetFile, new Set<string>());
        }
        importedSymbols.get(targetFile)!.add(symbol);
    }

    function addDependencyEdge(importer: string, imported: string, isTypeOnly: boolean = false) {
        if (!dependencyGraph[importer]) {
            dependencyGraph[importer] = [];
        }
        if (!dependencyGraph[importer].includes(imported)) {
            dependencyGraph[importer].push(imported);
        }
        if (!isTypeOnly) {
            runtimeEdges.add(`${importer}\0${imported}`);
        }
    }

    for (const file of normalizedFiles) {
        const absolutePath = path.resolve(projectPath, file);
        let content: string;
        try {
            content = await fs.readFile(absolutePath, 'utf8');
        } catch {
            continue;
        }

        const sourceFile = ts.createSourceFile(
            absolutePath,
            content,
            ts.ScriptTarget.Latest,
            true
        );

        function getLineNumber(node: ts.Node): number {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            return line + 1;
        }

        function visit(node: ts.Node): void {
            // 1. ImportDeclaration: import ... from '...'
            if (ts.isImportDeclaration(node)) {
                if (ts.isStringLiteral(node.moduleSpecifier)) {
                    const specifier = node.moduleSpecifier.text;
                    const target = resolveImportPath(file, specifier, projectPath, fileSet, tsConfig);
                    if (target) {
                        addDependencyEdge(file, target, isTypeOnlyImportDeclaration(node));

                        if (target !== file) {
                            if (node.importClause) {
                                // Default import: import foo from './bar'
                                if (node.importClause.name) {
                                    recordImportedSymbol(target, 'default');
                                }
                                // Named / namespace bindings
                                if (node.importClause.namedBindings) {
                                    if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                                        // import * as ns from './bar'
                                        recordImportedSymbol(target, '*');
                                    } else if (ts.isNamedImports(node.importClause.namedBindings)) {
                                        // import { a, b as c } from './bar'
                                        for (const elem of node.importClause.namedBindings.elements) {
                                            const originalName = elem.propertyName ? elem.propertyName.text : elem.name.text;
                                            recordImportedSymbol(target, originalName);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 2. ExportDeclaration: export { ... } from '...' or export { ... }
            else if (ts.isExportDeclaration(node)) {
                if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                    const specifier = node.moduleSpecifier.text;
                    const target = resolveImportPath(file, specifier, projectPath, fileSet, tsConfig);
                    if (target) {
                        addDependencyEdge(file, target, isTypeOnlyExportDeclaration(node));

                        if (!node.exportClause) {
                            // export * from './bar'
                            if (target !== file) {
                                recordImportedSymbol(target, '*');
                            }
                        } else if (ts.isNamespaceExport(node.exportClause)) {
                            // export * as ns from './bar'
                            if (target !== file) {
                                recordImportedSymbol(target, '*');
                            }
                            recordExport(file, node.exportClause.name.text, getLineNumber(node.exportClause));
                        } else if (ts.isNamedExports(node.exportClause)) {
                            // export { a, b as c } from './bar'
                            for (const elem of node.exportClause.elements) {
                                const originalName = elem.propertyName ? elem.propertyName.text : elem.name.text;
                                if (target !== file) {
                                    recordImportedSymbol(target, originalName);
                                }
                                recordExport(file, elem.name.text, getLineNumber(elem));
                            }
                        }
                    }
                } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
                    // Local export: export { a, b as c }
                    for (const elem of node.exportClause.elements) {
                        recordExport(file, elem.name.text, getLineNumber(elem));
                    }
                }
            }

            // 3. Dynamic import() or require()
            else if (ts.isCallExpression(node)) {
                const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
                const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
                if ((isDynamicImport || isRequire) && node.arguments.length > 0) {
                    const arg = node.arguments[0];
                    if (ts.isStringLiteral(arg)) {
                        const target = resolveImportPath(file, arg.text, projectPath, fileSet, tsConfig);
                        if (target) {
                            addDependencyEdge(file, target, false);
                            if (target !== file) {
                                recordImportedSymbol(target, '*');
                            }
                        }
                    }
                }
            }

            // 4. Export assignment: export default expr;
            else if (ts.isExportAssignment(node)) {
                recordExport(file, 'default', getLineNumber(node));
            }

            // 5. Declarations with export modifier
            else if (hasModifier(node, ts.SyntaxKind.ExportKeyword)) {
                if (hasModifier(node, ts.SyntaxKind.DefaultKeyword)) {
                    recordExport(file, 'default', getLineNumber(node));
                } else {
                    if (ts.isFunctionDeclaration(node) && node.name) {
                        recordExport(file, node.name.text, getLineNumber(node.name));
                    } else if (ts.isClassDeclaration(node) && node.name) {
                        recordExport(file, node.name.text, getLineNumber(node.name));
                    } else if (ts.isInterfaceDeclaration(node)) {
                        recordExport(file, node.name.text, getLineNumber(node.name));
                    } else if (ts.isTypeAliasDeclaration(node)) {
                        recordExport(file, node.name.text, getLineNumber(node.name));
                    } else if (ts.isEnumDeclaration(node)) {
                        recordExport(file, node.name.text, getLineNumber(node.name));
                    } else if (ts.isVariableStatement(node)) {
                        for (const decl of node.declarationList.declarations) {
                            const bindings = extractBindingNames(decl.name);
                            for (const b of bindings) {
                                recordExport(file, b.name, getLineNumber(b.node));
                            }
                        }
                    }
                }
            }

            ts.forEachChild(node, visit);
        }

        visit(sourceFile);
    }

    // Detect circular dependencies
    const allCycles = detectCycles(dependencyGraph, runtimeEdges);
    const circularDependencies = options?.ignoreTypeCycles
        ? allCycles.filter(c => !c.isTypeOnly)
        : allCycles;

    // Identify unused exports across project files (excluding detected/configured entry points)
    const unusedExports: UnusedExport[] = [];
    for (const [file, exportsList] of exportsByFile.entries()) {
        if (entryPointSet.has(file)) {
            continue;
        }
        const imported = importedSymbols.get(file) || new Set<string>();
        if (imported.has('*')) {
            // Wildcard import/re-export used, treat all as referenced
            continue;
        }

        for (const exp of exportsList) {
            if (!imported.has(exp.exportName)) {
                unusedExports.push({
                    file,
                    exportName: exp.exportName,
                    line: exp.line,
                    name: exp.exportName
                });
            }
        }
    }

    // Sort unused exports deterministically
    unusedExports.sort((a, b) => {
        if (a.file !== b.file) return a.file.localeCompare(b.file);
        if (a.line !== b.line) return a.line - b.line;
        return a.exportName.localeCompare(b.exportName);
    });

    return {
        circularDependencies,
        unusedExports,
        dependencyGraph,
        totalFilesAnalyzed: normalizedFiles.length,
        circularDependencyCount: circularDependencies.length,
        unusedExportCount: unusedExports.length,
        entryPoints: Array.from(entryPointSet).sort()
    };
}
