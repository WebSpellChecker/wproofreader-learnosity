/**
 * WProofreader connector for Learnosity.
 *
 * Attaches WProofreader to Learnosity-rendered editables only, scoped by an
 * ancestry walk for `lrn`-prefixed classes (plus optional caller selectors),
 * and filtered per editor by Learnosity surface. Bundle loading and instance
 * creation are delegated to the WProofreader SDK; this class only decides which
 * editors to attach to and cleans them up when they leave the DOM.
 *
 *   import LearnosityWProofreader from '@webspellchecker/wproofreader-learnosity';
 *   LearnosityWProofreader.init({ wproofreader: { serviceId: '...' } });
 */

import WProofreaderSDK from '@webspellchecker/wproofreader-sdk-js';
import {
  SURFACE_GLOBALS,
  buildConfig
} from './config.js';

class LearnosityWProofreader {
  static #initialized = false;
  static #config = null;
  static #attachedContainers = new WeakSet();
  static #containerToInstance = new WeakMap();

  static init(options) {
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

    if (LearnosityWProofreader.#initialized) {
      // Observer reads #config live, so swapping it is enough; the SDK has
      // already loaded the bundle.
      LearnosityWProofreader.#config = config;
      return;
    }

    // No window.WEBSPELLCHECKER_CONFIG: options go straight to the SDK per
    // editor. We never set `autoSearch`; attachment is explicit via the
    // observer so it stays scoped to Learnosity editors.
    LearnosityWProofreader.#config = config;
    LearnosityWProofreader.#observeLearnosity();
    LearnosityWProofreader.#initialized = true;
  }

  // Page-level gate: is any allowed-surface Learnosity global present at all?
  static #isAnyAllowedSurfaceLoaded() {
    const surfaces = LearnosityWProofreader.#config.surfaces;
    if (typeof window === 'undefined') return false;
    if (surfaces.length === 0) return false;
    for (let i = 0; i < surfaces.length; i++) {
      const g = SURFACE_GLOBALS[surfaces[i]];
      if (g && typeof window[g] !== 'undefined') return true;
    }
    return false;
  }

  static #detectSurface(el) {
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

  static #hasLearnosityAncestor(el) {
    const customSelectors = LearnosityWProofreader.#config.customSelectors;
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

  static #observeLearnosity() {
    if (typeof document === 'undefined') return;

    LearnosityWProofreader.#scanForEditables(document);

    const observer = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'childList') {
          const added = m.addedNodes;
          for (let j = 0; j < added.length; j++) {
            const node = added[j];
            if (node && node.nodeType === 1 /* ELEMENT_NODE */) {
              LearnosityWProofreader.#scanForEditables(node);
            }
          }
          const removed = m.removedNodes;
          for (let k = 0; k < removed.length; k++) {
            const node = removed[k];
            if (node && node.nodeType === 1) LearnosityWProofreader.#detachInSubtree(node);
          }
        } else if (m.type === 'attributes' && m.attributeName === 'contenteditable') {
          const el = m.target;
          if (el && LearnosityWProofreader.#matchesCandidate(el) && LearnosityWProofreader.#hasLearnosityAncestor(el)) {
            LearnosityWProofreader.#attachToContainer(el);
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['contenteditable']
    });
  }

  static #scanForEditables(root) {
    if (!root || !root.querySelectorAll) return;
    const candidates = [];
    if (LearnosityWProofreader.#matchesCandidate(root)) candidates.push(root);
    const inside = root.querySelectorAll(LearnosityWProofreader.#candidateSelector());
    for (let i = 0; i < inside.length; i++) candidates.push(inside[i]);

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (LearnosityWProofreader.#hasLearnosityAncestor(el)) LearnosityWProofreader.#attachToContainer(el);
    }
  }

  static #candidateSelector() {
    let s = 'iframe, [contenteditable]:not([contenteditable="false"])';
    if (LearnosityWProofreader.#config.enableShorttext) s += ', input[type="text"], input:not([type])';
    return s;
  }

  static #matchesCandidate(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === 'IFRAME') return true;
    if (el.tagName === 'INPUT' && LearnosityWProofreader.#config.enableShorttext) {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      return t === 'text';
    }
    if (!el.hasAttribute || !el.hasAttribute('contenteditable')) return false;
    return el.getAttribute('contenteditable') !== 'false';
  }

  static #attachToContainer(container) {
    const config = LearnosityWProofreader.#config;
    if (!container || LearnosityWProofreader.#attachedContainers.has(container)) return;
    if (!LearnosityWProofreader.#isAnyAllowedSurfaceLoaded()) return;
    const surface = LearnosityWProofreader.#detectSurface(container);
    if (config.surfaces.indexOf(surface) === -1) return;
    LearnosityWProofreader.#attachedContainers.add(container);

    const go = () => {
      const initArgs = Object.assign({}, config.wproofreader, { container: container });
      WProofreaderSDK.init(initArgs)
        .then((instance) => {
          if (instance) LearnosityWProofreader.#containerToInstance.set(container, instance);
        })
        .catch(() => { /* the SDK reports its own failures */ });
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

  static #detachInSubtree(root) {
    if (!root) return;
    if (LearnosityWProofreader.#attachedContainers.has(root)) LearnosityWProofreader.#detachFromContainer(root);
    if (root.querySelectorAll) {
      const candidates = root.querySelectorAll('iframe, [contenteditable], input[type="text"], input:not([type])');
      for (let i = 0; i < candidates.length; i++) {
        if (LearnosityWProofreader.#attachedContainers.has(candidates[i])) {
          LearnosityWProofreader.#detachFromContainer(candidates[i]);
        }
      }
    }
  }

  static #detachFromContainer(container) {
    const inst = LearnosityWProofreader.#containerToInstance.get(container);
    if (inst) {
      try {
        if (typeof inst.destroy === 'function') inst.destroy();
      } catch (_) { /* swallow */ }
      LearnosityWProofreader.#containerToInstance.delete(container);
    }
    LearnosityWProofreader.#attachedContainers.delete(container);
  }
}

// Default export:
//   import LearnosityWProofreader from '@webspellchecker/wproofreader-learnosity';
export default LearnosityWProofreader;
