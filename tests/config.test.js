// Unit tests for the pure config layer (src/config.js): the two-tier option
// split, the WProofreader defaults, and surface normalisation. No DOM, no SDK.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConfig,
  normalizeSurfaces,
  APP_TYPE
} from '../src/config.js';

// defaultLang() reads document.documentElement.lang; stub it per test.
function withHtmlLang(t, lang) {
  globalThis.document = { documentElement: { lang } };
  t.after(() => { delete globalThis.document; });
}

test('serviceId path: Cloud config with grammar/autocorrect/appType defaults', () => {
  const config = buildConfig({ wproofreader: { serviceId: 'svc-123' } });
  assert.equal(config.wproofreader.serviceId, 'svc-123');
  assert.equal(config.wproofreader.enableGrammar, true);
  assert.equal(config.wproofreader.autocorrect, true);
  assert.equal(config.wproofreader.appType, 'learnosity_extension');
});

test('self-hosted service options pass through unchanged', () => {
  const config = buildConfig({
    wproofreader: {
      serviceProtocol: 'https',
      serviceHost: 'localhost',
      servicePort: 443,
      servicePath: '/wscservice/api'
    }
  });
  assert.equal(config.wproofreader.serviceHost, 'localhost');
  assert.equal(config.wproofreader.serviceProtocol, 'https');
  assert.equal(config.wproofreader.servicePort, 443);
  assert.equal(config.wproofreader.servicePath, '/wscservice/api');
  assert.equal(config.wproofreader.serviceId, undefined);
});

test('enableGrammar and autocorrect can be turned off explicitly', () => {
  const config = buildConfig({
    wproofreader: { serviceId: 'svc', enableGrammar: false, autocorrect: false }
  });
  assert.equal(config.wproofreader.enableGrammar, false);
  assert.equal(config.wproofreader.autocorrect, false);
});

test('appType is set to the fixed partner tag', () => {
  const config = buildConfig({ wproofreader: { serviceId: 'svc' } });
  assert.equal(config.wproofreader.appType, APP_TYPE);
  assert.equal(APP_TYPE, 'learnosity_extension');
});

test('appType is not caller-configurable: a supplied value is ignored', () => {
  const config = buildConfig({ wproofreader: { serviceId: 'svc', appType: 'custom_partner' } });
  assert.equal(config.wproofreader.appType, 'learnosity_extension');
});

test('explicit wproofreader.lang overrides defaultLang', (t) => {
  withHtmlLang(t, 'fr-FR');
  const config = buildConfig({ wproofreader: { serviceId: 'svc', lang: 'de_DE' } });
  assert.equal(config.wproofreader.lang, 'de_DE');
});

test('lang defaults to <html lang> with hyphen normalised', (t) => {
  withHtmlLang(t, 'fr-FR');
  const config = buildConfig({ wproofreader: { serviceId: 'svc' } });
  assert.equal(config.wproofreader.lang, 'fr_FR');
});

test('lang falls back to en_US for a bare un-regioned <html lang>', (t) => {
  withHtmlLang(t, 'en');
  const config = buildConfig({ wproofreader: { serviceId: 'svc' } });
  assert.equal(config.wproofreader.lang, 'en_US');
});

test('lang falls back to en_US when document is absent', () => {
  const config = buildConfig({ wproofreader: { serviceId: 'svc' } });
  assert.equal(config.wproofreader.lang, 'en_US');
});

test('unknown WProofreader options pass through to the wproofreader config', () => {
  const config = buildConfig({ wproofreader: { serviceId: 'svc', someFutureWProofreaderOption: 'x' } });
  assert.equal(config.wproofreader.someFutureWProofreaderOption, 'x');
});

test('connector-only options do not leak into the wproofreader config', () => {
  const config = buildConfig({
    wproofreader: { serviceId: 'svc' },
    surfaces: ['questions', 'items', 'author'],
    enableShorttext: true,
    customSelectors: ['.my-host-app-region']
  });
  assert.equal(config.wproofreader.surfaces, undefined);
  assert.equal(config.wproofreader.enableShorttext, undefined);
  assert.equal(config.wproofreader.customSelectors, undefined);
  // ...and they land at the top level instead.
  assert.deepEqual(config.surfaces, ['questions', 'items', 'author']);
  assert.equal(config.enableShorttext, true);
  assert.deepEqual(config.customSelectors, ['.my-host-app-region']);
});

test('srcUrl rides through the wproofreader block to the SDK', () => {
  const config = buildConfig({
    wproofreader: { serviceId: 'svc', srcUrl: 'https://localhost/wscbundle.js' }
  });
  assert.equal(config.wproofreader.srcUrl, 'https://localhost/wscbundle.js');
});

test('normalizeSurfaces drops unknown entries and defaults non-arrays to author', () => {
  assert.deepEqual(normalizeSurfaces(['author', 'bogus', 'items']), ['author', 'items']);
  assert.deepEqual(normalizeSurfaces(undefined), ['author']);
  assert.deepEqual(normalizeSurfaces('author'), ['author']);
});
