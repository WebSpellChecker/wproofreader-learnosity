/**
 * WProofreader connector for Learnosity.
 *
 * Targeted attachment to Learnosity-rendered editables, scoped by an ancestry
 * walk for any `lrn`-prefixed class plus optional caller-supplied selectors.
 * Per-editor `surfaces` filter (default `['author']`) covers assessment
 * integrity by excluding Questions and Items by default; the host app opts in
 * explicitly. Cleans up WProofreader instances when their host elements are
 * removed from the DOM (single-page apps that rebuild Learnosity widgets do
 * not leak).
 *
 * Usage in a host app:
 *
 *   import LearnosityWProofreader from '@webspellchecker/wproofreader-learnosity';
 *
 *   LearnosityWProofreader.init({
 *     wproofreader: { serviceId: 'YOUR_WPROOFREADER_SERVICE_ID' }
 *   });
 *
 *   LearnosityApp.init(signedRequest, callbacks);
 */

const DEFAULT_BUNDLE_URL =
  'https://svc.webspellchecker.net/spellcheck31/wscbundle/wscbundle.js';

/*
 * Surfaces the connector recognises. `SURFACE_GLOBALS` maps each to the
 * `window` global Learnosity exposes for that API. Used in two places:
 *   - `isAnyAllowedSurfaceLoaded`: cheap page-level gate; skip everything if
 *     no allowed-surface global has loaded yet.
 *   - `detectSurface`: per-editor classification via DOM-ancestor markers,
 *     so multi-API pages are filtered correctly.
 */
const ALLOWED_SURFACES = ['questions', 'items', 'author'];
const SURFACE_GLOBALS = {
  questions: 'LearnosityApp',
  items: 'LearnosityItems',
  author: 'LearnosityAuthor'
};
/*
 * Default surfaces. Author only, because Questions and Items render
 * student-facing assessments where spell-check can compromise the activity
 * itself. Host apps that want proofreading in those contexts opt in
 * explicitly with `surfaces: ['questions', 'items', 'author']`.
 */
const DEFAULT_SURFACES = ['author'];

/*
 * Maximum wait for `window.WEBSPELLCHECKER` to appear after the bundle
 * `<script>` is injected. The bundle loads async, so it may not be on
 * `window` by the time the first editor needs attaching. After this timeout,
 * `whenAvailable` logs a console warning and stops waiting.
 */
const GLOBAL_WAIT_TIMEOUT_MS = 30000;
const GLOBAL_POLL_INTERVAL_MS = 100;

let initialized = false;
let currentConnectorConfig = null;
const attachedContainers = new WeakSet();
const containerToInstance = new WeakMap();

