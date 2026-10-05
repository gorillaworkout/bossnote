import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pushBannerMode } from './push-ux.ts';
import { uniqueSubscriptions } from './push-targets.ts';

describe('pushBannerMode', () => {
  it('tells iOS Safari to add the app before asking for permission', () => {
    assert.equal(pushBannerMode({
      ios: true,
      standalone: false,
      hasServiceWorker: true,
      hasPushManager: false,
      hasNotification: false,
      permission: 'unknown',
    }), 'ios-install');
  });

  it('asks for permission once the iOS app is installed', () => {
    assert.equal(pushBannerMode({
      ios: true,
      standalone: true,
      hasServiceWorker: true,
      hasPushManager: true,
      hasNotification: true,
      permission: 'default',
    }), 'enable');
  });

  it('explains a blocked permission and stays quiet when already granted', () => {
    const base = {
      ios: false,
      standalone: false,
      hasServiceWorker: true,
      hasPushManager: true,
      hasNotification: true,
    };
    assert.equal(pushBannerMode({ ...base, permission: 'denied' }), 'denied');
    assert.equal(pushBannerMode({ ...base, permission: 'granted' }), 'granted');
    assert.equal(pushBannerMode({
      ...base,
      hasPushManager: false,
      permission: 'default',
    }), 'unsupported');
  });
});

describe('uniqueSubscriptions', () => {
  it('keeps every device endpoint for the same user', () => {
    const subs = uniqueSubscriptions([
      { endpoint: 'https://push.example/mac', user_id: 'boss-001' },
      { endpoint: 'https://push.example/iphone', user_id: 'boss-001' },
      { endpoint: ' https://push.example/iphone ', user_id: 'boss-001' },
      { endpoint: '', user_id: 'boss-001' },
    ]);
    assert.deepEqual(subs.map((sub) => sub.endpoint.trim()), [
      'https://push.example/mac',
      'https://push.example/iphone',
    ]);
  });
});
