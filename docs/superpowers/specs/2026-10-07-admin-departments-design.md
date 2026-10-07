# Admin, departments, and task visibility

Design for BossNote. This document specifies behavior only. It does not add schema, API, or UI code.

## Problem

BossNote currently has two roles, `boss` and `member`. Any boss can create users, reset passwords, and see every task. Members see tasks they created or that are assigned to them, with no department boundary. The assignee list is the whole company. Ian (`boss-001`), Prista (`prista-001`), Bayu (`bayu-001`), and Sandra (`sandra-001`) all share one flat team.

The company needs departments. A boss and the staff in that department assign work to each other. Bosses still need a company-wide view of tasks. User and department administration needs a separate admin account, so a working boss account is not also the account that creates people.

## Goals

- Add a new admin account and the `admin` role. Bayu stays a member.
- Only that admin creates, edits, and deletes departments and users.
- The admin home is Manage Departments and Manage Users. The admin has no task board.
- Store departments in a `departments` table and point each boss and member at one department with `users.department_id` (Approach A). Tasks do not gain a department column.
- Enforce assignment in the API: a task’s creator and assignee are a boss and a member in the same department.
- Bosses see every task in the company. A member sees only their own tasks with bosses in their department.
- Place every existing boss and member into one seeded department, and create the admin from environment variables at seed time.
- Keep live task refresh (SSE), Lark group and DM notify, web push, task images, status chips, voice and typed create, and the existing board scopes.

## Non-goals

- Cross-department assignment. The API rejects it. See Open questions.
- Promoting Bayu, Ian, Prista, or Sandra to admin.
- A second login page, SSO, or email login. Login stays name plus password on `/`.
- More than one admin account, department hierarchies, or a department column on `tasks`.
- Changing Lark to one group per department, or changing push copy, image limits, status values, or the six-month done-task cleanup.
- Rewriting historical tasks so every old row is a boss–member pair.

## Roles

Login is unchanged: case-insensitive unique `users.name`, bcrypt password, `bn_token` httpOnly cookie, 90-day JWT. The JWT identifies the user. Every authorization check loads `role` and `department_id` from `users` for that id. A stale cookie cannot keep a role or department after an admin edits the row. If the row is gone, the request is unauthorized.

`toSessionUser` accepts `admin`, `boss`, and `member`. Any other role fails closed: login returns the same failure as a bad password, and an existing cookie for an unknown role is treated as logged out.

| Role | `department_id` | After login | Can open the board | Can manage users or departments |
| --- | --- | --- | --- | --- |
| `admin` | `NULL` | `/dashboard/departments` | No | Yes |
| `boss` | required | `/dashboard` | Yes, every task | No |
| `member` | required | `/dashboard` | Yes, own boss interactions in their department | No |

There is one admin user, id `admin-001`. The Manage Users form cannot create another admin, and no screen can change a boss or member into admin. The admin cannot take a department, cannot be an assignee, and cannot create tasks.

Bayu (`bayu-001`) remains `member`. The admin is a new row.

Boss and member labels in the product stay Boss and Staff. The header shows Admin, Boss, or Team (the current member label).

## Data model

Approach A. Department membership lives only on the user.

`departments`

