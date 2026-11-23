// src/typescript-safety.ts
import * as ts from 'typescript';
import fs from 'fs/promises';
import path from 'path';

export interface TypeScriptMetrics {
    totalTypeableNodes: number;
    typedNodes: number;
    typeCoverage: string;
    anyTypeCount: number;
    typeAssertions: number;
    nonNullAssertions: number;
    optionalProperties: number;
    genericsCount: number;
    typeSafetyScore: number;
    typeComplexity: string;
}

export interface FileSafetyHotspot {
    file: string;
    typeSafetyScore: number;
    typeCoverage: string;
    anyCount: number;
    typeAssertions: number;
    nonNullAssertions: number;
}

export interface TypeScriptSafetyMetrics {
    tsFileCount: number;
    tsPercentage: string;
    avgTypeCoverage: string;
    totalAnyCount: number;
    totalAssertions: number;
    totalNonNullAssertions: number;
    avgTypeSafetyScore: number;
    overallComplexity: string;
    worstFiles?: FileSafetyHotspot[];
}

/**
 * Reads tsconfig.json once for a directory using TypeScript's config reader (supports comments and trailing commas).
 */
export function getTsconfigScore(searchDir: string): number {
    const candidates = [
        path.resolve(searchDir, 'tsconfig.json'),
        path.resolve(searchDir, '..', 'tsconfig.json')
    ];

    for (const configPath of candidates) {
        if (ts.sys.fileExists(configPath)) {
            const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
            if (!error && config && typeof config === 'object') {
                let score = 0;
                const opts = config.compilerOptions;
                if (opts && typeof opts === 'object') {
                    if (opts.strict === true) score += 5;
                    if (opts.noImplicitAny === true) score += 3;
                    if (opts.strictNullChecks === true) score += 3;
                    if (opts.noImplicitReturns === true) score += 2;
                }
                return score;
            }
        }
    }

    return 5; // Default TypeScript compiler baseline when tsconfig.json is not found
}

/**
 * Realistic TypeScript safety analyzer that provides results comparable to real-world analysis tools
 */
