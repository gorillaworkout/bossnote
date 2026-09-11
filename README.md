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

- **Android Chrome:** Allow notifications when prompted (or tap **Enable** on the banner).
- **iOS Safari:** Add to Home Screen first. Web Push only works for the installed PWA, then grant notifications.

After login, the dashboard registers `/sw.js?v=6` (`bossnote-v6`). `/api/` (including `/api/voice/`) is network-only and never served from the SW cache so session cookies stay on voice playback. Push subscription is stored at `POST /api/push/subscribe`. `POST /api/push/test` sends a test notification to the current user.

## Lark group notify (AgenticOS Group)

English-only bosses who miss phone push still see new tasks in Lark. After a successful create (and reassign), BossNote fire-and-forgets a group text:

```
New task: {title}
Assignee: {name}
Priority: {priority}
{bossnote url if known}
```

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
```

If any required Lark var is missing, create/reassign still succeeds; Lark is skipped (one warning log). The custom app bot must be in the group and allowed to send messages.

## Daily digest cron (Oracle, Asia/Jakarta)

Applies `migrations/007_push_subscriptions.sql`, then:

```
0 10 * * * TZ=Asia/Jakarta cd /home/ubuntu/apps/bossnote && set -a && . ./.env && set +a && /usr/bin/node scripts/daily-task-notify.mjs >> /home/ubuntu/logs/bossnote-notify.log 2>&1
```

The script skips users with zero open tasks (`todo` / `in_progress` / `waiting`) and drops dead subscriptions (410/404).

## Create tasks / reminders

Any logged-in user (member or boss) can create:

- **Voice** — same AI pipeline (Gemini 3.7 default + `assignee_hint`). Assignee can be staff or boss. Auto-from-voice still works.
- **Type** — typed title/reminder, no LLM. Works when Gemini is down. `POST /api/tasks` with `text` / `title` (+ `assignee_id`, optional `priority`, `deadline`). JSON body is also accepted.

On create (and reassign), the assignee gets a fire-and-forget push: title `New task`, body = English task title. The same events also post an English text message to the Lark group when Lark env is set (see **Lark group notify** above).

Members still only see tasks assigned to them. Bosses see the full board.

## Deploy notes

1. `npm i`
2. Apply `migrations/007_push_subscriptions.sql`
3. Set VAPID env vars (generate with `npx web-push generate-vapid-keys`). For Lark group notify, set `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_CHAT_ID` (optional `LARK_API_BASE`, `BOSSNOTE_URL`)
4. Install the crontab line above
5. Rebuild / restart (`npm run build && npm start` or your Oracle process manager)
6. Installed PWAs pick up `bossnote-v6` after the next visit
