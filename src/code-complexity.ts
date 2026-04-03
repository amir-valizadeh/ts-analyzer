// src/code-complexity.ts
import fs from 'fs/promises';
import path from 'path';
import * as espree from 'espree';
import * as estraverse from 'estraverse';
import * as ts from 'typescript';
import { Node as EstreeNode } from 'estree';

// Define our own simplified Node interface
interface CustomNode {
  type: string;
  body?: any;
  loc?: { start: { line: number }, end: { line: number } };
  params?: any[];
  id?: { name: string };
  operator?: string;
}

interface SimplifiedProgram {
  type: string;
  body: any[];
}

interface FunctionData {
  type: string;
  name: string;
  complexity: number;
  nestingDepth: number;
  paramCount: number;
  lineCount: number;
}

export interface FileComplexityMetrics {
  avgComplexity: string;
  maxComplexity: number;
  avgNestingDepth: string;
  maxNestingDepth: number;
  avgFunctionSize: string;
  avgParams: string;
  functionCount: number;
  complexityScore: number;
  complexityRating: string;
  codeSmells: {
    magicNumbers: number;
    callbackHell: number;
    godFiles: number; // For God Classes/Files
    excessiveParameters: number;
  };
}

export interface CodeComplexityMetrics {
  analyzedFiles: number;
  avgComplexity: string;
  maxComplexity: number;
  avgNestingDepth: string;
  maxNestingDepth: number;
  avgFunctionSize: string;
  totalFunctions: number;
  complexFiles: number;
  overallComplexity: string;
  codeSmells: {
    magicNumbers: number;
    callbackHell: number;
    godFiles: number;
    excessiveParameters: number;
  };
}

// Calculate cyclomatic complexity
function calculateCyclomaticComplexity(ast: any): number {
  let complexity = 1; // Start with 1 (one path through the function)

  estraverse.traverse(ast, {
    enter(node: any) {
      // Count conditional statements and operators that create new paths
      switch (node.type) {
        case 'IfStatement':
        case 'ConditionalExpression':
        case 'SwitchCase':
        case 'ForStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'WhileStatement':
        case 'DoWhileStatement':
          complexity++;
          break;
        case 'LogicalExpression':
          if (node.operator === '&&' || node.operator === '||') {
            complexity++;
          }
          break;
      }
    }
  });

  return complexity;
}

// Calculate nesting depth
function calculateNestingDepth(ast: any): number {
  let maxDepth = 0;
  let currentDepth = 0;

  estraverse.traverse(ast, {
    enter(node: any) {
      // Count nesting for blocks and control structures
      switch (node.type) {
        case 'BlockStatement':
        case 'IfStatement':
        case 'SwitchStatement':
        case 'ForStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'WhileStatement':
        case 'DoWhileStatement':
        case 'TryStatement':
          currentDepth++;
          maxDepth = Math.max(maxDepth, currentDepth);
          break;
      }
    },
    leave(node: any) {
      // Decrement depth when leaving a block
      switch (node.type) {
        case 'BlockStatement':
        case 'IfStatement':
        case 'SwitchStatement':
        case 'ForStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'WhileStatement':
        case 'DoWhileStatement':
        case 'TryStatement':
          currentDepth--;
          break;
      }
    }
  });

  return maxDepth;
}

// Find function declarations and calculate their metrics
function analyzeFunctions(ast: any): FunctionData[] {
  const functions: FunctionData[] = [];

  estraverse.traverse(ast, {
    enter(node: any) {
      if (node.type === 'FunctionDeclaration' ||
          node.type === 'FunctionExpression' ||
          node.type === 'ArrowFunctionExpression') {

        // Skip functions without a body
        if (!node.body) return;

        // Get the function's source code
        let functionAst = node;
        if (node.type === 'ArrowFunctionExpression' && node.body.type !== 'BlockStatement') {
          functionAst = {
            type: 'ArrowFunctionExpression',
            body: {
              type: 'BlockStatement',
              body: [{ type: 'ReturnStatement', argument: node.body }]
            }
          };
        }

        // Calculate complexity
        const complexity = calculateCyclomaticComplexity(functionAst);

        // Calculate nesting
        const nestingDepth = calculateNestingDepth(functionAst);

        // Count function parameters
        const paramCount = node.params ? node.params.length : 0;

        // Estimate function size (lines)
        let lineCount = 0;
        if (node.loc) {
          lineCount = node.loc.end.line - node.loc.start.line + 1;
        }

        functions.push({
          type: node.type,
          name: node.id ? node.id.name : 'anonymous',
          complexity: node.complexity || complexity,
          nestingDepth: node.nestingDepth || nestingDepth,
          paramCount,
          lineCount
        });
      }
    }
  });

  return functions;
}