- `id` `TEXT` primary key, same style as `users.id` (`gen_random_uuid()::text`, or a fixed id for the seed row).
- `name` `TEXT NOT NULL`. Trimmed, 1–60 characters. Unique case-insensitively.
- `created_at` `TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

`users` changes

- `department_id` `TEXT NULL REFERENCES departments(id) ON DELETE RESTRICT`.
- Role check becomes `role IN ('admin', 'boss', 'member')`.
- Row check: `admin` has `department_id IS NULL`; `boss` and `member` have `department_id IS NOT NULL`.
- Index on `users(department_id)`.

`tasks` is unchanged. A task’s departments are the current `department_id` of `created_by` and `assignee_id`. Moving a user updates what they can see and who they can be paired with. It does not rewrite task rows.

Seed department, inserted by the migration before the check is applied:

- id `dept-general`
- name `General`

Every existing `boss` and `member`, including Ian, Bayu, Sandra, and Prista, and any other non-admin user already in the database, gets `department_id = 'dept-general'`. Then the role and department checks are added.

The admin row is not inserted by SQL with a password hash. `scripts/seed-admin.mjs` upserts it:

- Requires `ADMIN_PASSWORD` (minimum 6 characters, same rule as other passwords). If it is missing, the script exits with an error and writes no user.
- `ADMIN_NAME` optional, default `Admin`. The name must not collide case-insensitively with an existing user. If it does, the script exits without changing that user.
- Id `admin-001`, role `admin`, `department_id` NULL. Email is derived the same way as other accounts (`admin@bossnote.id` when the name is `Admin`). Email is still not used for login.
- Password is bcrypt-hashed at runtime. The script does not print the password.
- Also inserts `user_settings` for `admin-001` so the user row matches other accounts. The admin UI does not expose the voice model.
- `.env.example` may list `ADMIN_NAME` and `ADMIN_PASSWORD` empty. The repo must not contain a real admin password or a bcrypt hash for this account.

Login names stay globally unique. Two people named Bayu cannot exist in different departments, because sign-in has no department field.

## API and auth rules

Layouts and APIs both enforce the role. Hiding a link is not the control.

### Admin-only management

Boss and member calls to these routes return 403. Logged-out calls return 401.

Departments:

- `GET /api/admin/departments` — each department with its boss count and member count.
- `POST /api/admin/departments` — body `{ name }`. 201 with the row. 400 for an empty or too-long name. 409 if the name already exists, case-insensitively.
- `PUT /api/admin/departments/:id` — rename with the same name rules. 404 if the id is missing.
- `DELETE /api/admin/departments/:id` — 409 when any user still has that `department_id`, with an error that tells the admin to move those users first. `ON DELETE RESTRICT` is the backstop. Deleting `dept-general` is allowed once it has no users.

Users, on the existing `/api/admin/users` routes. The gate changes from “boss” to “admin”.

- `GET` returns id, email, name, role, `department_id`, department name, `lark_open_id`, `created_at`, ordered by name. The admin row is included.
- `POST` body `{ name, password, role, department_id }`. `role` is `boss` or `member` only. `department_id` must reference a department. 400 when the department is missing from the body or the role is `admin`. Password minimum stays 6 characters. Name rules stay as they are today (required, max 60, case-insensitive unique). Email is still derived. A `user_settings` row is still created.
- `PUT` can change name, `boss`/`member` role, `department_id`, and `lark_open_id` for a boss or member. Clearing `department_id` on a boss or member is 400. The admin row cannot change role or department. The admin cannot demote or department-assign themselves.
- `DELETE` still refuses self-deletion and still refuses when the user has tasks or replies (409, same idea as today). It also refuses to delete `admin-001`. The old “cannot demote or delete the last boss” rule goes away. The admin is the operator and may leave a department without a boss. Create and assign then fail until a boss exists, as below.

`POST /api/auth/password` (reset someone else’s password) is admin-only. Bosses receive 403. The admin can reset any boss or member. The admin changes their own password only through `PUT /api/auth/password`, which still requires the current password and stays available to every role.

`GET /api/auth/me` returns the database role and `department_id`, then refreshes the cookie from that row.

### Assignment

A pair is valid only when all of the following are true:

- One of creator and assignee has role `boss`, and the other has role `member`.
- Both have non-null `department_id`, and those ids are equal.
- Neither user is `admin`.
- The two ids are different. Opposite roles already imply that. Self-assign is rejected.

Checked pairs:

| Creator | Assignee | Same department | Result |
| --- | --- | --- | --- |
| boss | member | yes | allow |
| member | boss | yes | allow |
| boss | member | no | reject |
| member | boss | no | reject |
| boss | boss | yes | reject |
| member | member | yes | reject |
| admin | anyone | — | reject |
| anyone | admin | — | reject |

Create (`POST /api/tasks`): the signed-in user is the creator. Admin receives 403 and no task is inserted. The assignee id, and any voice `assignee_hint`, may resolve only inside the candidate set for that creator:

- A boss’s candidates are the members in the boss’s department.
- A member’s candidates are the bosses in the member’s department.

A spoken name that matches only someone outside that set does not assign. The response stays the current `400` `assignee_required` (“Pick an assignee”). A form `assignee_id` outside the set, or an id that is not a user, does not fall through to a company-wide match. Unknown id: 400 assignee not found. Known user, invalid pair: 400 with code `assignee_not_allowed` and the message “That assignee is not allowed.” When the candidate set is empty, create returns 400 code `no_assignee_available`. For a member the message is “No boss in your department can take this task.” For a boss it is “No staff in your department to assign.”

Reassign (`PUT /api/tasks/:id` with `assignee_id`): the original `created_by` stays the creator. The new assignee must form a valid pair with that creator’s current role and department, not with the person clicking reassign. So a boss in department A, looking at a task created by a boss in department B, can reassign it only to a member who is currently in department B.

Who may reassign: a boss (any department), or the user who is the current assignee, or the user who is the creator, and only if that caller can also view the task under the visibility rules. Admin receives 403. A member who is neither creator nor assignee receives 403.

The pair rule is about the two users stored on the task. The person saving the change does not have to be the opposite role of the new assignee. A member who was assigned a task by their boss may reassign it to another member in that boss’s current department. `created_by` stays the boss, so the pair remains boss↔member in one department. After that save, the previous member is no longer creator or assignee, so the task leaves their board. The new member sees it.

### Visibility

Let the viewer be `V`, the task creator `C`, and the assignee `A`.

- `V.role = admin`: no task is visible. `GET` and `POST /api/tasks`, `GET/PUT/DELETE /api/tasks/:id`, replies, images, retranscribe, and `GET /api/tasks/events` return 403. The list is not an empty 200.
- `V.role = boss`: every task is visible, in every department. Board scopes still filter that set. `assigned` is tasks whose assignee is this boss. `created` is tasks this boss created. `all` is the whole company, still narrowable by assignee, status, and search. Those filters do not grant or remove the underlying permission.
- `V.role = member`: the task is visible only when `V` is involved and the other party is a boss in `V`’s department.
  - `V` is the assignee and not the creator, `C.role = boss`, and `C.department_id = V.department_id`.
  - Or `V` is the creator and not the assignee, `A.role = boss`, and `A.department_id = V.department_id`.
  - Otherwise the task is hidden. Hidden cases include another member’s tasks, a task whose other party is a member, a task whose other party is a boss in a different department, and a task where this member is both creator and assignee. A task this member created for a boss in their own department stays visible.

Member board scopes apply on top of that predicate:

- `assigned`: visible tasks whose assignee is this member (a boss in their department created it).
- `created`: visible tasks whose creator is this member (they assigned it to a boss in their department).
- `all`: the union of those two. It is not other members’ boards, and it is not every task in the department.

Worked example after everyone starts in General. Ian and Prista are bosses. Bayu and Sandra are members.

- Ian creates a task for Bayu. Bayu sees it. Sandra does not. Ian and Prista both see it.
- Bayu creates a task for Prista. Bayu sees it. Sandra does not. Both bosses see it.
- Bayu does not see a task Sandra created, and Sandra does not see a task assigned only to Bayu.
- A task that is member-to-member or boss-to-boss stays in the database. Both bosses see it. Neither member sees it until a reassign makes a valid pair with the original creator. Example: a task Bayu created for Sandra becomes visible to Bayu only after it is reassigned to Ian or Prista (a boss in Bayu’s department). Sandra then stops being the assignee, so she still does not see it.

The same predicate is used for the task detail, replies, images, status changes, retranscribe, and delete. Status changes currently do not check the viewer. They will. Delete stays boss-only, and any boss may delete any task because bosses can see all of them. Members cannot delete.

A missing task is 404. A task that exists and the caller cannot view is 403.

### Assignee lists

Assignee choices come from the reads below. Every list omits the admin.

- `GET /api/users` is the create-form candidate set for the signed-in user (rules above). Admin receives 403. The response is id, name, and role, enough for the picker label `Name (Boss)` or `Name (Staff)`.
- `GET /api/users?view=directory` is boss-only. It returns every boss and member in the company so the board’s All-scope assignee filter can name people outside the boss’s department. Members and admin receive 403.
- Reassign options for a specific task are not “whoever `/api/users` returned for me” when the creator is someone else. The task screen asks for candidates for that task: `GET /api/tasks/:id/assignees`, visible only when the caller can view the task and is allowed to reassign it. The list is the valid pair set for the task’s creator. Create continues to use `GET /api/users`.

Voice matching runs only on the create candidate set.

### What stays

SSE stays a content-free `tasks` wake-up on `bossnote_tasks`. The client refetches the scoped list, so the list query is what enforces visibility. Admin cannot open the stream.

Push on create and reassign still goes to the new assignee after the pair check succeeds. The daily digest, for a member, includes only open tasks that pass that member’s visibility predicate, so a hidden historical task does not produce a notification they cannot open. A boss’s digest is still every open task assigned to that boss, company-wide.

Lark stays one company group plus a DM to the assignee. Department privacy is in the app. v1 does not split Lark by department. Create and reassign still do not wait on Lark, and a Lark failure still does not fail the task.

Images (up to 8, same size rules), status chips (`todo`, `in_progress`, `waiting`, `done`), bilingual titles, voice clarity, typed create, and create idempotency stay as they are, gated by the rules above.

## UI changes

One login form. The login response includes `role`. Admin is sent to `/dashboard/departments`. Boss and member are sent to `/dashboard`. A signed-in visit to `/` uses the same split, so an admin session never stops on the board.

The shared `/dashboard` layout only requires a session. The board page at exactly `/dashboard` redirects admin to `/dashboard/departments`. Admin still opens `/dashboard/departments`, `/dashboard/users`, and `/dashboard/account`. Layouts on the department and user pages redirect a boss or member to `/dashboard`. A logged-out visitor goes to `/`.

Header:

- Admin: Manage Departments, Manage Users, Account. No Board link. The logo goes to `/dashboard/departments`.
- Boss: Board and Account. Manage Users is removed.
- Member: Board and Account.

Manage Departments (`/dashboard/departments`), admin only:

- List each department with boss count and staff count.
- Add a department by name.
- Rename.
- Delete, with a confirm step. If people are still in it, show the API error and do not remove the row.

Manage Users (`/dashboard/users`), admin only. The current add / edit / reset password / delete flows move here from the boss, and gain a required department select of existing departments. If no department exists, the add form is disabled and tells the admin to create a department first. Role choices are Staff and Boss only. Each row shows the department name. Editing the admin row does not offer role or department. Delete is hidden for the admin row. The page copy states that the admin creates each person, picks Boss or Staff, and places them in a department.

Moving a user to another department, or switching them between Boss and Staff, does not delete tasks. The edit confirm copy says their visible tasks and allowed assignees follow the new role and department immediately.

Account (`/dashboard/account`):

- Every role can change their own password.
- Voice model stays for boss and member only.
- The “reset a user’s password” block is removed from this page. Reset lives on Manage Users.

Board, boss and member only:

- Scopes stay Assigned to me, Created by me, and All, with the same defaults (boss opens Assigned to me, member opens Created by me) and the same `scope` query plus local storage.
- Create and reassign pickers list only the legal candidates. Labels stay `Name (Boss)` and `Name (Staff)`. An empty candidate set shows the same sentence as `no_assignee_available` and does not offer a company-wide list.
- The boss All-scope filter uses the directory list so a boss can narrow the company-wide board to any person.
- On a boss’s cards, show the assignee’s department name. Members are already limited to their own department, so their cards do not need that chip.
- Status chips, screenshots, voice, typed reminder, and live refresh stay on the board.

The admin home does not show the push-enable banner and does not open the task event stream.

## Migration plan

Ship one migration, `migrations/011_departments.sql`, then the admin seed script. Order inside the migration:

1. Create `departments`.
2. Insert `dept-general` / `General` if that id is absent.
3. Add nullable `users.department_id` and the foreign key (`ON DELETE RESTRICT`).
4. Set `department_id = 'dept-general'` on every user whose role is `boss` or `member`.
5. Replace the `users.role` check so `admin` is allowed.
6. Add the admin-null / boss-and-member-required department check.
7. Add the department index and the case-insensitive unique index on department name.

Do not put `admin-001` or a password hash in that file. Deploy runs `scripts/seed-admin.mjs` with `ADMIN_PASSWORD` set in the server environment, the same place as `JWT_SECRET` and the Lark variables, after migrations. Running the seed twice updates the admin password hash to the current `ADMIN_PASSWORD` and leaves role and `department_id` as admin and NULL. It does not touch Ian, Bayu, Sandra, or Prista.

Existing tasks are not updated. After deploy, bosses still see all of them. A member sees an old task only when it is already a same-department boss↔member interaction with them. In the current seed data, Ian and Prista are bosses and Bayu and Sandra are members, all in General, so a task between a boss and a member stays on that member’s board. A task between Bayu and Sandra, or between Ian and Prista, stays on the bosses’ boards only.

Existing boss and member sessions keep working. Their next request loads the new department from the database. A boss session loses Manage Users as soon as the new pages and route checks ship. Anyone still holding the old “bosses manage users” UI gets 403 from the APIs.

## Open questions

These are deferred. v1 behavior above is decided, and none of them block implementation.

- Cross-department assign: whether a boss may later assign a member in another department, and whether that member may assign back only to that boss or to any boss in the boss’s department.
- If cross-department tasks exist later, whether visibility should use the departments saved on the task at create time. v1 reads live `users.department_id`, so an admin move changes visibility immediately and can hide a task from the member who still holds it.
- Whether boss visibility should later shrink from the whole company to one department. v1 bosses see every department.
- Whether Lark should later post to a department channel. v1 keeps the single group and the assignee DM.

## Success criteria

- A new admin can sign in with the seeded name and `ADMIN_PASSWORD`. Bayu’s role is still `member`, and Bayu’s password still signs in as Bayu.
- The repo and `migrations/011_departments.sql` contain no admin password and no admin bcrypt hash.
- Admin landing is Manage Departments and Manage Users. Opening `/dashboard` redirects the admin away. Task list, task detail, create, reassign, reply, image, and the task event stream return 403 for the admin.
- A boss or member who calls department or user admin APIs, or `POST /api/auth/password`, receives 403. They do not see Manage Users or Manage Departments.
- Admin can create a department, create a boss and a member in it, and cannot save a boss or member without a department. Admin’s own `department_id` stays NULL.
- On create, a boss’s assignee list is the members in that boss’s department, and a member’s assignee list is the bosses in that member’s department. On reassign, the list is the valid pair for the original creator: members in the creator’s department when the creator is a boss, and bosses in the creator’s department when the creator is a member. That list is the same when the saver is a boss, the creator, or the current assignee. Boss↔boss, member↔member, self-assign, and cross-department ids return 400 and insert or update nothing.
- Ian, in General, sees a task Prista in another department assigned to a member there. Ian’s reassign control on that task lists that creator’s department members, not Ian’s.
- Bayu sees a task Ian assigned to him, and a task Bayu assigned to Ian or Prista, while everyone is in General. Bayu does not see Sandra’s tasks. Prista sees both Bayu’s and Sandra’s tasks.
- Voice hint resolution cannot select a person outside the create candidate set.
- SSE still refreshes an open boss or member board without putting task bodies on the channel. Push, Lark group text, Lark DM, image upload, and status chips still run for an allowed create and reassign.
- A member’s daily digest omits tasks that fail the member visibility predicate.
