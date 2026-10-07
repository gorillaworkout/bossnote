# Lark login

Design for BossNote. This document specifies behavior only. It does not add schema, API, or UI code.

Approach A: a standard Lark OAuth web redirect on the existing Lark custom app. Username and password stay on `/` forever. Login with Lark is a second way in.

## Problem

BossNote signs people in with a case-insensitive `users.name` and a bcrypt password, then sets the `bn_token` httpOnly cookie (`src/lib/auth.ts`, `src/lib/session.ts`, `POST /api/auth/login`, `src/components/LoginForm.tsx`). The live site is `https://bossnote.gorillaworkout.id`.

The same Lark app already sends group and DM notifications with `LARK_APP_ID`, `LARK_APP_SECRET`, and `LARK_CHAT_ID`. `users.lark_open_id` (migration `008_lark_open_id.sql`) is a mention address. It is not a login key today.

Staff who already live in Lark should be able to open BossNote without a password BossNote invented for them. The admin account must stay password-only. Ian (`boss-001`), Prista (`prista-001`), Bayu (`bayu-001`), and Sandra (`sandra-001`) already have password rows. Those rows stay password accounts. A Lark sign-in must not attach itself to them by email or by `lark_open_id`.

A first Lark sign-in has no department yet. Migration `011_departments.sql` rejects that: `users_department_role_check` requires every `boss` and `member` to have `department_id`. The check has to allow a member with no department until an admin assigns one.

## Goals

- Keep username and password login, the `bn_token` cookie, and the 90-day JWT exactly as they are.
- Add Login with Lark on the same page, using the authorization-code redirect on the existing Lark app.
- On first successful Lark sign-in, insert a new user: `role = member`, `department_id` NULL, `auth_provider = lark`, a `lark_open_id` that is unique among Lark login rows, and a bcrypt hash of a random secret nobody stores.
- On later Lark sign-ins, find that row by `lark_open_id` and `auth_provider = lark` and start a session. Do not create a second row.
- Show that user on Manage Users. The admin sets role and department there.
- Let that member sign in and open the board before a department is set. Do not let them create a task or be assigned until the department is set.
- Refuse Lark for the admin row. Admin signs in only with a password.
- Leave Ian, Prista, Bayu, and Sandra’s password rows unchanged, including any `lark_open_id` already stored for mentions.

## Non-goals

- QR login, a Lark magic link, or any login other than the password form and this web redirect.
- Linking or merging a Lark identity into an existing password account by email, name, or `lark_open_id`.
- Removing password login, or making Lark required.
- A second admin, or a Lark session whose role is `admin`.
- Storing `user_access_token`, `refresh_token`, or the `offline_access` scope.
- Changing Lark group notify, assignee DMs, push, task visibility for people who already have a department, or the department table.
- Rewriting Ian, Prista, Bayu, or Sandra onto Lark accounts.

## What changes from the departments design

`docs/superpowers/specs/2026-10-07-admin-departments-design.md` still describes roles, assignment, and visibility for everyone who has a department. Two of its rules change here:

- Login is no longer only name plus password. The password form stays. Login with Lark is added on `/`.
- A `member` may have `department_id` NULL. A `boss` still must have a department. `admin` still must not have one. Admin-created password users still require a department at create time. Only a Lark-provisioned member, or an admin edit that clears a member’s department, may store NULL.

Assignment and visibility for a null department are specified below. They do not loosen the same-department boss↔member pair.

## Login UX

`/` stays the only login page. `LoginForm` keeps the username field, password field, and Sign In button. Sign In still `POST`s `/api/auth/login` and still routes with `homePathForRole`.

Under the form, a divider reads `or`. Under that, a full-width link labeled `Login with Lark` points at `GET /api/auth/lark/start`. It is an anchor, not a submit button, so the browser follows the redirect to Lark. It does not call `fetch`.

A signed-in visit to `/` still redirects with `homePathForRole`. `GET /api/auth/lark/start` does the same when `getSession()` already returns a user, and it does not send that browser to Lark.

