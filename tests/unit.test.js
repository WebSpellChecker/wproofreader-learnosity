/*
 * Unit tests for the connector. No DOM library: we hand-mock the small
 * surface of `document` and `Element` that the connector actually touches.
 * Runs under `node --test` (Node 18+).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/*
 * The connector keeps module-level state (`initialized`, `currentConnectorConfig`)
 * so that init() is idempotent in production. That same state would leak
 * between tests if we imported the module once at the top. Instead each test
 * imports a fresh copy via a cache-busting query string, so every test sees a
 * brand-new module instance with `initialized = false`. Idempotence is still
 * covered: the dedicated test calls `init()` twice on the same fresh import.
 */
async function freshConnector() {
  const mod = await import('../src/index.js?bust=' + Math.random());
  return mod.default;
}

/*
 * Mock the bits of the browser environment the connector needs. We only
 * assert on what gets written into `window.WEBSPELLCHECKER_CONFIG`; the
 * MutationObserver and bundle script tag are no-ops we can ignore.
 */
function installFakeBrowser({ htmlLang = '', surfaceGlobals = ['LearnosityApp'] } = {}) {
  const fakeHead = {
    appendChild() {}
  };
  const fakeDocumentElement = {
    lang: htmlLang
  };
  const fakeDoc = {
    documentElement: fakeDocumentElement,
    body: { /* observable */ },
    createElement() { return { dataset: {}, async: false, src: '', addEventListener() {} }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    head: fakeHead
  };
  const fakeWindow = {
    document: fakeDoc,
    MutationObserver: class { observe() {} disconnect() {} }
  };
  for (const g of surfaceGlobals) fakeWindow[g] = {};

  // The connector reads `window` and `document` as globals. Wire both.
  globalThis.window = fakeWindow;
  globalThis.document = fakeDoc;
  globalThis.MutationObserver = fakeWindow.MutationObserver;
  return fakeWindow;
}

function uninstallFakeBrowser() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.MutationObserver;
}

test('init() with no wproofreader.serviceId and no wproofreader.serviceHost is a silent no-op', async (t) => {
  const win = installFakeBrowser();
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({});
  assert.equal(win.WEBSPELLCHECKER_CONFIG, undefined);
});

test('init() with only wproofreader.serviceHost activates self-hosted path', async (t) => {
  const win = installFakeBrowser();
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({
    wproofreader: {
      serviceProtocol: 'https',
      serviceHost: 'localhost',
      servicePort: 443,
      servicePath: '/wscservice/api'
    }
  });
  assert.equal(win.WEBSPELLCHECKER_CONFIG.serviceHost, 'localhost');
  assert.equal(win.WEBSPELLCHECKER_CONFIG.serviceProtocol, 'https');
  assert.equal(win.WEBSPELLCHECKER_CONFIG.servicePort, 443);
  assert.equal(win.WEBSPELLCHECKER_CONFIG.servicePath, '/wscservice/api');
  assert.equal(win.WEBSPELLCHECKER_CONFIG.serviceId, undefined);
});

test('init() with wproofreader.serviceId writes the Cloud config', async (t) => {
  const win = installFakeBrowser();
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({ wproofreader: { serviceId: 'svc-123' } });
  assert.equal(win.WEBSPELLCHECKER_CONFIG.serviceId, 'svc-123');
  assert.equal(win.WEBSPELLCHECKER_CONFIG.enableGrammar, true);
  assert.equal(win.WEBSPELLCHECKER_CONFIG.autocorrect, true);
});

test('explicit wproofreader.lang overrides defaultLang', async (t) => {
  const win = installFakeBrowser({ htmlLang: 'fr-FR' });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({ wproofreader: { serviceId: 'svc', lang: 'de_DE' } });
  assert.equal(win.WEBSPELLCHECKER_CONFIG.lang, 'de_DE');
});

test('lang defaults to <html lang> with hyphen normalised', async (t) => {
  const win = installFakeBrowser({ htmlLang: 'fr-FR' });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({ wproofreader: { serviceId: 'svc' } });
  assert.equal(win.WEBSPELLCHECKER_CONFIG.lang, 'fr_FR');
});

test('lang falls back to en_US for a bare un-regioned <html lang>', async (t) => {
  const win = installFakeBrowser({ htmlLang: 'en' });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({ wproofreader: { serviceId: 'svc' } });
  assert.equal(win.WEBSPELLCHECKER_CONFIG.lang, 'en_US');
});

test('lang falls back to en_US when <html lang> is absent', async (t) => {
  const win = installFakeBrowser({ htmlLang: '' });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({ wproofreader: { serviceId: 'svc' } });
  assert.equal(win.WEBSPELLCHECKER_CONFIG.lang, 'en_US');
});

test('unknown WProofreader options pass through to the global config', async (t) => {
  const win = installFakeBrowser();
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({ wproofreader: { serviceId: 'svc', someFutureWProofreaderOption: 'x' } });
  assert.equal(win.WEBSPELLCHECKER_CONFIG.someFutureWProofreaderOption, 'x');
});

test('connector-only options do not leak into WProofreader config', async (t) => {
  const win = installFakeBrowser();
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({
    wproofreader: { serviceId: 'svc' },
    surfaces: ['questions', 'items', 'author'],
    enableShorttext: true,
    customSelectors: ['.my-host-app-region'],
    bundleUrl: 'https://example.test/wscbundle.js'
  });
  assert.equal(win.WEBSPELLCHECKER_CONFIG.surfaces, undefined);
  assert.equal(win.WEBSPELLCHECKER_CONFIG.enableShorttext, undefined);
  assert.equal(win.WEBSPELLCHECKER_CONFIG.customSelectors, undefined);
  assert.equal(win.WEBSPELLCHECKER_CONFIG.bundleUrl, undefined);
});

test('init() is idempotent: second call updates the existing WProofreader config in place', async (t) => {
  const win = installFakeBrowser();
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({ wproofreader: { serviceId: 'first' } });
  const firstRef = win.WEBSPELLCHECKER_CONFIG;
  LearnosityWProofreader.init({ wproofreader: { serviceId: 'second', lang: 'fr_FR' } });
  assert.equal(win.WEBSPELLCHECKER_CONFIG, firstRef, 'config object identity is preserved');
  assert.equal(win.WEBSPELLCHECKER_CONFIG.serviceId, 'second');
  assert.equal(win.WEBSPELLCHECKER_CONFIG.lang, 'fr_FR');
});
