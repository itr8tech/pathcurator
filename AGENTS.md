# Repository Guidelines

## Project Structure & Module Organization
PathCurator serves static HTML screens backed by modular ES6 scripts in the repo root. Each view (`dashboard.html`, `edit-pathway.html`, `popup.html`, etc.) pairs with a similarly named `.js` controller and shared helpers like `storage-manager.js`, `router.js`, and `version-utils.js`. Global styles live beside their consumers (`dashboard-styles.css`, `curator.css`, `styles.css`), while icons and packaged assets sit in `icons/` and `pathcurator-extension/`. Automated docs and reference material reside in `docs/`, and browser automation lives under `tests/`. Use the existing pairing pattern when adding new surfaces.

## Build, Test, and Development Commands
- `npm install`: install Node dependencies, including Playwright test tooling.  
- `npm run playwright:install`: download Playwright browsers after dependency installs.  
- `npm run serve`: launch a local static server on http://localhost:8080 via Python for manual testing.  
- `npm test` (alias `npm run test:all`): execute the full Playwright suite.  
- `npm run test:accessibility` / `npm run test:lighthouse`: run targeted audits.  
- `npm run test:axe-node` / `npm run test:lighthouse-node`: invoke Node-based accessibility scripts for CI-friendly checks.

## Coding Style & Naming Conventions
Follow the prevailing 4-space indentation and trailing comma-free style seen in `app.js` and companions. Favor ES module imports/exports, descriptive function names (`loadPathwaysForBookmark`) and dashed filenames for HTML/CSS (`edit-pathway.html`). Keep DOM ids kebab-cased, and namespace storage keys through `storage-manager.js`. Run any formatters you introduce via `npm scripts`; do not rely on implicit global tooling.

## Testing Guidelines
End-to-end coverage uses Playwright specs in `tests/` (naming: `<feature>.spec.js`). Mirror new user journeys with additional specs and update fixtures as needed. Accessibility regressions should trigger updates to `test-axe-accessibility.js` or the relevant Playwright audit. Before opening a PR, confirm `npm test` passes locally and attach failing traces when triaging issues.

## Commit & Pull Request Guidelines
Commits follow short, sentence-case summaries in the imperative mood (e.g., `Fix link tracking in HTML output`). Keep body text focused on context and decisions. Pull requests should: 1) explain the user-facing outcome, 2) reference any GitHub issues, 3) include screenshots or recordings for UI changes, and 4) note testing commands executed. Large changes should describe rollout considerations and manual verification steps.

## Security & Configuration Tips
GitHub PAT usage is documented in `github-pat-guide.html`; never hard-code tokens or export files containing secrets. Verify browser storage changes with `secure-storage.js` utilities, and rotate tokens for demo accounts after review. Use `manifest.json` and `webapp-manifest.json` as the source of truth for extension and PWA metadata when distributing builds.