Password errors stay `Invalid username or password` and `Username and password are required`. Lark errors use the codes in Error cases. The form reads `lark_error` from the query string and shows the fixed sentence for that code. An unknown code shows the generic failure sentence. The page does not render the raw query value.

There is no separate Lark page and no QR code.

## OAuth flow

Two routes, both `force-dynamic`, GET only.

The authorize host is `https://accounts.larksuite.com`. Token and user-info calls use `LARK_API_BASE`, which already defaults to `https://open.larksuite.com/open-apis`. Do not send the browser to `open.larksuite.com` for consent, and do not use the Feishu hosts. Do not call `getTenantToken()`. That token is the bot. This flow uses a one-time user token and then drops it.

### Redirect URI

Production value, registered exactly, with no trailing slash and no hash:

`https://bossnote.gorillaworkout.id/api/auth/lark/callback`

Resolution order for the URI the server sends:

1. `LARK_REDIRECT_URI` when it is a non-empty absolute `http` or `https` URL.
2. Otherwise `{publicBossnoteUrl}/api/auth/lark/callback`, using the existing `publicBossnoteUrl()` order: `BOSSNOTE_URL`, then `APP_URL`, then `NEXT_PUBLIC_APP_URL`.

If that resolution fails, or `LARK_APP_ID`, `LARK_APP_SECRET`, or `LARK_TENANT_KEY` is empty, start does not redirect to Lark. It redirects to `/?lark_error=unavailable`.

### Start

`GET /api/auth/lark/start`

1. If a session already exists, redirect to `homePathForRole` and stop.
2. If configuration is missing, redirect to `/?lark_error=unavailable` and stop.
3. Generate a 32-byte `state` and a 32-byte PKCE `code_verifier`, both base64url. `code_challenge` is the base64url SHA-256 of the verifier ASCII, method `S256`.
4. Set cookie `bn_lark_oauth` to a JWT signed with `jwtSecretBytes()` (the same key as `bn_token`, including the dev fallback). Payload is `state`, `code_verifier`, and a 10-minute expiry. Cookie flags: httpOnly, `sameSite: lax`, `secure` in production, `path: /api/auth/lark`, `maxAge` 600. `lax` is required so the browser sends the cookie on Lark’s top-level redirect back. Replace any previous `bn_lark_oauth` cookie.
5. Redirect the browser to:

`https://accounts.larksuite.com/open-apis/authen/v1/authorize`

Query parameters, built with a URL encoder:

| Name | Value |
| --- | --- |
| `client_id` | `LARK_APP_ID` |
| `response_type` | `code` |
| `redirect_uri` | the resolved redirect URI |
| `scope` | `contact:user.email:readonly` |
| `state` | the generated state |
| `code_challenge` | the S256 challenge |
| `code_challenge_method` | `S256` |

Do not send `prompt`. Do not send `offline_access`. `open_id`, `name`, `en_name`, and `tenant_key` come back from Get User Information without an extra scope. Email comes back only with `contact:user.email:readonly`.

### Callback

`GET /api/auth/lark/callback`

Always clear `bn_lark_oauth` on the response, including failures.

1. If `error` is present, do not read `code`. `access_denied` becomes `/?lark_error=denied`. Any other `error` becomes `/?lark_error=failed`.
2. Read `code` and `state`. Verify the `bn_lark_oauth` JWT with `jwtSecretBytes()`. Reject when the cookie is missing, the signature fails, the JWT is expired, or `state` does not match the query with a timing-safe compare. Redirect to `/?lark_error=state`. Do not call Lark.
3. `POST {LARK_API_BASE}/authen/v2/oauth/token` with JSON:

```json
{
  "grant_type": "authorization_code",
  "client_id": "<LARK_APP_ID>",
  "client_secret": "<LARK_APP_SECRET>",
  "code": "<code>",
  "redirect_uri": "<the same redirect URI used in start>",
  "code_verifier": "<verifier from the JWT>"
}
```

Do not send `scope` on this call. A non-zero Lark `code`, HTTP failure, or missing `access_token` redirects to `/?lark_error=failed`. Lark error `20027` or `99991679` redirects to `/?lark_error=scope`.