/**
 * Initialise the connector. Should be called before Learnosity widgets render.
 * Safe to call multiple times: subsequent calls update the live configuration
 * without reloading the WProofreader bundle or re-binding the observer.
 *
 * Options are split into two groups:
 *   - `wproofreader`: passed through to WProofreader unchanged (its runtime
 *     options surface). `serviceId` for Cloud or `serviceHost` for self-hosted
 *     activates the connector; without one of these, init() no-ops with a
 *     console warning.
 *   - Top-level keys: connector-only configuration (`surfaces`,
 *     `enableShorttext`, `customSelectors`, `bundleUrl`).
 *
 * @param {Object}    [options]
 * @param {Object}    [options.wproofreader]                    WProofreader runtime options.
 *                                                              Forwarded to WProofreader unchanged.
 * @param {string}    [options.wproofreader.serviceId]          WProofreader Cloud service ID.
 *                                                              Required for the Cloud path. Omit
 *                                                              when using a self-hosted deployment
 *                                                              (see `serviceHost`).
 * @param {string}    [options.wproofreader.serviceProtocol]    Self-hosted: 'http' or 'https'.
 * @param {string}    [options.wproofreader.serviceHost]        Self-hosted: hostname of the
 *                                                              WProofreader server. Presence of
 *                                                              `serviceHost` (or `serviceId`)
 *                                                              activates init().
 * @param {number}    [options.wproofreader.servicePort]        Self-hosted: port.
 * @param {string}    [options.wproofreader.servicePath]        Self-hosted: URL path to the
 *                                                              WProofreader API (e.g.
 *                                                              '/wscservice/api').
 * @param {boolean}   [options.wproofreader.enableGrammar]      Default true.
 * @param {boolean}   [options.wproofreader.autocorrect]        Default true.
 * @param {string}    [options.wproofreader.lang]               Default: the host page's
 *                                                              `<html lang>` attribute, with `-`
 *                                                              normalised to `_` (e.g. `en-US`
 *                                                              becomes `en_US`). Falls back to
 *                                                              `en_US` if the page does not set a
 *                                                              `lang` or sets a bare un-regioned
 *                                                              one (WProofreader requires
 *                                                              region-qualified codes).
 * @param {string[]}  [options.surfaces]                        Connector-only. Subset of
 *                                                              ['questions','items','author'].
 *                                                              Default: `['author']`
 *                                                              (assessment-safe). The connector
 *                                                              walks each editor's ancestry to
 *                                                              detect which Learnosity API placed
 *                                                              it (`lrn-author*` → author,
 *                                                              `lrn_player*` → items, otherwise →
 *                                                              questions) and skips editors whose
 *                                                              surface is not in the allowed list.
 * @param {boolean}   [options.enableShorttext]                 Connector-only. Default false. When
 *                                                              true, also attach to `shorttext`
 *                                                              inputs (`<input type="text">`)
 *                                                              inside Learnosity scope. Off by
 *                                                              default because plain text inputs
 *                                                              are often short and proofreading
 *                                                              them feels noisy.
 * @param {string[]}  [options.customSelectors]                 Connector-only. Extra ancestor CSS
 *                                                              selectors that count as "inside
 *                                                              Learnosity scope" for unusual host
 *                                                              apps.
 * @param {string}    [options.bundleUrl]                       Connector-only. Override the
 *                                                              WProofreader bundle URL.
 */
function init(options) {
  options = options || {};
  const wp = options.wproofreader || {};

  if (!wp.serviceId && !wp.serviceHost) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[wproofreader-learnosity] No wproofreader.serviceId or wproofreader.serviceHost ' +
        'provided. Proofreading will not activate. Pass serviceId for WProofreader Cloud, or ' +
        'serviceHost (plus serviceProtocol, servicePort, servicePath) for a self-hosted deployment.'
      );
    }
    return;
  }

  const config = buildConfig(options);

  if (initialized) {
    // Idempotent: update the live WProofreader config in place so the observer's
    // captured config keeps the same identity, while WProofreader's bundle picks
    // up the new values next time it reads `window.WEBSPELLCHECKER_CONFIG`.
    Object.assign(window.WEBSPELLCHECKER_CONFIG, config.wproofreader);
    Object.assign(currentConnectorConfig, config);
    return;
  }

  /*
   * WProofreader's bundle reads its runtime config from
   * `window.WEBSPELLCHECKER_CONFIG` when it boots, so the object must exist
   * before the bundle `<script>` runs. `autoSearch` is intentionally absent
   * from the config: we attach explicitly via `observeLearnosity` below so
   * attachment stays scoped to Learnosity-rendered editors only.
   */
  window.WEBSPELLCHECKER_CONFIG = config.wproofreader;
  currentConnectorConfig = config;
  loadBundle(options.bundleUrl || DEFAULT_BUNDLE_URL);
  observeLearnosity(config);
  initialized = true;
}

/*
 * Two-tier config:
 *   - `wproofreader`: everything WProofreader's bundle reads from
 *     `window.WEBSPELLCHECKER_CONFIG`. Spread-then-default so any unknown
 *     option (self-hosted service*, future WProofreader knobs) flows through
 *     unchanged, while our defaults (enableGrammar, autocorrect, lang) apply
 *     only when the caller did not supply them.
 *   - Top-level: connector-only fields the observer reads (surfaces,
 *     enableShorttext, customSelectors). `bundleUrl` is consumed by
 *     `loadBundle()` directly from `options` and is not stored here.
 */
