# Admin, Departments, and Task Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one admin account and departments so only that admin manages people, bosses and staff in the same department assign work to each other, and bosses still see every task.

**Architecture:** Department membership lives only on `users.department_id` (Approach A). Tasks keep `created_by` and `assignee_id` and do not gain a department column. Every request reloads `role` and `department_id` from `users`. One pure pair rule and one pure visibility predicate are shared by create, reassign, lists, task routes, and the daily digest. The admin has no board: `/dashboard` redirects them to Manage Departments, and task APIs return 403.

**Tech Stack:** Next.js 16 App Router route handlers, React 19 client pages, PostgreSQL migrations, `bcryptjs`, JWT cookie `bn_token` via `jose`, Node `node:test` with `node --experimental-strip-types`.

## Global Constraints

- One admin user, id `admin-001`. The Manage Users form cannot create another admin, and no screen can change a boss or member into admin.
- `toSessionUser` accepts `admin`, `boss`, and `member`. Any other role fails closed.
- `admin` has `department_id` NULL. `boss` and `member` have `department_id` NOT NULL.
- Bayu (`bayu-001`) remains `member`. Do not promote Ian (`boss-001`), Prista (`prista-001`), Bayu, or Sandra (`sandra-001`).
- Login stays name plus password on `/`. Case-insensitive unique `users.name`. bcrypt password. `bn_token` httpOnly cookie. 90-day JWT. The JWT identifies the user. Email is not used for login.
- Password minimum is 6 characters. Person names are required and max 60 characters. Department names are trimmed, 1–60 characters, unique case-insensitively.
- Seed department id `dept-general`, name `General`. Every existing `boss` and `member` gets that department inside `migrations/011_departments.sql`.
- `migrations/011_departments.sql` and the repo contain no `admin-001` password and no admin bcrypt hash. `ADMIN_PASSWORD` is read at seed time on the server. `ADMIN_NAME` is optional and defaults to `Admin`. Email for that default name is `admin@bossnote.id`.
- Assignment is allowed only for a boss and a member who share one non-null `department_id`, with two different ids. Cross-department assignment is rejected.
- Bosses see every task. A member sees a task only when they are one party and the other party is a boss in their current department. Admin sees no tasks (403, not an empty 200).
- Header labels: Admin, Boss, or Team. Picker labels stay `Name (Boss)` and `Name (Staff)`.
- Delete of a department that still has users is 409 and tells the admin to move those users first. `ON DELETE RESTRICT` is the backstop. Deleting `dept-general` is allowed once it has no users.
- The old “cannot demote or delete the last boss” rule goes away.
- `POST /api/auth/password` is admin-only. `PUT /api/auth/password` stays available to every role and still requires the current password.
- Unknown assignee id: 400 `Assignee not found`. Known user, invalid pair: 400 code `assignee_not_allowed`, message `That assignee is not allowed.` Empty candidate set: 400 code `no_assignee_available`. Member message: `No boss in your department can take this task.` Boss message: `No staff in your department to assign.` Voice miss stays 400 code `assignee_required` and the current “Pick an assignee” error.
- A missing task is 404. A task that exists and the caller cannot view is 403. Delete stays boss-only.
- SSE stays a content-free `tasks` wake-up. Admin cannot open the stream. Lark stays one company group plus a DM to the assignee. Image limit, status values (`todo`, `in_progress`, `waiting`, `done`), and the six-month done-task cleanup stay as they are.
- Do not build the deferred open questions: cross-department assign, department stored on the task, boss visibility shrunk to one department, or a Lark channel per department.

This plan is one document because the migration, session shape, pair rule, and visibility predicate are shared. A later task does not boot a working slice without those.

---

## File map

| File | Responsibility |
| --- | --- |
| Create: `migrations/011_departments.sql` | `departments` table, `dept-general`, `users.department_id`, role and row checks, indexes. No admin row. |
| Create: `src/lib/roles.ts` | `admin` / `boss` / `member`, `admin-001`, fail-closed role check. |
| Create: `src/lib/admin-seed.ts` | Password, name, and email rules for the admin seed. |
| Create: `scripts/seed-admin.mjs` | Upsert `admin-001` from `ADMIN_PASSWORD` / `ADMIN_NAME`. |
| Create: `.env.example` | Empty `ADMIN_NAME` and `ADMIN_PASSWORD`. No real secret. |
| Create: `src/lib/managed-user.ts` | Department name rules and admin user create/update/delete decisions. |
| Create: `src/lib/assignment.ts` | Pair rule, candidate query, create and reassign decisions. |
| Create: `src/lib/home-path.ts` | `/dashboard/departments` for admin, `/dashboard` for boss and member. |
| Create: `src/app/api/admin/departments/route.ts` | List and create departments. |
| Create: `src/app/api/admin/departments/[id]/route.ts` | Rename and delete a department. |
| Create: `src/app/api/tasks/[id]/assignees/route.ts` | Reassign candidates for one task. |
| Create: `src/app/dashboard/departments/layout.tsx` | Admin-only gate. |
| Create: `src/app/dashboard/departments/page.tsx` | Manage Departments. |
| Create: `src/components/TaskBoard.tsx` | Current board client, moved off `page.tsx`, with filtered pickers. |
| Modify: `src/lib/session.ts` | `SessionUser.department_id`. Unknown roles return null. |
| Modify: `src/lib/auth.ts` | Login and `getSession` load the database row. |
| Modify: `src/lib/task-access.ts` | Member/boss/admin visibility. |
| Modify: `src/lib/task-list-scope.ts` | Member list SQL uses the visibility predicate. Boss cards get the assignee department name. |
| Modify: `src/lib/task-gallery.ts` | Image rows include creator and assignee role and department. |
| Modify: `src/lib/push-digest.ts` | Digest filter for the assignee. |
| Modify: `src/lib/push.ts` | Daily digest query joins parties and filters. |
| Modify: `scripts/daily-task-notify.mjs` | Same digest filter. |
| Modify: `src/app/api/admin/users/route.ts` | Gate is admin. Create requires a department. Role is boss or member only. |
| Modify: `src/app/api/admin/users/[id]/route.ts` | Department edits. No last-boss rule. Cannot delete `admin-001`. |
| Modify: `src/app/api/auth/password/route.ts` | Reset is admin-only. |
| Modify: `src/app/api/auth/me/route.ts` | Returns the database user (role and `department_id`) and refreshes the cookie. |
| Modify: `src/app/api/users/route.ts` | Create candidates, or the boss directory. |
| Modify: `src/app/api/tasks/route.ts` | Admin 403. Create assignee must be in the candidate set. |
| Modify: `src/app/api/tasks/[id]/route.ts` | View check on status. Pair check on reassign. Delete 404 then 403. |
| Modify: `src/app/api/tasks/[id]/reply/route.ts` | Visibility predicate. |
| Modify: `src/app/api/tasks/[id]/retranscribe/route.ts` | Visibility predicate. Hint stays inside the creator’s candidates. |
| Modify: `src/app/api/tasks/[id]/image/route.ts` | Visibility uses party columns. |
| Modify: `src/app/api/tasks/[id]/image/[index]/route.ts` | Same. |
| Modify: `src/app/api/tasks/events/route.ts` | Admin 403. |
| Modify: `src/app/page.tsx` | Signed-in admin goes to Manage Departments. |
| Modify: `src/components/LoginForm.tsx` | Login response `role` picks the home path. |
| Modify: `src/components/DashboardHeader.tsx` | Admin, boss, and member nav. |
| Modify: `src/app/dashboard/page.tsx` | Server redirect. Admin never renders the board. |
| Modify: `src/app/dashboard/users/layout.tsx` | Admin-only. Boss and member go to `/dashboard`. |
| Modify: `src/app/dashboard/users/page.tsx` | Department select, admin row limits, reset stays here. |
| Modify: `src/app/dashboard/account/page.tsx` | Own password for every role. Voice model for boss and member. No reset block. |
| Modify: `src/lib/auth-session.test.ts` | Fail-closed roles and `department_id`. |
| Modify: `src/lib/task-list-scope.test.ts` | Member SQL expectations. |
| Modify: `src/lib/task-image.test.ts` | `canViewTask` party examples. |
| Modify: `src/lib/push-digest.test.ts` | Member digest omits a hidden task. |
| Modify: `tests/boss-view.test.mjs` | New member predicate strings. |
| Modify: `tests/voice-create-ui.test.mjs` | Create path expects `decideCreateAssignee`. Task 17 also points this file at `TaskBoard.tsx`. |
| Modify: `tests/deadline-picker-ui.test.mjs`, `tests/needs-confirmation-ui.test.mjs`, `tests/status-buttons.test.mjs`, `tests/task-live.test.mjs`, `tests/board-layout.test.mjs` | Read `src/components/TaskBoard.tsx`. |
| Modify: `tests/sw-voice.test.mjs` | Signed-in `/` redirect uses `homePathForRole`. |
| Modify: `package.json` | Register each new test file on `npm test`. |
| Modify: `README.md` | Oracle deploy: migration 011, then `seed-admin.mjs` with `ADMIN_PASSWORD`. |
| Create tests listed on each task below. | |

`resolveAssigneeFromHint` and `resolveCreateAssignee` stay. Create and retranscribe pass only the legal candidate list into them. A form id that is not in that list is classified before any hint fallback, so `resolveCreateAssignee`’s existing “missing id falls back to the hint” behavior is not used on these routes.

---

### Task 1: Departments migration

**Files:**
- Create: `migrations/011_departments.sql`
- Test: `tests/migration-011.test.mjs`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: existing `users.role` check named `users_role_check` (same drop/add style as `migrations/004_waiting_status.sql`).
- Produces: table `departments(id, name, created_at)`; column `users.department_id`; constraints `users_role_check` and `users_department_role_check`; indexes `idx_users_department` and `departments_name_lower_idx`; seed row `dept-general` / `General`.

- [ ] **Step 1: Write the failing test**

```js
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '011_departments.sql'),
  'utf8',
);

describe('migrations/011_departments.sql', () => {
  it('creates departments, seeds General, then constrains users', () => {
    const markers = [
      'CREATE TABLE IF NOT EXISTS departments',
      "('dept-general', 'General')",
      'ADD COLUMN IF NOT EXISTS department_id',
      'ON DELETE RESTRICT',
      "SET department_id = 'dept-general'",
      "role IN ('boss', 'member')",
      'DROP CONSTRAINT IF EXISTS users_role_check',
      "role IN ('admin', 'boss', 'member')",
      'users_department_role_check',
      "role = 'admin' AND department_id IS NULL",
      "role IN ('boss', 'member') AND department_id IS NOT NULL",
      'idx_users_department',
      'departments_name_lower_idx',
      'LOWER(name)',
    ];
    let at = -1;
    for (const marker of markers) {
      const next = sql.indexOf(marker);
      assert.ok(next > at, `missing or out of order: ${marker}`);
      at = next;
    }
  });

  it('does not insert the admin or any password hash', () => {
    assert.equal(sql.includes('admin-001'), false);
    assert.equal(sql.includes('password_hash'), false);
    assert.equal(/\$2[aby]\$/.test(sql), false);
    assert.equal(sql.includes('ADMIN_PASSWORD'), false);
  });
});
```