4. `GET {LARK_API_BASE}/authen/v1/user_info` with `Authorization: Bearer <access_token>`. Then discard the access token. Do not write it to the database, a cookie, or a log. The same scope errors map to `lark_error=scope`. Any other failure maps to `lark_error=failed`.
5. Read `data.open_id`, `data.name`, `data.en_name`, `data.email`, and `data.tenant_key`. Run `open_id` through `normalizeLarkOpenId`. If that returns null, redirect to `/?lark_error=failed` and insert nothing.
6. If `tenant_key` is not exactly `LARK_TENANT_KEY`, redirect to `/?lark_error=org` and insert nothing. This is the wrong-organization case, including a Lark user such as Ian when his tenant is not the BossNote company.
7. Run the lookup in User provisioning. When that lookup stops because an admin row has this `open_id`, redirect to `/?lark_error=admin` and do not set `bn_token`.
8. Otherwise `createSession` and `setSessionCookie` on the redirect, same cookie as password login. Send the browser to `homePathForRole` of the row just loaded. A member or a boss goes to `/dashboard`. Step 7 already refused `admin`, so this callback does not mint an admin session.

Error and success redirects use the origin of the resolved redirect URI when configuration is present. The path is only `/`, `/dashboard`, or `/dashboard/departments`. The callback does not copy a redirect target from the query string.

Logs may include the Lark numeric `code` and `msg`, and the `open_id` on a rejected admin or organization match. Logs must not include the authorization code, access token, refresh token, app secret, `state`, or `code_verifier`.

## User provisioning

Identity for Lark login is `lark_open_id` plus `auth_provider = lark`. The callback never selects a user by email or by name in order to attach a session.

Lookup order after a valid user-info payload:

1. If any row with `role = admin` has this `lark_open_id`, stop. `lark_error=admin`. No insert. No session.
2. Else select `auth_provider = 'lark' AND lark_open_id = ?`.
3. If that row exists, sign in as that row. Do not change `name`, `email`, `role`, `department_id`, `password_hash`, or `auth_provider`. Update `lark_email` only, using the rule below.
4. If no such row exists, insert one. A password row that already stores the same `lark_open_id` for mentions is not a match and is not updated. The insert still proceeds. Ian, Prista, Bayu, and Sandra stay on their current ids.

Insert, in one transaction with the `user_settings` row:

| Column | Value |
| --- | --- |
| `id` | new UUID, same generator as `POST /api/admin/users` |
| `name` | first free candidate below |
| `email` | BossNote login email from `deriveLoginEmail`, never the Lark address |
| `password_hash` | bcrypt, cost 10, of 32 random bytes. Discard the plaintext. The hash must be a normal bcrypt string. |
| `role` | `member` |
| `department_id` | `NULL` |
| `lark_open_id` | the normalized `open_id` |
| `lark_email` | normalized Lark email, or NULL |
| `auth_provider` | `lark` |

Also insert `user_settings` for that id with `DEFAULT_AUDIO_MODEL`, same as an admin-created user.

Name candidates, in order, case-insensitive against `users.name`, each at most 60 characters. The suffix stays at the end. Shorten the base from its end so the base plus the suffix still fits:

1. Trimmed `data.name`. If that is empty, trimmed `data.en_name`. If that is empty, `Lark user`.
2. `{base} (Lark)`
3. `{base} (Lark 2)` through `{base} (Lark 20)`

Use the first candidate whose `LOWER(name)` is not already taken. Store the Lark casing. Example: Lark name `Ian` while `boss-001` is named Ian produces `Ian (Lark)`, email local-part `ianlark` via `deriveLoginEmail`, not a session for `boss-001`.

If all 21 candidates are taken, roll back and redirect to `/?lark_error=failed`.

Email: `deriveLoginEmail(chosenName, false)`. If that address exists, call `deriveLoginEmail(chosenName, true)` again with a new timestamp, up to five times. If all five exist, roll back and redirect to `/?lark_error=failed`. Do not write `data.email` into `users.email`.

