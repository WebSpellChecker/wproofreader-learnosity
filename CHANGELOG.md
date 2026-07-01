# Changelog

All notable changes to `@webspellchecker/wproofreader-learnosity`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.2]

### Changed

- Minor technical updates.

## [2.0.0]

### Breaking

- **`bundleUrl` option removed.** To point at a self-hosted or non-default
  bundle, pass the WProofreader SDK's own `srcUrl` inside the `wproofreader`
  block instead of the top-level `bundleUrl`:

  ```js
  // before
  LearnosityWProofreader.init({ wproofreader: { serviceHost: '...' }, bundleUrl: '...' });
  // after
  LearnosityWProofreader.init({ wproofreader: { serviceHost: '...', srcUrl: '...' } });
  ```

### Added

- **Named export.** The plugin can now be imported as
  `import { LearnosityWProofreader } from '@webspellchecker/wproofreader-learnosity'`
  in addition to the existing default import, mirroring the WProofreader SDK
  (default plus named exports). Both resolve to the same object.

### Changed

- **Bundle loading delegated to the WProofreader SDK.** The plugin now uses
  `@webspellchecker/wproofreader-sdk-js` to load the WProofreader bundle and
  create instances, replacing the hand-rolled script injection and global
  polling. The internal `window.WEBSPELLCHECKER_CONFIG` object is no longer set;
  per-editor options are passed straight to the SDK's `init()` (so the SDK's
  `srcUrl`, `lang`, etc. ride through the `wproofreader` block). The default
  bundle URL is unchanged.

## [1.2.1]

### Features

- **Published to npm.** `@webspellchecker/wproofreader-learnosity` is now available on the public npm registry. v1.2.1 is functionally identical to v1.2.0; the bump exists to mark the npm publication event so the jsDelivr URL documented in the README resolves.

## [1.2.0]

### Features

- **Two install paths.** Existing ESM via npm, plus a new IIFE bundle (`dist/wproofreader-learnosity.min.js`) served from jsDelivr, exposing `window.LearnosityWProofreader.init` for host apps that load the connector via a `<script>` tag (PHP, Python, Java, ASP.NET, Ruby, classic HTML). About 5 KB minified, no runtime dependencies. Built with esbuild via `npm run build`; produced automatically at `npm publish` time via the `prepack` hook.

## [1.1.0]

### Features

- **Self-hosted WProofreader support.** `init()` accepts self-hosted service options (`serviceProtocol`, `serviceHost`, `servicePort`, `servicePath`) under the `wproofreader` block instead of (or alongside) `serviceId`, so customers running the WProofreader Server on their own infrastructure (Docker, Helm, on-prem) integrate without a Cloud service ID. Either `wproofreader.serviceId` or `wproofreader.serviceHost` activates `init()`.

## [1.0.0]

Initial public release.

### Features

- **Drop-in initialisation.** A single `LearnosityWProofreader.init({ wproofreader: { serviceId } })` call from a host app is enough to start proofreading inside Learnosity widgets. Idempotent: subsequent calls update the live configuration.
- **ESM npm package.** Default export imported as `import LearnosityWProofreader from '@webspellchecker/wproofreader-learnosity'`; the call site mirrors the import shape.
- **All three Learnosity APIs supported.** Questions API (`longtextV2` rich-text responses), Author API (every rich-text field across the authoring UI), and Items API (`assess` rendering type).
- **Two-tier options.** WProofreader runtime options live under a nested `wproofreader` block and are forwarded to WProofreader unchanged (including unknown future options); connector-only fields (`surfaces`, `enableShorttext`, `customSelectors`, `bundleUrl`) live at the top level. The two groups never collide.
- **Per-editor surface filter.** The `surfaces` option (default `['author']`) walks each editor's ancestry to detect which Learnosity API placed it (`lrn-author*` → Author, `lrn_player*` → Items, otherwise → Questions) and skips editors whose surface is not allowed. Multi-API pages are handled correctly. Opt in to assessment proofreading explicitly with `['questions', 'items', 'author']`.
- **Assessment-safe default.** The default `surfaces: ['author']` keeps proofreading off in student-facing assessments unless the host app derives an explicit opt-in from server-side activity metadata.
- **Locale-aware default.** `wproofreader.lang` reads from the host page's `<html lang>` (with `-` normalised to `_`), so a French page proofreads in French without extra config. Falls back to `en_US` when the page does not set a `lang` or sets a bare un-regioned one like `en`.
- **TypeScript definitions** at `src/index.d.ts`, exposed via `package.json` `types` and `exports.types`. `WProofreaderOptions` has an `[other: string]: unknown` index signature so unknown WProofreader options still type-check.
- **Lifecycle cleanup.** A scoped `MutationObserver` watches for editors appearing and disappearing. WProofreader instances are destroyed when their host elements leave the DOM, so single-page-app hosts that rebuild Learnosity widgets do not leak instances.
- **Targeted attachment, not autoSearch.** Attaches only to editors inside a Learnosity-rendered subtree (any ancestor with a class starting with `lrn`, plus optional caller-supplied selectors). The host app's own editables are left untouched.
- **`customSelectors` escape hatch.** Caller-supplied ancestor selectors extend the Learnosity scope for unusual host apps without giving up the built-in scoping for the rest.
- **Optional `shorttext` surface.** Off by default. When `enableShorttext: true`, the connector also attaches to `<input type="text">` inside Learnosity scope.
- **Configurable WProofreader bundle URL** via `bundleUrl`, for customers running WProofreader from a non-default CDN host.
- **Apache-2.0 licensed.**

[2.0.2]: https://github.com/WebSpellChecker/wproofreader-learnosity/releases/tag/v2.0.2
[2.0.0]: https://github.com/WebSpellChecker/wproofreader-learnosity/releases/tag/v2.0.0
[1.2.1]: https://github.com/WebSpellChecker/wproofreader-learnosity/releases/tag/v1.2.1
[1.2.0]: https://github.com/WebSpellChecker/wproofreader-learnosity/releases/tag/v1.2.0
[1.1.0]: https://github.com/WebSpellChecker/wproofreader-learnosity/releases/tag/v1.1.0
[1.0.0]: https://github.com/WebSpellChecker/wproofreader-learnosity/releases/tag/v1.0.0
