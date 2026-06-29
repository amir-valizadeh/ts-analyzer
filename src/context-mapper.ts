// src/context-mapper.ts
import * as ts from 'typescript';
import fs from 'fs/promises';
import path from 'path';

export interface ExportInfo {
    name: string;
    kind: string; // 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum' | 'other'
    signature: string;
    members?: string[];
}

export interface FileContext {
    filePath: string;
    exports: ExportInfo[];
}

function isExported(node: ts.Node): boolean {
    const modifiers = (node as any).modifiers;
    if (modifiers) {
        return modifiers.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword);
    }
    return false;
}

function isDefaultExport(node: ts.Node): boolean {
    const modifiers = (node as any).modifiers;
    if (modifiers) {
        return modifiers.some((m: any) => m.kind === ts.SyntaxKind.DefaultKeyword);
    }
    return false;
}

function getFunctionSignature(node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ConstructorDeclaration): string {
    const name = node.name ? node.name.getText() : (ts.isConstructorDeclaration(node) ? 'constructor' : 'anonymous');
    const params = node.parameters.map(p => {
        const pName = p.name.getText();
        const pType = p.type ? `: ${p.type.getText()}` : '';
        const isOptional = p.questionToken ? '?' : '';
        return `${pName}${isOptional}${pType}`;
    }).join(', ');
    const returnType = node.type ? `: ${node.type.getText()}` : '';
    const prefix = ts.isFunctionDeclaration(node) ? 'function ' : '';
    return `${prefix}${name}(${params})${returnType}`;
}

function getClassSignature(node: ts.ClassDeclaration): { signature: string; members: string[] } {
    const name = node.name ? node.name.getText() : 'AnonymousClass';
    const heritage = node.heritageClauses ? ' ' + node.heritageClauses.map(h => h.getText()).join(' ') : '';
    const members: string[] = [];
    
    node.members.forEach(member => {
        const modifiers = (member as any).modifiers;
        const isPrivate = modifiers?.some((m: any) => 
            m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword
        );
        if (isPrivate) return;

        if (ts.isMethodDeclaration(member)) {
            members.push(getFunctionSignature(member));
        } else if (ts.isPropertyDeclaration(member)) {
            const mName = member.name.getText();
            const mType = member.type ? `: ${member.type.getText()}` : '';
            members.push(`prop ${mName}${mType}`);
        } else if (ts.isConstructorDeclaration(member)) {
            members.push(getFunctionSignature(member));
        }
    });

    return {
        signature: `class ${name}${heritage}`,
        members
    };
}

function getInterfaceSignature(node: ts.InterfaceDeclaration): { signature: string; members: string[] } {
    const name = node.name.getText();
    const heritage = node.heritageClauses ? ' ' + node.heritageClauses.map(h => h.getText()).join(' ') : '';
    const members: string[] = [];
    
    node.members.forEach(member => {
        if (ts.isPropertySignature(member)) {
            const mName = member.name.getText();
            const mType = member.type ? `: ${member.type.getText()}` : '';
            const isOptional = member.questionToken ? '?' : '';
            members.push(`${mName}${isOptional}${mType}`);
        } else if (ts.isMethodSignature(member)) {
            const mName = member.name.getText();
            const params = member.parameters.map(p => {
                const pName = p.name.getText();
                const pType = p.type ? `: ${p.type.getText()}` : '';
                return `${pName}${pType}`;
            }).join(', ');
            const returnType = member.type ? `: ${member.type.getText()}` : '';
            members.push(`${mName}(${params})${returnType}`);
        }
    });

    return {
        signature: `interface ${name}${heritage}`,
        members
    };
}

function getTypeAliasSignature(node: ts.TypeAliasDeclaration): string {
    const name = node.name.getText();
    let typeText = node.type.getText().replace(/\s+/g, ' ');
    if (typeText.length > 80) {
        typeText = typeText.substring(0, 77) + '...';
    }
    return `type ${name} = ${typeText}`;
}

function getEnumSignature(node: ts.EnumDeclaration): string {
    const name = node.name.getText();
    const members = node.members.map(m => m.name.getText()).join(', ');
    return `enum ${name} { ${members} }`;
}