Append ` tests/migration-011.test.mjs` to the `test` script in `package.json`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/migration-011.test.mjs`

Expected: FAIL, cannot read `migrations/011_departments.sql`.

- [ ] **Step 3: Write the migration**

```sql
-- Departments live on the user. Tasks do not gain a department column.
-- Do not insert admin-001. Do not put a password or bcrypt hash in this file.

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO departments (id, name)
VALUES ('dept-general', 'General')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS department_id TEXT NULL REFERENCES departments(id) ON DELETE RESTRICT;

UPDATE users
SET department_id = 'dept-general'
WHERE role IN ('boss', 'member')
  AND department_id IS NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'boss', 'member'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_department_role_check;
ALTER TABLE users ADD CONSTRAINT users_department_role_check CHECK (
  (role = 'admin' AND department_id IS NULL)
  OR (role IN ('boss', 'member') AND department_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_lower_idx ON departments (LOWER(name));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/migration-011.test.mjs`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add migrations/011_departments.sql tests/migration-011.test.mjs package.json
git commit -m "Add departments migration"
```

---

### Task 2: Fail-closed session roles

**Files:**
- Create: `src/lib/roles.ts`
- Modify: `src/lib/session.ts`
- Modify: `src/lib/auth.ts` (callers of `toSessionUser` only)
- Test: `src/lib/auth-session.test.ts`
- Modify: `package.json` if a new test file is added (this task extends the existing test file)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime. Tests do not need Postgres.
- Produces:
  - `ADMIN_USER_ID = 'admin-001'`
  - `type AppRole = 'admin' | 'boss' | 'member'`
  - `isAppRole(role: string): role is AppRole`
  - `SessionUser = { id: string; email: string; name: string; role: AppRole; department_id: string | null }`
  - `toSessionUser(user): SessionUser | null` — null when the role is not an `AppRole`. Admin’s `department_id` is always null. A missing `department_id` on a boss or member becomes null (the database reload in Task 4 fills it).

- [ ] **Step 1: Write the failing test**

In `src/lib/auth-session.test.ts`, add `department_id: 'dept-general'` to `SAMPLE`. Replace the `toSessionUser` assertion and add these cases inside `createSession / verifySessionToken`:

```ts
it('keeps admin, boss, and member and drops every other role', async () => {
  assert.equal(isAppRole('admin') && isAppRole('boss') && isAppRole('member'), true);
  assert.equal(isAppRole('owner'), false);
  assert.equal(ADMIN_USER_ID, 'admin-001');

  const token = await createSession({ ...SAMPLE, role: 'boss', department_id: 'dept-general' });
  assert.deepEqual(await verifySessionToken(token), {
    ...SAMPLE,
    role: 'boss',
    department_id: 'dept-general',
  });

  assert.equal(toSessionUser({ ...SAMPLE, role: 'owner' }), null);
  assert.deepEqual(
    toSessionUser({ ...SAMPLE, role: 'admin', department_id: 'dept-general' }),
    { ...SAMPLE, role: 'admin', department_id: null },
  );
  assert.deepEqual(toSessionUser({ ...SAMPLE, role: 'member' }), {
    ...SAMPLE,
    role: 'member',
    department_id: 'dept-general',
  });
});
```

Import `ADMIN_USER_ID` and `isAppRole` from `./roles.ts`. The old assertion that any non-boss role becomes `member` is removed.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/auth-session.test.ts`

Expected: FAIL, `isAppRole` is not defined, or `toSessionUser` still maps unknown roles to `member`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/roles.ts`:

```ts
export const ADMIN_USER_ID = 'admin-001';

export const APP_ROLES = ['admin', 'boss', 'member'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(role: string): role is AppRole {
  return role === 'admin' || role === 'boss' || role === 'member';
}
```

`src/lib/session.ts`: import `isAppRole` and `AppRole`. Change `SessionUser.role` to `AppRole` and add `department_id: string | null`.

```ts
export function toSessionUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  department_id?: string | null;
}): SessionUser | null {
  if (!isAppRole(user.role)) return null;
  if (!user.id || !user.email || !user.name) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    department_id: user.role === 'admin' ? null : (user.department_id ?? null),
  };
}
```

`createSession` throws `Error('Unknown role')` when `toSessionUser` returns null, then signs the stripped session. `verifySessionToken` returns null when `toSessionUser` returns null.

`src/lib/auth.ts` `login` and `getUsers`: after `toSessionUser(...)`, return null / skip the row when the result is null. `login` still returns null for a bad password. An unknown role takes that same null path after the password matches, so the route body stays `Invalid username or password`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/auth-session.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roles.ts src/lib/session.ts src/lib/auth.ts src/lib/auth-session.test.ts
git commit -m "Fail closed on unknown session roles"
```

---

### Task 3: Admin seed script

**Files:**
- Create: `src/lib/admin-seed.ts`
- Create: `src/lib/admin-seed.test.ts`
- Create: `scripts/seed-admin.mjs`
- Create: `.env.example`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ADMIN_USER_ID` from `src/lib/roles.ts`. `DEFAULT_AUDIO_MODEL` from `src/lib/ai.ts` (`ag/gemini-3.7-flash-high`).
- Produces:
  - `adminPasswordError(value: string | undefined): string | null`
  - `normalizeAdminName(value: string | undefined): string` — blank becomes `Admin`
  - `deriveLoginEmail(name: string, taken: boolean, now?: number): string`
  - `ADMIN_SETTINGS_MODEL` equal to `DEFAULT_AUDIO_MODEL`

- [ ] **Step 1: Write the failing test**

```ts
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
```

Add `src/lib/admin-seed.test.ts` to the `package.json` `test` script.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/admin-seed.test.ts`

Expected: FAIL, cannot find `src/lib/admin-seed.ts` or `scripts/seed-admin.mjs`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/admin-seed.ts`:

```ts
import { DEFAULT_AUDIO_MODEL } from './ai.ts';

export const ADMIN_SETTINGS_MODEL = DEFAULT_AUDIO_MODEL;
export const DEFAULT_ADMIN_NAME = 'Admin';

export function adminPasswordError(value: string | undefined): string | null {
  const password = typeof value === 'string' ? value : '';
  if (!password) return 'ADMIN_PASSWORD is required';
  if (password.length < 6) return 'ADMIN_PASSWORD must be at least 6 characters';
  return null;
}

export function normalizeAdminName(value: string | undefined): string {
  const name = typeof value === 'string' ? value.trim() : '';
  return name || DEFAULT_ADMIN_NAME;
}

export function deriveLoginEmail(name: string, taken: boolean, now = Date.now()): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  if (!taken) return `${base}@bossnote.id`;
  return `${base}-${now.toString(36)}@bossnote.id`;
}
```

`.env.example`:

```
# Set on the Oracle server only. Do not commit a real password.
ADMIN_NAME=
ADMIN_PASSWORD=
```

`scripts/seed-admin.mjs` copies the `.env` loader from `scripts/daily-task-notify.mjs` (do not override variables already in the environment). Then:

```js
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { ADMIN_USER_ID } from '../src/lib/roles.ts';
import {
  ADMIN_SETTINGS_MODEL,
  adminPasswordError,
  deriveLoginEmail,
  normalizeAdminName,
} from '../src/lib/admin-seed.ts';

const passwordError = adminPasswordError(process.env.ADMIN_PASSWORD);
if (passwordError) {
  console.error(`[seed-admin] ${passwordError}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[seed-admin] DATABASE_URL is required');
  process.exit(1);
}

const name = normalizeAdminName(process.env.ADMIN_NAME);
const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();
try {
  const collision = await client.query(
    'SELECT id FROM users WHERE LOWER(name) = LOWER($1) AND id <> $2',
    [name, ADMIN_USER_ID],
  );
  if (collision.rows[0]) {
    console.error('[seed-admin] ADMIN_NAME is already used by another user');
    process.exit(1);
  }

  const emailOwner = await client.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [
    deriveLoginEmail(name, false),
    ADMIN_USER_ID,
  ]);
  const email = deriveLoginEmail(name, Boolean(emailOwner.rows[0]));
  const passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);

  await client.query(
    `INSERT INTO users (id, email, name, password_hash, role, department_id)
     VALUES ($1, $2, $3, $4, 'admin', NULL)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = 'admin',
       department_id = NULL`,
    [ADMIN_USER_ID, email, name, passwordHash],
  );
  await client.query(
    `INSERT INTO user_settings (user_id, ai_model) VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [ADMIN_USER_ID, ADMIN_SETTINGS_MODEL],
  );
  console.log('[seed-admin] upserted admin-001');
} finally {
  client.release();
  await pool.end();
}
```

The script checks the password before it opens a connection, so a missing password writes no user. A name collision exits before the upsert. A second run updates the hash, forces `role = 'admin'` and `department_id` NULL, and does not touch any other user id. It logs `upserted admin-001` and does not log `ADMIN_PASSWORD` or the hash.

Run the script with `node --experimental-strip-types scripts/seed-admin.mjs` so the TypeScript imports load. Document that command in Task 18.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/admin-seed.test.ts`

Expected: PASS. Do not run the script against a database in this task, and do not put a sample password in the repo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-seed.ts src/lib/admin-seed.test.ts scripts/seed-admin.mjs .env.example package.json
git commit -m "Seed the admin account from the server environment"
```

---

### Task 4: Load role and department from the database

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/app/api/auth/login/route.ts` (no body change if `login()` already returns the session user)
- Modify: `src/app/api/auth/me/route.ts`
- Test: `tests/session-db.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `toSessionUser` from Task 2. `queryOne` from `src/lib/database.ts`.
- Produces: `getSession(): Promise<SessionUser | null>` reads the JWT only for `id`, then loads `id, email, name, role, department_id` from `users`. Missing row or unknown role returns null. `login` selects those columns too. `GET /api/auth/me` returns that user and calls `refreshSessionCookie` with it.

- [ ] **Step 1: Write the failing test**

```js
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
```

Add `tests/session-db.test.mjs` to `package.json`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/session-db.test.mjs`

Expected: FAIL, `auth.ts` does not select `department_id`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/auth.ts`:

```ts
async function sessionFromUserId(id: string): Promise<SessionUser | null> {
  const row = await queryOne<{
    id: string;
    email: string;
    name: string;
    role: string;
    department_id: string | null;
  }>('SELECT id, email, name, role, department_id FROM users WHERE id = ?', [id]);
  if (!row) return null;
  return toSessionUser(row);
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const tokenUser = await verifySessionToken(token);
    if (!tokenUser) return null;
    return sessionFromUserId(tokenUser.id);
  } catch {
    return null;
  }
}
```

`login` selects `department_id` in the same query as `password_hash`. Password failure and `toSessionUser(...) === null` both return null.

`GET /api/auth/me` already returns `user` from `getSession()` and refreshes the cookie. Leave that shape: `{ user }` now includes `department_id` because `SessionUser` does. Do not trust the role stored in the old cookie.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/session-db.test.mjs src/lib/auth-session.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/me/route.ts tests/session-db.test.mjs package.json
git commit -m "Load session role and department from the database"
```

---

### Task 5: Department names and managed-user decisions

**Files:**
- Create: `src/lib/managed-user.ts`
- Create: `src/lib/managed-user.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ADMIN_USER_ID` from `src/lib/roles.ts`. `deriveLoginEmail` from `src/lib/admin-seed.ts`.
- Produces:
  - `normalizeDepartmentName(raw: unknown): { ok: true; name: string } | { ok: false; error: string }`
  - `validateCreateUser(body): { ok: true; name: string; password: string; role: 'boss' | 'member'; department_id: string } | { ok: false; status: 400; error: string }`
  - `validateUpdateUser(input): { ok: true; name: string; role: 'boss' | 'member' | null; department_id: string | null; lark_open_id: string | null | undefined } | { ok: false; status: 400; error: string }`
  - `deleteUserBlock(input): { status: number; error: string } | null`
  - `DEPARTMENT_IN_USE_ERROR = 'Move the people in this department to another department before deleting it.'`

`validateUpdateUser` input is `{ actorId: string; target: { id: string; name: string; role: string; department_id: string | null }; body: { name?: unknown; role?: unknown; department_id?: unknown; lark_open_id?: unknown } }`. When `role` or `department_id` is omitted, the result keeps the stored value (`role: null` means “do not change role” only for a boss or member name-only edit — see the code). Lark handling stays in the route via `normalizeLarkOpenId`; this function only rejects a non-string Lark id by leaving `lark_open_id: undefined` when the field is absent, and passes a string through trimmed. The route still calls `normalizeLarkOpenId`.

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADMIN_USER_ID } from './roles.ts';
import {
  DEPARTMENT_IN_USE_ERROR,
  deleteUserBlock,
  normalizeDepartmentName,
  validateCreateUser,
  validateUpdateUser,
} from './managed-user.ts';

const admin = { id: ADMIN_USER_ID, name: 'Admin', role: 'admin', department_id: null };
const bayu = { id: 'bayu-001', name: 'Bayu', role: 'member', department_id: 'dept-general' };

describe('normalizeDepartmentName', () => {
  it('trims and keeps 1 to 60 characters', () => {
    assert.deepEqual(normalizeDepartmentName('  Sales '), { ok: true, name: 'Sales' });
    assert.deepEqual(normalizeDepartmentName('   '), { ok: false, error: 'Name is required' });
    assert.deepEqual(normalizeDepartmentName('x'.repeat(61)), { ok: false, error: 'Name is too long' });
  });
});

describe('validateCreateUser', () => {
  it('requires boss or staff and a department id', () => {
    assert.deepEqual(
      validateCreateUser({ name: 'Rina', password: 'secret1', role: 'member', department_id: 'dept-sales' }),
      { ok: true, name: 'Rina', password: 'secret1', role: 'member', department_id: 'dept-sales' },
    );
    assert.equal(validateCreateUser({ name: 'Rina', password: 'secret1', role: 'admin', department_id: 'dept-sales' }).ok, false);
    assert.equal(validateCreateUser({ name: 'Rina', password: 'secret1', role: 'boss', department_id: '' }).ok, false);
    assert.equal(validateCreateUser({ name: 'Rina', password: '12345', role: 'member', department_id: 'dept-sales' }).ok, false);
  });
});

describe('validateUpdateUser', () => {
  it('keeps the admin out of a department and requires one for everyone else', () => {
    const adminEdit = validateUpdateUser({
      actorId: ADMIN_USER_ID,
      target: admin,
      body: { name: 'Admin', role: 'member', department_id: 'dept-general' },
    });
    assert.equal(adminEdit.ok, false);

    const cleared = validateUpdateUser({
      actorId: ADMIN_USER_ID,
      target: bayu,
      body: { name: 'Bayu', role: 'member', department_id: '' },
    });
    assert.equal(cleared.ok, false);

    const moved = validateUpdateUser({
      actorId: ADMIN_USER_ID,
      target: bayu,
      body: { name: 'Bayu', role: 'boss', department_id: 'dept-sales' },
    });
    assert.deepEqual(moved, {
      ok: true,
      name: 'Bayu',
      role: 'boss',
      department_id: 'dept-sales',
      lark_open_id: undefined,
    });
  });
});

describe('deleteUserBlock', () => {
  it('blocks self, the admin row, and users who still have tasks or replies', () => {
    assert.equal(DEPARTMENT_IN_USE_ERROR.includes('Move the people'), true);
    assert.deepEqual(deleteUserBlock({ actorId: ADMIN_USER_ID, targetId: ADMIN_USER_ID, taskCount: 0, replyCount: 0 }), {
      status: 400,
      error: 'You cannot delete yourself',
    });
    assert.equal(deleteUserBlock({ actorId: 'other', targetId: ADMIN_USER_ID, taskCount: 0, replyCount: 0 })?.error, 'The admin account cannot be deleted.');
    assert.equal(deleteUserBlock({ actorId: ADMIN_USER_ID, targetId: 'bayu-001', taskCount: 1, replyCount: 0 })?.status, 409);
    assert.equal(deleteUserBlock({ actorId: ADMIN_USER_ID, targetId: 'boss-001', taskCount: 0, replyCount: 0 }), null);
  });
});
```

Add `src/lib/managed-user.test.ts` to `package.json`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/managed-user.test.ts`

Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { ADMIN_USER_ID } from './roles.ts';

export const DEPARTMENT_IN_USE_ERROR =
  'Move the people in this department to another department before deleting it.';

export function normalizeDepartmentName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) return { ok: false, error: 'Name is required' };
  if (name.length > 60) return { ok: false, error: 'Name is too long' };
  return { ok: true, name };
}

export function validateCreateUser(body: {
  name?: unknown;
  password?: unknown;
  role?: unknown;
  department_id?: unknown;
}):
  | { ok: true; name: string; password: string; role: 'boss' | 'member'; department_id: string }
  | { ok: false; status: 400; error: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { ok: false, status: 400, error: 'Name is required' };
  if (name.length > 60) return { ok: false, status: 400, error: 'Name is too long' };
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 6) return { ok: false, status: 400, error: 'Password must be at least 6 characters' };
  if (body.role !== 'boss' && body.role !== 'member') {
    return { ok: false, status: 400, error: 'Role must be Boss or Staff' };
  }
  const departmentId = typeof body.department_id === 'string' ? body.department_id.trim() : '';
  if (!departmentId) return { ok: false, status: 400, error: 'Department is required' };
  return { ok: true, name, password, role: body.role, department_id: departmentId };
}

export function validateUpdateUser(input: {
  actorId: string;
  target: { id: string; name: string; role: string; department_id: string | null };
  body: { name?: unknown; role?: unknown; department_id?: unknown; lark_open_id?: unknown };
}):
  | { ok: true; name: string; role: 'boss' | 'member' | null; department_id: string | null; lark_open_id: string | null | undefined }
  | { ok: false; status: 400; error: string } {
  const name = typeof input.body.name === 'string' ? input.body.name.trim() : input.target.name;
  if (!name) return { ok: false, status: 400, error: 'Name is required' };
  if (name.length > 60) return { ok: false, status: 400, error: 'Name is too long' };

  const roleSent = input.body.role !== undefined;
  const departmentSent = input.body.department_id !== undefined;
  const nextRole = input.body.role === 'boss' || input.body.role === 'member' ? input.body.role : null;
  const nextDepartment = typeof input.body.department_id === 'string' ? input.body.department_id.trim() : '';

  if (input.target.role === 'admin' || input.target.id === ADMIN_USER_ID) {
    if (roleSent && input.body.role !== 'admin') {
      return { ok: false, status: 400, error: 'The admin role cannot be changed' };
    }
    if (departmentSent && nextDepartment) {
      return { ok: false, status: 400, error: 'The admin account cannot belong to a department' };
    }
    return {
      ok: true,
      name,
      role: null,
      department_id: null,
      lark_open_id: larkField(input.body.lark_open_id),
    };
  }

  if (roleSent && !nextRole) return { ok: false, status: 400, error: 'Role must be Boss or Staff' };
  if (departmentSent && !nextDepartment) {
    return { ok: false, status: 400, error: 'A boss or staff account needs a department' };
  }
  return {
    ok: true,
    name,
    role: nextRole,
    department_id: departmentSent ? nextDepartment : input.target.department_id,
    lark_open_id: larkField(input.body.lark_open_id),
  };
}

function larkField(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' ? value.trim() : '';
}

export function deleteUserBlock(input: {
  actorId: string;
  targetId: string;
  taskCount: number;
  replyCount: number;
}): { status: number; error: string } | null {
  if (input.targetId === input.actorId) return { status: 400, error: 'You cannot delete yourself' };
  if (input.targetId === ADMIN_USER_ID) return { status: 400, error: 'The admin account cannot be deleted.' };
  const total = input.taskCount + input.replyCount;
  if (total > 0) {
    return {
      status: 409,
      error: `This user still has ${total} task(s)/reply(s). Reassign or delete them first.`,
    };
  }
  return null;
}
```

There is no last-boss branch.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/managed-user.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/managed-user.ts src/lib/managed-user.test.ts package.json
git commit -m "Add department and managed-user rules"
```

---

### Task 6: Assignment pair rules

**Files:**
- Create: `src/lib/assignment.ts`
- Create: `src/lib/assignment.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ASSIGNEE_REQUIRED_CODE` and `ASSIGNEE_REQUIRED_ERROR` from `src/lib/assignee.ts`. `resolveAssigneeFromHint` from the same file. Do not change those functions.
- Produces:
  - `type Party = { id: string; name: string; role: string; department_id: string | null; email?: string | null; lark_open_id?: string | null }`
  - `isValidAssignmentPair(creator: Party, assignee: Party): boolean`
  - `oppositeRole(role: string): 'boss' | 'member' | null`
  - `candidatesFor(creator: { role: string; department_id: string | null }, people: Party[]): Party[]`
  - `candidateListQuery(party: { role: string; department_id: string | null }): { sql: string; values: string[] } | null`
  - `ASSIGNEE_NOT_ALLOWED_CODE = 'assignee_not_allowed'`
  - `ASSIGNEE_NOT_ALLOWED_ERROR = 'That assignee is not allowed.'`
  - `NO_ASSIGNEE_AVAILABLE_CODE = 'no_assignee_available'`
  - `noAssigneeAvailableMessage(role: string): string`
  - `decideCreateAssignee(input): { ok: true; user: Party } | { ok: false; status: 400; error: string; code?: string }`
  - `canReassign(viewer: { id: string; role: string }, task: { created_by: string; assignee_id: string }, canView: boolean): boolean`
  - `decideReassign(...)` described in the test

`decideCreateAssignee` input: `{ creatorRole: string; candidates: Party[]; knownUserIds: string[]; formAssigneeId: string; hint: string | null; typed: boolean }`.

- [ ] **Step 1: Write the failing test**

Cover the spec pair table and the create/reassign cases with `node:test` assertions:

```ts
const general = 'dept-general';
const other = 'dept-other';
const ian = party('boss-001', 'Ian', 'boss', general);
const prista = party('prista-001', 'Prista', 'boss', other);
const bayu = party('bayu-001', 'Bayu', 'member', general);
const sandra = party('sandra-001', 'Sandra', 'member', general);
const nia = party('nia-001', 'Nia', 'member', other);
const admin = party('admin-001', 'Admin', 'admin', null);

function party(id: string, name: string, role: string, department_id: string | null): Party {
  return { id, name, role, department_id, email: `${id}@bossnote.id`, lark_open_id: null };
}
```

Assertions:

- `isValidAssignmentPair(ian, bayu)` and `isValidAssignmentPair(bayu, ian)` are true.
- `isValidAssignmentPair(ian, nia)`, `isValidAssignmentPair(nia, ian)`, `isValidAssignmentPair(ian, prista)`, `isValidAssignmentPair(bayu, sandra)`, `isValidAssignmentPair(admin, bayu)`, and `isValidAssignmentPair(bayu, admin)` are false.
- `isValidAssignmentPair(ian, { ...ian, id: 'boss-002' })` is false (boss with boss). Same id is false.
- `candidatesFor(ian, [ian, prista, bayu, sandra, nia, admin])` deep-equals `[bayu, sandra]` (members in Ian’s department only).
- `candidatesFor(bayu, [ian, prista, bayu, sandra, admin])` deep-equals `[ian]`.
- `candidatesFor(prista, same list plus nia)` deep-equals `[nia]`, including when the saver is Ian. Call `candidatesFor(prista, ...)` twice and assert the ids match; the function does not take a viewer.
- `candidateListQuery(ian)` SQL contains `role = ?` and `department_id = ?` with values `['member', general]`. `candidateListQuery(admin)` is null.
- Empty candidates: `decideCreateAssignee({ creatorRole: 'member', candidates: [], knownUserIds: [], formAssigneeId: '', hint: 'Ian', typed: false })` is `{ ok: false, status: 400, code: 'no_assignee_available', error: 'No boss in your department can take this task.' }`. Boss empty message is `No staff in your department to assign.`
- Form id `missing` with candidates `[bayu]` and `knownUserIds: ['bayu-001']` and hint `Bayu` returns `{ ok: false, status: 400, error: 'Assignee not found' }` and does not return Bayu.
- Form id `sandra-001` with candidates `[bayu]` and known ids including Sandra returns code `assignee_not_allowed` and error `That assignee is not allowed.`
- Form id `bayu-001` returns Bayu even when the hint says Sandra.
- No form id, hint `Sandra`, candidates `[bayu]` (Sandra not in the list) returns code `assignee_required` and `ASSIGNEE_REQUIRED_ERROR`.
- Typed create with an empty form id returns `{ ok: false, status: 400, error: 'Assignee is required' }` and no `code`.
- `canReassign({ id: 'boss-001', role: 'boss' }, { created_by: 'prista-001', assignee_id: 'nia-001' }, true)` is true.
- `canReassign({ id: 'bayu-001', role: 'member' }, { created_by: 'bayu-001', assignee_id: 'sandra-001' }, false)` is false.
- `canReassign({ id: 'bayu-001', role: 'member' }, { created_by: 'boss-001', assignee_id: 'bayu-001' }, true)` is true.
- `decideReassign` with viewer Bayu, creator Ian, next assignee Sandra (another member in Ian’s department), and `canView: true` is `{ ok: true }`. `created_by` stays Ian, so the stored pair is still boss↔member.
- `decideReassign` with viewer Ian, creator Prista, next assignee Nia, and `canView: true` is `{ ok: true }`.
- The same call with next assignee Bayu (Ian’s department, not Prista’s) is status 400 code `assignee_not_allowed`.
- Viewer Bayu, `canView: false`, is status 403 error `Forbidden`.

Add `src/lib/assignment.test.ts` to `package.json`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/assignment.test.ts`

Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import {
  ASSIGNEE_REQUIRED_CODE,
  ASSIGNEE_REQUIRED_ERROR,
  resolveAssigneeFromHint,
} from './assignee.ts';

export type Party = {
  id: string;
  name: string;
  role: string;
  department_id: string | null;
  email?: string | null;
  lark_open_id?: string | null;
};

export const ASSIGNEE_NOT_ALLOWED_CODE = 'assignee_not_allowed';
export const ASSIGNEE_NOT_ALLOWED_ERROR = 'That assignee is not allowed.';
export const NO_ASSIGNEE_AVAILABLE_CODE = 'no_assignee_available';

export function noAssigneeAvailableMessage(role: string): string {
  if (role === 'member') return 'No boss in your department can take this task.';
  return 'No staff in your department to assign.';
}

export function oppositeRole(role: string): 'boss' | 'member' | null {
  if (role === 'boss') return 'member';
  if (role === 'member') return 'boss';
  return null;
}

export function isValidAssignmentPair(creator: Party, assignee: Party): boolean {
  if (!creator.id || creator.id === assignee.id) return false;
  if (creator.role === 'admin' || assignee.role === 'admin') return false;
  if (!creator.department_id || creator.department_id !== assignee.department_id) return false;
  const roles = [creator.role, assignee.role].slice().sort().join(',');
  return roles === 'boss,member';
}

export function candidatesFor(
  creator: { role: string; department_id: string | null },
  people: Party[],
): Party[] {
  const role = oppositeRole(creator.role);
  if (!role || !creator.department_id) return [];
  return people.filter((person) => person.role === role && person.department_id === creator.department_id);
}

export function candidateListQuery(party: { role: string; department_id: string | null }): { sql: string; values: string[] } | null {
  const role = oppositeRole(party.role);
  if (!role || !party.department_id) return null;
  return {
    sql: 'SELECT id, name, role, email, lark_open_id FROM users WHERE role = ? AND department_id = ? ORDER BY LOWER(name)',
    values: [role, party.department_id],
  };
}

export function decideCreateAssignee(input: {
  creatorRole: string;
  candidates: Party[];
  knownUserIds: string[];
  formAssigneeId: string;
  hint: string | null;
  typed: boolean;
}): { ok: true; user: Party } | { ok: false; status: 400; error: string; code?: string } {
  if (input.candidates.length === 0) {
    return {
      ok: false,
      status: 400,
      code: NO_ASSIGNEE_AVAILABLE_CODE,
      error: noAssigneeAvailableMessage(input.creatorRole),
    };
  }
  const formId = input.formAssigneeId.trim();
  if (formId) {
    const chosen = input.candidates.find((person) => person.id === formId);
    if (chosen) return { ok: true, user: chosen };
    if (!input.knownUserIds.includes(formId)) return { ok: false, status: 400, error: 'Assignee not found' };
    return { ok: false, status: 400, code: ASSIGNEE_NOT_ALLOWED_CODE, error: ASSIGNEE_NOT_ALLOWED_ERROR };
  }
  if (input.typed) return { ok: false, status: 400, error: 'Assignee is required' };
  const hinted = resolveAssigneeFromHint(input.hint, input.candidates);
  if (!hinted) return { ok: false, status: 400, code: ASSIGNEE_REQUIRED_CODE, error: ASSIGNEE_REQUIRED_ERROR };
  const user = input.candidates.find((person) => person.id === hinted.id);
  if (!user) return { ok: false, status: 400, code: ASSIGNEE_REQUIRED_CODE, error: ASSIGNEE_REQUIRED_ERROR };
  return { ok: true, user };
}

export function canReassign(
  viewer: { id: string; role: string },
  task: { created_by: string; assignee_id: string },
  canView: boolean,
): boolean {
  if (!canView || viewer.role === 'admin') return false;
  return viewer.role === 'boss' || viewer.id === task.assignee_id || viewer.id === task.created_by;
}

export function decideReassign(input: {
  viewer: { id: string; role: string };
  creator: Party;
  nextAssignee: Party | null;
  task: { created_by: string; assignee_id: string };
  canView: boolean;
}): { ok: true } | { ok: false; status: 400 | 403; error: string; code?: string } {
  if (!canReassign(input.viewer, input.task, input.canView)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  if (!input.nextAssignee) return { ok: false, status: 400, error: 'Assignee not found' };
  if (!isValidAssignmentPair(input.creator, input.nextAssignee)) {
    return { ok: false, status: 400, code: ASSIGNEE_NOT_ALLOWED_CODE, error: ASSIGNEE_NOT_ALLOWED_ERROR };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/assignment.test.ts src/lib/ai-and-assignee.test.ts`

Expected: PASS. The existing hint fallback test still passes because `resolveCreateAssignee` is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assignment.ts src/lib/assignment.test.ts package.json
git commit -m "Add department assignment pair rules"
```

---

### Task 7: Visibility predicate and task read gates

**Files:**
- Modify: `src/lib/task-access.ts`
- Modify: `src/lib/task-list-scope.ts`
- Modify: `src/lib/task-gallery.ts`
- Modify: `src/app/api/tasks/route.ts` (`GET`, and a 403 at the start of `POST` for admin)
- Modify: `src/app/api/tasks/[id]/route.ts`
- Modify: `src/app/api/tasks/[id]/reply/route.ts`
- Modify: `src/app/api/tasks/[id]/retranscribe/route.ts`
- Modify: `src/app/api/tasks/[id]/image/route.ts`
- Modify: `src/app/api/tasks/[id]/image/[index]/route.ts`
- Modify: `src/app/api/tasks/events/route.ts`
- Modify: `src/lib/task-list-scope.test.ts`
- Modify: `src/lib/task-image.test.ts`
- Modify: `tests/boss-view.test.mjs`
- Create: `tests/task-visibility-routes.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SessionUser` from Task 2. `canViewTask` is the predicate later tasks call.
- Produces:
  - `type Viewer = { id: string; role: string; department_id?: string | null }`
  - `type TaskParties = { assignee_id: string; created_by: string; creator_role: string; creator_department_id: string | null; assignee_role: string; assignee_department_id: string | null }`
  - `canViewTask(viewer: Viewer, task: TaskParties): boolean`
  - `TASK_PARTY_SELECT` — the JOIN fragment routes paste after `tasks t`:

```sql
JOIN users bu ON t.created_by = bu.id
JOIN users au ON t.assignee_id = au.id
```

  and these columns: `bu.role AS creator_role`, `bu.department_id AS creator_department_id`, `au.role AS assignee_role`, `au.department_id AS assignee_department_id`.
  - `buildTaskListQuery` user argument gains `department_id?: string | null`. Boss SQL is unchanged aside from `ad.name AS assignee_department_name` via `LEFT JOIN departments ad ON ad.id = au.department_id`.

- [ ] **Step 1: Write the failing test**

Replace the `task visibility` case in `src/lib/task-image.test.ts`:

```ts
const general = 'dept-general';
const other = 'dept-other';
const ianTask = {
  assignee_id: 'bayu-001',
  created_by: 'boss-001',
  creator_role: 'boss',
  creator_department_id: general,
  assignee_role: 'member',
  assignee_department_id: general,
};

it('lets bosses see every task and members see only their own boss in-department', () => {
  const ian = { id: 'boss-001', role: 'boss', department_id: general };
  const prista = { id: 'prista-001', role: 'boss', department_id: other };
  const bayu = { id: 'bayu-001', role: 'member', department_id: general };
  const sandra = { id: 'sandra-001', role: 'member', department_id: general };
  assert.equal(canViewTask(ian, ianTask), true);
  assert.equal(canViewTask(prista, ianTask), true);
  assert.equal(canViewTask(bayu, ianTask), true);
  assert.equal(canViewTask(sandra, ianTask), false);
  assert.equal(canViewTask({ id: 'admin-001', role: 'admin', department_id: null }, ianTask), false);

  const bayuToPrista = {
    ...ianTask,
    assignee_id: 'prista-001',
    created_by: 'bayu-001',
    creator_role: 'member',
    assignee_role: 'boss',
    assignee_department_id: general,
  };
  assert.equal(canViewTask(bayu, bayuToPrista), true);
  assert.equal(canViewTask(sandra, bayuToPrista), false);

  const pristaToNia = {
    assignee_id: 'nia-001',
    created_by: 'prista-001',
    creator_role: 'boss',
    creator_department_id: other,
    assignee_role: 'member',
    assignee_department_id: other,
  };
  assert.equal(canViewTask(ian, pristaToNia), true);
  assert.equal(canViewTask(bayu, pristaToNia), false);

  const bayuToSandra = {
    assignee_id: 'sandra-001',
    created_by: 'bayu-001',
    creator_role: 'member',
    creator_department_id: general,
    assignee_role: 'member',
    assignee_department_id: general,
  };
  assert.equal(canViewTask(bayu, bayuToSandra), false);
  assert.equal(canViewTask(ian, bayuToSandra), true);
});
```

In `src/lib/task-list-scope.test.ts`, pass `department_id: 'dept-general'` on `bayu`. Replace member assertions:

- Assigned scope SQL matches `t.assignee_id = ?`, `t.created_by <> ?`, `bu.role = 'boss'`, and `bu.department_id = ?`. Values: `['bayu-001', 'bayu-001', 'dept-general']`.
- Created scope matches `t.created_by = ?`, `t.assignee_id <> ?`, `au.role = 'boss'`, `au.department_id = ?`. Values: `['bayu-001', 'bayu-001', 'dept-general']`.
- All scope contains both branches and values `['bayu-001', 'bayu-001', 'dept-general', 'bayu-001', 'bayu-001', 'dept-general']`. It does not append the boss filter assignee `boss-001`.
- Missing scope matches the assigned predicate.
- A member with `department_id: null` produces SQL containing `FALSE` and values that do not include another user’s id.
- Boss queries still use `t.assignee_id = ?` / `t.created_by = ?` / no WHERE for All, and every query selects `assignee_department_name`.
- Status and search values stay after the scope values. The waiting-status created query values are `['bayu-001', 'bayu-001', 'dept-general', 'waiting']`.

In `tests/boss-view.test.mjs`, replace the assertion that matches `(t.assignee_id = ? OR t.created_by = ?)` with:

```js
assert.match(taskListScope, /bu\.role = 'boss'/);
assert.match(taskListScope, /au\.role = 'boss'/);
assert.match(taskListScope, /bu\.department_id = \?/);
assert.match(taskListScope, /au\.department_id = \?/);
```

`tests/task-visibility-routes.test.mjs` reads the route files and asserts:

- `src/app/api/tasks/route.ts` contains `user.role === 'admin'` and status `403` in both `GET` and `POST`.
- `src/app/api/tasks/events/route.ts` contains `user.role === 'admin'` and `403`.
- `src/app/api/tasks/[id]/route.ts` calls `canViewTask` on the `PUT` status path and on `DELETE`, and contains `Not found` with status `404` before the boss-only delete check.
- `reply/route.ts`, `retranscribe/route.ts`, both image routes, and `task-gallery.ts` contain `creator_role` and `canViewTask`.

Add the new test file to `package.json`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/task-image.test.ts src/lib/task-list-scope.test.ts tests/boss-view.test.mjs tests/task-visibility-routes.test.mjs`

Expected: FAIL. `canViewTask` still treats every member creator/assignee as visible, and the list SQL is still `(t.assignee_id = ? OR t.created_by = ?)`.

- [ ] **Step 3: Write minimal implementation**

`canViewTask`:

```ts
export type Viewer = { id: string; role: string; department_id?: string | null };

export type TaskParties = {
  assignee_id: string;
  created_by: string;
  creator_role: string;
  creator_department_id: string | null;
  assignee_role: string;
  assignee_department_id: string | null;
};

export function canViewTask(viewer: Viewer, task: TaskParties): boolean {
  if (viewer.role === 'boss') return true;
  if (viewer.role !== 'member' || !viewer.department_id) return false;
  const assignedByBoss =
    viewer.id === task.assignee_id &&
    viewer.id !== task.created_by &&
    task.creator_role === 'boss' &&
    task.creator_department_id === viewer.department_id;
  const createdForBoss =
    viewer.id === task.created_by &&
    viewer.id !== task.assignee_id &&
    task.assignee_role === 'boss' &&
    task.assignee_department_id === viewer.department_id;
  return assignedByBoss || createdForBoss;
}
```

Keep `assignmentPushUrl` unchanged.

`buildTaskListQuery` user type is `{ id: string; role: string; department_id?: string | null }`. Extend `LIST_SELECT` with `ad.name AS assignee_department_name` and `LEFT JOIN departments ad ON ad.id = au.department_id`.

Scope SQL:

- `role === 'admin'` or a member with no `department_id`: `conditions.push('FALSE')`.
- Member `assigned` (also the default when scope is missing): `t.assignee_id = ? AND t.created_by <> ? AND bu.role = 'boss' AND bu.department_id = ?` with `[id, id, department_id]`.
- Member `created`: `t.created_by = ? AND t.assignee_id <> ? AND au.role = 'boss' AND au.department_id = ?` with `[id, id, department_id]`.
- Member `all`: the two branches joined by `OR`, values concatenated. Ignore `input.assignee` for members.
- Boss `assigned` / `created` / All assignee filter: leave the current conditions.

`GET /api/tasks`: after the 401 check, `if (user.role === 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })`. Then call `buildTaskListQuery` as today.

`POST /api/tasks`: the same admin 403 immediately after the 401 check, before `beginCreateClaim`.

`GET /api/tasks/:id`: select the party columns (the existing `bu` / `au` joins already exist; add the four columns). 404 when the row is missing. 403 when `canViewTask` is false. Boss question filtering stays `user.role !== 'boss'`.

`PUT` status branch: load the party row first. 404 if missing. 403 if `!canViewTask`. Then update status. Do not change the reassign branch’s assignee lookup in this task beyond requiring `canViewTask` and `canReassign` from `src/lib/assignment.ts` so a member who cannot view the task gets 403. Pair rejection of the new assignee is Task 10; until then a visible reassign may still write any existing user id. That keeps this task’s deliverable as the read gate.

`DELETE`: load the party row. 404 if missing. 403 if `!canViewTask`. 403 if `user.role !== 'boss'`. Then delete, publish, and remove images as today.

Reply, retranscribe, and both image routes: load party columns. Extend `TaskImageRow` in `src/lib/task-gallery.ts` with `creator_role`, `creator_department_id`, `assignee_role`, and `assignee_department_id`, and add those columns plus the `bu` / `au` joins to both `loadTaskForImage` selects (the `image_paths` select and the missing-column fallback). Replace the id-equality check with `canViewTask`. 404 when the task is missing, 403 when it is hidden. Retranscribe’s assignee hint update stays on the full team until Task 10.

`GET /api/tasks/events`: after 401, admin returns 403 `Forbidden`. Boss and member still get the content-free stream.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/task-image.test.ts src/lib/task-list-scope.test.ts tests/boss-view.test.mjs tests/task-visibility-routes.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-access.ts src/lib/task-list-scope.ts src/lib/task-gallery.ts src/app/api/tasks src/lib/task-list-scope.test.ts src/lib/task-image.test.ts tests/boss-view.test.mjs tests/task-visibility-routes.test.mjs package.json
git commit -m "Gate task reads by department visibility"
```

---

### Task 8: Admin department API

**Files:**
- Create: `src/lib/require-admin.ts`
- Create: `src/app/api/admin/departments/route.ts`
- Create: `src/app/api/admin/departments/[id]/route.ts`
- Create: `tests/admin-departments-api.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `normalizeDepartmentName`, `DEPARTMENT_IN_USE_ERROR` from Task 5. `getSession` from Task 4.
- Produces: `requireAdmin(user: { role: string } | null, message: string): NextResponse | null`.
  - `GET /api/admin/departments` → `{ departments: { id, name, created_at, boss_count, member_count }[] }`
  - `POST` body `{ name }` → 201 `{ department }`
  - `PUT /api/admin/departments/:id` body `{ name }` → `{ department }`
  - `DELETE` → `{ ok: true }` or 409 `DEPARTMENT_IN_USE_ERROR`

- [ ] **Step 1: Write the failing test**

`tests/admin-departments-api.test.mjs` asserts the route sources contain:

- `requireAdmin`
- `Only an admin can manage departments`
- `LOWER(name) = LOWER(?)`
- `COUNT(*) FILTER (WHERE u.role = 'boss')`
- `COUNT(*) FILTER (WHERE u.role = 'member')`
- `DEPARTMENT_IN_USE_ERROR`
- status `409`, `404`, `400`, and `201`
- `ON DELETE RESTRICT` is not required in the route; the 409 check is `SELECT COUNT(*)::int AS n FROM users WHERE department_id = ?`

A unit test in the same file imports `requireAdmin` and asserts a null user is status 401 and a boss is status 403.

Add the test path to `package.json`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/admin-departments-api.test.mjs`

Expected: FAIL, route file missing.

- [ ] **Step 3: Write minimal implementation**

```ts
import { NextResponse } from 'next/server';

export function requireAdmin(user: { role: string } | null, message: string) {
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: message }, { status: 403 });
  return null;
}
```

`GET` uses:

```sql
SELECT d.id, d.name, d.created_at,
  COUNT(*) FILTER (WHERE u.role = 'boss')::int AS boss_count,
  COUNT(*) FILTER (WHERE u.role = 'member')::int AS member_count
FROM departments d
LEFT JOIN users u ON u.department_id = d.id
GROUP BY d.id, d.name, d.created_at
ORDER BY LOWER(d.name)
```

Map counts with `Number`. `POST` runs `normalizeDepartmentName`. Duplicate `LOWER(name)` returns 409 `That department name is already taken`. Insert `gen` id with `uuid` v4, the same helper the user route uses (`uuidv4` from `uuid`). Return 201 `{ department: { id, name, created_at } }`.

`PUT` 404 `Department not found` when the id is missing. Same name rules. Uniqueness query is `LOWER(name) = LOWER(?) AND id <> ?`.

`DELETE` counts users. When `n > 0`, return 409 with `DEPARTMENT_IN_USE_ERROR` and do not delete. When the foreign key still raises, catch it and return that same 409. `dept-general` has no special case.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/admin-departments-api.test.mjs src/lib/managed-user.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/require-admin.ts src/app/api/admin/departments tests/admin-departments-api.test.mjs package.json
git commit -m "Add admin department APIs"
```

---

### Task 9: Admin user APIs and password reset

**Files:**
- Modify: `src/app/api/admin/users/route.ts`
- Modify: `src/app/api/admin/users/[id]/route.ts`
- Modify: `src/app/api/auth/password/route.ts`
- Create: `tests/admin-users-api.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `requireAdmin` from Task 8. `validateCreateUser`, `validateUpdateUser`, `deleteUserBlock` from Task 5. `deriveLoginEmail` from Task 3. `normalizeLarkOpenId` from `src/lib/lark.ts`. `DEFAULT_AUDIO_MODEL` from `src/lib/ai.ts`.
- Produces: existing paths `/api/admin/users` and `/api/admin/users/:id`, gated by admin. `GET` rows include `department_id` and `department_name`. `POST /api/auth/password` message for a non-admin is `Only an admin can reset passwords`.

- [ ] **Step 1: Write the failing test**

Assert the user route sources:

- call `requireAdmin(..., 'Only an admin can manage users')`
- do not contain `Only a boss can manage users`, `Cannot demote the last boss`, or `Cannot delete the last boss`
- `GET` SQL selects `u.department_id` and `d.name AS department_name` with `LEFT JOIN departments d` and `ORDER BY LOWER(u.name)`
- `POST` calls `validateCreateUser` and `deriveLoginEmail`, inserts `department_id`, and still inserts `user_settings`
- `PUT` calls `validateUpdateUser`, returns 400 when the department id is not in `departments`, and updates `department_id`
- `DELETE` calls `deleteUserBlock`
- password `POST` contains `user.role !== 'admin'` and `Only an admin can reset passwords`
- password `POST` returns 400 `Use Account to change your own password.` when `user_id` is the caller or the target role is `admin`
- password `PUT` still checks `current_password` and has no admin gate

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/admin-users-api.test.mjs`

Expected: FAIL, routes still say only a boss can manage users.

- [ ] **Step 3: Write minimal implementation**

Replace `requireBoss` with `requireAdmin(user, 'Only an admin can manage users')`.

`GET`:

```sql
SELECT u.id, u.email, u.name, u.role, u.department_id, d.name AS department_name,
       u.lark_open_id, u.created_at
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
ORDER BY LOWER(u.name)
```

`POST`: `const parsed = validateCreateUser(body)`. On failure return `parsed.status` and `parsed.error`. Confirm the department exists or return 400 `Department not found`. Keep the case-insensitive name uniqueness check (`409` `That name is already taken`). Build email with `deriveLoginEmail`. Insert `department_id`. Insert `user_settings` with `DEFAULT_AUDIO_MODEL`. Return 201 `{ user, ok: true }` including `department_id`.

`PUT`: load `department_id` on the target. `validateUpdateUser`. For a boss or member, when `department_id` is non-null, confirm the department row exists (400 `Department not found`). Apply Lark normalization only when `lark_open_id !== undefined`, using the current `normalizeLarkOpenId` errors. Update:

```sql
UPDATE users
SET name = ?, role = COALESCE(?, role), department_id = ?, lark_open_id = ?
WHERE id = ?
```

For the admin row, `role` argument is null (COALESCE keeps `admin`) and `department_id` is null. Return the same shape as `GET` for that id.

`DELETE`: load the target, count tasks and replies exactly as today, then `deleteUserBlock`. There is no boss-count query. Delete `user_settings` then `users` when the block is null.

`POST /api/auth/password`: replace the boss check with admin. If `user_id === user.id` or the target’s role is `admin`, return 400 `Use Account to change your own password.` Boss and member targets still get a new bcrypt hash. `PUT` is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/admin-users-api.test.mjs src/lib/managed-user.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/users src/app/api/auth/password/route.ts tests/admin-users-api.test.mjs package.json
git commit -m "Limit user management and password reset to admin"
```

---

### Task 10: Enforce pairs on create, reassign, and retranscribe

**Files:**
- Modify: `src/app/api/tasks/route.ts`
- Modify: `src/app/api/tasks/[id]/route.ts`
- Modify: `src/app/api/tasks/[id]/retranscribe/route.ts`
- Modify: `tests/voice-create-ui.test.mjs`
- Create: `tests/assignment-routes.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `decideCreateAssignee`, `decideReassign`, `candidateListQuery`, `candidatesFor`, `isValidAssignmentPair` from Task 6. `canViewTask` from Task 7. `resolveAssigneeFromHint` only through `decideCreateAssignee`.
- Produces: create and reassign responses using the codes from Task 6. Retranscribe does not move `assignee_id` unless the hinted user is a valid pair with the original creator.

- [ ] **Step 1: Write the failing test**

In `tests/voice-create-ui.test.mjs`, replace the form-assignee and Lark assertions with:

```js
it('prefers form assignee on the voice create API path', () => {
  assert.match(tasksRoute, /decideCreateAssignee\(/);
  assert.doesNotMatch(tasksRoute, /resolveCreateAssignee\(/);
  assert.match(tasksRoute, /candidateListQuery/);
  assert.match(tasksRoute, /ASSIGNEE_REQUIRED_CODE/);
  assert.doesNotMatch(tasksRoute, /fromVoice\?\.id \|\| formUser\?\.id/);
});

it('passes stored Lark open ids and assignee email into fire-and-forget notify', () => {
  assert.match(tasksRoute, /assigneeOpenId: formUser\.lark_open_id/);
  assert.match(tasksRoute, /assigneeEmail: formUser\.email/);
  assert.match(tasksRoute, /assigneeOpenId: assignee\.lark_open_id/);
  assert.match(tasksRoute, /assigneeEmail: assignee\.email/);
  assert.match(taskUpdateRoute, /SELECT id, name, role, department_id, email, lark_open_id FROM users WHERE id = \?/);
  assert.match(taskUpdateRoute, /decideReassign/);
  assert.match(taskUpdateRoute, /assigneeEmail: assignee\.email/);
  assert.match(taskUpdateRoute, /kind: 'reassign'/);
});
```

Leave the `assignee_required` order test as it is: `ASSIGNEE_REQUIRED_CODE` must still appear in `route.ts` after `shouldInsertVoiceTask`.

`tests/assignment-routes.test.mjs` asserts retranscribe contains `candidateListQuery` and `isValidAssignmentPair`, and does not contain `FROM users ORDER BY name`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/assignment-routes.test.mjs`

Expected: FAIL, create still loads every user and calls `resolveCreateAssignee`.

- [ ] **Step 3: Write minimal implementation**

In `createTaskForUser`, replace the company-wide `team` query with:

```ts
const listed = candidateListQuery({ role: user.role, department_id: user.department_id ?? null });
const candidates = listed
  ? await queryAll<Party>(listed.sql, listed.values)
  : [];
```

`user` on `createTaskForUser` must include `role` and `department_id`. Thread them from `POST`.

Typed path: `const decision = decideCreateAssignee({ creatorRole: user.role, candidates, knownUserIds, formAssigneeId: input.formAssigneeId, hint: null, typed: true })`. Load `knownUserIds` with `SELECT id FROM users WHERE id = ?` only when `formAssigneeId` is non-empty (one row or none). On `ok: false`, return `NextResponse.json({ error: decision.error, code: decision.code }, { status: decision.status })` and do not insert. On success, name the user `formUser` and keep the existing `notifyAssignee` fields `assigneeOpenId: formUser.lark_open_id` and `assigneeEmail: formUser.email`.

Voice path: the same call with `typed: false` and `hint: ai?.assignee_hint ?? null`, after the clarity / title checks and instead of `resolveCreateAssignee`. Name the chosen user `assignee` and keep `assigneeOpenId: assignee.lark_open_id` and `assigneeEmail: assignee.email`. A failure returns before `saveVoice` / `INSERT`. The failure return in this voice block must mention `ASSIGNEE_REQUIRED_CODE` so the existing order test still sees it after `shouldInsertVoiceTask`:

```ts
if (!decision.ok) {
  return NextResponse.json(
    {
      error: decision.error,
      code: decision.code === ASSIGNEE_REQUIRED_CODE ? ASSIGNEE_REQUIRED_CODE : decision.code,
    },
    { status: decision.status },
  );
}
```

Import `ASSIGNEE_REQUIRED_CODE` from `@/lib/assignee`. Push and Lark still run only after the insert.

Reassign branch in `PUT`: load the creator with `SELECT id, name, role, department_id, email, lark_open_id FROM users WHERE id = ?` using `task.created_by`. Load the next assignee the same way (`null` when missing). `const view = canViewTask(user, partyRow)`. `const decision = decideReassign({ viewer: user, creator, nextAssignee, task: partyRow, canView: view })`. On failure, return that status and body and do not `UPDATE`. On success, keep the current push/Lark block, including the skip when the assignee id did not change. `created_by` is not in the UPDATE.

Retranscribe: after `canViewTask`, build candidates with `candidateListQuery` for the creator’s role and department (load the creator row). `resolveAssigneeFromHint(ai.assignee_hint, candidates)`. If that user forms `isValidAssignmentPair(creator, hinted)`, use their id. Otherwise keep `task.assignee_id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/assignment-routes.test.mjs src/lib/assignment.test.ts tests/voice-create-ui.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tasks/route.ts src/app/api/tasks/\[id\]/route.ts src/app/api/tasks/\[id\]/retranscribe/route.ts tests/voice-create-ui.test.mjs tests/assignment-routes.test.mjs package.json
git commit -m "Reject assignees outside the department pair"
```

---

### Task 11: Assignee lists

**Files:**
- Modify: `src/app/api/users/route.ts`
- Create: `src/app/api/tasks/[id]/assignees/route.ts`
- Create: `tests/assignee-lists.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `candidateListQuery`, `candidatesFor`, `canReassign` from Task 6. `canViewTask` and the party select from Task 7.
- Produces:
  - `GET /api/users` → `{ users: { id, name, role }[] }` for the signed-in user’s create candidates. Admin 403. Logged out 401.
  - `GET /api/users?view=directory` → every boss and member, boss-only. Members and admin 403.
  - `GET /api/tasks/:id/assignees` → `{ users: { id, name, role }[] }` for the task creator’s candidates, only when the caller can view and reassign. 404 missing. 403 otherwise.

- [ ] **Step 1: Write the failing test**

Assert `src/app/api/users/route.ts` contains `view=directory` handling via `searchParams.get('view')`, `candidateListQuery`, `role IN ('boss', 'member')`, and `user.role === 'admin'`. Assert it does not call `getUsers(`.

Assert `src/app/api/tasks/[id]/assignees/route.ts` contains `canViewTask`, `canReassign`, and `candidateListQuery`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/assignee-lists.test.mjs`

Expected: FAIL, `getUsers` is still the whole company, and the assignees route does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
const DIRECTORY_SQL =
  "SELECT id, name, role FROM users WHERE role IN ('boss', 'member') ORDER BY LOWER(name)";
```

`GET /api/users`: 401 when logged out. 403 when `view === 'directory'` and role is not `boss`. 403 when role is `admin` on the default view. Directory returns `DIRECTORY_SQL`. Default view runs `candidateListQuery` and maps rows to `{ id, name, role }`. A null query returns `{ users: [] }` with 200 for a boss or member who has no department yet (create then fails with `no_assignee_available`).

`GET /api/tasks/:id/assignees`: 401, then load the party row. 404 `Not found` when missing. 403 when `!canViewTask` or `!canReassign`. Load the creator’s `role` and `department_id` (they are already on the party row: `creator_role`, `creator_department_id`). Run `candidateListQuery({ role: creator_role, department_id: creator_department_id })`. Return `{ users }` as id, name, and role. Admin is absent because the SQL role is only `boss` or `member`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/assignee-lists.test.mjs src/lib/assignment.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/users/route.ts src/app/api/tasks/\[id\]/assignees/route.ts tests/assignee-lists.test.mjs package.json
git commit -m "Serve create and reassign candidate lists"
```

---

### Task 12: Digest visibility

**Files:**
- Modify: `src/lib/push-digest.ts`
- Modify: `src/lib/push-digest.test.ts`
- Modify: `src/lib/push.ts`
- Modify: `scripts/daily-task-notify.mjs`
- Create: `tests/digest-visibility.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `canViewTask` and `TaskParties` from Task 7. `DigestTask` stays `{ assignee_id, title, title_id? }`.
- Produces: `visibleDigestTasks<T extends DigestTask & TaskParties>(viewer: Viewer, tasks: T[]): T[]` — tasks whose `assignee_id` is the viewer and that pass `canViewTask`.

- [ ] **Step 1: Write the failing test**

In `src/lib/push-digest.test.ts` add a case: Bayu (member, `dept-general`) receives the task Ian assigned to him and does not receive the task Sandra assigned to him (creator role `member`). Ian (boss) receives both tasks assigned to Ian, including one created by Prista in another department. An empty visible list is not passed to `buildDigestPayload` (call `visibleDigestTasks` and assert length 0).

`tests/digest-visibility.test.mjs` asserts `src/lib/push.ts` and `scripts/daily-task-notify.mjs` contain `visibleDigestTasks` and `creator_role`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/push-digest.test.ts tests/digest-visibility.test.mjs`

Expected: FAIL, `visibleDigestTasks` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import { canViewTask, type TaskParties, type Viewer } from './task-access.ts';

export function visibleDigestTasks<T extends DigestTask & TaskParties>(viewer: Viewer, tasks: T[]): T[] {
  return tasks.filter((task) => task.assignee_id === viewer.id && canViewTask(viewer, task));
}
```

`sendDailyTaskDigests` selects:

```sql
SELECT t.assignee_id, t.title, t.title_id, t.created_by,
       cu.role AS creator_role, cu.department_id AS creator_department_id,
       au.role AS assignee_role, au.department_id AS assignee_department_id
FROM tasks t
JOIN users au ON au.id = t.assignee_id
JOIN users cu ON cu.id = t.created_by
WHERE t.status IN (${placeholders})
ORDER BY t.created_at DESC
```

Group by `assignee_id`. For each group, viewer is `{ id: assignee_id, role: assignee_role, department_id: assignee_department_id }` from the first row. `visibleDigestTasks` then `buildDigestPayload`. Skip when the payload is null.

`scripts/daily-task-notify.mjs` imports `visibleDigestTasks` from `../src/lib/push-digest.ts` and uses the same SELECT (`$1` array form it already uses). The crontab in Task 18 runs it with `--experimental-strip-types`. Do not duplicate the predicate in the script.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/push-digest.test.ts tests/digest-visibility.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/push-digest.ts src/lib/push-digest.test.ts src/lib/push.ts scripts/daily-task-notify.mjs tests/digest-visibility.test.mjs package.json
git commit -m "Hide non-visible tasks from member digests"
```

---

### Task 13: Login redirect, header, and admin layouts

**Files:**
- Create: `src/lib/home-path.ts`
- Create: `src/lib/home-path.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/LoginForm.tsx`
- Modify: `src/components/DashboardHeader.tsx`
- Modify: `tests/sw-voice.test.mjs`
- Modify: `src/app/dashboard/users/layout.tsx`
- Create: `src/app/dashboard/departments/layout.tsx`
- Create: `tests/admin-shell.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `getSession()` from Task 4, which includes `role`.
- Produces: `homePathForRole(role: string | null | undefined): '/dashboard/departments' | '/dashboard'`. Admin header links: Manage Departments (`/dashboard/departments`), Manage Users (`/dashboard/users`), Account. Logo href is the admin home. Boss and member: Board (`/dashboard`) and Account. No Manage Users link for them.

- [ ] **Step 1: Write the failing test**

`src/lib/home-path.test.ts`:

```ts
assert.equal(homePathForRole('admin'), '/dashboard/departments');
assert.equal(homePathForRole('boss'), '/dashboard');
assert.equal(homePathForRole('member'), '/dashboard');
assert.equal(homePathForRole(null), '/dashboard');
```

`tests/admin-shell.test.mjs` asserts:

- `src/app/page.tsx` calls `homePathForRole`
- `LoginForm.tsx` calls `homePathForRole(data.user?.role)` and does not hard-code only `router.push('/dashboard')`
- `DashboardHeader.tsx` contains `Admin`, `Manage Departments`, and renders Manage Users only when `user.role === 'admin'`
- boss branch does not include a Manage Users link (assert the Manage Users JSX is inside `user.role === 'admin'`)
- member label string `Team` remains
- `users/layout.tsx` redirects when `user.role !== 'admin'`
- `departments/layout.tsx` does the same redirect to `/dashboard`
- neither layout redirects admin away
- `src/app/dashboard/layout.tsx` still only checks that a session exists

In `tests/sw-voice.test.mjs`, replace `assert.match(loginPage, /redirect\('\/dashboard'\)/)` with:

```js
assert.match(loginPage, /homePathForRole\(user\.role\)/);
assert.match(loginPage, /redirect\(homePathForRole\(user\.role\)\)/);
```

Keep the `start_url` assertion on `/dashboard`. The installed app opens the board URL, and Task 17 redirects an admin session from that page.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/home-path.test.ts tests/admin-shell.test.mjs tests/sw-voice.test.mjs`

Expected: FAIL, `homePathForRole` is missing and the header still shows Manage Users for bosses.

- [ ] **Step 3: Write minimal implementation**

```ts
export function homePathForRole(role: string | null | undefined): '/dashboard/departments' | '/dashboard' {
  if (role === 'admin') return '/dashboard/departments';
  return '/dashboard';
}
```

`src/app/page.tsx` imports `homePathForRole` from `@/lib/home-path` and, when `getSession()` returns a user, calls `redirect(homePathForRole(user.role))`.

`LoginForm` imports the same helper and calls `router.push(homePathForRole(data.user?.role))` then `router.refresh()`.

Replace the header nav. Role line: `user.role === 'admin' ? 'Admin' : user.role === 'boss' ? 'Boss' : 'Team'`. Logo `href={homePathForRole(user.role)}`. Nav:

- Admin: Manage Departments, Manage Users, Account. Do not render Board.
- Boss and member: Board, Account.

`users/layout.tsx` and `departments/layout.tsx`:

```tsx
if (!user) redirect('/');
if (user.role !== 'admin') redirect('/dashboard');
```

Both export `dynamic = 'force-dynamic'`. Leave `src/app/dashboard/layout.tsx` as the session-only wrapper so admin can open departments, users, and account.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/home-path.test.ts tests/admin-shell.test.mjs tests/sw-voice.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/home-path.ts src/lib/home-path.test.ts src/app/page.tsx src/components/LoginForm.tsx src/components/DashboardHeader.tsx src/app/dashboard/users/layout.tsx src/app/dashboard/departments/layout.tsx tests/admin-shell.test.mjs tests/sw-voice.test.mjs package.json
git commit -m "Send admin to department management"
```

---

### Task 14: Manage Departments page

**Files:**
- Create: `src/app/dashboard/departments/page.tsx`
- Create: `tests/departments-page.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `GET/POST /api/admin/departments` and `PUT/DELETE /api/admin/departments/:id` from Task 8. `DashboardHeader` from Task 13.
- Produces: page at `/dashboard/departments` that lists boss and staff counts, adds, renames, and deletes. Delete asks for confirmation. A 409 leaves the row on screen and shows `error` from the API.

- [ ] **Step 1: Write the failing test**

Assert the page source contains `Manage Departments`, `/api/admin/departments`, `boss_count`, `member_count`, a confirm step (`confirmDelete`), and that it does not import `PushEnableBanner` or `useLiveTaskList`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/departments-page.test.mjs`

Expected: FAIL, page missing.

- [ ] **Step 3: Write minimal implementation**

`'use client'` page. Copy the shell classes from `src/app/dashboard/users/page.tsx` (`min-h-screen`, `DashboardHeader`, `card`, `input-field`, violet submit button, red delete button). Do not import `PushEnableBanner` or `useLiveTaskList`.

On load, `GET /api/auth/me` with `credentials: 'include'` and `cache: 'no-store'`. Missing user: `window.location.assign('/')`. Role other than `admin`: `router.push('/dashboard')`. Then `GET /api/admin/departments`.

State: `departments`, `newName`, `editing` (`{ id, name } | null`), `editName`, `confirmDelete`, `busy`, `msg`.

Add form: `POST /api/admin/departments` with `{ name: newName.trim() }`. Rename: `PUT /api/admin/departments/${id}` with `{ name: editName.trim() }`. Delete confirm copy: `Delete {name}? People in this department must be moved first.` `DELETE /api/admin/departments/${id}`. On a non-OK response, `setMsg({ ok: false, text: d.error })`, close the dialog, and `GET` again so the row stays. Each row shows `{name}`, `{boss_count} boss` or `{boss_count} bosses`, and `{member_count} staff`. Pluralize boss only when the count is not 1. Staff stays the word `staff`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/departments-page.test.mjs tests/admin-shell.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/departments/page.tsx tests/departments-page.test.mjs package.json
git commit -m "Add the manage departments page"
```

---

### Task 15: Manage Users page

**Files:**
- Modify: `src/app/dashboard/users/page.tsx`
- Create: `tests/admin-users-page.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: user APIs from Task 9. Department list from Task 8. Header from Task 13.
- Produces: the existing add / edit / reset / delete UI, plus a required department `<select>`, admin-row limits, and the copy below.

- [ ] **Step 1: Write the failing test**

Assert the page contains all of these strings:

- `The admin creates each person, picks Boss or Staff, and places them in a department.`
- `Create a department first.`
- `Their visible tasks and allowed assignees follow the new role and department immediately.`
- `department_id`
- `/api/admin/departments`
- `d.user.role !== 'admin'`

Assert it does not contain `Cannot demote the last boss` or `bossCount <= 1`. Assert Delete is not rendered for `u.role === 'admin'` (the condition `u.role !== 'admin'` gates the delete button). Assert the edit form skips role and department controls when `editing.role === 'admin'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/admin-users-page.test.mjs`

Expected: FAIL, the page still redirects non-bosses and has no department field.

- [ ] **Step 3: Write minimal implementation**

Change the session check from `role !== 'boss'` to `role !== 'admin'`, and `router.push('/dashboard')`.

Load departments with `GET /api/admin/departments` next to users. Extend the `User` type with `department_id: string | null` and `department_name: string | null`.

Page subtitle is the sentence in the test. When `departments.length === 0`, disable the add button and show `Create a department first.`

Add form fields stay name, role (Staff / Boss only), password, plus department `<select>` of `departments` (required). POST body adds `department_id`.

Each row shows `department_name` or `No department` for the admin row. Role badge: Boss, Staff, or Admin.

`canDelete` is `u.role !== 'admin' && u.id !== me.id`. Remove the last-boss count.

Edit: for `editing.role === 'admin'`, show name and Lark Open ID only, plus `This admin account has no department.` For everyone else, show role, department, and Lark. Under the save button for a non-admin: `Their visible tasks and allowed assignees follow the new role and department immediately. Tasks are not deleted.` PUT sends `department_id` for those users and omits it for the admin.

Reset password stays the existing modal and `POST /api/auth/password`. Hide Reset on the admin row the same way Delete is hidden (`u.id !== me.id` already hides it when the admin is the signed-in user).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/admin-users-page.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/users/page.tsx tests/admin-users-page.test.mjs package.json
git commit -m "Require a department when the admin manages users"
```

---

### Task 16: Account page

**Files:**
- Modify: `src/app/dashboard/account/page.tsx`
- Create: `tests/account-page.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PUT /api/auth/password` for every role. Voice model API stays. No reset API on this page.
- Produces: password form for admin, boss, and member. Voice model block only when `me.role === 'boss' || me.role === 'member'`.

- [ ] **Step 1: Write the failing test**

Assert the account page does not contain `Reset a user's password` or `method: 'POST'` to `/api/auth/password`. Assert the voice-model `<section>` is wrapped in `me.role !== 'admin'`. Assert `Change your password` remains.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/account-page.test.mjs`

Expected: FAIL, the boss reset block is still there.

- [ ] **Step 3: Write minimal implementation**

Delete `users`, `targetId`, `targetPw`, `resetUser`, the `/api/users` fetch, and the reset `<section>`. Subtitle is `Update your password.` Remove `isBoss`. Render the voice-model section only when `me.role !== 'admin'`. Keep the change-password form and `PUT /api/auth/password`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/account-page.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/account/page.tsx tests/account-page.test.mjs package.json
git commit -m "Keep password reset on Manage Users"
```

---

### Task 17: Board pickers, department chip, and admin redirect

**Files:**
- Create: `src/components/TaskBoard.tsx` (move of `src/app/dashboard/page.tsx`)
- Modify: `src/app/dashboard/page.tsx` (server redirect)
- Modify: `tests/boss-view.test.mjs`
- Modify: `tests/voice-create-ui.test.mjs`
- Modify: `tests/deadline-picker-ui.test.mjs`
- Modify: `tests/needs-confirmation-ui.test.mjs`
- Modify: `tests/status-buttons.test.mjs`
- Modify: `tests/task-live.test.mjs`
- Modify: `tests/board-layout.test.mjs`
- Create: `tests/board-assignees.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `GET /api/users`, `GET /api/users?view=directory`, `GET /api/tasks/:id/assignees` from Task 11. `noAssigneeAvailableMessage` from Task 6. `assignee_department_name` from Task 7. `homePathForRole` is not used here; this page redirects with `redirect('/dashboard/departments')`.
- Produces: server page that redirects admin before the client board mounts. Client board uses three lists: create candidates, boss directory filter, and per-task reassign candidates.

- [ ] **Step 1: Write the failing test**

Point every existing reader of `src/app/dashboard/page.tsx` at `src/components/TaskBoard.tsx`. In `tests/task-live.test.mjs` the URL import becomes `../src/components/TaskBoard.tsx`.

`tests/board-assignees.test.mjs`:

- `src/app/dashboard/page.tsx` contains `user.role === 'admin'` and `redirect('/dashboard/departments')` and does not contain `useLiveTaskList`.
- `TaskBoard.tsx` fetches `/api/users?view=directory` only in a `user.role === 'boss'` branch.
- Create `<AssigneeSelect` uses `createUsers`, not the directory list.
- Reassign `<AssigneeSelect` uses `reassignUsers`.
- The file fetches `` `/api/tasks/${id}/assignees` ``.
- Empty copy uses `noAssigneeAvailableMessage`.
- Boss cards render `assignee_department_name` inside `isBoss &&`.
- `PushEnableBanner` and `useLiveTaskList` remain in `TaskBoard.tsx`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/board-assignees.test.mjs tests/boss-view.test.mjs tests/board-layout.test.mjs`

Expected: FAIL, `TaskBoard.tsx` does not exist and `page.tsx` is still the client board.

- [ ] **Step 3: Write minimal implementation**

Move the client file to `src/components/TaskBoard.tsx` and rename the default export to `TaskBoard`. Update the seven test paths.

New `src/app/dashboard/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import TaskBoard from '@/components/TaskBoard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect('/');
  if (user.role === 'admin') redirect('/dashboard/departments');
  return <TaskBoard />;
}
```

In `TaskBoard`, replace the single `users` state with `createUsers`, `directoryUsers`, and `reassignUsers`. After `/api/auth/me`:

- If `d.user.role === 'admin'`, `window.location.assign('/dashboard/departments')` and return before `setUser`, so `useLiveTaskList(Boolean(user), fetchTasks)` stays off. The server redirect is the one that matters; this is a second stop if the client mounts.
- `GET /api/users` fills `createUsers`.
- When `d.user.role === 'boss'`, `GET /api/users?view=directory` fills `directoryUsers`.

`AssigneeSelect` and `AssigneePickModal` gain `emptyMessage?: string`. When `users.length === 0`, render that sentence and no `<option>` list of other people. Pass `emptyMessage={noAssigneeAvailableMessage(user.role)}`.

Voice and typed create use `createUsers`. The All-scope `<select>` (boss only) uses `directoryUsers` and still labels options with `assigneeOptionLabel`.

When opening a task (`loadTaskDetail`), `GET /api/tasks/${id}/assignees`. 200 stores `reassignUsers`. Any other status stores `[]` and hides the reassign `<AssigneeSelect` (the detail still shows). The reassign control’s users prop is `reassignUsers`. `reassignTask` looks up the name in `reassignUsers`.

On a boss card, next to `@{task.assignee_name}`, when `task.assignee_department_name` is set, show a second chip with that name. Add `assignee_department_name?: string | null` to the `Task` type. Do not show that chip when `!isBoss`.

Leave scopes, status chips, screenshots, voice, typed create, and `useLiveTaskList` in place.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS, including the relocated board source tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/TaskBoard.tsx src/app/dashboard/page.tsx tests package.json
git commit -m "Filter board pickers by department and redirect admin"
```

---

### Task 18: Deploy notes

**Files:**
- Modify: `README.md`
- Create: `tests/readme-admin-deploy.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `scripts/seed-admin.mjs` and `migrations/011_departments.sql` from Tasks 1 and 3.
- Produces: Oracle instructions that set `ADMIN_PASSWORD` beside `JWT_SECRET` and run the seed after migrations. No password value in the README.

- [ ] **Step 1: Write the failing test**

```js
const readme = readFileSync(join(root, 'README.md'), 'utf8');

it('tells Oracle to migrate then seed the admin without committing a password', () => {
  assert.match(readme, /migrations\/011_departments\.sql/);
  assert.match(readme, /node --experimental-strip-types scripts\/seed-admin\.mjs/);
  assert.match(readme, /ADMIN_PASSWORD/);
  assert.match(readme, /ADMIN_NAME/);
  assert.equal(readme.includes('admin@bossnote.id') || readme.includes('default `Admin`'), true);
  assert.equal(/\$2[aby]\$/.test(readme), false);
  assert.equal(/ADMIN_PASSWORD=\S+/.test(readme), false);
});
```

Also assert the daily digest crontab uses `node --experimental-strip-types scripts/daily-task-notify.mjs`, and that the “who sees tasks” paragraph contains `department` and does not say members see every task they created with no department limit. Assert Lark is still described as one group plus a DM.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/readme-admin-deploy.test.mjs`

Expected: FAIL, README has no migration 011.

- [ ] **Step 3: Write the README edits**

In **Getting Started** / login paragraph, replace the signed-in visit sentence with: opening `/` while signed in goes to Manage Departments for admin and to the board for a boss or member.

In **Create tasks**, replace the company-wide assignee sentence with: a boss’s create list is the staff in that boss’s department; a staff member’s create list is the bosses in their department. Reassign uses `GET /api/tasks/:id/assignees` for the original creator’s department. Bosses still open the board on Assigned to me and can filter All with the company directory. Staff still open on Created by me and only see their own tasks with a boss in their department.

In **Daily digest cron**, change the command to `/usr/bin/node --experimental-strip-types scripts/daily-task-notify.mjs` and say a member’s digest includes only open tasks that pass that member’s visibility rule.

In **Lark**, say Manage Users is the admin page. Leave the single group, the DM, and the Dupoin email table as they are.

In **Deploy notes**, insert after the migration list:

1. Apply `migrations/011_departments.sql` with the other migrations. It seeds the `General` department and assigns existing bosses and staff to it. It does not create the admin login.
2. On the Oracle server `.env`, next to `JWT_SECRET` and the Lark variables, set `ADMIN_PASSWORD` (at least 6 characters). `ADMIN_NAME` is optional; a blank name becomes `Admin` and the derived email is `admin@bossnote.id`.
3. From the app directory, with that env loaded: `node --experimental-strip-types scripts/seed-admin.mjs`. Run it after the migration. Running it again updates the admin password hash and leaves Ian, Bayu, Sandra, and Prista unchanged.
4. Do not commit `ADMIN_PASSWORD` or the hash. `.env.example` keeps both admin variables empty.

Update the digest crontab in that section to the same `--experimental-strip-types` command.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS. Then search the repo:

Run: `rg -n "\\$2[aby]\\$|ADMIN_PASSWORD=.+" migrations/011_departments.sql scripts/seed-admin.mjs .env.example README.md docs/superpowers/plans/2026-10-07-admin-departments.md`

Expected: no matches. Historical hashes in `migrations/001_schema.sql` and `migrations/005_new_users.sql` are out of scope; do not copy them into the new files.

- [ ] **Step 5: Commit**

```bash
git add README.md tests/readme-admin-deploy.test.mjs package.json
git commit -m "Document the admin seed on Oracle"
```

---

## Spec coverage

| Spec section | Task |
| --- | --- |
| Migration order, `dept-general`, no admin hash | 1 |
| `seed-admin.mjs`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `user_settings`, empty `.env.example` | 3, 18 |
| `toSessionUser` fail-closed, JWT is only an id, `/api/auth/me` refresh | 2, 4 |
| Department and user admin APIs, gate boss → admin, last-boss rule removed | 5, 8, 9 |
| `POST /api/auth/password` admin-only, `PUT` stays for everyone | 9, 16 |
| Pair table, create codes, voice hint limited to candidates, reassign by original creator | 6, 10 |
| Visibility, 403 vs 404, status check, boss delete, admin 403 on tasks and SSE | 7, 17 |
| `GET /api/users`, directory, `GET /api/tasks/:id/assignees` | 11, 17 |
| Member digest, boss digest still every open task assigned to that boss | 12 |
| Login and `/` split, header, layouts, Manage Departments, Manage Users, Account | 13, 14, 15, 16 |
| Board scopes, pickers, boss department chip, no push banner or SSE on the admin home | 17 |
| Oracle `ADMIN_PASSWORD` | 18 |
| Deferred cross-department, task department column, per-department Lark | Global Constraints — do not implement |

## Self-review

- Spec coverage: each section in the table has a task with the exact codes, SQL order, and UI copy from the spec.
- Placeholder scan: no TBD, TODO, or “similar to task N” steps. Route and UI tasks name the files and the strings the tests assert.
- Type consistency: `Party`, `Viewer`, `TaskParties`, `decideCreateAssignee`, `decideReassign`, `candidateListQuery`, `canViewTask`, `visibleDigestTasks`, `requireAdmin`, `homePathForRole`, and `ADMIN_USER_ID` are defined before later tasks use them.