`lark_email`: trim and lowercase `data.email`. Store it when it matches the same shape `normalizeEmail` already uses in `src/lib/lark.ts`. Otherwise store NULL. It is not unique. It is not a login key. On a returning Lark login, set it to the new value, or to NULL when this payload has no usable email. Absence of email does not fail the login.

A concurrent first login can lose the insert on the partial unique index below. The loser rolls back, re-reads `auth_provider = 'lark' AND lark_open_id = ?`, and continues with that row. If the re-read is empty, redirect to `/?lark_error=failed`.

Password login against the random hash fails `bcrypt.compare` and returns the existing 401. `login()` also treats a bcrypt exception as that same 401, so a bad hash cannot 500 the password route. Nothing in the 401 text says the account is Lark-only.

An admin reset (`POST /api/auth/password`) may later replace the hash. After that, the Lark row accepts both that password and Login with Lark. `auth_provider` stays `lark`. That reset does not merge the row with Ian, Prista, Bayu, or Sandra. `PUT /api/auth/password` still requires the current password, so a Lark user cannot set their first password themselves while the hash is still the discarded random secret.

Returning Lark login does not refresh the display name from Lark. The admin owns the name after the insert.

## Uniqueness

`lark_open_id` is unique among Lark login rows, not across the whole table.

Password rows may keep a `lark_open_id` so notify can @mention and DM them. Bayu’s mention id and a new Lark user’s login id may be the same string. Login still ignores the password row. The migration does not add a table-wide unique constraint on `lark_open_id`.

The partial unique index is:

`UNIQUE (lark_open_id) WHERE auth_provider = 'lark' AND lark_open_id IS NOT NULL`

`auth_provider` is a required column, not an optional flag the app guesses from the hash. Existing rows, including the admin and the four password accounts, are `password`.

## Admin is password-only

`admin-001` signs in only through `POST /api/auth/login`. The Lark callback never sets `bn_token` for a row with `role = admin`.

If `admin-001` (or any other `admin` row) has `lark_open_id` set to the person who just consented, the callback stops with `lark_error=admin`. It does not create a member with that `open_id`, and it does not sign in the admin.

On `PUT` for the admin row, `lark_open_id` works like this. Omitted, or equal to the stored value, leaves it. Empty stores NULL, so an id that was saved by mistake can be removed. A different non-empty value is 400 `The admin account cannot use Lark sign-in.` The edit dialog still shows the field, with helper text that this account cannot sign in with Lark. `scripts/seed-admin.mjs` keeps `auth_provider = password` on `admin-001` and does not write `lark_open_id`.

The logged-out page still shows Login with Lark to everyone. If the human who uses the admin password also has a personal Lark user, and that `open_id` is not stored on the admin row, first sign-in creates an ordinary member. That member is not `admin-001` and cannot open Manage Users. Password remains the only path into the admin row.

## Manage Users

`GET /api/admin/users` already lists every user. A Lark insert shows up on the next load. The payload adds `auth_provider` and `lark_email`. Order stays by name.

Each Lark row shows a `Lark` badge, role Staff, department text `No department` while `department_id` is NULL, and `lark_email` when it is set. The login email stays the `@bossnote.id` address. The existing “Lark mention ready” line still follows `lark_open_id`.

Page copy adds this sentence to the current admin instructions: `People who use Login with Lark appear here after their first sign-in, as Staff with no department. Assign a department before they can create or receive tasks.`

Add user is unchanged: name, password, Boss or Staff, and a required department. Those rows stay `auth_provider = password`. The add form cannot create a Lark login.

Edit:

- Name, Boss/Staff, and department still save through `PUT /api/admin/users/:id`.
- A member may be saved with no department. The department control includes `No department` as a real empty option, and that option is the one selected when `department_id` is NULL. The control is not HTML-required while the role is Staff, so the empty option submits. Saving it sends an empty department and the API stores NULL.
- A boss still requires a department. The control is required while the role is Boss. Choosing Boss with `No department` is 400 `A boss account needs a department.` The client blocks that submit with the same sentence.
- Promoting a Lark member to boss in one save is allowed only when the department id is present. Role and department change together, as they do today. Tasks are not deleted. Visibility follows the new role and department on the next request.
- For `auth_provider = lark`, the Lark Open ID field is read-only. `PUT` treats an omitted `lark_open_id`, or one equal to the stored value, as no change. A different value is 400 `Lark sign-in id cannot be changed.` Password rows keep the editable mention field.
- `PUT` does not change `auth_provider`.
- Reset password stays available and does not change `auth_provider`.
- Delete rules stay as they are. A Lark user with no tasks and no replies can be deleted. The next Lark sign-in with that `open_id` inserts a new member.

