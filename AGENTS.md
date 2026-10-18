This project is synced with GitHub so please make sure all your changes are pushed to GitHub once verification is complete. Assume the extension is stored in the following directory on the device that pulls from github:
public/scripts/extensions/third-party/sillytavern_thread_tools

- Sillytavern source code is available at /Users/macbookpro/projects/source_projects/SillyTavern

## Project notes

- This is a catch-all for small SillyTavern fixes that don't deserve their own extension. Each fix is a feature in `src/features/<name>/`, registered in `index.js`, with its own settings section and Enabled switch (see README "Adding a feature").
- No build step: plain ES modules loaded directly by SillyTavern. Reach SillyTavern only through `SillyTavern.getContext()`, never relative imports into ST core, so the extension works from both `public/scripts/extensions/third-party/` and `data/<user>/extensions/`.
- Keep pure logic in a `logic.js` next to the feature. Tests use `node:test`: run `npm test`. Syntax check: `for f in index.js src/*.js src/features/*/*.js; do node --check "$f"; done`
- DOM IDs and CSS classes use the `thread_tools_` prefix; console logs use `[Thread Tools]`.
- Live testing: run a throwaway SillyTavern with `node server.js --dataRoot <scratch dir> --port 8123` and symlink this folder into `<scratch dir>/default-user/extensions/`, so real profiles and settings aren't touched.
