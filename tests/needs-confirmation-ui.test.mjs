import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = readFileSync(join(root, 'src/app/dashboard/page.tsx'), 'utf8');

describe('needs confirmation badge', () => {
  it('makes the header question count open one task or filter several', () => {
    assert.match(dashboard, /confirmationAction/);
    assert.match(dashboard, /needsConfirmation/);
    assert.match(dashboard, /unansweredCount\(task\)/);
    assert.match(dashboard, /onClick=\{showNeedsConfirmation\}/);
    assert.match(dashboard, /aria-pressed=\{needsConfirmationOnly\}/);
    assert.match(dashboard, /\{pendingCount\} question/);
    assert.match(dashboard, /Needs confirmation/);
    assert.match(dashboard, /setNeedsConfirmationOnly\(false\)/);
    assert.doesNotMatch(dashboard, /<span className="px-2 py-0\.5 bg-\[var\(--warning-soft\)\]/);
  });
});
