# Contributing to TreeMonk

Thanks for your interest in TreeMonk! This is a source-available, **noncommercial**
project (see the [License](LICENSE)) maintained in spare time. Contributions are
welcome and appreciated — please read this short guide first.

## Ways to help

- **Report a bug** — open an [issue](https://github.com/n1kozor/TreeMonk/issues/new/choose)
  with steps to reproduce, your OS and app version.
- **Suggest a feature** — open a feature-request issue describing the problem you
  want solved (the *why*), not only the solution.
- **Improve docs / translations** — the UI ships in English, German and Hungarian
  (`src/renderer/src/i18n`); fixes and new strings are very welcome.
- **Send a pull request** — for anything non-trivial, please open an issue first
  so we can agree on the approach before you invest time.

## Development setup

See **[Build from source](README.md#-build-from-source)** in the README. In short:

```bash
npm install        # postinstall rebuilds better-sqlite3 for Electron
npm run dev        # hot-reload dev build
npm run typecheck  # type-check main + renderer
npm run test:run   # run the test suite
```

Please make sure `npm run typecheck` and `npm run test:run` pass before opening a PR.

## Coding guidelines

- **TypeScript**, matching the style of the surrounding code (the repo is
  Prettier/ESLint-formatted — keep diffs minimal and focused).
- Keep the **main/renderer** boundary clean: renderer talks to the database only
  through the typed `window.api.*` IPC contract (`src/shared`, `src/preload`).
- The app is **local-first and private** — do not add cloud calls, telemetry, or
  anything that sends user data off the machine. Network access stays opt-in
  (FamilySearch import, map tiles, place geocoding, update check).
- Add or update tests when you change behavior.

## Pull request process

1. Fork the repo and create a topic branch.
2. Make your change with a clear, focused commit history.
3. Ensure typecheck + tests pass.
4. Fill in the pull-request template and link any related issue.

## Contributor license

By contributing, you agree that your contribution is licensed under the project's
[PolyForm Noncommercial License 1.0.0](LICENSE), the same terms as the rest of
TreeMonk.

## Questions

Open a [discussion or issue](https://github.com/n1kozor/TreeMonk/issues), or reach
out via [treemonk.eu](https://treemonk.eu).
