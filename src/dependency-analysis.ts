import * as ts from 'typescript';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export interface CircularDependencyCycle {
    cycle: string[];
    formattedCycle?: string;
    length?: number;
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
}

const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const SCRIPT_EXT_SET = new Set(SCRIPT_EXTENSIONS);

/**
 * Normalizes file path to forward slashes and removes leading './'.
 */
function normalizePath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Resolves a module specifier to a project-relative file path.
 */
function resolveImportPath(
    importingFile: string,
    specifier: string,
    projectPath: string,
    fileSet: Set<string>
): string | null {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        // External dependency or bare package specifier
        return null;
    }

    const importingDir = path.dirname(importingFile);
    let targetBase: string;

    if (specifier.startsWith('/')) {
        targetBase = normalizePath(specifier);
    } else {
        targetBase = normalizePath(path.join(importingDir, specifier));
    }

    // 1. Direct match in known files
    if (fileSet.has(targetBase)) {
        return targetBase;
    }

    // 2. If specifier has .js or .jsx extension in TS ESM, try TS alternatives
    if (targetBase.endsWith('.js')) {
        const tsVariant = targetBase.replace(/\.js$/, '.ts');
        if (fileSet.has(tsVariant)) return tsVariant;
        const tsxVariant = targetBase.replace(/\.js$/, '.tsx');
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
            const rel = normalizePath(path.relative(projectPath, absolutePath));
            fileSet.add(rel);
            return rel;
        }
    }

    return null;
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

/**
 * Detects all simple cycles in a directed graph using DFS and deduplicates symmetric cycles.
 */
function detectCycles(graph: Record<string, string[]>): CircularDependencyCycle[] {
    const cycles: CircularDependencyCycle[] = [];
    const seenKeys = new Set<string>();
    const nodes = Object.keys(graph).sort();

    const currentPath: string[] = [];
    const visitedInPath = new Set<string>();

    function dfs(node: string, depth: number): void {
        if (depth > 50 || cycles.length >= 500) return;

        const neighbors = graph[node] || [];
        for (const neighbor of neighbors) {
            if (visitedInPath.has(neighbor)) {
                // Cycle detected
                const cycleStartIndex = currentPath.indexOf(neighbor);
                if (cycleStartIndex !== -1) {
                    const rawCycle = [...currentPath.slice(cycleStartIndex), neighbor];
                    const uniqueVertices = rawCycle.slice(0, -1);
                    if (uniqueVertices.length > 0) {
                        // Find minimum vertex to normalize rotation
                        let minIdx = 0;
                        for (let i = 1; i < uniqueVertices.length; i++) {
                            if (uniqueVertices[i] < uniqueVertices[minIdx]) {
                                minIdx = i;
                            }
                        }
                        const rotated = [
                            ...uniqueVertices.slice(minIdx),
                            ...uniqueVertices.slice(0, minIdx)
                        ];
                        const normalizedCycle = [...rotated, rotated[0]];
                        const key = normalizedCycle.join(' -> ');
                        if (!seenKeys.has(key)) {
                            seenKeys.add(key);
                            cycles.push({
                                cycle: normalizedCycle,
                                formattedCycle: key,
                                length: normalizedCycle.length - 1
                            });
                        }
                    }
                }
            } else {
                visitedInPath.add(neighbor);
                currentPath.push(neighbor);
                dfs(neighbor, depth + 1);
                currentPath.pop();
                visitedInPath.delete(neighbor);
            }
        }
    }

    for (const startNode of nodes) {
        visitedInPath.add(startNode);
        currentPath.push(startNode);
        dfs(startNode, 1);
        currentPath.pop();
        visitedInPath.delete(startNode);
    }

    // Sort cycles deterministically
    cycles.sort((a, b) => {
        if (a.cycle[0] !== b.cycle[0]) {
            return a.cycle[0].localeCompare(b.cycle[0]);
        }
        return (a.length || a.cycle.length) - (b.length || b.cycle.length);
    });

    return cycles;
}

/**
 * Analyzes dependencies and exports across project files.
 */
export async function analyzeDependencies(
    projectPath: string = '.',
    fileList: string[] = []
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

    const dependencyGraph: Record<string, string[]> = {};
    for (const file of normalizedFiles) {
        dependencyGraph[file] = [];
    }

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

    function addDependencyEdge(importer: string, imported: string) {
        if (!dependencyGraph[importer]) {
            dependencyGraph[importer] = [];
        }
        if (!dependencyGraph[importer].includes(imported)) {
            dependencyGraph[importer].push(imported);
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
                    const target = resolveImportPath(file, specifier, projectPath, fileSet);
                    if (target) {
                        addDependencyEdge(file, target);

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
                    const target = resolveImportPath(file, specifier, projectPath, fileSet);
                    if (target) {
                        addDependencyEdge(file, target);

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
                        const target = resolveImportPath(file, arg.text, projectPath, fileSet);
                        if (target) {
                            addDependencyEdge(file, target);
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
    const circularDependencies = detectCycles(dependencyGraph);

    // Identify unused exports across project files
    const unusedExports: UnusedExport[] = [];
    for (const [file, exportsList] of exportsByFile.entries()) {
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
        unusedExportCount: unusedExports.length
    };
}
