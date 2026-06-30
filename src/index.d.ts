/**
 * Type definitions for @webspellchecker/wproofreader-learnosity.
 * Hand-written to match src/index.js. Keep in sync.
 */

export type Surface = 'questions' | 'items' | 'author';

export interface WProofreaderOptions {
  serviceId?: string;
  serviceProtocol?: 'http' | 'https';
  serviceHost?: string;
  servicePort?: number | string;
  servicePath?: string;
  enableGrammar?: boolean;
  autocorrect?: boolean;
  lang?: string;
  /** SDK option: WProofreader bundle URL, for self-hosted or non-default CDN deployments. */
  srcUrl?: string;
  // Note: `appType` is set by the plugin to a fixed partner tag and is not caller-configurable.
  [other: string]: unknown;
}

export interface InitOptions {
  wproofreader?: WProofreaderOptions;
  surfaces?: ReadonlyArray<Surface>;
  enableShorttext?: boolean;
  customSelectors?: ReadonlyArray<string>;
}

export declare class LearnosityWProofreader {
  static init(options?: InitOptions): void;
}

export default LearnosityWProofreader;