export async function analyzeTypeScriptSafety(filePath: string, precomputedTsconfigScore?: number): Promise<TypeScriptMetrics> {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        
        // Create a source file
        const sourceFile = ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true
        );

        // Initialize metrics
        const metrics = {
            totalTypeableNodes: 0,
            typedNodes: 0,
            anyTypeCount: 0,
            typeAssertions: 0,
            nonNullAssertions: 0,
            optionalProperties: 0,
            genericsCount: 0,
            explicitlyTypedNodes: 0, // Track explicitly typed nodes separately
            implicitlyTypedNodes: 0  // Track implicitly typed nodes separately
        };

        // Function to visit each node and analyze types
        function visit(node: ts.Node, parent?: ts.Node) {
            // Check for declarations that should have types
            if (
                ts.isVariableDeclaration(node) ||
                ts.isParameter(node) ||
                ts.isPropertySignature(node) ||
                ts.isPropertyDeclaration(node) ||
                ts.isMethodDeclaration(node) ||
                ts.isFunctionDeclaration(node)
            ) {
                metrics.totalTypeableNodes++;

                // Check for explicitly typed nodes
                if (node.type) {
                    metrics.typedNodes++;
                    metrics.explicitlyTypedNodes++;

                    // Check for 'any' type
                    if (node.type.kind === ts.SyntaxKind.AnyKeyword) {
                        metrics.anyTypeCount++;
                    }
                } else {
                    // For variables without explicit type but with initializers, count as inferred type
                    if (ts.isVariableDeclaration(node) && node.initializer) {
                        // Almost all initializers in TypeScript are type-inferred
                        metrics.typedNodes++;
                        metrics.implicitlyTypedNodes++;
                    }

                    // For parameters in TypeScript functions, count as inferred if parent has type annotations
                    if (ts.isParameter(node) && parent) {
                        if (ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent) || ts.isConstructorDeclaration(parent)) {
                            if (parent.type || (parent.parameters && parent.parameters.some(p => p.type))) {
                                // If function has any type annotations, TypeScript will infer parameter types where possible
                                metrics.typedNodes++;
                                metrics.implicitlyTypedNodes++;
                            }
                        }
                    }

                    // For function declarations with no return type
                    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && !node.type) {
                        // In TypeScript, return types are almost always inferred correctly
                        metrics.typedNodes++;
                        metrics.implicitlyTypedNodes++;
                    }

                    // For property declarations in classes without type annotations
                    if (ts.isPropertyDeclaration(node) && !node.type && node.initializer) {
                        // Properties with initializers get inferred types
                        metrics.typedNodes++;
                        metrics.implicitlyTypedNodes++;
                    }
                }
            }

            // Count arrow functions
            if (ts.isArrowFunction(node)) {
                metrics.totalTypeableNodes++;

                // Arrow functions with explicit parameter types or return type
                if (node.type || (node.parameters && node.parameters.some(p => p.type))) {
                    metrics.typedNodes++;
                    metrics.explicitlyTypedNodes++;
                } else {
                    // Arrow functions with simple body or object literals are usually well-inferred
                    metrics.typedNodes++;
                    metrics.implicitlyTypedNodes++;
                }
            }

            // Check for interface and type declarations - these contribute to type safety
            if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
                metrics.typedNodes++;
                metrics.totalTypeableNodes++;
                metrics.explicitlyTypedNodes++;
            }

            // Check for all imports (imported modules are well-typed)
            if (ts.isImportDeclaration(node)) {
                metrics.typedNodes++;
                metrics.totalTypeableNodes++;
                metrics.implicitlyTypedNodes++;
            }

            // Check for type assertions
            if (ts.isAsExpression(node) || (ts as any).isTypeAssertion?.(node)) {
                metrics.typeAssertions++;
            }

            // Check for non-null assertions
            if (ts.isNonNullExpression(node)) {
                metrics.nonNullAssertions++;
            }

            // Check for optional properties
            if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) &&
                node.questionToken) {
                metrics.optionalProperties++;
            }

            // Check for generics usage
            if (ts.isTypeReferenceNode(node) && node.typeArguments) {
                metrics.genericsCount += node.typeArguments.length;
            }

            ts.forEachChild(node, n => visit(n, node));
        }

        visit(sourceFile);

        // Calculate type coverage percentage using tsconfig score
        const tsconfigScore = precomputedTsconfigScore ?? getTsconfigScore(path.dirname(filePath));

        // If no typeable nodes found, ensure we have at least one to avoid division by zero
        if (metrics.totalTypeableNodes === 0) {
            metrics.totalTypeableNodes = 1;
            metrics.typedNodes = 1; // Default TypeScript file is actually well-typed
        }

        // Calculate type coverage percentage based on meaningful nodes
        const rawTypeCoverage = (metrics.typedNodes / metrics.totalTypeableNodes) * 100;

        // Calculate explicit vs implicit ratio - this is important for real-world metrics
        const explicitRatio = metrics.explicitlyTypedNodes / Math.max(metrics.typedNodes, 1);

        // Realistically, type-coverage will often show ~95% coverage for well-typed code
        // But we want to give a slightly lower score to encourage explicit type annotations
        // This provides a more realistic metric based on real-world TypeScript projects
        const adjustedTypeCoverage = rawTypeCoverage * (0.75 + (explicitRatio * 0.25));

        // Add tsconfig bonus, but cap it
        const typeCoverage = Math.min(adjustedTypeCoverage + tsconfigScore, 98); // Cap at 98% to be realistic

        // Calculate type safety score (higher is better, scale 0-100)
        // Base score scales to 90-100 for a 100%-typed file depending on tsconfig strictness
        const nodeCount = Math.max(metrics.totalTypeableNodes, 1);
        const baseScore = Math.min(adjustedTypeCoverage * 0.9 + tsconfigScore, 100);
        const anyPenalty = Math.min((metrics.anyTypeCount / nodeCount) * 60 + metrics.anyTypeCount * 2, 40);
        const assertionPenalty = Math.min((metrics.typeAssertions / nodeCount) * 30 + metrics.typeAssertions * 1.5, 25);
        const nonNullPenalty = Math.min((metrics.nonNullAssertions / nodeCount) * 20 + metrics.nonNullAssertions * 1, 20);

        const typeSafetyScore = Math.max(0, Math.min(baseScore - anyPenalty - assertionPenalty - nonNullPenalty, 100));

        // Determine complexity level based on score
        let complexityLevel: string;
        if (typeSafetyScore >= 80) complexityLevel = 'Low';
        else if (typeSafetyScore >= 50) complexityLevel = 'Medium';
        else complexityLevel = 'High';

        return {
            totalTypeableNodes: metrics.totalTypeableNodes,
            typedNodes: metrics.typedNodes,
            typeCoverage: typeCoverage.toFixed(1),
            anyTypeCount: metrics.anyTypeCount,
            typeAssertions: metrics.typeAssertions,
            nonNullAssertions: metrics.nonNullAssertions,
            optionalProperties: metrics.optionalProperties,
            genericsCount: metrics.genericsCount,
            typeSafetyScore: Math.round(typeSafetyScore),
            typeComplexity: complexityLevel
        };
    } catch (error) {
        console.error(`Error analyzing TypeScript safety for ${filePath}:`, error);
        return {
            totalTypeableNodes: 0,
            typedNodes: 0,
            typeCoverage: '0.0',
            anyTypeCount: 0,
            typeAssertions: 0,
            nonNullAssertions: 0,
            optionalProperties: 0,
            genericsCount: 0,
            typeSafetyScore: 0,
            typeComplexity: 'N/A'
        };
    }
}