// Parse a TypeScript file using the TypeScript compiler
function parseTypeScriptFile(content: string): SimplifiedProgram {
  try {
    // Create a source file
    const sourceFile = ts.createSourceFile(
        'temp.ts',
        content,
        ts.ScriptTarget.Latest,
        true
    );

    // Create a simplified program AST structure
    const simplifiedAst: SimplifiedProgram = {
      type: 'Program',
      body: []
    };

    // Function to visit TypeScript nodes and extract function information
    function visit(node: ts.Node) {
      if (ts.isLiteralExpression(node) && node.kind === ts.SyntaxKind.NumericLiteral) {
          simplifiedAst.body.push({
             type: 'Literal',
             value: parseFloat(node.text)
          });
      }

      if (ts.isFunctionDeclaration(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isArrowFunction(node) ||
          ts.isFunctionExpression(node)) {

        const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

        // Calculate complexity and nesting for this TS function
        let complexity = 1;
        let maxNesting = 0;
        let currentNesting = 0;

        function checkNode(n: ts.Node) {
            // Complexity
            if (ts.isIfStatement(n) || ts.isConditionalExpression(n) || ts.isCaseClause(n) ||
                ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) ||
                ts.isWhileStatement(n) || ts.isDoStatement(n)) {
                complexity++;
            }
            if (ts.isBinaryExpression(n)) {
                if (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                    n.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
                    complexity++;
                }
            }

            // Nesting
            const isNestingNode = ts.isBlock(n) || ts.isIfStatement(n) || ts.isSwitchStatement(n) ||
                                  ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) ||
                                  ts.isWhileStatement(n) || ts.isDoStatement(n) || ts.isTryStatement(n);

            if (isNestingNode) {
                currentNesting++;
                maxNesting = Math.max(maxNesting, currentNesting);
            }

            ts.forEachChild(n, checkNode);

            if (isNestingNode) {
                currentNesting--;
            }
        }

        if (node.body) {
            checkNode(node.body);
        }

        const functionNode: any = {
          type: ts.isFunctionDeclaration(node) ? 'FunctionDeclaration' :
              ts.isArrowFunction(node) ? 'ArrowFunctionExpression' : 'FunctionExpression',
          id: ts.isFunctionDeclaration(node) && node.name ? { name: node.name.text } : undefined,
          params: node.parameters ? node.parameters.map(() => ({})) : [],
          body: { type: 'BlockStatement', body: [] as any[] },
          loc: {
            start: { line: startLine },
            end: { line: endLine }
          },
          complexity,
          nestingDepth: maxNesting
        };

        simplifiedAst.body.push(functionNode);
        return; // Don't recurse into function body for the main visit (already handled by checkNode)
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return simplifiedAst;
  } catch (error) {
    console.error('Error parsing TypeScript file:', error);
    return { type: 'Program', body: [] };
  }
}

export async function analyzeFileComplexity(filePath: string): Promise<FileComplexityMetrics> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const extension = path.extname(filePath);

    // Choose the appropriate parser based on file extension
    let ast: any;

    if (extension === '.ts' || extension === '.tsx') {
      // Use TypeScript parser for .ts and .tsx files
      ast = parseTypeScriptFile(content);
    } else {
      // Use espree for JavaScript files
      try {
        const parserOptions = {
          ecmaVersion: 2022,
          sourceType: 'module',
          ecmaFeatures: {
            jsx: extension === '.jsx'
          }
        };

        ast = espree.parse(content, parserOptions as any);
      } catch (parseError) {
        console.error(`Parsing error in ${filePath}: ${(parseError as Error).message}`);
        return {
          avgComplexity: '0',
          maxComplexity: 0,
          avgNestingDepth: '0',
          maxNestingDepth: 0,
          avgFunctionSize: '0',
          avgParams: '0',
          functionCount: 0,
          complexityScore: 0,
          complexityRating: 'N/A',
          codeSmells: { magicNumbers: 0, callbackHell: 0, godFiles: 0, excessiveParameters: 0 }
        };
      }
    }

    // Analyze the functions in the file
    const functions = analyzeFunctions(ast);

    let magicNumbers = 0;
    estraverse.traverse(ast, {
      enter(node: any) {
        if (node.type === 'Literal' && typeof node.value === 'number') {
          // A magic number could be considered > 10
          if (node.value > 10 || node.value < -10) {
            magicNumbers++;
          }
        }
      }
    });

    // Check for god file (> 500 lines)
    const lineCount = content.split('\n').length;
    const godFiles = lineCount > 500 ? 1 : 0;

    let callbackHell = 0;
    let excessiveParameters = 0;
    functions.forEach(fn => {
        if (fn.nestingDepth > 3) callbackHell++;
        if (fn.paramCount > 4) excessiveParameters++;
    });

    if (functions.length === 0) {
      return {
        avgComplexity: '0',
        maxComplexity: 0,
        avgNestingDepth: '0',
        maxNestingDepth: 0,
        avgFunctionSize: '0',
        avgParams: '0',
        functionCount: 0,
        complexityScore: 0,
        complexityRating: 'N/A',
        codeSmells: { magicNumbers, callbackHell, godFiles, excessiveParameters }
      };
    }

    // Calculate average and maximum values
    const totalComplexity = functions.reduce((sum, fn) => sum + fn.complexity, 0);
    const maxComplexity = Math.max(...functions.map(fn => fn.complexity));

    const totalNestingDepth = functions.reduce((sum, fn) => sum + fn.nestingDepth, 0);
    const maxNestingDepth = Math.max(...functions.map(fn => fn.nestingDepth));

    const totalLineCount = functions.reduce((sum, fn) => sum + fn.lineCount, 0);
    const totalParams = functions.reduce((sum, fn) => sum + fn.paramCount, 0);

    const avgComplexity = totalComplexity / functions.length;
    const avgNestingDepth = totalNestingDepth / functions.length;
    const avgFunctionSize = totalLineCount / functions.length;
    const avgParams = totalParams / functions.length;

    // Calculate a complexity score (0-100, higher means more complex)
    const complexityWeight = 0.4;
    const nestingWeight = 0.3;
    const sizeWeight = 0.2;
    const paramsWeight = 0.1;

    // Normalized scores (0-100)
    const complexityScore = Math.min((avgComplexity / 10) * 100, 100);
    const nestingScore = Math.min((avgNestingDepth / 5) * 100, 100);
    const sizeScore = Math.min((avgFunctionSize / 30) * 100, 100);
    const paramsScore = Math.min((avgParams / 6) * 100, 100);

    const totalScore = (complexityScore * complexityWeight) +
        (nestingScore * nestingWeight) +
        (sizeScore * sizeWeight) +
        (paramsScore * paramsWeight);

    // Define complexity rating
    let complexityRating: string;
    if (totalScore < 30) complexityRating = 'Low';
    else if (totalScore < 60) complexityRating = 'Medium';
    else complexityRating = 'High';

    return {
      avgComplexity: avgComplexity.toFixed(1),
      maxComplexity,
      avgNestingDepth: avgNestingDepth.toFixed(1),
      maxNestingDepth,
      avgFunctionSize: avgFunctionSize.toFixed(1),
      avgParams: avgParams.toFixed(1),
      functionCount: functions.length,
      complexityScore: Math.round(totalScore),
      complexityRating,
      codeSmells: { magicNumbers, callbackHell, godFiles, excessiveParameters }
    };
  } catch (error) {
    console.error(`Error analyzing file complexity for ${filePath}:`, error);
    return {
      avgComplexity: '0',
      maxComplexity: 0,
      avgNestingDepth: '0',
      maxNestingDepth: 0,
      avgFunctionSize: '0',
      avgParams: '0',
      functionCount: 0,
      complexityScore: 0,
      complexityRating: 'N/A',
      codeSmells: { magicNumbers: 0, callbackHell: 0, godFiles: 0, excessiveParameters: 0 }
    };
  }
}

