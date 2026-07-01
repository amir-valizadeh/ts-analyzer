#!/usr/bin/env node
// bin/cli.ts
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { analyzeProject, generateContextOutline, generateRules } from '../src/index.js';
import { formatTable } from '../src/table-formatter.js';
import { generateHtmlReport } from '../src/html-formatter.js';
import { writeFileSync } from 'fs';

const program = new Command();

interface ProgramOptions {
    exclude?: string;
    include?: string;
    color?: boolean;
    safety?: boolean;
    complexity?: boolean;
    format?: string;
    initRules?: boolean | string;
}

program
    .name('ts-analyzer')
    .description('Comprehensive TypeScript code analyzer with type safety and complexity metrics')
    .version('1.5.0')
    .argument('[dir]', 'project directory to analyze', '.')
    .option('-e, --exclude <patterns>', 'additional patterns to exclude (comma-separated)')
    .option('-i, --include <extensions>', 'additional file extensions to include (comma-separated)')
    .option('--no-color', 'disable colored output')
    .option('--no-safety', 'disable TypeScript safety analysis')
    .option('--no-complexity', 'disable code complexity analysis')
    .option('-f, --format <type>', 'output format (text, json, html, or context)', 'text')
    .option('--init-rules [type]', 'generate AI coding rules (cursorrules, claudeprompt, or both)')
    .action(async (dir: string, options: ProgramOptions) => {
        let configOptions: any = {};
        try {
            const configPath = path.resolve(dir, 'ts-analyzer.config.json');
            if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf8');
                configOptions = JSON.parse(configContent);
            }
        } catch (error) {
            console.warn(chalk.yellow('Warning: Could not parse ts-analyzer.config.json'));
        }

        const format = options.format !== 'text' ? options.format : (configOptions.format || 'text');
        const isJson = format === 'json';
        const isHtml = format === 'html';
        const isContext = format === 'context';
        const useColors = options.color !== false && configOptions.color !== false && !isJson && !isHtml && !isContext;

        const spinner = (isJson || isHtml || isContext || options.initRules !== undefined) ? null : ora('Analyzing TypeScript project...').start();

        try {
            let extraExcludes: string[] = [];
            if (configOptions.exclude) extraExcludes.push(...configOptions.exclude);
            if (options.exclude) extraExcludes.push(...options.exclude.split(','));

            let extraExtensions: string[] = [];
            if (configOptions.include) {
                extraExtensions.push(...configOptions.include.map((ext: string) => ext.startsWith('.') ? ext : `.${ext}`));
            }
            if (options.include) {
                extraExtensions.push(...options.include.split(',').map((ext: string) => ext.startsWith('.') ? ext : `.${ext}`));
            }

            const analyzeSafety = options.safety !== false && configOptions.safety !== false;
            const analyzeComplexity = options.complexity !== false && configOptions.complexity !== false;

            const stats = await analyzeProject(dir, {
                excludePatterns: extraExcludes,
                additionalExtensions: extraExtensions,
                analyzeSafety,
                analyzeComplexity
            });

            if (options.initRules !== undefined) {
                const initSpinner = ora('Generating AI rules tailored to codebase...').start();
                try {
                    const ruleFormat = typeof options.initRules === 'string' ? options.initRules : 'cursorrules';
                    if (ruleFormat !== 'cursorrules' && ruleFormat !== 'claudeprompt' && ruleFormat !== 'both') {
                        initSpinner.fail(`Invalid AI rules format: ${ruleFormat}. Must be cursorrules, claudeprompt, or both.`);
                        process.exit(1);
                    }
                    const result = await generateRules(dir, stats, { outputFormat: ruleFormat as any });
                    initSpinner.succeed('AI rules generated successfully!');
                    if (result.cursorrulesPath) {
                        console.log(`Generated: ${chalk.green(result.cursorrulesPath)}`);
                    }
                    if (result.claudepromptPath) {
                        console.log(`Generated: ${chalk.green(result.claudepromptPath)}`);
                    }
                    process.exit(0);
                } catch (err) {
                    initSpinner.fail('Failed to generate AI rules');
                    console.error(err);
                    process.exit(1);
                }
            }

            if (isContext) {
                if (!stats.allFilePaths) {
                    console.error('Error: Could not retrieve file paths for context mapping.');
                    process.exit(1);
                }
                const contextOutline = await generateContextOutline(dir, stats.allFilePaths);
                console.log(contextOutline);
                process.exit(0);
            }

            if (isJson) {
                console.log(JSON.stringify(stats, (key, value) => {
                    if (key === 'formatNumber' || key === 'formattedFileTypes') return undefined;
                    return value;
                }, 2));
                process.exit(0);
            }

            if (isHtml) {
                const htmlOutput = generateHtmlReport(stats);
                const htmlReportPath = path.resolve(process.cwd(), 'ts-analyzer-report.html');
                writeFileSync(htmlReportPath, htmlOutput);
                console.log(`HTML report generated at: ${htmlReportPath}`);
                process.exit(0);
            }

            spinner?.succeed('Analysis complete!');

            // Print summary table
            console.log('\n' + (useColors ? chalk.bold.green('Project Summary:') : 'Project Summary:'));
            formatTable([
                { metric: 'Total Files', value: stats.formatNumber(stats.files) },
                { metric: 'Total Lines', value: stats.formatNumber(stats.totalLines) },
                { metric: 'Code Lines', value: stats.formatNumber(stats.codeLines) },
                { metric: 'Comment Lines', value: stats.formatNumber(stats.commentLines) },
                { metric: 'Empty Lines', value: stats.formatNumber(stats.emptyLines) }
            ]);

            // Print file types table
            console.log('\n' + (useColors ? chalk.bold.green('Files by Type:') : 'Files by Type:'));
            formatTable(stats.formattedFileTypes as any[]);

            // Print TypeScript safety metrics if available
            if (stats.typescriptSafety) {
                console.log('\n' + (useColors ? chalk.bold.green('TypeScript Safety:') : 'TypeScript Safety:'));

                // Prepare safety indicators
                let safetyIndicator;
                if (stats.typescriptSafety.avgTypeSafetyScore >= 80) {
                    safetyIndicator = useColors ? chalk.green('Good ✓') : 'Good ✓';
                } else if (stats.typescriptSafety.avgTypeSafetyScore >= 50) {
                    safetyIndicator = useColors ? chalk.yellow('Moderate ⚠') : 'Moderate ⚠';
                } else {
                    safetyIndicator = useColors ? chalk.red('Poor ✗') : 'Poor ✗';
                }

                let safetyRating;
                if (stats.typescriptSafety.overallComplexity === 'Low') {
                    safetyRating = useColors ? chalk.green('Low') : 'Low';
                } else if (stats.typescriptSafety.overallComplexity === 'Medium') {
                    safetyRating = useColors ? chalk.yellow('Medium') : 'Medium';
                } else {
                    safetyRating = useColors ? chalk.red('High') : 'High';
                }

                // Create coverage evaluation
                let coverageEvaluation;
                const typeCoverage = parseFloat(stats.typescriptSafety.avgTypeCoverage);
                if (typeCoverage >= 95) {
                    coverageEvaluation = useColors ? chalk.green('(Excellent)') : '(Excellent)';
                } else if (typeCoverage >= 85) {
                    coverageEvaluation = useColors ? chalk.green('(Good)') : '(Good)';
                } else if (typeCoverage >= 70) {
                    coverageEvaluation = useColors ? chalk.yellow('(Moderate)') : '(Moderate)';
                } else {
                    coverageEvaluation = useColors ? chalk.red('(Needs Improvement)') : '(Needs Improvement)';
                }

                formatTable([
                    { metric: 'TypeScript Files', value: `${stats.formatNumber(stats.typescriptSafety.tsFileCount)} (${stats.typescriptSafety.tsPercentage}% of codebase)` },
                    { metric: 'Type Coverage', value: `${stats.typescriptSafety.avgTypeCoverage}% ${coverageEvaluation}` },
                    { metric: 'Any Type Usage', value: stats.formatNumber(stats.typescriptSafety.totalAnyCount) },
                    { metric: 'Type Assertions', value: stats.formatNumber(stats.typescriptSafety.totalAssertions) },
                    { metric: 'Non-Null Assertions', value: stats.formatNumber(stats.typescriptSafety.totalNonNullAssertions) },
                    { metric: 'Type Safety Score', value: `${stats.typescriptSafety.avgTypeSafetyScore}/100 (${safetyIndicator})` },
                    { metric: 'Type Safety Rating', value: safetyRating }
                ]);

                // Add explanation about TypeScript metrics
                console.log('\n' + (useColors ? chalk.italic('Type Coverage:') : 'Type Coverage:'));
                console.log(useColors
                    ? chalk.italic('• Measures the percentage of code elements that have proper type information')
                    : '• Measures the percentage of code elements that have proper type information');
                console.log(useColors
                    ? chalk.italic('• Includes both explicit type annotations and TypeScript\'s type inference')
                    : '• Includes both explicit type annotations and TypeScript\'s type inference');
                console.log(useColors
                    ? chalk.italic('• Industry standard for production TypeScript is 85-95% coverage')
                    : '• Industry standard for production TypeScript is 85-95% coverage');

                console.log('\n' + (useColors ? chalk.italic('Type Safety Score:') : 'Type Safety Score:'));
                console.log(useColors
                    ? chalk.italic('• Comprehensive evaluation that considers type coverage, "any" usage, and type assertions')
                    : '• Comprehensive evaluation that considers type coverage, "any" usage, and type assertions');
                console.log(useColors
                    ? chalk.italic('• Also accounts for TypeScript configuration in tsconfig.json')
                    : '• Also accounts for TypeScript configuration in tsconfig.json');
            }

            // Print code complexity metrics if available
            if (stats.codeComplexity) {
                console.log('\n' + (useColors ? chalk.bold.green('Code Complexity:') : 'Code Complexity:'));

                // Prepare complexity indicator
                let complexityIndicator;
                if (stats.codeComplexity.overallComplexity === 'Low') {
                    complexityIndicator = useColors ? chalk.green('Simple ✓') : 'Simple ✓';
                } else if (stats.codeComplexity.overallComplexity === 'Medium') {
                    complexityIndicator = useColors ? chalk.yellow('Moderate ⚠') : 'Moderate ⚠';
                } else {
                    complexityIndicator = useColors ? chalk.red('Complex ✗') : 'Complex ✗';
                }

                formatTable([
                    { metric: 'Analyzed Files', value: stats.formatNumber(stats.codeComplexity.analyzedFiles) },
                    { metric: 'Total Functions', value: stats.formatNumber(stats.codeComplexity.totalFunctions) },
                    { metric: 'Avg Cyclomatic Complexity', value: stats.codeComplexity.avgComplexity },
                    { metric: 'Max Cyclomatic Complexity', value: stats.formatNumber(stats.codeComplexity.maxComplexity) },
                    { metric: 'Avg Nesting Depth', value: stats.codeComplexity.avgNestingDepth },
                    { metric: 'Max Nesting Depth', value: stats.formatNumber(stats.codeComplexity.maxNestingDepth) },
                    { metric: 'Avg Function Size', value: `${stats.codeComplexity.avgFunctionSize} lines` },
                    { metric: 'Complex Files', value: stats.formatNumber(stats.codeComplexity.complexFiles) },
                    { metric: 'Overall Complexity', value: complexityIndicator }
                ]);

                console.log('\n' + (useColors ? chalk.bold.magenta('Anti-Patterns & Code Smells:') : 'Anti-Patterns & Code Smells:'));
                const hasSmells = stats.codeComplexity.codeSmells.callbackHell > 0 ||
                    stats.codeComplexity.codeSmells.godFiles > 0 ||
                    stats.codeComplexity.codeSmells.excessiveParameters > 0 ||
                    stats.codeComplexity.codeSmells.magicNumbers > 0 ||
                    (stats.codeComplexity.duplicateCode && stats.codeComplexity.duplicateCode.totalDuplicateLines > 0);

                if (hasSmells) {
                    const smellsTable = [
                        { metric: 'Callback Hell (Depth > 3)', value: stats.formatNumber(stats.codeComplexity.codeSmells.callbackHell) },
                        { metric: 'God Files (> 500 lines)', value: stats.formatNumber(stats.codeComplexity.codeSmells.godFiles) },
                        { metric: 'Excessive Params (> 4)', value: stats.formatNumber(stats.codeComplexity.codeSmells.excessiveParameters) },
                        { metric: 'Magic Numbers', value: stats.formatNumber(stats.codeComplexity.codeSmells.magicNumbers) }
                    ];

                    if (stats.codeComplexity.duplicateCode) {
                        smellsTable.push({
                            metric: 'Duplicate Code (Lines)',
                            value: `${stats.formatNumber(stats.codeComplexity.duplicateCode.totalDuplicateLines)} lines in ${stats.codeComplexity.duplicateCode.totalClones} clones`
                        });
                    }

                    formatTable(smellsTable);
                } else {
                    console.log(useColors ? chalk.green('✓ No major code smells detected.') : '✓ No major code smells detected.');
                }
            }

            // Add code quality recommendations
            if (stats.typescriptSafety || stats.codeComplexity) {
                console.log('\n' + (useColors ? chalk.bold.blue('📝 Code Quality Recommendations:') : '📝 Code Quality Recommendations:'));
                const recommendations: string[] = [];

                if (stats.typescriptSafety) {
                    const typeCoverage = parseFloat(stats.typescriptSafety.avgTypeCoverage);

                    // Type safety recommendations - with more specific thresholds
                    if (typeCoverage < 85) {
                        recommendations.push(useColors
                            ? chalk.yellow('• Improve type coverage by adding more explicit type annotations')
                            : '• Improve type coverage by adding more explicit type annotations');
                    } else if (typeCoverage < 95) {
                        recommendations.push(useColors
                            ? chalk.yellow('• Consider adding explicit type annotations to remaining untyped areas')
                            : '• Consider adding explicit type annotations to remaining untyped areas');
                    }

                    if (stats.typescriptSafety.totalAnyCount > 10) {
                        recommendations.push(useColors
                            ? chalk.yellow(`• Reduce usage of 'any' type (found ${stats.typescriptSafety.totalAnyCount} instances) by using more specific types`)
                            : `• Reduce usage of 'any' type (found ${stats.typescriptSafety.totalAnyCount} instances) by using more specific types`);
                    } else if (stats.typescriptSafety.totalAnyCount > 0) {
                        recommendations.push(useColors
                            ? chalk.yellow(`• Consider replacing the ${stats.typescriptSafety.totalAnyCount} 'any' type usage(s) with more specific types`)
                            : `• Consider replacing the ${stats.typescriptSafety.totalAnyCount} 'any' type usage(s) with more specific types`);
                    }

                    if (stats.typescriptSafety.totalAssertions > 5) {
                        recommendations.push(useColors
                            ? chalk.yellow(`• Reduce type assertions (${stats.typescriptSafety.totalAssertions} instances) by improving type declarations`)
                            : `• Reduce type assertions (${stats.typescriptSafety.totalAssertions} instances) by improving type declarations`);
                    }

                    if (stats.typescriptSafety.totalNonNullAssertions > 5) {
                        recommendations.push(useColors
                            ? chalk.yellow(`• Replace non-null assertions (${stats.typescriptSafety.totalNonNullAssertions} instances) with proper null checks`)
                            : `• Replace non-null assertions (${stats.typescriptSafety.totalNonNullAssertions} instances) with proper null checks`);
                    }
                }

                if (stats.codeComplexity) {
                    // Code complexity recommendations
                    if (parseFloat(stats.codeComplexity.avgComplexity) > 6) {
                        recommendations.push(useColors
                            ? chalk.yellow('• Reduce function complexity by breaking down complex functions into smaller, more focused ones')
                            : '• Reduce function complexity by breaking down complex functions into smaller, more focused ones');
                    }

                    if (parseFloat(stats.codeComplexity.avgNestingDepth) > 3) {
                        recommendations.push(useColors
                            ? chalk.yellow('• Reduce nesting depth by extracting deeply nested code into separate functions')
                            : '• Reduce nesting depth by extracting deeply nested code into separate functions');
                    }

                    if (parseFloat(stats.codeComplexity.avgFunctionSize) > 15) {
                        recommendations.push(useColors
                            ? chalk.yellow('• Consider refactoring large functions to improve readability and maintainability')
                            : '• Consider refactoring large functions to improve readability and maintainability');
                    }

                    if (stats.codeComplexity.complexFiles > 0) {
                        recommendations.push(useColors
                            ? chalk.yellow(`• Address high complexity in ${stats.codeComplexity.complexFiles} files with potential technical debt`)
                            : `• Address high complexity in ${stats.codeComplexity.complexFiles} files with potential technical debt`);
                    }

                    if (stats.codeComplexity.duplicateCode && stats.codeComplexity.duplicateCode.totalDuplicateLines > 0) {
                        recommendations.push(useColors
                            ? chalk.yellow(`• Extract duplicated code (${stats.codeComplexity.duplicateCode.totalDuplicateLines} duplicate lines) into shared helper functions or utilities`)
                            : `• Extract duplicated code (${stats.codeComplexity.duplicateCode.totalDuplicateLines} duplicate lines) into shared helper functions or utilities`);
                    }
                }

                if (recommendations.length > 0) {
                    console.log(recommendations.join('\n'));
                } else {
                    console.log(useColors
                        ? chalk.green('✓ Your code looks well structured! Keep up the good work.')
                        : '✓ Your code looks well structured! Keep up the good work.');
                }
            }

        } catch (error) {
            spinner?.fail('Analysis failed');
            console.error(useColors ? chalk.red('Error:') : 'Error:', (error as Error).message);
            process.exit(1);
        }
    });

program.parse();