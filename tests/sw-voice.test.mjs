import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');
const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');
const manifest = readFileSync(join(root, 'public/manifest.json'), 'utf8');
const loginPage = readFileSync(join(root, 'src/app/page.tsx'), 'utf8');

describe('service worker voice / API policy', () => {
  it('bumps cache and registration to v8', () => {
    assert.match(sw, /const CACHE = 'bossnote-v8'/);
    assert.doesNotMatch(sw, /bossnote-v7/);
    assert.match(layout, /\/sw\.js\?v=8/);
    assert.doesNotMatch(layout, /\/sw\.js\?v=7/);
  });

  it('skips non-http(s) schemes and does not Cache.put failed fetches', () => {
    const fetchHandler = sw.slice(sw.indexOf("self.addEventListener('fetch'"));
    assert.match(fetchHandler, /url\.protocol !== 'http:' && url\.protocol !== 'https:'\) return/);
    assert.match(fetchHandler, /if \(res\.ok\)/);
    assert.match(fetchHandler, /c\.put\(e\.request/);
    assert.match(fetchHandler, /\.catch\(\(\) => \{\}\)/);
  });

  it('leaves /api/, navigations, and manifest unhandled so cookies stay on the request', () => {
    assert.match(sw, /pathname\.startsWith\('\/api\/'\)\) return/);
    assert.doesNotMatch(sw, /caches\.(match|put)\([^)]*isAPI/);
    const fetchHandler = sw.slice(sw.indexOf("self.addEventListener('fetch'"));
    const apiGuard = fetchHandler.slice(0, fetchHandler.indexOf("self.addEventListener('push'"));
    assert.match(apiGuard, /if \(url\.pathname\.startsWith\('\/api\/'\)\) return;/);
    assert.match(apiGuard, /if \(e\.request\.mode === 'navigate'\) return;/);
    assert.match(apiGuard, /if \(url\.pathname === '\/manifest\.json'\) return;/);
    assert.doesNotMatch(apiGuard, /isAPI/);
    assert.doesNotMatch(apiGuard, /isNavigate/);
  });
});

describe('login session restore', () => {
  it('starts the PWA on the dashboard and redirects / when a session exists', () => {
    assert.match(manifest, /"start_url":\s*"\/dashboard"/);
    assert.match(loginPage, /getSession\(\)/);
    assert.match(loginPage, /redirect\('\/dashboard'\)/);
    assert.match(loginPage, /export const dynamic = 'force-dynamic'/);
  });
});
