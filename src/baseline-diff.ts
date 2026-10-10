import type { ProjectStats } from './index.js';

export interface BaselineDiff {
    typeSafetyScoreDelta: number; // e.g. +2.5 or -3.0
    typeCoverageDelta: number;
    avgComplexityDelta: number;
    circularDependencyDelta: number;
    unusedExportsDelta: number;
    duplicateLinesDelta: number;
    codeLinesDelta: number;
    regressions: string[];
    improvements: string[];
}

export function compareWithBaseline(
    current: ProjectStats,
    baseline: Partial<ProjectStats> = {}
): BaselineDiff {
    const regressions: string[] = [];
    const improvements: string[] = [];

    // 1. typeSafetyScoreDelta (higher is better)
    const currentSafetyScore = current.typescriptSafety?.avgTypeSafetyScore;
    const baselineSafetyScore = baseline.typescriptSafety?.avgTypeSafetyScore;
    let typeSafetyScoreDelta = 0;
    if (currentSafetyScore !== undefined && baselineSafetyScore !== undefined) {
        typeSafetyScoreDelta = Number((currentSafetyScore - baselineSafetyScore).toFixed(2));
        if (typeSafetyScoreDelta < 0) {
            regressions.push(
                `Type Safety Score decreased by ${Math.abs(typeSafetyScoreDelta)} (from ${baselineSafetyScore} to ${currentSafetyScore})`
            );
        } else if (typeSafetyScoreDelta > 0) {
            improvements.push(
                `Type Safety Score increased by ${typeSafetyScoreDelta} (from ${baselineSafetyScore} to ${currentSafetyScore})`
            );
        }
    }

    // 2. typeCoverageDelta (higher is better)
    const currentCov = current.typescriptSafety
        ? parseFloat(current.typescriptSafety.avgTypeCoverage)
        : undefined;
    const baselineCov = baseline.typescriptSafety?.avgTypeCoverage !== undefined
        ? parseFloat(String(baseline.typescriptSafety.avgTypeCoverage))
        : undefined;
    let typeCoverageDelta = 0;
    if (currentCov !== undefined && baselineCov !== undefined) {
        typeCoverageDelta = Number((currentCov - baselineCov).toFixed(2));
        if (typeCoverageDelta < 0) {
            regressions.push(
                `Type Coverage decreased by ${Math.abs(typeCoverageDelta)}% (from ${baselineCov}% to ${currentCov}%)`
            );
        } else if (typeCoverageDelta > 0) {
            improvements.push(
                `Type Coverage increased by ${typeCoverageDelta}% (from ${baselineCov}% to ${currentCov}%)`
            );
        }
    }

    // 3. avgComplexityDelta (lower is better)
    const currentComp = current.codeComplexity
        ? parseFloat(current.codeComplexity.avgComplexity)
        : undefined;
    const baselineComp = baseline.codeComplexity?.avgComplexity !== undefined
        ? parseFloat(String(baseline.codeComplexity.avgComplexity))
        : undefined;
    let avgComplexityDelta = 0;
    if (currentComp !== undefined && baselineComp !== undefined) {
        avgComplexityDelta = Number((currentComp - baselineComp).toFixed(2));
        if (avgComplexityDelta > 0) {
            regressions.push(
                `Average Complexity increased by ${avgComplexityDelta} (from ${baselineComp} to ${currentComp})`
            );
        } else if (avgComplexityDelta < 0) {
            improvements.push(
                `Average Complexity decreased by ${Math.abs(avgComplexityDelta)} (from ${baselineComp} to ${currentComp})`
            );
        }
    }

    // 4. circularDependencyDelta (lower is better)
    const currentCirc = current.dependencies?.circularDependencyCount;
    const baselineCirc = baseline.dependencies?.circularDependencyCount;
    let circularDependencyDelta = 0;
    if (currentCirc !== undefined && baselineCirc !== undefined) {
        circularDependencyDelta = currentCirc - baselineCirc;
        if (circularDependencyDelta > 0) {
            regressions.push(
                `Circular Dependencies increased by ${circularDependencyDelta} (from ${baselineCirc} to ${currentCirc})`
            );
        } else if (circularDependencyDelta < 0) {
            improvements.push(
                `Circular Dependencies decreased by ${Math.abs(circularDependencyDelta)} (from ${baselineCirc} to ${currentCirc})`
            );
        }
    }

    // 5. unusedExportsDelta (lower is better)
    const currentUnused = current.dependencies?.unusedExportCount;
    const baselineUnused = baseline.dependencies?.unusedExportCount;
    let unusedExportsDelta = 0;
    if (currentUnused !== undefined && baselineUnused !== undefined) {
        unusedExportsDelta = currentUnused - baselineUnused;
        if (unusedExportsDelta > 0) {
            regressions.push(
                `Unused Exports increased by ${unusedExportsDelta} (from ${baselineUnused} to ${currentUnused})`
            );
        } else if (unusedExportsDelta < 0) {
            improvements.push(
                `Unused Exports decreased by ${Math.abs(unusedExportsDelta)} (from ${baselineUnused} to ${currentUnused})`
            );
        }
    }

    // 6. duplicateLinesDelta (lower is better)
    const currentDup = current.codeComplexity?.duplicateCode?.totalDuplicateLines;
    const baselineDup = baseline.codeComplexity?.duplicateCode?.totalDuplicateLines;
    let duplicateLinesDelta = 0;
    if (currentDup !== undefined && baselineDup !== undefined) {
        duplicateLinesDelta = currentDup - baselineDup;
        if (duplicateLinesDelta > 0) {
            regressions.push(
                `Duplicate Lines increased by ${duplicateLinesDelta} (from ${baselineDup} to ${currentDup})`
            );
        } else if (duplicateLinesDelta < 0) {
            improvements.push(
                `Duplicate Lines decreased by ${Math.abs(duplicateLinesDelta)} (from ${baselineDup} to ${currentDup})`
            );
        }
    }

    // 7. codeLinesDelta
    const currentCodeLines = current.codeLines;
    const baselineCodeLines = baseline.codeLines;
    let codeLinesDelta = 0;
    if (currentCodeLines !== undefined && baselineCodeLines !== undefined) {
        codeLinesDelta = currentCodeLines - baselineCodeLines;
    }

    return {
        typeSafetyScoreDelta,
        typeCoverageDelta,
        avgComplexityDelta,
        circularDependencyDelta,
        unusedExportsDelta,
        duplicateLinesDelta,
        codeLinesDelta,
        regressions,
        improvements
    };
}
