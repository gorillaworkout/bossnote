# BossNote

Voice (and typed) task manager PWA. Staff and bosses create reminders for anyone on the team. Installed phones get Web Push for new assignments and a daily digest.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tests

```bash
npm test
```

## Web Push (phone notifications)

Generate VAPID keys (do **not** commit real keys):

```bash
npx web-push generate-vapid-keys
```

Example placeholder only:

```
VAPID_PUBLIC_KEY=BPlaceholderPublicKey_not_a_real_key
VAPID_PRIVATE_KEY=PlaceholderPrivateKey_not_a_real_key
VAPID_SUBJECT=mailto:admin@gorillaworkout.id
```

Add those to `.env` on the server. Also required: `DATABASE_URL`, `JWT_SECRET`, `GORILLAWORKOUT_API_KEY` (voice path only).

### Phone notes

- **Android Chrome:** Allow notifications when prompted (or tap **Enable Push** on the banner).
- **iOS Safari:** Add to Home Screen first. Web Push only works for the installed PWA. The banner says **Add to Home Screen** until the app is opened from the icon, then tap **Enable Push**. Each device stores its own subscription; a new phone does not replace the Mac.

After login, the dashboard registers `/sw.js?v=8` (`bossnote-v8`). `/api/`, document navigations, and `/manifest.json` are network-only so the `bn_token` session cookie is not dropped on reopen. Non-http(s) schemes (e.g. `chrome-extension://`) are left unhandled so `Cache.put` does not throw. Push subscription is stored at `POST /api/push/subscribe`. `POST /api/push/test` sends a test notification to the current user.

Login lasts **90 days** on the same browser/PWA (`bn_token` httpOnly cookie + JWT). Opening `/` or the installed app while still signed in goes to the dashboard. Logout clears the cookie. Keep `JWT_SECRET` stable across process restarts or existing sessions become invalid.

## Lark group notify (AgenticOS Group)

English-only bosses who miss phone push still see new tasks in Lark. After a successful create (and reassign), BossNote fire-and-forgets a group text:

```
New task: {title}
From: {creator name}
Assignee: @Assignee   (Lark mention when a Lark id is known)
Priority: {priority}
{bossnote url if known}
```

The assignee is **@mentioned** so they get a Lark notification in AgenticOS Group. Official `im/v1/messages` text syntax is `<at user_id="ou_xxx">Name</at>` (`user_id` = open_id, union_id, or user_id — not the BossNote display name). If mention lookup fails, the message still posts with a plain `Assignee: Name` line. Create/reassign never waits on Lark.

The same event also sends a **personal Lark DM** to the assignee (`POST /im/v1/messages?receive_id_type=open_id`) when their open_id resolves. The DM is a short English reminder (new task or reassigned, title, from, priority, and the task link when `BOSSNOTE_URL` is set). It does not @mention anyone else, and it does not message the creator separately — only the assignee, including when they assigned the task to themselves. If the DM is rejected or the open_id is missing, BossNote logs `[lark] dm failed` (or skips silently when there is no id) and the group post still stands. Create/reassign is not blocked.

Reassign uses `Task reassigned:` as the heading. `From` is the person who created the task or performed the reassignment (the signed-in user).

Required on the server (already on Oracle prod `.env` — do **not** commit secrets):

```
LARK_APP_ID=cli_xxx
LARK_APP_SECRET=xxx
LARK_CHAT_ID=oc_xxx
```

Optional:

```
LARK_API_BASE=https://open.larksuite.com/open-apis
BOSSNOTE_URL=https://your-bossnote-host
LARK_OPEN_IDS={"boss-001":"ou_REPLACE","bayu-001":"ou_REPLACE","prista-001":"ou_REPLACE","sandra-001":"ou_REPLACE"}
```

`ou_REPLACE` is not a real id. Put the real open_ids in the Oracle env or in `users.lark_open_id`. Do not commit them. Keys are the BossNote user ids from the migrations (Ian is `boss-001`, not `ian-001`). Names still work as keys (`Ian`, `Boss`, `Bayu`, `Prista`, `Sandra`). The same open_id can be listed under more than one key.

Optional `LARK_ASSIGNEE_EMAILS` adds or corrects a directory email (same JSON or `id:email` comma form). Use it for Bayu once his Dupoin address is known. It does not replace the built-in list below unless you repeat a key.