`validateCreateUser` still requires `department_id`. `validateUpdateUser` allows an empty department only when the resulting role is `member`. Empty department on a `boss` stays 400. The admin row still cannot take a department or a role change.

Department member counts stay `COUNT` of users whose `department_id` is that department. A member with NULL is in no department’s count. Deleting a department is still blocked only by users who point at it.

## Board and assignment with no department

Rule: a member with `department_id` NULL may sign in and open `/dashboard`. They cannot create a task, and nobody can assign a task to them, until an admin sets a department.

This matches the checks already in the code, and the implementation keeps those checks:

- `homePathForRole('member')` is `/dashboard`. The board page does not redirect this member away.
- `buildTaskListQuery` already adds `FALSE` when the viewer is a member without a department, so every scope is an empty list. Assignee, status, and search filters do not override that.
- `canViewTask` already returns false for a member without a department. Detail, replies, images, status, retranscribe, and delete stay 403 for any task.
- `candidatesFor` and `candidateListQuery` already return no one when `department_id` is missing.
- `isValidAssignmentPair` already returns false when either side has a null department. A posted assignee id for this member is 400 `assignee_not_allowed` / `That assignee is not allowed.` They never appear in a boss’s candidate list, because candidates require an equal non-null department.

Create when the signed-in member has no department returns 400 `no_assignee_available` with `An admin must assign your department before you can create tasks.` The board shows that sentence instead of the picker. The older copy, `No boss in your department can take this task.`, remains for a member who has a department and zero bosses in it.

The board also shows this banner while the signed-in member has no department: `An admin has not assigned your department yet. You can sign in, but you cannot create or receive tasks until then.` `GET /api/auth/me` already returns `department_id`, which is enough for the banner. Bosses and members who have a department do not see it.

After the admin sets a department, the next request uses the normal member rules: the member sees only their own tasks with a boss in that department, and they can assign only those bosses. No backfill. Tasks are not created for the waiting period.

Clearing the department later hides the member’s tasks again and removes them from candidate lists. Bosses still see historical tasks. The daily digest already filters with `canViewTask`, so a member with no department gets no digest rows. Push still runs only after a successful pair check, which this member cannot pass.

A boss cannot be stored without a department, so there is no boss equivalent of this state.

## Lark developer console

Use the existing custom app whose App ID and App Secret are already `LARK_APP_ID` and `LARK_APP_SECRET`. Do not create a second app.

In that app:

1. Security settings, Redirect URLs: add `https://bossnote.gorillaworkout.id/api/auth/lark/callback`. If a non-production `LARK_REDIRECT_URI` is used, add that exact URL too.
2. Permissions: enable the user identity scope `contact:user.email:readonly`. The app must already have been granted it, or Lark returns error 20027 on the consent screen. Do not enable `offline_access` for this feature.
3. Publish a version so the new redirect URL and scope are the released version. An unreleased permission does not work for users.
4. Availability stays the BossNote company only. A person in another Lark organization, which is the expected case for Ian (`ian@dupoin.com` while the company mail for the other accounts is `@dupoin.co.id`), never receives a code for this app. If a token is issued anyway, the `tenant_key` check still rejects them.
5. Copy that company’s tenant key into `LARK_TENANT_KEY`. The value is `data.tenant_key` from Get User Information for a known user in the company. The repository must not contain the real tenant key.

Existing bot scopes for group send, DM, and contact id lookup stay as they are. This design does not remove them.

## Environment

Reused, unchanged meaning:

