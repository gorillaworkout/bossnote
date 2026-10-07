import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const retranscribe = readFileSync(join(root, 'src/app/api/tasks/[id]/retranscribe/route.ts'), 'utf8');

describe('assignment routes', () => {
  it('keeps retranscribe hints inside the creator candidate set', () => {
    assert.match(retranscribe, /candidateListQuery/);
    assert.match(retranscribe, /isValidAssignmentPair/);
    assert.doesNotMatch(retranscribe, /FROM users ORDER BY name/);
  });
});
