import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Lark auth routes', () => {
  const start = read('src/app/api/auth/lark/start/route.ts');
  const callback = read('src/app/api/auth/lark/callback/route.ts');
  const login = read('src/app/api/auth/login/route.ts');
  const form = read('src/components/LoginForm.tsx');
  const page = read('src/app/page.tsx');
  const tasks = read('src/app/api/tasks/route.ts');
  const users = read('src/app/api/admin/users/route.ts');
  const item = read('src/app/api/admin/users/[id]/route.ts');
  const board = read('src/components/TaskBoard.tsx');
  const manage = read('src/app/dashboard/users/page.tsx');
  const auth = read('src/lib/auth.ts');

  it('keeps password login and adds the Lark redirect routes', () => {
    assert.match(login, /export async function POST/);
    assert.match(login, /Invalid username or password/);
    assert.match(auth, /LOWER\(name\) = LOWER\(\?\)/);
    assert.match(auth, /passwordMatches/);
    assert.match(start, /force-dynamic/);
    assert.match(callback, /force-dynamic/);
    assert.match(start, /export async function GET/);
    assert.match(callback, /export async function GET/);
    assert.doesNotMatch(start, /export async function POST/);
    assert.doesNotMatch(callback, /export async function POST/);
    assert.match(start, /beginLarkLogin/);
    assert.match(start, /larkOauthCookieOptions/);
    assert.match(callback, /runLarkCallback/);
    assert.match(callback, /clearLarkOauthCookieOptions/);
    assert.match(callback, /result\.user\.role !== 'admin'/);
    assert.match(callback, /setSessionCookie/);
    assert.doesNotMatch(`${start}\n${callback}`, /getTenantToken/);
    assert.doesNotMatch(`${start}\n${callback}`, /offline_access/);
    assert.match(form, /href="\/api\/auth\/lark\/start"/);
    assert.match(form, /Login with Lark/);
    assert.match(form, />\s*or\s*</);
    assert.match(form, /larkLoginErrorSentence/);
    assert.doesNotMatch(form, /\{larkError\}/);
    assert.match(page, /lark_error/);
    assert.match(page, /<LoginForm/);
  });

  it('blocks create for a member with no department and shows Lark users to the admin', () => {
    assert.match(tasks, /noAssigneeAvailableMessage\(user\.role, null\)/);
    assert.match(read('src/lib/assignment.ts'), /An admin must assign your department before you can create tasks\./);
    assert.match(tasks, /creatorDepartmentId: user\.department_id/);
    assert.match(board, /An admin has not assigned your department yet/);
    assert.match(users, /u\.auth_provider/);
    assert.match(users, /u\.lark_email/);
    assert.match(users, /auth_provider = 'password'|VALUES \(\?, \?, \?, \?, \?, \?, 'password'\)/);
    assert.match(item, /resolveLarkOpenIdChange/);
    assert.match(item, /auth_provider/);
    assert.doesNotMatch(item, /SET auth_provider/);
    assert.match(manage, /People who use Login with Lark appear here/);
    assert.match(manage, />Lark</);
    assert.match(manage, /No department/);
    assert.match(manage, /A boss account needs a department\./);
    assert.match(manage, /This account cannot sign in with Lark\./);
    assert.match(manage, /readOnly=\{editing\.auth_provider === 'lark'\}/);
  });
});
