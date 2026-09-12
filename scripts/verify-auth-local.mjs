// SPDX-License-Identifier: Apache-2.0
// Explicit local-only HTTP integration; creates and removes its own Auth fixture.
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const origin = process.env.ONEVOICE_APP_ORIGIN || 'http://localhost:3000';
const localUrl = process.env.ONEVOICE_LOCAL_URL;
assert.equal(localUrl, 'http://127.0.0.1:54321', 'Only local Supabase is allowed');
assert.ok(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin), 'Only local app is allowed');
assert.ok(process.env.ONEVOICE_LOCAL_ADMIN && process.env.ONEVOICE_LOCAL_JWT, 'Local test credentials required');
const db = createClient(localUrl, process.env.ONEVOICE_LOCAL_ADMIN, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `onevoice-auth-${randomUUID()}@example.invalid`;
const password = randomUUID() + '!aA9';
let userId;
const jar = new Map();
const request = async (path, init = {}) => {
  const response = await fetch(origin + path, { ...init, redirect: 'manual', headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...init.headers } });
  for (const cookie of response.headers.getSetCookie()) {
    assert.match(cookie, /httponly/i);
    assert.match(cookie, /samesite=lax/i);
    const pair = cookie.split(';')[0];
    const split = pair.indexOf('=');
    const name = pair.slice(0, split), value = pair.slice(split + 1);
    if (!value || /max-age=0(?:;|$)/i.test(cookie)) jar.delete(name); else jar.set(name, value);
  }
  return response;
};
const login = () => request('/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password, next: '//outside.invalid' }) });
try {
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null, 'Fixture create failed');
  userId = created.data.user.id;
  const saved = await db.from('staff_profiles').insert({ user_id: userId, organization_id: 'a0000000-0000-0000-0000-000000000001', role: 'staff', active: true, display_name: 'Auth local fixture' });
  assert.equal(saved.error, null, 'Fixture profile failed');
  assert.equal((await request('/api/auth/session')).status, 401);
  if (process.env.ONEVOICE_VERIFY_GUARDS === '1') {
    const missingId = randomUUID();
    for (const path of ['/api/products', '/api/dashboard', '/api/ready', `/api/renders/${missingId}`, `/api/renders/${missingId}/video`, `/api/renders/${missingId}/download`]) {
      assert.equal((await request(path)).status, 401, `Anonymous access: ${path}`);
    }
    for (const suffix of ['video', 'download']) assert.equal((await request(`/api/renders/${missingId}/${suffix}`, { method: 'HEAD' })).status, 401);
    assert.equal((await request('/api/renders', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' })).status, 401);
    for (const path of ['/', '/catalog', '/dashboard', '/history', '/funnel']) {
      const page = await request(path);
      assert.ok([303, 307].includes(page.status), `Anonymous page not redirected: ${path}`);
      assert.match(page.headers.get('location') || '', /^\/login\?/);
    }
    assert.equal((await request('/api/health')).status, 200);
  }
  assert.equal((await request('/api/auth/login', { method: 'POST', headers: { origin: 'https://outside.invalid' } })).status, 403);
  const signedIn = await login();
  assert.equal(signedIn.status, 303);
  assert.equal(signedIn.headers.get('location'), origin + '/dashboard');
  assert.ok(jar.size > 0);
  const session = await request('/api/auth/session');
  assert.equal(session.status, 200);
  assert.equal((await session.json()).actor.role, 'staff');
  assert.equal((await db.from('staff_profiles').update({ active: false }).eq('user_id', userId)).error, null);
  assert.equal((await request('/api/auth/session')).status, 401, 'Disabled profile must affect existing session');
  assert.equal((await db.from('staff_profiles').update({ active: true }).eq('user_id', userId)).error, null);
  assert.equal((await request('/api/auth/session')).status, 200);
  if (process.env.ONEVOICE_VERIFY_GUARDS === '1') {
    assert.equal((await request('/api/products')).status, 200);
    for (const path of ['/api/dashboard', '/api/ready', `/api/renders/${randomUUID()}/video`]) assert.equal((await request(path)).status, 403, `Staff manager access: ${path}`);
    assert.equal((await request('/api/renders', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await db.from('staff_profiles').update({ role: 'manager' }).eq('user_id', userId)).error, null);
    assert.equal((await request('/api/dashboard')).status, 200);
    assert.equal((await request('/api/renders', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' })).status, 400, 'Authorized manager reaches request validation');
    assert.equal((await request('/api/renders', { method: 'POST', headers: { origin: 'https://outside.invalid', 'content-type': 'application/json' }, body: '{}' })).status, 403);
    console.log('PASS: local protected API/page matrix, HEAD, staff permissions and manager Origin boundary');
  }
  if (process.env.ONEVOICE_VERIFY_SETTINGS === '1') {
    assert.equal((await db.from('staff_profiles').update({ role: 'staff' }).eq('user_id', userId)).error, null);
    for (const path of ['/api/settings', '/api/audit']) assert.equal((await request(path)).status, 403);
    assert.equal((await db.from('staff_profiles').update({ role: 'manager' }).eq('user_id', userId)).error, null);
    const initialResponse = await request('/api/settings');
    assert.equal(initialResponse.status, 200);
    const initial = await initialResponse.json();
    const save = input => request('/api/settings', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const input = { expectedRevision: initial.revision, requestId: randomUUID(), settings: { ...initial.settings, brandName: 'OneVoice local HTTP verification' } };
    let current;
    try {
      const saved = await save(input);
      assert.equal(saved.status, 200);
      current = await saved.json();
      assert.equal(current.revision, initial.revision + 1);
      const repeated = await save(input);
      assert.equal(repeated.status, 200);
      assert.deepEqual(await repeated.json(), current);
      assert.equal((await save({ ...input, requestId: randomUUID() })).status, 409);
      const auditResponse = await request('/api/audit?limit=100');
      assert.equal(auditResponse.status, 200);
      const audit = await auditResponse.json();
      assert.ok(audit.events.some(event => event.actor_id === userId), 'Saved settings must have an audit event');
      assert.equal((await request('/settings')).status, 200);
      assert.equal((await request('/settings/audit')).status, 200);
      console.log('PASS: local settings role boundary, save, replay, stale revision, audit and pages');
    } finally {
      if (current) assert.equal((await save({ expectedRevision: current.revision, requestId: randomUUID(), settings: initial.settings })).status, 200, 'Restore original local settings values');
    }
  }
  if (process.env.ONEVOICE_VERIFY_CATALOG === '1') {
    assert.equal((await db.from('staff_profiles').update({ role: 'staff' }).eq('user_id', userId)).error, null);
    assert.equal((await request('/api/products/manage')).status, 403);
    assert.equal((await db.from('staff_profiles').update({ role: 'manager' }).eq('user_id', userId)).error, null);
    const productId = randomUUID();
    const document = { name: 'Local catalog HTTP fixture ' + productId, sku: null, brand: null, productType: 'keyboard', descriptionText: null, priceVnd: 100000, stockQuantity: 3, inStock: true, active: true, specifications: [{ name: 'Switch', value: 'Linear' }], images: [], variants: [] };
    const save = input => request('/api/products/manage', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const input = { requestId: randomUUID(), productId, expectedVersion: 0, document };
    let current;
    try {
      const created = await save(input);
      assert.equal(created.status, 200);
      current = await created.json();
      assert.equal(current.version, 1);
      const replay = await save(input);
      assert.equal(replay.status, 200);
      assert.deepEqual(await replay.json(), current);
      assert.equal((await save({ ...input, requestId: randomUUID() })).status, 409);
      const detailResponse = await request('/api/products/manage?id=' + productId);
      assert.equal(detailResponse.status, 200);
      const detail = await detailResponse.json();
      assert.equal(detail.document.priceVnd, 100000);
      assert.equal(detail.sourceName, 'OneVoice manual');
      const edited = await save({ ...input, requestId: randomUUID(), expectedVersion: current.version, document: { ...document, priceVnd: 125000, stockQuantity: 0 } });
      assert.equal(edited.status, 200);
      current = await edited.json();
      const fresh = await (await request('/api/products/manage?id=' + productId)).json();
      assert.equal(fresh.document.priceVnd, 125000);
      assert.equal(fresh.document.inStock, false);
      assert.equal((await request('/products')).status, 200);
      console.log('PASS: local catalog roles, create, replay, conflict, fresh manual price and zero-stock normalization');
    } finally {
      // Audit/edit history is append-only; retain this named local fixture disabled.
      if (current) assert.equal((await save({ ...input, requestId: randomUUID(), expectedVersion: current.version, document: { ...document, active: false, stockQuantity: 0 } })).status, 200, 'Disable local catalog fixture');
    }
  }
  if (process.env.ONEVOICE_VERIFY_KNOWLEDGE === '1') {
    assert.equal((await db.from('staff_profiles').update({ role: 'staff' }).eq('user_id', userId)).error, null);
    assert.equal((await request('/api/knowledge/sources')).status, 200);
    assert.equal((await request('/api/knowledge')).status, 403);
    assert.equal((await db.from('staff_profiles').update({ role: 'manager' }).eq('user_id', userId)).error, null);
    for (const [path, document] of [
      ['/api/knowledge/sources', { name: 'Local HTTP source fixture', kind: 'text', text: 'Synthetic reference only.', url: null, authority: 'business', productIds: [], topics: ['Test'], freshnessHours: 24, active: true }],
      ['/api/knowledge/sources', { name: 'Local HTTP URL fixture', kind: 'html', text: null, url: 'HTTPS://EXAMPLE.COM.:443/manual', authority: 'reference', productIds: [], topics: [], freshnessHours: 24, active: true }],
      ['/api/knowledge', { kind: 'return', title: 'Local HTTP policy fixture', body: 'Synthetic policy only.', startsAt: null, expiresAt: null, active: true, scope: 'all', productIds: [], discountType: null, discountValue: null }],
      ['/api/knowledge', { kind: 'promotion', title: 'Local HTTP program fixture', body: 'Synthetic program only.', startsAt: null, expiresAt: null, active: true, scope: 'all', productIds: [], discountType: null, discountValue: null }],
    ]) {
      const input = { id: randomUUID(), requestId: randomUUID(), expectedVersion: 0, document };
      const save = payload => request(path, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      let current;
      try {
        const created = await save(input);
        assert.equal(created.status, 200, `${path} create`);
        current = await created.json();
        assert.equal(current.version, 1);
        const replay = await save(input);
        assert.equal(replay.status, 200);
        assert.deepEqual(await replay.json(), current);
        assert.equal((await save({ ...input, requestId: randomUUID() })).status, 409);
        const read = await request(path + (path.endsWith('sources') ? '?id=' + input.id : '?history=' + input.id));
        assert.equal(read.status, 200);
        if (document.kind === 'html') assert.equal((await read.json()).document.url, 'https://example.com/manual');
      } finally {
        if (current) assert.equal((await save({ ...input, requestId: randomUUID(), expectedVersion: current.version, document: { ...document, active: false } })).status, 200, 'Disable local knowledge fixture');
      }
    }
    for (const path of ['/knowledge', '/knowledge/sources']) assert.equal((await request(path)).status, 200);
    console.log('PASS: local source/policy/global-program roles, create, replay, conflict, read/history, disable and pages');
  }
  assert.equal((await request('/api/auth/logout', { method: 'POST', headers: { origin } })).status, 303);
  assert.equal((await request('/api/auth/session')).status, 401);

  // Valid local signature but expired access token and unusable refresh token.
  // Do not wait for production TTL or alter local Auth configuration.
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({ sub: userId, aud: 'authenticated', role: 'authenticated', exp: 1, iat: 0 });
  const signature = createHmac('sha256', process.env.ONEVOICE_LOCAL_JWT).update(`${head}.${body}`).digest('base64url');
  jar.clear();
  jar.set('sb-127-auth-token', 'base64-' + encode({ access_token: `${head}.${body}.${signature}`, refresh_token: 'expired-local-fixture', expires_at: 1, token_type: 'bearer', user: { id: userId } }));
  assert.equal((await request('/api/auth/session')).status, 401, 'Expired session cannot authorize');
  console.log('PASS: local login, cookie flags, CSRF, redirect, fresh disable, logout and expired session');
} finally {
  if (userId) {
    const removed = await db.auth.admin.deleteUser(userId);
    assert.equal(removed.error, null, 'Local fixture cleanup failed');
  }
}