**Assignee → Lark id** (first match wins; never blocks task create). Create and reassign both DM the assignee when this resolves:

1. `users.lark_open_id` — **Manage Users → Edit → Lark Open ID**, or `UPDATE users SET lark_open_id = 'ou_…' WHERE id = '…'` after `migrations/008_lark_open_id.sql`.
2. `LARK_OPEN_IDS` — JSON or comma list, keyed by BossNote user id or display name.
3. Directory email — `POST /contact/v3/users/batch_get_id?user_id_type=open_id` with the tenant token. Needs scope `contact:user.id:readonly` (obtain user id by email). A miss or an API error is logged and skipped. Successful ids are cached a few minutes in the process. They are not written back to the database.
4. Group member list — `GET /im/v1/chats/{chat_id}/members` matched to the BossNote name (case-insensitive), including a unique first name (`Bayu` ↔ `Bayu Darmawan`). Two people sharing that first name are not guessed. Needs the bot scope to view group members. Cached a few minutes.

BossNote login emails (`ian@bossnote.id` and the others) are not in Lark. The contact call uses these Dupoin addresses:

| BossNote user id | Names matched | Directory email |
| --- | --- | --- |
| `boss-001` | Ian, Boss | `ian@dupoin.com` |
| `sandra-001` | Sandra, Alessandra | `alessandra.jovita@dupoin.co.id` |
| `prista-001` | Prista | `prista.regina@dupoin.co.id` |
| `bayu-001` | Bayu | none in this repo |

After a lookup, copy each returned `user_id` (that field is the open_id when `user_id_type=open_id`) into one of these places on Oracle:

- `LARK_OPEN_IDS` in the server `.env`, then restart the app, or
- **Manage Users → Edit → Lark Open ID** (column `users.lark_open_id`).

Either one is checked before the contact API, so the DM still works if the contact scope is missing later. The app also calls the contact API on create/reassign when those are empty, so DMs work before the ids are pasted, as long as the bot can read user ids by email and can DM (`im:message.p2p_msg:send_as_bot`).

If any required Lark var is missing, create/reassign still succeeds; Lark is skipped (one warning log). The custom app bot must be in the group and allowed to send messages (`im:message` or `im:message:send_as_bot`, and the group-send scope if the app uses granular permissions). Personal DMs also need permission to message a user, typically `im:message.p2p_msg:send_as_bot`, and the assignee must be in the app’s availability. A DM can still fail if that person has never opened a chat with the bot; BossNote logs it and continues.

## Daily digest cron (Oracle, Asia/Jakarta)

Applies `migrations/007_push_subscriptions.sql`, then:

```
0 10 * * * TZ=Asia/Jakarta cd /home/ubuntu/apps/bossnote && set -a && . ./.env && set +a && /usr/bin/node scripts/daily-task-notify.mjs >> /home/ubuntu/logs/bossnote-notify.log 2>&1
```

The script skips users with zero open tasks (`todo` / `in_progress` / `waiting`) and drops dead subscriptions (410/404).

## Create tasks / reminders

Any logged-in user (member or boss) can create:

- **Voice** — same AI pipeline (Gemini 3.7 default + `assignee_hint`). Assignee can be staff or boss. Auto-from-voice still works. A form-selected assignee wins over the AI name hint. If neither resolves, `POST /api/tasks` returns `400` with `code: assignee_required` and the dashboard asks **Who is this task for?** then retries the same recording with `assignee_id`.
- **Type** — typed title/reminder, no LLM. Works when Gemini is down. `POST /api/tasks` with `text` / `title` (+ `assignee_id`, optional `priority`, `deadline`). JSON body is also accepted.

On create (and reassign), the assignee gets a fire-and-forget push to **every** stored device: title `New task`, body = English task title, tap opens that task. The same events also post an English text message to the Lark group and, when the assignee’s open_id resolves, a personal Lark DM (see **Lark group notify** above).

The board has **Assigned to me**, **Created by me**, and **All**. Bosses open on **Assigned to me**. Other users open on **Created by me**. The choice is kept in the `scope` query (`assigned`, `created`, or `all`) and in local storage. **All** is every task that user is allowed to see: bosses see the whole board (and can still narrow it with the assignee picker); members see tasks assigned to them or created by them. The assignee picker lists staff and every Boss account as `Name (Boss)`.

### Screenshots

