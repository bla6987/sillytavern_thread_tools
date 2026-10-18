# Thread Tools

A SillyTavern extension that collects small fixes and tools, each too small to be an extension of its own.

Settings live under **Extensions → Thread Tools**. Each feature has its own collapsible section with an **Enabled** switch.

## Features

### Profile model memory

When a connection profile **with no model saved** loads, switch to the model you last used with that endpoint URL. Profiles that have a model saved are left alone.

- **Remembering:** every time you generate, and whenever you pick a model by hand, the current model is stored against the endpoint URL. URLs are compared loosely: scheme, case, trailing slashes and a trailing `/v1` are ignored, and `localhost` / `0.0.0.0` count as `127.0.0.1`. So a vLLM text-completion connection and a Custom chat-completion connection to the same server share one entry. Hosted APIs without a URL (OpenRouter, Claude, …) are keyed by API type.
- **Restoring:** after the profile loads and the endpoint's model list has refreshed, the remembered model is selected, as long as the endpoint still offers it.

| Setting | Default | |
| --- | --- | --- |
| Also save the restored model into the profile | off | Writes the model into the profile. From then on the profile has a model, and this feature no longer touches it. |
| Show a notification when a model is restored | on | |

The section also lists remembered endpoints, with buttons to forget one or all of them.

### Profile editor

Edit what's saved in any connection profile without switching to it: name, API, server URL, model, settings preset, proxy, system prompt, instruct/context templates, tokenizer, stop strings, start reply with, reasoning template, prompt post-processing, secret and regex preset.

- Open it from the **sliders** button next to the connection profile list (API Connections panel), or from its section in Thread Tools.
- Untick a setting to leave it out of the profile. The profile then doesn't change that setting when it loads, and SillyTavern's **Update** button won't record it again.
- The model field can load the model list straight from the profile's endpoint (click the field or the refresh button), and it warns when the typed model isn't offered.
- **Save** only saves. **Save & load** also switches to the profile. If you edit the active profile with plain Save, reload it to apply the changes.

## Adding a feature

1. Create `src/features/<name>/index.js` exporting a feature object: `id`, `title`, `description`, optional `defaults`, `renderSettings(container, api)`, `init(api)` and `onToggle(enabled, api)` (see the typedefs in `src/core.js`).
2. Register it in `index.js`.

Keep pure logic in a separate `logic.js` next to it so it can be unit-tested without a browser.

## Install

Clone or symlink this folder into `SillyTavern/data/<user>/extensions/`, then reload SillyTavern.

## Tests

```bash
npm test
```