| Variable | Use |
| --- | --- |
| `LARK_APP_ID` | Authorize `client_id` and token `client_id` |
| `LARK_APP_SECRET` | Token `client_secret` |
| `LARK_API_BASE` | Token and user-info prefix. Default `https://open.larksuite.com/open-apis` |
| `BOSSNOTE_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL` | Fallback origin for the redirect URI |
| `JWT_SECRET` | Signs `bn_token` and `bn_lark_oauth` through `jwtSecretBytes()`, including that function’s dev fallback |
| `LARK_CHAT_ID` | Notify only. Not required for login, and not sufficient for it |

New:

| Variable | Required | Value |
| --- | --- | --- |
| `LARK_TENANT_KEY` | Yes, for Lark login | The company `tenant_key`. Empty disables start with `lark_error=unavailable`. |
| `LARK_REDIRECT_URI` | No | Exact callback URL. Unset means `{publicBossnoteUrl}/api/auth/lark/callback`. |

`.env.example` lists `LARK_TENANT_KEY` and `LARK_REDIRECT_URI` empty, with a comment that the production callback is `https://bossnote.gorillaworkout.id/api/auth/lark/callback`. No tenant key, app secret, or token is committed.

Missing `LARK_CHAT_ID` does not disable Lark login. Missing `LARK_APP_ID`, `LARK_APP_SECRET`, or `LARK_TENANT_KEY` does.

## Migration

One new file, `migrations/012_lark_login.sql`. It does not insert users, passwords, open ids, or a tenant key. It does not update Ian, Prista, Bayu, Sandra, or `admin-001`.

Order:

1. `ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'`.
2. Add `users_auth_provider_check`: `auth_provider IN ('password', 'lark')`.
3. `ADD COLUMN lark_email TEXT NULL`.
4. Drop and re-add `users_department_role_check` as `(role = 'admin' AND department_id IS NULL) OR (role = 'boss' AND department_id IS NOT NULL) OR (role = 'member')`. A member may have any `department_id`, including NULL. A boss may not. Admin may not have a department.
5. Add `users_admin_password_only_check`: `role <> 'admin' OR auth_provider = 'password'`.
6. `CREATE UNIQUE INDEX users_lark_login_open_id_idx ON users (lark_open_id) WHERE auth_provider = 'lark' AND lark_open_id IS NOT NULL`.

Existing password rows pick up `auth_provider = password` from the default. Their `department_id` values stay. The new member-null branch does not clear any department.

`scripts/seed-admin.mjs` sets `auth_provider = password` when it upserts `admin-001`, still with `department_id` NULL, and still does not write a Lark id.

## Error cases

The callback and start routes redirect to `/` with one of these codes. No `bn_token` is set. A failed callback inserts nothing. In the concurrent first-login race the winner’s row stays, and the loser signs in as that row when the re-read finds it.

| `lark_error` | When | Sentence on the form |
| --- | --- | --- |
| `denied` | Lark redirects with `error=access_denied` | Lark sign-in was cancelled. |
| `state` | Missing cookie, bad signature, expired state, or state mismatch | Lark sign-in expired. Try again. |
| `org` | `tenant_key` ≠ `LARK_TENANT_KEY` | This Lark account is not in the BossNote organization. |
| `admin` | This `open_id` is stored on a user whose role is `admin` | The admin account signs in with a password. |
| `unavailable` | App id, app secret, tenant key, or redirect URI is missing | Lark sign-in is not available. |
| `scope` | Lark `20027` or `99991679` | Lark did not grant the permissions BossNote needs. |
| `failed` | Token or user-info failure, unusable `open_id`, name or email exhaustion, or a database error | Lark sign-in failed. Try again or use your password. |

A missing email field is not `scope` and not `failed`. Login continues with `lark_email` NULL.

If Lark shows its own error page and never hits the callback, BossNote has no session and no new user. That is the usual result when the app is not available to Ian’s organization.

Password login is a separate failure. Wrong password, unknown name, and the random Lark hash all return 401 `Invalid username or password`.

## Testing checklist

Automated:

