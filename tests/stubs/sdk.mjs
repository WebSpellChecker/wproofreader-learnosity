/*
 * Test stub for `@webspellchecker/wproofreader-sdk-js`. Mirrors the real SDK's
 * default-export surface: a `WProofreaderSDK` object whose `init(options)`
 * loads the bundle and resolves to a WProofreader instance. Here it records
 * the options it was called with on `globalThis.__sdkInitCalls` and resolves
 * to a fake instance exposing the documented `destroy()` method, so tests can
 * assert on what the connector hands the SDK and on lifecycle cleanup.
 */
const WProofreaderSDK = {
  init(options) {
    const calls = globalThis.__sdkInitCalls || (globalThis.__sdkInitCalls = []);
    const instance = {
      destroyed: false,
      destroy() { this.destroyed = true; }
    };
    calls.push({ options, instance });
    return Promise.resolve(instance);
  }
};

export default WProofreaderSDK;
