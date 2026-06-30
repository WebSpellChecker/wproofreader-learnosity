# @webspellchecker/wproofreader-learnosity

WProofreader for Learnosity. Spelling, grammar and style assistance inside Learnosity rich-text widgets, with one function call.

## Install

The plugin offers two install paths. The runtime API is identical, `LearnosityWProofreader.init({...})` in both.

### Via npm (Node host apps)

```bash
npm install @webspellchecker/wproofreader-learnosity
```

```js
import { LearnosityWProofreader } from '@webspellchecker/wproofreader-learnosity';

LearnosityWProofreader.init({
  wproofreader: { serviceId: 'YOUR_WPROOFREADER_SERVICE_ID' }
});
```

The plugin is available as both a named and a default export, so a default import works too:

```js
import LearnosityWProofreader from '@webspellchecker/wproofreader-learnosity';
```

### Via `<script>` tag (non-Node host apps)

For host apps where adding a bundler is overkill (classic HTML, PHP, Python, Java, ASP.NET, Ruby), load the plugin from jsDelivr:

```html
<script src="https://cdn.jsdelivr.net/npm/@webspellchecker/wproofreader-learnosity@2.0.0/dist/wproofreader-learnosity.min.js"></script>
<script>
  LearnosityWProofreader.init({
    wproofreader: { serviceId: 'YOUR_WPROOFREADER_SERVICE_ID' }
  });
</script>
```

## Quickstart

```js
import { LearnosityWProofreader } from '@webspellchecker/wproofreader-learnosity';

// Before Learnosity widgets render.
LearnosityWProofreader.init({
  wproofreader: { serviceId: 'YOUR_WPROOFREADER_SERVICE_ID' }
});

// Initialise Learnosity as normal. The plugin attaches to longtextV2 editors automatically.
LearnosityApp.init(signedRequest, {
  readyListener() { console.log('Learnosity ready'); },
  errorListener(err) { console.error(err); }
});
```

`init()` is idempotent: calling it again updates the live configuration without reloading the WProofreader bundle.

## Getting a service ID

WProofreader is a commercial service from WebSpellChecker. The service ID passed to `init({ wproofreader: { serviceId } })` is your account's activation key.

- **Free trial**: <https://webspellchecker.com/free-trial/> issues a service ID for evaluation.
- **Paid subscription** converts the trial to a production licence with the domain set you need.
- **Domain locking**: every service ID is bound to a list of allowed origins. Whitelist your production and development domains in the WebSpellChecker dashboard; otherwise the spell-check API returns 403 for those origins.

If you run WProofreader on your own infrastructure (Docker, Helm, on-prem) you skip the service ID entirely. See [Self-hosted WProofreader](#self-hosted-wproofreader) below.

## Self-hosted WProofreader

For customers running the [WProofreader Server](https://hub.docker.com/r/webspellchecker/wproofreader) on their own infrastructure (Docker, Helm, on-prem), pass the service connection options inside the `wproofreader` block instead of (or alongside) `serviceId`. Every property on `wproofreader` is forwarded to WProofreader unchanged:

```js
LearnosityWProofreader.init({
  wproofreader: {
    serviceProtocol: 'https',
    serviceHost: 'localhost',
    servicePort: 443,
    servicePath: '/wscservice/api',
    srcUrl: 'https://localhost/wscservice/wscbundle/wscbundle.js'
  }
});
```

Either `wproofreader.serviceId` or `wproofreader.serviceHost` must be set; otherwise `init()` no-ops with a console warning.

## Configuration

`init()` takes a single options object with two groups: a nested `wproofreader` sub-object (forwarded to WProofreader unchanged) and plugin-only fields at the top level.

### WProofreader options (under `wproofreader`)

These pass straight through to WProofreader's runtime config. The tables below cover the frequently-used ones; the full surface is documented in [Documentation and support](#documentation-and-support).

| Option            | Default                              | Notes                                                  |
|-------------------|--------------------------------------|--------------------------------------------------------|
| `serviceId`       | _none_                               | WProofreader Cloud service ID. Domain-locked server-side. Required for the Cloud path. Omit when using a self-hosted deployment. |
| `serviceProtocol` | _none_                               | Self-hosted: `'http'` or `'https'`. |
| `serviceHost`     | _none_                               | Self-hosted: WProofreader server hostname. Presence of `serviceHost` (or `serviceId`) is what activates `init()`. |
| `servicePort`     | _none_                               | Self-hosted: port. |
| `servicePath`     | _none_                               | Self-hosted: URL path to the WProofreader API. |
| `srcUrl`          | _SDK default (cloud CDN)_            | SDK option: where to load `wscbundle.js` from. Override for a self-hosted deployment or non-default CDN; defaults to the WebSpellChecker cloud bundle. |
| `enableGrammar`   | `true`                               | Grammar checking on top of spell checking. |
| `autocorrect`     | `true`                               | Suggested replacement on typo accept. |
| `lang`            | host page's `<html lang>`, or `en_US`| Read from `<html lang>` with `-` normalised to `_` (e.g. `en-US` → `en_US`). Falls back to `en_US` if the page does not set a `lang` or sets a bare un-regioned one (`en`, `fr`), because WProofreader expects region-qualified codes. Pass explicitly to override. |

If neither `wproofreader.serviceId` nor `wproofreader.serviceHost` is set, `init()` no-ops with a console warning so the host app can call it unconditionally.


### Plugin options (top level)

| Option            | Default       | Notes                                                  |
|-------------------|---------------|--------------------------------------------------------|
| `surfaces`        | `['author']`  | Subset of `['questions','items','author']`. **Per-editor** filter: each editor's ancestry is walked for surface-specific markers (`lrn-author*` → author, `lrn_player*` → items, otherwise → questions); editors whose surface is not in the allowed list are skipped. Default is Author only, for assessment integrity. Opt in to assessment proofreading explicitly with `['questions', 'items', 'author']`. |
| `enableShorttext` | `false`       | Also attach to `shorttext` inputs (`<input type="text">`) inside Learnosity scope. Off by default because plain text inputs are usually short and proofreading them is noisy. |
| `customSelectors` | `[]`          | Extra ancestor CSS selectors that count as "inside Learnosity scope" for unusual host apps. Each entry is matched via `element.matches`. |

```js
LearnosityWProofreader.init({
  wproofreader: { serviceId: '...' },
  surfaces: ['questions', 'items', 'author'],
  customSelectors: ['.my-host-app-learnosity-region']
});
```

## Supported surfaces

| Learnosity API | Surface                       |
|----------------|-------------------------------|
| Questions API  | `longtextV2` (rich-text essay) |
| Author API     | All rich-text fields          |
| Items API      | `assess` rendering type       |

`shorttext` (plain text input) is opt-in via `enableShorttext: true`.

## Supported Learnosity versions

Tested manually against the `latest-lts` channel. The plugin tracks editor placement via the `lrn`-prefixed class convention plus a small per-surface marker set; class-rename changes between LTS releases are an isolated update in `src/index.js`.

## Documentation and support

- **WProofreader product page**: <https://webspellchecker.com/wsc-proofreader/>
- **Configuration reference** (every WProofreader option beyond what this plugin documents): <https://webspellchecker.com/docs/api/wscbundle/Options.html>
- **Self-hosted server image**: <https://hub.docker.com/r/webspellchecker/wproofreader>
- **Contact and commercial enquiries**: <https://webspellchecker.com/contact-us/>

## License

Apache-2.0. See [LICENSE](./LICENSE).
