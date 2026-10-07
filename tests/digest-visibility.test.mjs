import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('digest visibility wiring', () => {
  it('filters member digests with the shared visibility predicate', () => {
    for (const rel of ['src/lib/push.ts', 'scripts/daily-task-notify.mjs']) {
      const source = readFileSync(join(root, rel), 'utf8');
      assert.match(source, /visibleDigestTasks/, rel);
      assert.match(source, /creator_role/, rel);
    }
  });
});