Create and the task screen accept optional photos (JPEG, PNG, WebP, GIF, or HEIC), up to **8** per task. Pick several at once. A photo is not required: if one upload fails, the task is still saved, the photos that succeeded stay attached, and the task screen shows **Add screenshot** to retry.

List cards show the first photo and a count when there are more. The task screen shows the full gallery.

**Size.** The browser keeps screenshots at or under **3.5MB** as-is so text stays sharp. Larger photos and HEIC are compressed before upload: longest side **2000px**, JPEG quality **0.85**. Originals over **8MB** also try **1600px / 0.72** and **1280px / 0.60** until the file fits. The server stores at most **8MB** per file and rejects anything that is still bigger. Files live in `IMAGE_UPLOAD_DIR` (default `public/uploads/images`; on Oracle use a path outside the repo, same idea as voice notes): `{taskId}-0.jpg`, `{taskId}-1.png`, and so on. Older single files named `{taskId}.jpg` still open.

Apply `migrations/009_task_image.sql` and `migrations/010_task_images.sql`. `image_path` remains the first photo. `image_paths` is the full gallery.

## Done-task retention (6 months)

`scripts/cleanup-old-tasks.mjs` deletes tasks with `status = 'done'` whose `updated_at` is older than **6 months** (index `idx_tasks_done_updated` in `migrations/006_add_users.sql`). It also deletes their voice files and **every** screenshot for those tasks (`{taskId}.ext` and `{taskId}-{n}.ext`) from `IMAGE_UPLOAD_DIR`. Replies cascade with the task. Deleting a task in the app removes its image files the same way.

Run it from the app directory with the server env loaded (same pattern as the daily digest):

```
cd /home/ubuntu/apps/bossnote && set -a && . ./.env && set +a && node scripts/cleanup-old-tasks.mjs
```

## Live task list

Open dashboards (PC and phone) subscribe to `GET /api/tasks/events` with Server-Sent Events. The browser sends the existing `bn_token` cookie. Web Push and Lark stay as they are — push still alerts a closed or background phone; it does not update an open list, and a desktop session often has no push subscription.

After a task is created, reassigned, status-changed, replied to, retranscribed, or its screenshots change, the server publishes `{ "type": "tasks" }` to every connected dashboard in this Node process and runs `pg_notify('bossnote_tasks', '')`. The event has no task body. Each open session refetches `GET /api/tasks` with its current scope (**Assigned to me**, **Created by me**, or **All**), status filter, and search, so a task only appears where that user is already allowed to see it.

The stream sends `retry: 3000` so the browser reconnects after a drop, a 15s comment heartbeat so proxies do not treat the tab as idle, and a refetch when the stream reconnects or the tab becomes visible again.

No new environment variables. Run **one Node process** for the app (`npm start`, or PM2 fork mode with `instances: 1`). `pg_notify` also wakes other processes that share `DATABASE_URL` and are serving `/api/tasks/events`, but a single process is the setup this app deploys with.

### Oracle nginx

SSE is one long HTTP response. If nginx buffers it, the assignee's list stays stale until the proxy times out. Proxy this path with buffering off. The app also sends `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform`. `Content-Type` is `text/event-stream`.

```nginx
location /api/tasks/events {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    add_header X-Accel-Buffering no;
}
```

Keep the same `proxy_set_header` values the rest of the BossNote site already uses (including the cookie). Do not add `proxy_buffering on` for `/api/`.

## Deploy notes

1. `npm i`
2. Apply `migrations/007_push_subscriptions.sql`, `migrations/008_lark_open_id.sql`, `migrations/009_task_image.sql`, and `migrations/010_task_images.sql`
3. Optional: `IMAGE_UPLOAD_DIR=/home/ubuntu/data/bossnote-images` (create the directory; do not commit photos)
4. Set VAPID env vars (generate with `npx web-push generate-vapid-keys`). For Lark group notify and assignee DMs, set `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_CHAT_ID` (optional `LARK_API_BASE`, `BOSSNOTE_URL`, `LARK_OPEN_IDS` keyed by `boss-001`, `bayu-001`, `prista-001`, `sandra-001`). Enable bot scopes for group send, user DM (`im:message.p2p_msg:send_as_bot`), and email → open_id (`contact:user.id:readonly`). See **Lark group notify** for the Dupoin emails to resolve.
5. Install the crontab line above
6. Rebuild / restart (`npm run build && npm start` or your Oracle process manager)
7. Installed PWAs pick up `bossnote-v8` after the next visit
