import { describe, it, expect } from 'vitest';
import { detectCycles, type CircularDependencyCycle } from '../src/dependency-analysis.js';

/** The previous implementation: DFS over every simple path from every node (exponential). */
function referenceCycles(
    graph: Record<string, string[]>,
    runtimeEdges: Set<string>
): CircularDependencyCycle[] {
    const cycles: CircularDependencyCycle[] = [];
    const seenKeys = new Set<string>();
    const nodes = Object.keys(graph).sort();
    const currentPath: string[] = [];
    const visitedInPath = new Set<string>();
    function dfs(node: string, depth: number): void {
        if (depth > 50 || cycles.length >= 500) return;
        for (const neighbor of graph[node] || []) {
            if (visitedInPath.has(neighbor)) {
                const start = currentPath.indexOf(neighbor);
                if (start === -1) continue;
                const unique = currentPath.slice(start);
                let minIdx = 0;
                for (let i = 1; i < unique.length; i++) if (unique[i] < unique[minIdx]) minIdx = i;
                const rotated = [...unique.slice(minIdx), ...unique.slice(0, minIdx)];
                const cycle = [...rotated, rotated[0]];
                const key = cycle.join(' -> ');
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                let isTypeOnly = false;
                for (let i = 0; i < cycle.length - 1; i++) {
                    if (!runtimeEdges.has(`${cycle[i]}\0${cycle[i + 1]}`)) {
                        isTypeOnly = true;
                        break;
                    }
                }
                cycles.push({ cycle, formattedCycle: key, length: cycle.length - 1, isTypeOnly });
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
    return cycles;
}

/** Small deterministic PRNG so failures are reproducible. */
function lcg(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
}

function byKey(cycles: CircularDependencyCycle[]): Map<string, boolean | undefined> {
    return new Map(cycles.map(c => [c.cycle.join(' -> '), c.isTypeOnly]));
}

describe('detectCycles', () => {
    it('finds the same cycles as an exhaustive DFS on random graphs', () => {
        const random = lcg(1);
        let compared = 0;
        for (let trial = 0; trial < 2000; trial++) {
            const size = 1 + Math.floor(random() * 8);
            const density = random() * 0.6;
            const graph: Record<string, string[]> = {};
            const runtimeEdges = new Set<string>();
            for (let i = 0; i < size; i++) {
                graph[`f${i}.ts`] = [];
                for (let j = 0; j < size; j++) {
                    if (random() < density) {
                        graph[`f${i}.ts`].push(`f${j}.ts`);
                        if (random() < 0.7) runtimeEdges.add(`f${i}.ts\0f${j}.ts`);
                    }
                }
            }
            const expected = referenceCycles(graph, runtimeEdges);
            // The cap makes the reference keep an arbitrary subset; compare only uncapped graphs.
            if (expected.length >= 500) continue;
            compared++;
            expect(byKey(detectCycles(graph, runtimeEdges))).toEqual(byKey(expected));
        }
        expect(compared).toBeGreaterThan(1900);
    });

    it('is fast on graphs with many paths but few cycles', () => {
        // 16 layers of 3 files, each importing every file of the next layer (3^15 paths from each
        // first-layer file), with the last layer importing a separate two-file cycle. The previous
        // DFS walked every one of those paths (about 3 s at 14 layers, growing 9x per 2 layers);
        // the only cycle is z_a <-> z_b.
        const graph: Record<string, string[]> = {};
        const layers = 16;
        const width = 3;
        for (let layer = 0; layer < layers; layer++) {
            for (let i = 0; i < width; i++) {
                const name = `l${String(layer).padStart(2, '0')}_${i}.ts`;
                graph[name] =
                    layer + 1 < layers
                        ? Array.from({ length: width }, (_, j) => `l${String(layer + 1).padStart(2, '0')}_${j}.ts`)
                        : ['z_a.ts'];
            }
        }
        graph['z_a.ts'] = ['z_b.ts'];
        graph['z_b.ts'] = ['z_a.ts'];

        const startedAt = Date.now();
        const cycles = detectCycles(graph, new Set());
        expect(Date.now() - startedAt).toBeLessThan(1000);
        expect(cycles.map(c => c.formattedCycle)).toEqual(['z_a.ts -> z_b.ts -> z_a.ts']);
    });

    it('reports self-imports, rotates to the smallest file and sorts deterministically', () => {
        const graph = {
            'c.ts': ['a.ts', 'c.ts'],
            'a.ts': ['b.ts'],
            'b.ts': ['c.ts', 'a.ts']
        };
        expect(detectCycles(graph, new Set()).map(c => c.formattedCycle)).toEqual([
            'a.ts -> b.ts -> a.ts',
            'a.ts -> b.ts -> c.ts -> a.ts',
            'c.ts -> c.ts'
        ]);
    });

    it('marks a cycle type-only when any of its imports is type-only', () => {
        const graph = { 'a.ts': ['b.ts'], 'b.ts': ['a.ts'] };
        expect(detectCycles(graph, new Set(['a.ts\0b.ts', 'b.ts\0a.ts']))[0].isTypeOnly).toBe(false);
        expect(detectCycles(graph, new Set(['a.ts\0b.ts']))[0].isTypeOnly).toBe(true);
    });

    it('stops at 500 cycles', () => {
        const graph: Record<string, string[]> = {};
        const names = Array.from({ length: 8 }, (_, i) => `f${i}.ts`);
        for (const name of names) graph[name] = names.filter(other => other !== name);
        expect(detectCycles(graph, new Set())).toHaveLength(500);
    });
});
