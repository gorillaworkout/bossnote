import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const auth = readFileSync(join(root, 'src/lib/auth.ts'), 'utf8');
const me = readFileSync(join(root, 'src/app/api/auth/me/route.ts'), 'utf8');

describe('database session', () => {
  it('reloads role and department_id for the token user id', () => {
    assert.match(auth, /SELECT id, email, name, role, department_id FROM users WHERE id = \?/);
    assert.match(auth, /SELECT id, email, name, password_hash, role, department_id FROM users WHERE LOWER\(name\) = LOWER\(\?\)/);
    assert.match(auth, /toSessionUser/);
    assert.match(me, /refreshSessionCookie\(response, user\)/);
  });
});
