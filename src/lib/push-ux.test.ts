import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pushBannerDismissKey, pushBannerMode, pushDeniedCopy, shouldShowPushBanner } from './push-ux.ts';
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

describe('push banner copy and dismiss', () => {
  it('uses browser steps on desktop and Android, and iPhone steps only on iOS', () => {
    assert.match(pushDeniedCopy('desktop'), /address bar/i);
    assert.doesNotMatch(pushDeniedCopy('desktop'), /iPhone/);
    assert.match(pushDeniedCopy('android'), /browser/i);
    assert.doesNotMatch(pushDeniedCopy('android'), /iPhone/);
    assert.match(pushDeniedCopy('ios'), /iPhone/);
  });

  it('keeps a dismissed banner hidden until push is actually granted', () => {
    assert.equal(shouldShowPushBanner('denied', true), false);
    assert.equal(shouldShowPushBanner('enable', true), false);
    assert.equal(shouldShowPushBanner('ios-install', true), false);
    assert.equal(shouldShowPushBanner('denied', false), true);
    assert.equal(shouldShowPushBanner('granted', false), false);
    assert.equal(shouldShowPushBanner('unsupported', false), false);
    assert.equal(pushBannerDismissKey('denied'), 'bn_push_banner_dismissed');
    assert.equal(pushBannerDismissKey('ios-install'), 'bn_push_ios_dismissed');
    assert.equal(pushBannerDismissKey('granted'), null);
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