function buildConfig(options) {
  const wp = options.wproofreader || {};
  return {
    wproofreader: {
      ...wp,
      enableGrammar: wp.enableGrammar !== false,
      autocorrect: wp.autocorrect !== false,
      lang: wp.lang || defaultLang()
    },
    surfaces: normalizeSurfaces(options.surfaces),
    enableShorttext: options.enableShorttext === true,
    customSelectors: Array.isArray(options.customSelectors) ? options.customSelectors.slice() : []
  };
}

/*
 * Default WProofreader language. Read from the host page's `<html lang>` so a
 * Learnosity activity rendered into a French page proofreads in French without
 * the host app having to pass `lang` explicitly. Normalise `en-US` style to
 * `en_US` (WProofreader's expected separator).
 *
 * WProofreader requires a region-qualified code: bare `en` is rejected with
 * "Language 'en' is unsupported or doesn't exist." So we only use the host
 * page's lang when it includes a region; otherwise we fall back to `en_US`.
 */
function defaultLang() {
  if (typeof document === 'undefined') return 'en_US';
  const html = document.documentElement;
  if (!html || !html.lang) return 'en_US';
  const lang = html.lang;
  if (lang.indexOf('-') === -1 && lang.indexOf('_') === -1) return 'en_US';
  return lang.replace('-', '_');
}

/*
 * Coerce caller input into a valid subset of ALLOWED_SURFACES. Non-arrays
 * fall back to DEFAULT_SURFACES; unrecognised entries are dropped silently.
 */
function normalizeSurfaces(input) {
  if (!Array.isArray(input)) return DEFAULT_SURFACES.slice();
  return input.filter(function (s) { return ALLOWED_SURFACES.indexOf(s) !== -1; });
}

/*
 * Cheap page-level pre-check: is any allowed-surface Learnosity global on the
 * page at all? If not, no point doing any per-editor work.
 */
function isAnyAllowedSurfaceLoaded(surfaces) {
  if (typeof window === 'undefined') return false;
  if (surfaces.length === 0) return false;
  for (let i = 0; i < surfaces.length; i++) {
    const g = SURFACE_GLOBALS[surfaces[i]];
    if (g && typeof window[g] !== 'undefined') return true;
  }
  return false;
}

/*
 * Per-editor surface detection. Walks the editor's ancestry looking for the
 * smallest set of class names that distinguish each Learnosity API in the
 * rendered DOM. Markers confirmed from `Learnosity/learnosity-apis-css`:
 *
 *   - Author API uses the hyphenated `lrn-author` / `lrn-author-*` prefix
 *     exclusively (no other API does).
 *   - Items API (Assess) wraps its player in `.lrn_player`, also unique.
 *   - Everything else `lrn_*` falls through to Questions API as the catch-all.
 *
 * Best effort. If Learnosity renames these between LTS versions, the update
 * is isolated to this function. The `customSelectors` option is the escape
 * hatch for unusual host apps.
 */
function detectSurface(el) {
  let cur = el && el.parentElement;
  while (cur) {
    const list = cur.classList;
    if (list && list.length) {
      for (let i = 0; i < list.length; i++) {
        const cls = list[i];
        if (cls.indexOf('lrn-author') === 0) return 'author';
        if (cls.indexOf('lrn_player') === 0) return 'items';
      }
    }
    cur = cur.parentElement;
  }
  return 'questions';
}

/*
 * Learnosity rewrites the host-page placeholder span during render and does
 * not preserve our `learnosity-response` class on the result. So instead of
 * scoping by a single anchor class, we walk up the DOM from each candidate
 * editable and check for any ancestor whose class matches Learnosity's
 * conventions ("learnosity-response" exact, or any class starting with "lrn").
 * Caller-supplied selectors (customSelectors) extend the scope for unusual
 * host apps without giving up the Learnosity-internal scoping for the rest.
 */
