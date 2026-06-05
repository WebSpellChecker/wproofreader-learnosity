/**
 * Type definitions for @webspellchecker/wproofreader-learnosity.
 * Hand-written to match src/index.js. Keep in sync.
 */

/**
 * Learnosity API surfaces the connector knows how to scope to. Each editor's
 * ancestry is walked for surface-specific markers; editors whose surface is
 * not in the allowed list are skipped.
 */
export type Surface = 'questions' | 'items' | 'author';

/**
 * Runtime options forwarded to WProofreader unchanged. The connector does
 * not enforce any schema beyond `serviceId` / `serviceHost` activation, so
 * any other WProofreader option may also be set.
 */
export interface WProofreaderOptions {
  /**
   * WProofreader Cloud service ID. Domain-locked server-side. Required for
   * the Cloud path. Omit when using a self-hosted deployment.
   */
  serviceId?: string;

  /** Self-hosted: protocol. */
  serviceProtocol?: 'http' | 'https';

  /**
   * Self-hosted: WProofreader server hostname. Presence of `serviceHost` (or
   * `serviceId`) activates `init()`.
   */
  serviceHost?: string;

  /** Self-hosted: port. */
  servicePort?: number | string;

  /** Self-hosted: URL path to the WProofreader API (e.g. `/wscservice/api`). */
  servicePath?: string;

  /** Default `true`. */
  enableGrammar?: boolean;

  /** Default `true`. */
  autocorrect?: boolean;

  /**
   * Default: the host page's `<html lang>` attribute, with `-` normalised to
   * `_` (e.g. `en-US` becomes `en_US`). Falls back to `en_US` if the page
   * does not set a `lang` or sets a bare un-regioned one (WProofreader
   * requires region-qualified codes).
   */
  lang?: string;

  /**
   * Forward-compatible escape hatch: any other property is passed through to
   * WProofreader's runtime config unchanged. Useful for WProofreader options
   * the connector does not enumerate explicitly.
   */
  [other: string]: unknown;
}

export interface InitOptions {
  /** WProofreader runtime options. Forwarded to WProofreader unchanged. */
  wproofreader?: WProofreaderOptions;

  /**
   * Subset of `['questions','items','author']`. Default `['author']` for
   * assessment integrity. The connector walks each editor's ancestry to
   * detect which Learnosity API placed it (`lrn-author*` → author,
   * `lrn_player*` → items, otherwise → questions) and skips editors whose
   * surface is not in the allowed list. Opt in to assessment proofreading
   * explicitly with `['questions', 'items', 'author']`.
   */
  surfaces?: ReadonlyArray<Surface>;

  /**
   * Default `false`. Also attach to `shorttext` inputs (`<input type="text">`)
   * inside Learnosity scope.
   */
  enableShorttext?: boolean;

  /**
   * Extra ancestor CSS selectors that count as "inside Learnosity scope" for
   * unusual host apps. Each entry is matched via `element.matches`.
   */
  customSelectors?: ReadonlyArray<string>;

  /** Override the WProofreader bundle URL for non-default CDNs or self-hosted servers. */
  bundleUrl?: string;
}

/**
 * Public API surface. The default export is the namespace object; the call
 * site mirrors that shape.
 */
export interface LearnosityWProofreader {
  /**
   * Initialise the connector. Should be called before Learnosity widgets
   * render. Safe to call multiple times: subsequent calls update the live
   * configuration without reloading the WProofreader bundle.
   */
  init(options?: InitOptions): void;
}

declare const LearnosityWProofreader: LearnosityWProofreader;
export default LearnosityWProofreader;
