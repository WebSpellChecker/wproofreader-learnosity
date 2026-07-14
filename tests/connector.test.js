// Integration tests for the connector (src/index.js). The SDK is stubbed (see
// tests/hooks.mjs + tests/stubs/sdk.mjs); we hand-mock the bits of
// document/Element/MutationObserver the connector touches and assert on the
// options it hands the SDK, plus idempotence and lifecycle cleanup.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Cache-bust each import so the connector's static state doesn't leak between tests.
async function freshConnector() {
  const mod = await import('../src/index.js?bust=' + Math.random());
  return mod.default;
}

test('exposes the API as a default export only (no named export)', async () => {
  const mod = await import('../src/index.js?bust=' + Math.random());
  assert.equal(typeof mod.default.init, 'function');
  assert.equal(mod.LearnosityWProofreader, undefined);
});

// Minimal fake element. classList is a plain array (the connector only reads
// .length and indexes it); parent wires the ancestry walk.
function makeElement({ tag = 'DIV', classNames = [], attrs = {}, parent = null, descendants = [] } = {}) {
  return {
    nodeType: 1,
    tagName: tag,
    classList: classNames,
    parentElement: parent,
    _attrs: { ...attrs },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name); },
    getAttribute(name) { return name in this._attrs ? this._attrs[name] : null; },
    matches() { return false; },
    addEventListener() {},
    querySelectorAll() { return descendants; }
  };
}

// A contenteditable inside an lrn-author-* ancestor: in Learnosity scope, author surface.
function makeAuthorEditable() {
  const ancestor = makeElement({ classNames: ['lrn-author-item'] });
  return makeElement({ attrs: { contenteditable: 'true' }, parent: ancestor });
}

function installFakeBrowser({ surfaceGlobals = ['LearnosityAuthor'], editables = [] } = {}) {
  globalThis.__sdkInitCalls = [];
  const observers = [];
  const fakeDoc = {
    documentElement: { lang: '' },
    body: { /* observable */ },
    querySelector() { return null; },
    querySelectorAll() { return editables; },
    head: { appendChild() {} },
    createElement() { return { dataset: {}, addEventListener() {} }; }
  };
  const fakeWindow = { document: fakeDoc };
  for (const g of surfaceGlobals) fakeWindow[g] = {};

  class FakeMutationObserver {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe() {}
    disconnect() {}
  }

  globalThis.window = fakeWindow;
  globalThis.document = fakeDoc;
  globalThis.MutationObserver = FakeMutationObserver;
  return { window: fakeWindow, document: fakeDoc, observers };
}

function uninstallFakeBrowser() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.MutationObserver;
  delete globalThis.__sdkInitCalls;
}

// Let the SDK init() promise's `.then` (which stores the instance) settle.
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('init() with neither serviceId nor serviceHost is a silent no-op (SDK never called)', async (t) => {
  installFakeBrowser({ editables: [makeAuthorEditable()] });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({});
  assert.equal(globalThis.__sdkInitCalls.length, 0);
});

test('attaches via the SDK with the built wproofreader options incl. appType', async (t) => {
  const container = makeAuthorEditable();
  installFakeBrowser({ editables: [container] });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();

  LearnosityWProofreader.init({ wproofreader: { serviceId: 'svc-123' } });

  assert.equal(globalThis.__sdkInitCalls.length, 1);
  const { options } = globalThis.__sdkInitCalls[0];
  assert.equal(options.serviceId, 'svc-123');
  assert.equal(options.appType, 'wpr_learnosity');
  assert.equal(options.enableGrammar, true);
  assert.equal(options.container, container);
});

test('srcUrl in the wproofreader block reaches the SDK; absent otherwise', async (t) => {
  // With srcUrl.
  const container = makeAuthorEditable();
  installFakeBrowser({ editables: [container] });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({
    wproofreader: { serviceId: 'svc', srcUrl: 'https://localhost/wscbundle.js' }
  });
  assert.equal(globalThis.__sdkInitCalls[0].options.srcUrl, 'https://localhost/wscbundle.js');

  // Without srcUrl (fresh module + browser).
  uninstallFakeBrowser();
  installFakeBrowser({ editables: [makeAuthorEditable()] });
  const fresh = await freshConnector();
  fresh.init({ wproofreader: { serviceId: 'svc' } });
  assert.equal('srcUrl' in globalThis.__sdkInitCalls[0].options, false);
});

test('connector-only options never reach the SDK', async (t) => {
  const container = makeAuthorEditable();
  installFakeBrowser({ editables: [container] });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();

  LearnosityWProofreader.init({
    wproofreader: { serviceId: 'svc' },
    surfaces: ['author'],
    enableShorttext: true,
    customSelectors: ['.region']
  });

  const { options } = globalThis.__sdkInitCalls[0];
  assert.equal(options.surfaces, undefined);
  assert.equal(options.enableShorttext, undefined);
  assert.equal(options.customSelectors, undefined);
});

test('init() is idempotent: a later attach uses the updated config', async (t) => {
  // Start with no editables so the first init() does not attach anything.
  const { observers } = installFakeBrowser({ editables: [] });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();

  LearnosityWProofreader.init({ wproofreader: { serviceId: 'first' } });
  LearnosityWProofreader.init({ wproofreader: { serviceId: 'second', lang: 'fr_FR' } });
  assert.equal(globalThis.__sdkInitCalls.length, 0, 'no editables yet, nothing attached');

  // Simulate Learnosity inserting an editable: fire the observer callback.
  const container = makeAuthorEditable();
  observers[0].cb([{ type: 'childList', addedNodes: [container], removedNodes: [] }]);

  assert.equal(globalThis.__sdkInitCalls.length, 1);
  assert.equal(globalThis.__sdkInitCalls[0].options.serviceId, 'second');
  assert.equal(globalThis.__sdkInitCalls[0].options.lang, 'fr_FR');
});

test('removing an attached editor destroys its WProofreader instance', async (t) => {
  const container = makeAuthorEditable();
  const { observers } = installFakeBrowser({ editables: [container] });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();

  LearnosityWProofreader.init({ wproofreader: { serviceId: 'svc' } });
  await flush(); // let the instance get stored on the container

  const { instance } = globalThis.__sdkInitCalls[0];
  observers[0].cb([{ type: 'childList', addedNodes: [], removedNodes: [container] }]);
  assert.equal(instance.destroyed, true);
});

test('does not attach when no allowed-surface global is present', async (t) => {
  installFakeBrowser({ surfaceGlobals: [], editables: [makeAuthorEditable()] });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({ wproofreader: { serviceId: 'svc' } });
  assert.equal(globalThis.__sdkInitCalls.length, 0);
});

test('skips editors whose surface is not in the allowed list', async (t) => {
  // An author-surface editor, but surfaces restricted to items only.
  installFakeBrowser({ surfaceGlobals: ['LearnosityItems'], editables: [makeAuthorEditable()] });
  t.after(uninstallFakeBrowser);
  const LearnosityWProofreader = await freshConnector();
  LearnosityWProofreader.init({ wproofreader: { serviceId: 'svc' }, surfaces: ['items'] });
  assert.equal(globalThis.__sdkInitCalls.length, 0);
});