function hasLearnosityAncestor(el, customSelectors) {
  let cur = el && el.parentElement;
  while (cur) {
    const list = cur.classList;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const cls = list[i];
        if (cls === 'learnosity-response' || cls.indexOf('lrn') === 0) return true;
      }
    }
    if (customSelectors && customSelectors.length && cur.matches) {
      for (let j = 0; j < customSelectors.length; j++) {
        try { if (cur.matches(customSelectors[j])) return true; } catch (_) { /* bad selector */ }
      }
    }
    cur = cur.parentElement;
  }
  return false;
}

/*
 * Inject the WProofreader bundle `<script>` exactly once per page. The
 * `data-wproofreader-bundle` attribute serves as the idempotency marker.
 */
function loadBundle(url) {
  if (typeof document === 'undefined') return;
  if (document.querySelector('script[data-wproofreader-bundle]')) return;
  const script = document.createElement('script');
  script.src = url;
  script.async = true;
  script.dataset.wproofreaderBundle = '';
  document.head.appendChild(script);
}

/*
 * Watch the document for editables appearing or disappearing inside Learnosity
 * scope. On addition, attach. On removal, detach so SPA hosts that rebuild
 * Learnosity widgets do not leak WProofreader instances.
 */
function observeLearnosity(config) {
  if (typeof document === 'undefined') return;

  const scanRoot = function (root) { scanForEditables(root, config); };
  scanRoot(document);

  const observer = new MutationObserver(function (mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (m.type === 'childList') {
        const added = m.addedNodes;
        for (let j = 0; j < added.length; j++) {
          const node = added[j];
          if (node && node.nodeType === 1 /* ELEMENT_NODE */) scanRoot(node);
        }
        const removed = m.removedNodes;
        for (let k = 0; k < removed.length; k++) {
          const node = removed[k];
          if (node && node.nodeType === 1) detachInSubtree(node);
        }
      } else if (m.type === 'attributes' && m.attributeName === 'contenteditable') {
        const el = m.target;
        if (el && matchesCandidate(el, config) && hasLearnosityAncestor(el, config.customSelectors)) {
          attachToContainer(el, config);
        }
      }
    }
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    // Catch editors whose `contenteditable` flips to truthy after insertion.
    attributes: true,
    attributeFilter: ['contenteditable']
  });
}

/*
 * Find every editable under `root` that sits inside a Learnosity-rendered
 * subtree, and attach. `root` can be the document or a freshly-added subtree.
 */
function scanForEditables(root, config) {
  if (!root || !root.querySelectorAll) return;
  const candidates = [];
  if (matchesCandidate(root, config)) candidates.push(root);
  const inside = root.querySelectorAll(candidateSelector(config));
  for (let i = 0; i < inside.length; i++) candidates.push(inside[i]);

  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    if (hasLearnosityAncestor(el, config.customSelectors)) attachToContainer(el, config);
  }
}

/*
 * Selector for "could plausibly be an editable WProofreader should attach to."
 * Always includes iframes (CKEditor classic) and truthy contenteditables.
 * Includes plain text inputs only when enableShorttext is on.
 */
function candidateSelector(config) {
  let s = 'iframe, [contenteditable]:not([contenteditable="false"])';
  if (config.enableShorttext) s += ', input[type="text"], input:not([type])';
  return s;
}

/*
 * Element-level equivalent of `candidateSelector`. Used by the
 * attribute-mutation branch of `observeLearnosity`, where we already have the
 * target element and don't want to re-query the DOM.
 */
function matchesCandidate(el, config) {
  if (!el || el.nodeType !== 1) return false;
  if (el.tagName === 'IFRAME') return true;
  if (el.tagName === 'INPUT' && config.enableShorttext) {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    return t === 'text';
  }
  if (!el.hasAttribute || !el.hasAttribute('contenteditable')) return false;
  return el.getAttribute('contenteditable') !== 'false';
}