export async function calculateProjectTypeSafety(projectPath: string, fileList: string[]): Promise<TypeScriptSafetyMetrics> {
    const tsExtensions = ['.ts', '.tsx'];
    const typescriptFiles = fileList.filter(file => tsExtensions.includes(path.extname(file)));

    if (typescriptFiles.length === 0) {
        return {
            tsFileCount: 0,
            tsPercentage: '0.0',
            avgTypeCoverage: '0.0',
            totalAnyCount: 0,
            totalAssertions: 0,
            totalNonNullAssertions: 0,
            avgTypeSafetyScore: 0,
            overallComplexity: 'N/A',
            worstFiles: []
        };
    }

    const tsconfigScore = getTsconfigScore(projectPath);

    let totalTypeCoverage = 0;
    let totalTypeSafetyScore = 0;
    let totalAnyCount = 0;
    let totalAssertions = 0;
    let totalNonNullAssertions = 0;
    const worstFiles: FileSafetyHotspot[] = [];

    for (const file of typescriptFiles) {
        const filePath = path.join(projectPath, file);
        const metrics = await analyzeTypeScriptSafety(filePath, tsconfigScore);

        totalTypeCoverage += parseFloat(metrics.typeCoverage);
        totalTypeSafetyScore += metrics.typeSafetyScore;
        totalAnyCount += metrics.anyTypeCount;
        totalAssertions += metrics.typeAssertions;
        totalNonNullAssertions += metrics.nonNullAssertions;

        worstFiles.push({
            file,
            typeSafetyScore: metrics.typeSafetyScore,
            typeCoverage: metrics.typeCoverage,
            anyCount: metrics.anyTypeCount,
            typeAssertions: metrics.typeAssertions,
            nonNullAssertions: metrics.nonNullAssertions
        });
    }

    worstFiles.sort((a, b) => {
        if (a.typeSafetyScore !== b.typeSafetyScore) {
            return a.typeSafetyScore - b.typeSafetyScore;
        }
        const aIssues = a.anyCount + a.typeAssertions + a.nonNullAssertions;
        const bIssues = b.anyCount + b.typeAssertions + b.nonNullAssertions;
        if (aIssues !== bIssues) {
            return bIssues - aIssues;
        }
        const covDiff = parseFloat(a.typeCoverage) - parseFloat(b.typeCoverage);
        if (covDiff !== 0) {
            return covDiff;
        }
        return a.file.localeCompare(b.file);
    });

    const avgTypeCoverage = (totalTypeCoverage / typescriptFiles.length).toFixed(1);
    const avgTypeSafetyScore = Math.round(totalTypeSafetyScore / typescriptFiles.length);

    // Determine overall complexity
    let overallComplexity: string;
    if (avgTypeSafetyScore >= 80) overallComplexity = 'Low';
    else if (avgTypeSafetyScore >= 50) overallComplexity = 'Medium';
    else overallComplexity = 'High';

    return {
        tsFileCount: typescriptFiles.length,
        tsPercentage: ((typescriptFiles.length / fileList.length) * 100).toFixed(1),
        avgTypeCoverage,
        totalAnyCount,
        totalAssertions,
        totalNonNullAssertions,
        avgTypeSafetyScore,
        overallComplexity,
        worstFiles
    };
}