export async function calculateProjectComplexity(projectPath: string, fileList: string[]): Promise<CodeComplexityMetrics> {
  const jsExtensions = ['.js', '.jsx', '.ts', '.tsx'];
  const jsFiles = fileList.filter(file => jsExtensions.includes(path.extname(file)));

  if (jsFiles.length === 0) {
    return {
      analyzedFiles: 0,
      avgComplexity: '0.0',
      maxComplexity: 0,
      avgNestingDepth: '0.0',
      maxNestingDepth: 0,
      avgFunctionSize: '0.0',
      totalFunctions: 0,
      complexFiles: 0,
      overallComplexity: 'N/A',
      codeSmells: { magicNumbers: 0, callbackHell: 0, godFiles: 0, excessiveParameters: 0 }
    };
  }

  let totalComplexity = 0;
  let totalNestingDepth = 0;
  let totalFunctionSize = 0;
  let maxComplexityGlobal = 0;
  let maxNestingDepthGlobal = 0;
  let totalFunctions = 0;
  let complexFiles = 0;

  let totalSmells = { magicNumbers: 0, callbackHell: 0, godFiles: 0, excessiveParameters: 0 };

  for (const file of jsFiles) {
    const filePath = path.join(projectPath, file);
    const metrics = await analyzeFileComplexity(filePath);

    totalComplexity += parseFloat(metrics.avgComplexity) * metrics.functionCount;
    totalNestingDepth += parseFloat(metrics.avgNestingDepth) * metrics.functionCount;
    totalFunctionSize += parseFloat(metrics.avgFunctionSize) * metrics.functionCount;
    maxComplexityGlobal = Math.max(maxComplexityGlobal, metrics.maxComplexity);
    maxNestingDepthGlobal = Math.max(maxNestingDepthGlobal, metrics.maxNestingDepth);
    totalFunctions += metrics.functionCount;

    totalSmells.magicNumbers += metrics.codeSmells.magicNumbers;
    totalSmells.callbackHell += metrics.codeSmells.callbackHell;
    totalSmells.godFiles += metrics.codeSmells.godFiles;
    totalSmells.excessiveParameters += metrics.codeSmells.excessiveParameters;

    if (metrics.complexityRating === 'High') {
      complexFiles++;
    }
  }

  // Calculate project averages
  const avgComplexity = totalFunctions > 0 ? (totalComplexity / totalFunctions).toFixed(1) : '0.0';
  const avgNestingDepth = totalFunctions > 0 ? (totalNestingDepth / totalFunctions).toFixed(1) : '0.0';
  const avgFunctionSize = totalFunctions > 0 ? (totalFunctionSize / totalFunctions).toFixed(1) : '0.0';

  // Determine overall complexity
  let overallComplexity: string;
  const complexFilesPercentage = (complexFiles / jsFiles.length) * 100;

  if (parseFloat(avgComplexity) < 4 && complexFilesPercentage < 10) {
    overallComplexity = 'Low';
  } else if (parseFloat(avgComplexity) < 8 && complexFilesPercentage < 25) {
    overallComplexity = 'Medium';
  } else {
    overallComplexity = 'High';
  }

  return {
    analyzedFiles: jsFiles.length,
    avgComplexity,
    maxComplexity: maxComplexityGlobal,
    avgNestingDepth,
    maxNestingDepth: maxNestingDepthGlobal,
    avgFunctionSize,
    totalFunctions,
    complexFiles,
    overallComplexity,
    codeSmells: totalSmells
  };
}