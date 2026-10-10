#!/usr/bin/env node
// bin/cli.ts
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import {
    analyzeProject,
    generateContextOutline,
    generateRules,
    compareWithBaseline,
    QualityGateThresholds,
    BaselineDiff
} from '../src/index.js';
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
    dependencies?: boolean;
    format?: string;
    initRules?: boolean | string;
    check?: boolean;
    minSafety?: string;
    minCoverage?: string;
    maxComplexity?: string;
    failOnCircular?: boolean;
    failOnDeadCode?: boolean;
    maxClones?: string;
    compare?: string;
    githubSummary?: boolean;
}

program
    .name('ts-analyzer')
    .description('Comprehensive TypeScript code analyzer with CI/CD Quality Gate & Regression Tracking')
    .version('2.0.0')
    .argument('[dir]', 'project directory to analyze', '.')
    .option('-e, --exclude <patterns>', 'additional patterns to exclude (comma-separated)')
    .option('-i, --include <extensions>', 'additional file extensions to include (comma-separated)')
    .option('--no-color', 'disable colored output')
    .option('--no-safety', 'disable TypeScript safety analysis')
    .option('--no-complexity', 'disable code complexity analysis')
    .option('--no-dependencies', 'disable dependency and circular reference analysis')
    .option('-f, --format <type>', 'output format (text, json, html, or context)', 'text')
    .option('--init-rules [type]', 'generate AI coding rules (cursorrules, claudeprompt, or both)')
    .option('--check', 'run with standard quality gate checks')
    .option('--min-safety <number>', 'minimum Type Safety Score (0-100)')
    .option('--min-coverage <number>', 'minimum Type Coverage percentage (0-100)')
    .option('--max-complexity <number>', 'maximum average cyclomatic complexity allowed')
    .option('--fail-on-circular', 'fail if any circular dependencies exist')
    .option('--fail-on-dead-code', 'fail if any unused exports exist')
    .option('--max-clones <number>', 'maximum duplicate code clones allowed')
    .option('--compare <path>', 'path to a baseline JSON file to compare against and display diffs')
    .option('--github-summary', 'write GitHub Actions $GITHUB_STEP_SUMMARY markdown file or output annotations')
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
            const analyzeDependencies = options.dependencies !== false && configOptions.dependencies !== false;

            const isQualityGateRequested = !!(
                options.check ||
                options.minSafety !== undefined ||
                options.minCoverage !== undefined ||
                options.maxComplexity !== undefined ||
                options.failOnCircular !== undefined ||
                options.failOnDeadCode !== undefined ||
                options.maxClones !== undefined ||
                options.githubSummary ||
                configOptions.qualityGate
            );

            let qualityGateThresholds: QualityGateThresholds | undefined = undefined;

            if (isQualityGateRequested) {
                const thresholds: QualityGateThresholds = {};

                if (options.check) {
                    thresholds.minTypeSafetyScore = 70;
                    thresholds.minTypeCoverage = 75;
                    thresholds.maxAvgComplexity = 10;
                    thresholds.failOnCircular = true;
                }

                if (configOptions.qualityGate && typeof configOptions.qualityGate === 'object') {
                    Object.assign(thresholds, configOptions.qualityGate);
                }

                if (options.minSafety !== undefined) {
                    thresholds.minTypeSafetyScore = parseFloat(options.minSafety);
                }
                if (options.minCoverage !== undefined) {
                    thresholds.minTypeCoverage = parseFloat(options.minCoverage);
                }
                if (options.maxComplexity !== undefined) {
                    thresholds.maxAvgComplexity = parseFloat(options.maxComplexity);
                }
                if (options.failOnCircular) {
                    thresholds.failOnCircular = true;
                }
                if (options.failOnDeadCode) {
                    thresholds.failOnDeadCode = true;
                }
                if (options.maxClones !== undefined) {
                    thresholds.maxDuplicateClones = parseInt(options.maxClones, 10);
                }

                qualityGateThresholds = thresholds;
            }

            const stats = await analyzeProject(dir, {
                excludePatterns: extraExcludes,
                additionalExtensions: extraExtensions,
                analyzeSafety,
                analyzeComplexity,
                analyzeDependencies,
                qualityGate: qualityGateThresholds
            });

            let baselineDiff: BaselineDiff | null = null;
            if (options.compare) {
                try {
                    const baselinePath = path.resolve(process.cwd(), options.compare);
                    if (!fs.existsSync(baselinePath)) {
                        spinner?.fail('Comparison failed');
                        console.error(chalk.red(`Error: Baseline file not found: ${baselinePath}`));
                        process.exit(1);
                    }
                    const baselineContent = fs.readFileSync(baselinePath, 'utf8');
                    const baselineStats = JSON.parse(baselineContent);
                    baselineDiff = compareWithBaseline(stats, baselineStats);
                    (stats as any).baselineDiff = baselineDiff;
                } catch (err) {
                    spinner?.fail('Comparison failed');
                    console.error(chalk.red(`Error reading baseline file: ${(err as Error).message}`));
                    process.exit(1);
                }
            }

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
                if (options.githubSummary && stats.qualityGateResult) {
                    writeGitHubSummary(stats.qualityGateResult, baselineDiff, useColors);
                }
                if (stats.qualityGateResult && !stats.qualityGateResult.passed && isQualityGateRequested) {
                    process.exit(1);
                }
                process.exit(0);
            }

            if (isHtml) {
                const htmlOutput = generateHtmlReport(stats);
                const htmlReportPath = path.resolve(process.cwd(), 'ts-analyzer-report.html');
                writeFileSync(htmlReportPath, htmlOutput);
                console.log(`HTML report generated at: ${htmlReportPath}`);
                if (options.githubSummary && stats.qualityGateResult) {
                    writeGitHubSummary(stats.qualityGateResult, baselineDiff, useColors);
                }
                if (stats.qualityGateResult && !stats.qualityGateResult.passed && isQualityGateRequested) {
                    process.exit(1);
                }
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

            // Print dependency analysis metrics if available
            if (stats.dependencies) {
                console.log('\n' + (useColors ? chalk.bold.green('Dependency Analysis & Module Graph:') : 'Dependency Analysis & Module Graph:'));

                let circularIndicator;
                if (stats.dependencies.circularDependencyCount === 0) {
                    circularIndicator = useColors ? chalk.green('Passed ✓ (0 cycles)') : 'Passed ✓ (0 cycles)';
                } else {
                    circularIndicator = useColors ? chalk.red(`Failed ✗ (${stats.dependencies.circularDependencyCount} cycles)`) : `Failed ✗ (${stats.dependencies.circularDependencyCount} cycles)`;
                }

                let unusedIndicator;
                if (stats.dependencies.unusedExportCount === 0) {
                    unusedIndicator = useColors ? chalk.green('Clean ✓ (0 unused)') : 'Clean ✓ (0 unused)';
                } else {
                    unusedIndicator = useColors ? chalk.yellow(`Warning ⚠ (${stats.dependencies.unusedExportCount} unused)`) : `Warning ⚠ (${stats.dependencies.unusedExportCount} unused)`;
                }

                formatTable([
                    { metric: 'Analyzed Modules', value: stats.formatNumber(stats.dependencies.totalFilesAnalyzed) },
                    { metric: 'Circular Dependencies', value: circularIndicator },
                    { metric: 'Unused / Dead Exports', value: unusedIndicator }
                ]);

                if (stats.dependencies.circularDependencies.length > 0) {
                    console.log('\n' + (useColors ? chalk.bold.red('⚠️  Circular Dependency Cycles:') : '⚠️  Circular Dependency Cycles:'));
                    const cycleRows = stats.dependencies.circularDependencies.map((c, i) => ({
                        '#': String(i + 1),
                        'Cycle Chain': c.formattedCycle || c.cycle.join(' -> '),
                        'Hops': String(c.length || c.cycle.length - 1)
                    }));
                    formatTable(cycleRows);
                }

                if (stats.dependencies.unusedExports.length > 0) {
                    console.log('\n' + (useColors ? chalk.bold.yellow('⚠️  Unused / Dead Exports:') : '⚠️  Unused / Dead Exports:'));
                    const displayLimit = 15;
                    const exportsToShow = stats.dependencies.unusedExports.slice(0, displayLimit);
                    const unusedRows = exportsToShow.map(e => ({
                        'File': e.file,
                        'Line': String(e.line),
                        'Export Name': e.exportName
                    }));
                    formatTable(unusedRows);
                    if (stats.dependencies.unusedExports.length > displayLimit) {
                        const remaining = stats.dependencies.unusedExports.length - displayLimit;
                        console.log(useColors
                            ? chalk.dim(`... and ${remaining} more unused export(s)`)
                            : `... and ${remaining} more unused export(s)`);
                    }
                }
            }

            // Add code quality recommendations
            if (stats.typescriptSafety || stats.codeComplexity || stats.dependencies) {
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

                if (stats.dependencies) {
                    if (stats.dependencies.circularDependencyCount > 0) {
                        recommendations.push(useColors
                            ? chalk.red(`• Break ${stats.dependencies.circularDependencyCount} circular dependency cycle(s) to avoid runtime initialization errors and tightly coupled modules`)
                            : `• Break ${stats.dependencies.circularDependencyCount} circular dependency cycle(s) to avoid runtime initialization errors and tightly coupled modules`);
                    }
                    if (stats.dependencies.unusedExportCount > 0) {
                        recommendations.push(useColors
                            ? chalk.yellow(`• Remove or make internal ${stats.dependencies.unusedExportCount} unreferenced export(s) to eliminate dead code and improve tree-shaking`)
                            : `• Remove or make internal ${stats.dependencies.unusedExportCount} unreferenced export(s) to eliminate dead code and improve tree-shaking`);
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

            // Print Baseline Diff & Regression Tracking if available
            if (baselineDiff) {
                console.log('\n' + (useColors ? chalk.bold.cyan('Baseline Comparison & Regression Tracking:') : 'Baseline Comparison & Regression Tracking:'));

                const diffRows = [
                    { metric: 'Type Safety Score', delta: formatDelta(baselineDiff.typeSafetyScoreDelta, true, useColors) },
                    { metric: 'Type Coverage', delta: `${formatDelta(baselineDiff.typeCoverageDelta, true, useColors)}%` },
                    { metric: 'Avg Complexity', delta: formatDelta(baselineDiff.avgComplexityDelta, false, useColors) },
                    { metric: 'Circular Dependencies', delta: formatDelta(baselineDiff.circularDependencyDelta, false, useColors) },
                    { metric: 'Unused / Dead Exports', delta: formatDelta(baselineDiff.unusedExportsDelta, false, useColors) },
                    { metric: 'Duplicate Lines', delta: formatDelta(baselineDiff.duplicateLinesDelta, false, useColors) },
                    { metric: 'Code Lines', delta: formatDelta(baselineDiff.codeLinesDelta, null, useColors) }
                ];
                formatTable(diffRows);

                if (baselineDiff.regressions.length > 0) {
                    console.log('\n' + (useColors ? chalk.bold.red('⚠️  Regressions Detected:') : '⚠️  Regressions Detected:'));
                    for (const reg of baselineDiff.regressions) {
                        console.log(useColors ? chalk.red(`  • ${reg}`) : `  • ${reg}`);
                    }
                }

                if (baselineDiff.improvements.length > 0) {
                    console.log('\n' + (useColors ? chalk.bold.green('✨ Improvements Detected:') : '✨ Improvements Detected:'));
                    for (const imp of baselineDiff.improvements) {
                        console.log(useColors ? chalk.green(`  • ${imp}`) : `  • ${imp}`);
                    }
                }
            }

            // Print Quality Gate Evaluation if available
            if (stats.qualityGateResult) {
                console.log('\n' + (useColors ? chalk.bold.cyan('Quality Gate Evaluation:') : 'Quality Gate Evaluation:'));
                if (stats.qualityGateResult.passed) {
                    console.log(useColors
                        ? chalk.bold.green('✅ QUALITY GATE PASSED: All threshold checks satisfied!')
                        : '✅ QUALITY GATE PASSED: All threshold checks satisfied!');
                } else {
                    console.log(useColors
                        ? chalk.bold.red('❌ QUALITY GATE FAILED: Violations detected:')
                        : '❌ QUALITY GATE FAILED: Violations detected:');

                    const violationRows = stats.qualityGateResult.violations.map(v => ({
                        'Rule': v.rule,
                        'Expected': v.expected,
                        'Actual': v.actual,
                        'Severity': useColors ? chalk.bold.red(v.severity.toUpperCase()) : v.severity.toUpperCase()
                    }));
                    formatTable(violationRows);
                }
            }

            if (options.githubSummary && stats.qualityGateResult) {
                writeGitHubSummary(stats.qualityGateResult, baselineDiff, useColors);
            }

            if (stats.qualityGateResult && !stats.qualityGateResult.passed && isQualityGateRequested) {
                process.exit(1);
            }

        } catch (error) {
            spinner?.fail('Analysis failed');
            console.error(useColors ? chalk.red('Error:') : 'Error:', (error as Error).message);
            process.exit(1);
        }
    });

function formatDelta(delta: number, higherIsBetter: boolean | null, useColors: boolean): string {
    if (delta === 0) {
        return useColors ? chalk.dim('0') : '0';
    }
    const formatted = delta > 0 ? `+${delta}` : `${delta}`;
    if (!useColors || higherIsBetter === null) {
        return formatted;
    }
    if (higherIsBetter) {
        return delta > 0 ? chalk.green(formatted) : chalk.red(formatted);
    } else {
        return delta > 0 ? chalk.red(formatted) : chalk.green(formatted);
    }
}

function writeGitHubSummary(
    qg: any,
    baselineDiff: BaselineDiff | null,
    useColors: boolean
) {
    let summaryContent = qg.summaryMarkdown;
    if (baselineDiff) {
        summaryContent += '\n\n### 📈 Baseline Diff & Regression Tracking\n\n';
        if (baselineDiff.regressions.length > 0) {
            summaryContent += '#### ⚠️ Regressions\n' + baselineDiff.regressions.map(r => `- ${r}`).join('\n') + '\n\n';
        }
        if (baselineDiff.improvements.length > 0) {
            summaryContent += '#### ✨ Improvements\n' + baselineDiff.improvements.map(i => `- ${i}`).join('\n') + '\n\n';
        }
        if (baselineDiff.regressions.length === 0 && baselineDiff.improvements.length === 0) {
            summaryContent += '> No regressions or improvements detected compared to baseline.\n\n';
        }
    }

    if (process.env.GITHUB_STEP_SUMMARY) {
        try {
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryContent + '\n\n');
            console.log(useColors ? chalk.green('GitHub step summary written to $GITHUB_STEP_SUMMARY') : 'GitHub step summary written to $GITHUB_STEP_SUMMARY');
        } catch (err) {
            console.warn(useColors ? chalk.yellow(`Warning: Could not write to $GITHUB_STEP_SUMMARY: ${(err as Error).message}`) : `Warning: Could not write to $GITHUB_STEP_SUMMARY: ${(err as Error).message}`);
        }
    } else {
        const summaryPath = path.resolve(process.cwd(), 'github-summary.md');
        fs.writeFileSync(summaryPath, summaryContent);
        console.log(useColors ? chalk.green(`GitHub step summary written to ${summaryPath}`) : `GitHub step summary written to ${summaryPath}`);
    }

    if (!qg.passed) {
        for (const v of qg.violations) {
            console.log(`::error title=Quality Gate Violation::Rule ${v.rule} failed: expected ${v.expected}, got ${v.actual}`);
        }
    }
}

program.parse();