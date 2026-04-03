import { ProjectStats } from './index.js';
import process from 'process';
import path from 'path';

export function generateHtmlReport(stats: ProjectStats): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ts-analyzer Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa; color: #212529; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e9ecef; }
        h1, h2, h3 { color: #343a40; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #dee2e6; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .card h3 { margin-top: 0; margin-bottom: 10px; font-size: 15px; color: #6c757d; text-transform: uppercase; letter-spacing: 0.5px; }
        .card .value { font-size: 32px; font-weight: bold; color: #007bff; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #dee2e6; }
        th { background-color: #f8f9fa; font-weight: 600; color: #495057; }
        tr:hover { background-color: #f8f9fa; }
        .progress-bar { width: 100%; background-color: #e9ecef; border-radius: 4px; height: 24px; overflow: hidden; margin-top: 10px; }
        .progress { height: 100%; background-color: #28a745; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold; }
        .progress.warning { background-color: #ffc107; color: #212529; }
        .progress.danger { background-color: #dc3545; }
        .footer { margin-top: 40px; text-align: center; color: #6c757d; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f8f9fa; padding-bottom: 20px; margin-bottom: 30px;">
            <h1 style="margin: 0;">TS Analyzer Report</h1>
            <div style="color: #6c757d;">Generated: ${new Date().toLocaleString()}</div>
        </div>

        <h2>Project Summary</h2>
        <div class="grid">
            <div class="card">
                <h3>Total Files</h3>
                <div class="value">${stats.formatNumber(stats.files)}</div>
            </div>
            <div class="card">
                <h3>Total Lines</h3>
                <div class="value">${stats.formatNumber(stats.totalLines)}</div>
            </div>
            <div class="card">
                <h3>Code Lines</h3>
                <div class="value" style="color: #28a745">${stats.formatNumber(stats.codeLines)}</div>
            </div>
            <div class="card">
                <h3>Comment Lines</h3>
                <div class="value" style="color: #6c757d">${stats.formatNumber(stats.commentLines)}</div>
            </div>
        </div>

        <h2>Files by Type</h2>
        <table>
            <thead>
                <tr>
                    <th>Extension</th>
                    <th>Files</th>
                    <th>Total Lines</th>
                    <th>Code Lines</th>
                    <th>% of Codebase</th>
                </tr>
            </thead>
            <tbody>
                ${stats.formattedFileTypes?.map(type => `
                    <tr>
                        <td><strong>${type['Extension']}</strong></td>
                        <td>${type['Files']}</td>
                        <td>${type['Total Lines']}</td>
                        <td>${type['Code Lines']}</td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="flex-grow: 1; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                                    <div style="height: 100%; width: ${type['% of Codebase']}; background: #007bff;"></div>
                                </div>
                                <span style="font-size: 14px; width: 50px;">${type['% of Codebase']}</span>
                            </div>
                        </td>
                    </tr>
                `).join('') || ''}
            </tbody>
        </table>

        ${stats.typescriptSafety ? `
            <h2>TypeScript Safety</h2>
            <div class="grid">
                <div class="card">
                    <h3>Type Coverage</h3>
                    <div class="value">${stats.typescriptSafety.avgTypeCoverage}%</div>
                    <div class="progress-bar">
                        <div class="progress ${parseFloat(stats.typescriptSafety.avgTypeCoverage) < 80 ? 'warning' : ''}" style="width: ${stats.typescriptSafety.avgTypeCoverage}%"></div>
                    </div>
                </div>
                <div class="card">
                    <h3>Type Safety Score</h3>
                    <div class="value">${stats.typescriptSafety.avgTypeSafetyScore} <span style="font-size: 16px; color: #6c757d">/ 100</span></div>
                    <div class="progress-bar">
                        <div class="progress ${stats.typescriptSafety.avgTypeSafetyScore < 80 ? 'warning' : ''}" style="width: ${stats.typescriptSafety.avgTypeSafetyScore}%"></div>
                    </div>
                </div>
                <div class="card">
                    <h3>'any' Type Usage</h3>
                    <div class="value" style="color: ${stats.typescriptSafety.totalAnyCount > 10 ? '#dc3545' : '#28a745'}">${stats.formatNumber(stats.typescriptSafety.totalAnyCount)}</div>
                </div>
            </div>
        ` : ''}

        ${stats.codeComplexity ? `
            <h2>Code Complexity</h2>
            <div class="grid">
                <div class="card">
                    <h3>Average Complexity</h3>
                    <div class="value" style="color: ${parseFloat(stats.codeComplexity.avgComplexity) > 5 ? '#ffc107' : '#28a745'}">${stats.codeComplexity.avgComplexity}</div>
                </div>
                <div class="card">
                    <h3>Max Complexity</h3>
                    <div class="value" style="color: ${stats.codeComplexity.maxComplexity > 15 ? '#dc3545' : '#28a745'}">${stats.formatNumber(stats.codeComplexity.maxComplexity)}</div>
                </div>
                <div class="card">
                    <h3>Complex Files</h3>
                    <div class="value" style="color: ${stats.codeComplexity.complexFiles > 0 ? '#dc3545' : '#28a745'}">${stats.formatNumber(stats.codeComplexity.complexFiles)}</div>
                </div>
            </div>

            <h2>Anti-Patterns & Code Smells</h2>
            <div class="grid">
                <div class="card">
                    <h3>Callback Hell</h3>
                    <div class="value" style="color: ${stats.codeComplexity.codeSmells.callbackHell > 0 ? '#dc3545' : '#28a745'}">${stats.formatNumber(stats.codeComplexity.codeSmells.callbackHell)}</div>
                </div>
                <div class="card">
                    <h3>God Files (> 500 lines)</h3>
                    <div class="value" style="color: ${stats.codeComplexity.codeSmells.godFiles > 0 ? '#dc3545' : '#28a745'}">${stats.formatNumber(stats.codeComplexity.codeSmells.godFiles)}</div>
                </div>
                <div class="card">
                    <h3>Excessive Params (> 4)</h3>
                    <div class="value" style="color: ${stats.codeComplexity.codeSmells.excessiveParameters > 0 ? '#dc3545' : '#28a745'}">${stats.formatNumber(stats.codeComplexity.codeSmells.excessiveParameters)}</div>
                </div>
                <div class="card">
                    <h3>Magic Numbers</h3>
                    <div class="value" style="color: ${stats.codeComplexity.codeSmells.magicNumbers > 0 ? '#ffc107' : '#28a745'}">${stats.formatNumber(stats.codeComplexity.codeSmells.magicNumbers)}</div>
                </div>
            </div>
        ` : ''}

        <div class="footer">
            Generated by ts-analyzer &bull; A comprehensive TypeScript code analyzer
        </div>
    </div>
</body>
</html>
    `;
}
