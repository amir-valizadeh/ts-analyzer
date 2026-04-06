import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { countLines } from '../src/index.js';
import fs from 'fs/promises';
import path from 'path';

describe('countLines', () => {
  const testFilePath = path.join(process.cwd(), 'temp_test_file.ts');

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  });

  it('should correctly count lines in a simple file', async () => {
    const content = `// Line 1: Comment
import { x } from 'y';

/* Line 4: Block comment
   Line 5: Still block comment */

const a = 1;

// Line 9: Comment
const b = 2;
`;
    await fs.writeFile(testFilePath, content);

    const stats = await countLines(testFilePath);

    expect(stats.total).toBe(11);
    expect(stats.empty).toBe(4);
    expect(stats.comments).toBe(3);
    expect(stats.code).toBe(4);
  });

  it('should handle empty files', async () => {
    await fs.writeFile(testFilePath, '');
    const stats = await countLines(testFilePath);
    expect(stats.total).toBe(1); // fs.readFile('...') on empty string often gives 1 line array [""]
    expect(stats.code).toBe(0);
  });

  it('should handle reading errors gracefully', async () => {
    const stats = await countLines('/invalid/path/that/does/not/exist.ts');
    expect(stats.total).toBe(0);
    expect(stats.code).toBe(0);
  });
});
