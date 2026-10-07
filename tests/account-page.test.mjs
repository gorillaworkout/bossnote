import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const page = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src/app/dashboard/account/page.tsx'),
  'utf8',
);

describe('account page', () => {
  it('keeps own-password change and hides admin reset and voice model', () => {
    assert.equal(page.includes("Reset a user's password"), false);
    assert.equal(page.includes('Reset a user'), false);
    assert.equal(
      /\/api\/auth\/password[\s\S]{0,120}method:\s*'POST'|method:\s*'POST'[\s\S]{0,120}\/api\/auth\/password/.test(page),
      false,
    );
    const voiceAt = page.indexOf('>Voice model<');
    const gateAt = page.lastIndexOf("me.role !== 'admin'", voiceAt === -1 ? page.length : voiceAt);
    assert.ok(voiceAt !== -1 && gateAt !== -1 && gateAt < voiceAt, 'voice model is wrapped in me.role !== \'admin\'');
    assert.match(page, /Change your password/);
    assert.match(page, /method:\s*'PUT'/);
  });
});
