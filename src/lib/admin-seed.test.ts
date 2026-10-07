import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEFAULT_AUDIO_MODEL } from './ai.ts';
import { ADMIN_USER_ID } from './roles.ts';
import {
  ADMIN_SETTINGS_MODEL,
  adminPasswordError,
  deriveLoginEmail,
  normalizeAdminName,
} from './admin-seed.ts';

describe('admin seed rules', () => {
  it('requires a password of at least 6 characters and does not invent one', () => {
    assert.equal(adminPasswordError(undefined), 'ADMIN_PASSWORD is required');
    assert.equal(adminPasswordError(''), 'ADMIN_PASSWORD is required');
    assert.equal(adminPasswordError('short'), 'ADMIN_PASSWORD must be at least 6 characters');
    assert.equal(adminPasswordError('longenough'), null);
  });

  it('defaults the name to Admin and derives admin@bossnote.id', () => {
    assert.equal(normalizeAdminName(undefined), 'Admin');
    assert.equal(normalizeAdminName('  '), 'Admin');
    assert.equal(normalizeAdminName('Ada'), 'Ada');
    assert.equal(deriveLoginEmail('Admin', false), 'admin@bossnote.id');
    assert.match(deriveLoginEmail('Admin', true, 36), /^admin-[a-z0-9]+@bossnote\.id$/);
    assert.equal(ADMIN_SETTINGS_MODEL, DEFAULT_AUDIO_MODEL);
    assert.equal(ADMIN_USER_ID, 'admin-001');
  });
});

describe('seed script source', () => {
  const script = readFileSync(new URL('../../scripts/seed-admin.mjs', import.meta.url), 'utf8');
  const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');

  it('upserts admin-001 from the environment and never prints the password', () => {
    assert.match(script, /adminPasswordError/);
    assert.match(script, /ADMIN_USER_ID/);
    assert.match(script, /ON CONFLICT \(id\) DO UPDATE/);
    assert.match(script, /department_id = NULL/);
    assert.match(script, /role = 'admin'/);
    assert.equal(script.includes('console.log') && script.includes('ADMIN_PASSWORD'), false);
    assert.equal(/\$2[aby]\$/.test(script), false);
  });

  it('lists the admin env vars empty', () => {
    assert.match(example, /^ADMIN_NAME=$/m);
    assert.match(example, /^ADMIN_PASSWORD=$/m);
    assert.equal(/\$2[aby]\$/.test(example), false);
  });
});
