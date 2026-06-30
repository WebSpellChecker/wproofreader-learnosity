/*
 * Module-resolution hook (runs in the loader thread). Redirects the connector's
 * `@webspellchecker/wproofreader-sdk-js` import to the local test stub so the
 * suite never loads the real SDK or hits the network. Stable on Node 18+ (no
 * experimental flag), unlike `node:test`'s `mock.module`.
 */
const STUB_SPECIFIER = '@webspellchecker/wproofreader-sdk-js';
const stubUrl = new URL('./stubs/sdk.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === STUB_SPECIFIER) {
    return { url: stubUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
