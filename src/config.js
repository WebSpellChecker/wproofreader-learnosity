/**
 * Pure configuration logic for the connector: framework- and DOM-agnostic
 * enough to unit-test in isolation. Nothing here loads scripts or touches the
 * WProofreader SDK.
 */

// Surfaces the connector recognises, and the `window` global Learnosity
// exposes for each (used for the page-level gate and per-editor detection).
export const ALLOWED_SURFACES = ['questions', 'items', 'author'];
export const SURFACE_GLOBALS = {
  questions: 'LearnosityApp',
  items: 'LearnosityItems',
  author: 'LearnosityAuthor'
};
// Author only by default: Questions and Items render student-facing
// assessments where spell-check can compromise the activity. Host apps opt in
// explicitly with `surfaces: ['questions', 'items', 'author']`.
export const DEFAULT_SURFACES = ['author'];

// Fixed partner tag so WebSpellChecker can attribute traffic to this plugin
// (cf. the CKEditor 5 plugin's `proofreader_ck5`). Not caller-configurable.
export const APP_TYPE = 'wpr_learnosity';

/*
 * Split options into the WProofreader block (forwarded to the SDK's init()
 * unchanged; spread then default so unknown/self-hosted options — including the
 * SDK's own `srcUrl` for the bundle location — flow through while our defaults
 * apply only when unset) and connector-only fields. `appType` is pinned to the
 * fixed partner tag (set after the spread) so a caller cannot override it.
 */
export function buildConfig(options) {
  const wp = options.wproofreader || {};
  return {
    wproofreader: {
      ...wp,
      enableGrammar: wp.enableGrammar !== false,
      autocorrect: wp.autocorrect !== false,
      lang: wp.lang || defaultLang(),
      appType: APP_TYPE
    },
    surfaces: normalizeSurfaces(options.surfaces),
    enableShorttext: options.enableShorttext === true,
    customSelectors: Array.isArray(options.customSelectors) ? options.customSelectors.slice() : []
  };
}

/*
 * Default language from the host page's `<html lang>`, with `-` normalised to
 * `_` (e.g. `en-US` → `en_US`). WProofreader rejects bare codes like `en`, so
 * we fall back to `en_US` unless the page lang is region-qualified.
 */
export function defaultLang() {
  if (typeof document === 'undefined') return 'en_US';
  const html = document.documentElement;
  if (!html || !html.lang) return 'en_US';
  const lang = html.lang;
  if (lang.indexOf('-') === -1 && lang.indexOf('_') === -1) return 'en_US';
  return lang.replace('-', '_');
}

// Valid subset of ALLOWED_SURFACES; non-arrays fall back to the default.
export function normalizeSurfaces(input) {
  if (!Array.isArray(input)) return DEFAULT_SURFACES.slice();
  return input.filter(function (s) { return ALLOWED_SURFACES.indexOf(s) !== -1; });
}