/*
 * Initialise WProofreader against a container element. Three gates before we
 * actually attach:
 *   - dedupe against `attachedContainers` (no double-attaches across observer
 *     events).
 *   - page-level pre-check: at least one allowed-surface Learnosity global
 *     must be loaded.
 *   - per-editor surface filter: `detectSurface(container)` must be in
 *     `config.surfaces`.
 * Then, for an iframe whose document is not yet loaded, defer until the
 * `load` event so WProofreader sees the editable body. WProofreader's bundle
 * may still be loading, so we also wait for `window.WEBSPELLCHECKER` to
 * appear. The returned instance is tracked so we can destroy it later when
 * the host element is removed.
 */
function attachToContainer(container, config) {
  if (!container || attachedContainers.has(container)) return;
  if (!isAnyAllowedSurfaceLoaded(config.surfaces)) return;
  const surface = detectSurface(container);
  if (config.surfaces.indexOf(surface) === -1) return;
  attachedContainers.add(container);

  const go = function () {
    whenAvailable('WEBSPELLCHECKER', function (WSC) {
      const initArgs = Object.assign({}, config.wproofreader, { container: container });
      try {
        WSC.init(initArgs, function (instance) {
          if (instance) containerToInstance.set(container, instance);
        });
      } catch (_) { /* WProofreader handled the failure internally */ }
    });
  };

  const isIframe = container.tagName && container.tagName.toLowerCase() === 'iframe';
  if (isIframe) {
    let doc = null;
    try { doc = container.contentDocument; } catch (_) { /* cross-origin */ }
    if (doc && doc.readyState === 'complete') {
      go();
    } else {
      container.addEventListener('load', go, { once: true });
    }
  } else {
    go();
  }
}

/*
 * Walk a removed subtree, find any container we previously attached, destroy
 * its WProofreader instance, and forget it. WeakSet/WeakMap don't enumerate,
 * so we re-walk the DOM with `has()` checks instead.
 */
function detachInSubtree(root) {
  if (!root) return;
  if (attachedContainers.has(root)) detachFromContainer(root);
  if (root.querySelectorAll) {
    // Match the broadest possible candidate selector so we catch anything we
    // could have attached to under any config.
    const candidates = root.querySelectorAll('iframe, [contenteditable], input[type="text"], input:not([type])');
    for (let i = 0; i < candidates.length; i++) {
      if (attachedContainers.has(candidates[i])) detachFromContainer(candidates[i]);
    }
  }
}

/*
 * Destroy the WProofreader instance attached to `container` and forget the
 * mapping. Safe to call on containers we never attached to.
 */
function detachFromContainer(container) {
  const inst = containerToInstance.get(container);
  if (inst) {
    try {
      if (typeof inst.destroy === 'function') inst.destroy();
    } catch (_) { /* swallow */ }
    containerToInstance.delete(container);
  }
  attachedContainers.delete(container);
}

/*
 * Resolve a global once it appears on `window`, with a hard timeout so a
 * missing script does not leak an interval forever.
 */
function whenAvailable(globalName, callback) {
  if (typeof window === 'undefined') return;
  if (window[globalName]) { callback(window[globalName]); return; }
  const interval = setInterval(function () {
    if (window[globalName]) {
      clearInterval(interval);
      clearTimeout(timeout);
      callback(window[globalName]);
    }
  }, GLOBAL_POLL_INTERVAL_MS);
  const timeout = setTimeout(function () {
    clearInterval(interval);
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[wproofreader-learnosity] window.' + globalName +
        ' never appeared. Proofreading will not activate.');
    }
  }, GLOBAL_WAIT_TIMEOUT_MS);
}

/*
 * Public API. Exported as a default object so the import shape mirrors the
 * call site:
 *
 *   import LearnosityWProofreader from '@webspellchecker/wproofreader-learnosity';
 *   LearnosityWProofreader.init({ wproofreader: { serviceId: '...' } });
 */
export default { init };
