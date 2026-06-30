/*
 * Preloaded via `node --test --import` (see package.json `test` script).
 * Registers the resolve hook in `hooks.mjs` so the SDK import is stubbed for
 * every test file.
 */
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