- Start builds the authorize URL with `client_id`, `response_type=code`, the encoded redirect URI, scope `contact:user.email:readonly` only, `state`, and S256 `code_challenge`. It does not include `offline_access` or `prompt`.
- Start with any of app id, secret, tenant key, or redirect base missing redirects to `/?lark_error=unavailable` and sets no Lark cookie.
- Start with a session redirects home and does not set `bn_lark_oauth`.
- Callback rejects a missing cookie, a tampered JWT, an expired JWT, and a mismatched `state` as `lark_error=state`, and it does not call the token URL.
- Callback maps `error=access_denied` to `denied` and does not call the token URL.
- Callback maps Lark `20027` and `99991679` to `scope`, and other token or user-info failures to `failed`.
- A `tenant_key` other than `LARK_TENANT_KEY` inserts nothing and redirects to `org`.
- An `open_id` stored on `admin-001` inserts nothing and sets no session.
- First login inserts `member`, NULL `department_id`, `auth_provider = lark`, the open id, a `user_settings` row, and a bcrypt hash. `bcrypt.compare` of `password` and of an empty string is false.
- The same `open_id` on Bayu’s password row does not select Bayu. The new row has a different id. Bayu’s name, hash, role, department, and `lark_open_id` are unchanged.
- Lark name `Ian` inserts `Ian (Lark)` when Ian exists, and `ianlark@bossnote.id` (or the timestamp form if that address exists). `users.email` is not the Lark mailbox.
- Second login with the same `open_id` does not insert and does not rename the user. It updates `lark_email` only.
- Two concurrent first logins leave one row, and both can resolve to that row.
- `validateUpdateUser` accepts a member with an empty department and rejects a boss with an empty department.
- `PUT` rejects a changed non-empty `lark_open_id` on the admin and a changed `lark_open_id` on a Lark user. Repeating the stored value, or clearing the admin’s value, is allowed.
- A member with NULL `department_id` gets a task list query that is false, `canViewTask` false, no candidates, and create 400 with `An admin must assign your department before you can create tasks.`
- A member in General still gets the older empty-department-boss message when the candidate list is empty for that reason, and assignment inside General still works.
- Password login for Ian still returns Ian. Admin password login still returns the admin and still lands on `/dashboard/departments`.

Manual, on `https://bossnote.gorillaworkout.id` after the console steps:

- The password form still signs Ian in. Login with Lark is on the same card.
- A company user who has never had a BossNote row lands on an empty board with the department banner, and Manage Users shows them as Staff, Lark, no department.
- After the admin sets a department, that user can assign a boss in that department and does not see other departments.
- Cancelling the Lark consent screen returns to `/` with `Lark sign-in was cancelled.` and does not add a user.
- A Lark user outside `LARK_TENANT_KEY` does not get a BossNote session.
- Admin password still opens Manage Users. Login with Lark as the open id stored on the admin, if one is set, does not.

## Out of scope

- Lark QR login and magic-link login.
- Auto-linking a Lark `open_id` or email to Ian, Prista, Bayu, Sandra, or any other `auth_provider = password` row.
- Using Lark email as `users.email` or as a login lookup.
- Refresh tokens, a Lark session longer than the consent, and `offline_access`.
- Hiding the Lark button from the admin human, or creating their member row in advance.
- Per-department Lark apps, or changing notify channels.
- A table-wide unique constraint on `lark_open_id`.

## Success criteria

- Ian, Prista, Bayu, and Sandra still sign in with their current names and passwords, and their user ids are unchanged after someone with the same Lark name or the same `open_id` uses Login with Lark.
- That Lark sign-in creates a different member with no department, and a second sign-in reuses that member.
- The admin cannot obtain `bn_token` from the Lark callback. Password login for the admin still works.
- A member with no department can open `/dashboard`, sees no tasks, cannot create, and cannot be chosen as an assignee. After the admin assigns a department, the existing same-department rules apply.
- Manage Users lists the Lark member without a separate import.
- The Lark app credentials stay the existing `LARK_APP_ID` and `LARK_APP_SECRET`. The redirect URL registered for production is `https://bossnote.gorillaworkout.id/api/auth/lark/callback`.
- No route stores a Lark access token or refresh token.
