import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');
const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');

describe('service worker voice / API policy', () => {
  it('bumps cache and registration to v6', () => {
    assert.match(sw, /const CACHE = 'bossnote-v6'/);
    assert.doesNotMatch(sw, /bossnote-v5/);
    assert.match(layout, /\/sw\.js\?v=6/);
    assert.doesNotMatch(layout, /\/sw\.js\?v=5/);
  });

  it('leaves /api/ unhandled so voice GETs are network-only with cookies', () => {
    assert.match(sw, /pathname\.startsWith\('\/api\/'\)\) return/);
    assert.doesNotMatch(sw, /caches\.(match|put)\([^)]*isAPI/);
    // Must not re-fetch intercepted API requests (drops cookies on media).
    const fetchHandler = sw.slice(sw.indexOf("self.addEventListener('fetch'"));
    const apiGuard = fetchHandler.slice(0, fetchHandler.indexOf("self.addEventListener('push'"));
    assert.match(apiGuard, /if \(url\.pathname\.startsWith\('\/api\/'\)\) return;/);
    assert.doesNotMatch(apiGuard, /isAPI/);
  });
});