function getVariableSignatures(node: ts.VariableStatement): { name: string; signature: string }[] {
    const isConst = node.declarationList.flags & ts.NodeFlags.Const;
    const isLet = node.declarationList.flags & ts.NodeFlags.Let;
    const kind = isConst ? 'const' : (isLet ? 'let' : 'var');
    
    return node.declarationList.declarations.map(decl => {
        const name = decl.name.getText();
        const typeText = decl.type ? `: ${decl.type.getText()}` : '';
        return {
            name,
            signature: `${kind} ${name}${typeText}`
        };
    });
}

export async function analyzeFileContext(filePath: string): Promise<FileContext> {
    const exportsList: ExportInfo[] = [];
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const sourceFile = ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true
        );

        const localDecls = new Map<string, ExportInfo>();
        const exportedNames = new Set<string>();
        let defaultExportName: string | null = null;

        // Traverse statements to find declarations and exports
        sourceFile.statements.forEach(node => {
            const inlineExport = isExported(node);
            const isDefault = isDefaultExport(node);

            if (ts.isFunctionDeclaration(node)) {
                const name = node.name ? node.name.getText() : '';
                const signature = getFunctionSignature(node);
                const info: ExportInfo = { name, kind: 'function', signature };
                
                if (name) localDecls.set(name, info);
                if (inlineExport && name) {
                    exportedNames.add(name);
                }
                if (isDefault) {
                    defaultExportName = name || 'default';
                    exportsList.push({ ...info, name: 'default' });
                }
            } 
            else if (ts.isClassDeclaration(node)) {
                const name = node.name ? node.name.getText() : '';
                const { signature, members } = getClassSignature(node);
                const info: ExportInfo = { name, kind: 'class', signature, members };
                
                if (name) localDecls.set(name, info);
                if (inlineExport && name) {
                    exportedNames.add(name);
                }
                if (isDefault) {
                    defaultExportName = name || 'default';
                    exportsList.push({ ...info, name: 'default' });
                }
            } 
            else if (ts.isInterfaceDeclaration(node)) {
                const name = node.name.getText();
                const { signature, members } = getInterfaceSignature(node);
                const info: ExportInfo = { name, kind: 'interface', signature, members };
                
                localDecls.set(name, info);
                if (inlineExport) {
                    exportedNames.add(name);
                }
            } 
            else if (ts.isTypeAliasDeclaration(node)) {
                const name = node.name.getText();
                const signature = getTypeAliasSignature(node);
                const info: ExportInfo = { name, kind: 'type', signature };
                
                localDecls.set(name, info);
                if (inlineExport) {
                    exportedNames.add(name);
                }
            } 
            else if (ts.isEnumDeclaration(node)) {
                const name = node.name.getText();
                const signature = getEnumSignature(node);
                const info: ExportInfo = { name, kind: 'enum', signature };
                
                localDecls.set(name, info);
                if (inlineExport) {
                    exportedNames.add(name);
                }
            } 
            else if (ts.isVariableStatement(node)) {
                const vars = getVariableSignatures(node);
                vars.forEach(v => {
                    const info: ExportInfo = { name: v.name, kind: 'variable', signature: v.signature };
                    localDecls.set(v.name, info);
                    if (inlineExport) {
                        exportedNames.add(v.name);
                    }
                });
            } 
            else if (ts.isExportDeclaration(node)) {
                // e.g., export { foo, bar }; or export { foo as baz } from './module';
                if (node.exportClause && ts.isNamedExports(node.exportClause)) {
                    node.exportClause.elements.forEach(element => {
                        const localName = element.propertyName ? element.propertyName.getText() : element.name.getText();
                        const exportedName = element.name.getText();
                        exportedNames.add(exportedName);
                        
                        // If we have a local declaration, map it to the exported name
                        if (localDecls.has(localName)) {
                            const localInfo = localDecls.get(localName)!;
                            localDecls.set(exportedName, {
                                ...localInfo,
                                name: exportedName
                            });
                        } else {
                            // Placeholder if declared elsewhere
                            localDecls.set(exportedName, {
                                name: exportedName,
                                kind: 'other',
                                signature: `export ${exportedName}`
                            });
                        }
                    });
                }
            }
            else if (ts.isExportAssignment(node)) {
                // e.g. export default foo; or export = foo;
                const expr = node.expression.getText();
                defaultExportName = expr;
            }
        });

        // Add all explicitly named exports
        exportedNames.forEach(name => {
            if (name !== defaultExportName && localDecls.has(name)) {
                exportsList.push(localDecls.get(name)!);
            }
        });

        // If there's a default export mapping to a local declaration
        if (defaultExportName && defaultExportName !== 'default' && localDecls.has(defaultExportName)) {
            const info = localDecls.get(defaultExportName)!;
            exportsList.push({
                ...info,
                name: `default (${info.name})`
            });
        } else if (defaultExportName && defaultExportName !== 'default' && exportsList.every(e => e.name !== 'default')) {
            exportsList.push({
                name: 'default',
                kind: 'other',
                signature: `export default ${defaultExportName}`
            });
        }

    } catch (error) {
        console.error(`Error analyzing file context for ${filePath}:`, error);
    }

    return {
        filePath,
        exports: exportsList
    };
}

export async function generateContextOutline(projectPath: string, filePaths: string[]): Promise<string> {
    const contexts: FileContext[] = [];

    // Filter to only TypeScript and JavaScript files
    const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx'];
    const filteredFiles = filePaths.filter(file => relevantExtensions.includes(path.extname(file)));

    for (const file of filteredFiles) {
        const fullPath = path.join(projectPath, file);
        const fileCtx = await analyzeFileContext(fullPath);
        // Store relative path for readability
        fileCtx.filePath = file;
        contexts.push(fileCtx);
    }

    // Build the outline string
    let output = `# Project Context Map (Generated by ts-analyzer)\n\n`;

    // 1. Directory Tree Structure
    output += `## Directory Structure\n\n`;
    const treeLines = buildDirectoryTree(filteredFiles);
    output += treeLines.map(line => `    ${line}`).join('\n') + '\n\n';

    // 2. Outlines of exports per file
    output += `## Export Outlines\n\n`;
    
    contexts.forEach(ctx => {
        output += `### [${ctx.filePath}](file://${path.resolve(projectPath, ctx.filePath)})\n`;
        if (ctx.exports.length === 0) {
            output += `*(No public exports)*\n\n`;
            return;
        }

        ctx.exports.forEach(exp => {
            output += `- **${exp.name}** (\`${exp.kind}\`)\n`;
            output += `  \`\`\`typescript\n  ${exp.signature}\n  \`\`\`\n`;
            if (exp.members && exp.members.length > 0) {
                output += `  *Members:*\n`;
                exp.members.forEach(member => {
                    output += `  - \`${member}\`\n`;
                });
            }
        });
        output += `\n`;
    });

    return output;
}

function buildDirectoryTree(files: string[]): string[] {
    const tree: any = {};

    // Build nested object structure
    files.forEach(file => {
        const parts = file.split(path.sep);
        let current = tree;
        parts.forEach((part, index) => {
            if (!current[part]) {
                current[part] = index === parts.length - 1 ? null : {};
            }
            current = current[part];
        });
    });

    const lines: string[] = [];

    function traverseTree(obj: any, prefix = ''): void {
        if (!obj) return;
        const keys = Object.keys(obj).sort((a, b) => {
            // Put directories first, then files
            const aIsDir = obj[a] !== null;
            const bIsDir = obj[b] !== null;
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b);
        });

        keys.forEach((key, index) => {
            const isLast = index === keys.length - 1;
            const marker = isLast ? '└── ' : '├── ';
            const isDir = obj[key] !== null;
            
            lines.push(`${prefix}${marker}${key}${isDir ? '/' : ''}`);
            
            if (isDir) {
                const nextPrefix = prefix + (isLast ? '    ' : '│   ');
                traverseTree(obj[key], nextPrefix);
            }
        });
    }

    traverseTree(tree);
    return lines;
}
