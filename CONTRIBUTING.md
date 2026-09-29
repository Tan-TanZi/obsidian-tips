# Contributing to Tips

Thanks for taking the time to help improve Tips. This document covers the common
paths: reporting a bug, suggesting a feature, shipping templates with your own
plugin, and working on the code.

---

## Reporting a bug

Before opening an issue, please search the existing ones — the same problem may
already be tracked.

A useful report includes:

| Item | Why it matters |
| --- | --- |
| Obsidian version | The plugin relies on `getLanguage()` (1.8.7+) and behaves differently on older builds |
| Tips version | Shown under Settings → Community plugins |
| Platform | Desktop or mobile — scanning performance and file handling differ |
| Steps to reproduce | The single most valuable part; "it doesn't work" can't be acted on |
| Console output | Open the developer console (`Ctrl+Shift+I` / `Cmd+Option+I`) and paste anything starting with `[tips]` |

**The console is important here.** Editor-related failures are caught and logged
rather than thrown — a `ViewPlugin.update()` exception would otherwise break the
whole editor. That means a silent misbehaviour usually leaves a `[tips] ...`
line in the console that pinpoints it.

## Suggesting a feature

Describe the problem you're trying to solve, not just the solution. Knowing the
underlying workflow often leads to a simpler fix than the one originally imagined.

Two things are worth checking before proposing a change to the scanning logic:

- **It must use public APIs only.** `Vault.configDir`, `Vault.adapter` and the
  CodeMirror 6 extension points are fine; `app.plugins` and similar internals are
  not, and would fail review.
- **The plugin never moves your cursor on its own.** The hover button only picks a
  language; it must not disturb the editing position. Any change that violates
  this is out of scope.

## Shipping templates with your plugin

If your plugin works through code blocks, you can distribute reference templates
in a `tips.json` placed inside your plugin folder. Users get them on install with
no manual import.

```json
{
	"mermaid": [
		{ "name": "erDiagram", "body": "erDiagram\n    CUSTOMER ||--o{ ORDER : places" },
		{ "name": "......", "body": "........" }
	]
}
```

Conventions:

- Keys are **code block identifiers**, values are arrays of templates (each with
  `name` and `body`).
- Do not include the surrounding fence in `body`.
- Identifiers declared here also join the code block candidate list — this is what
  makes plugins with **runtime-registered** code block names usable, since static
  analysis cannot read those from `main.js`.
- Everything here disappears when your plugin is uninstalled.
- Users can turn off "Read templates bundled with plugins" in settings.

See the [README](README.md) for the user-facing description.

---

## Development

### Setup

Requires **Node.js 18 or newer**.

```bash
npm install
```

### Build

```bash
npm run dev     # watch mode, rebuilds on change
npm run build   # type check + production build
```

`npm run build` runs `tsc -noEmit -skipLibCheck` first, so type errors surface
before the bundle is produced.

During development you can clone this repository straight into
`<vault>/.obsidian/plugins/tips/` and reload the plugin in Obsidian after each
`npm run dev`.

### Testing

There is **no test framework** in this project. Pure logic modules are verified by
bundling them to ESM and running assertions in plain Node:

```bash
# 1. Bundle a pure module
npx esbuild src/core/snippets.ts --bundle --format=esm --platform=node --outfile=__v-snip__.mjs

# 2. Import it from a throwaway script and assert
node __v-snip__.run.mjs
```

Modules that import `obsidian` (such as `src/core/scanner.ts`) need a stub:

```bash
npx esbuild src/core/scanner.ts --bundle --format=esm --platform=node \
  --alias:obsidian=./__stub-obsidian__.mjs --outfile=__v-scan__.mjs
```

**Clean up after yourself.** Temporary `__v-*.mjs` files must not be committed.

This approach exists for a reason: several real bugs in this codebase (for example
fingerprint comparison that ignored the identifier) were invisible on inspection
and only surfaced once a script ran against them. If you change anything in
`src/core/`, write a throwaway script and actually run it.

---

## Project layout

```
src/
├── main.ts              # Entry: settings, commands, scan scheduling, public API
├── settings.ts          # Settings tab
├── i18n.ts              # Six-language strings and language resolution
├── types.ts             # Settings, candidate and template types
├── data/languages.ts    # Built-in language table and Obsidian processors
├── core/                # Pure logic — no DOM, no editor. Testable in Node.
│   ├── preferences.ts   # Settings merge and normalisation
│   ├── scanner.ts       # Scans plugin folders for names and tips.json
│   ├── snippets.ts      # Templates: fence stripping, normalisation, import
│   └── store.ts         # Candidate merging, filtering and sorting
├── editor/              # CodeMirror 6 integration
│   ├── codeblocks.ts    # Fence detection, ? trigger, replacement maths
│   └── extension.ts     # Button + panel timing (the most intricate file)
└── ui/                  # Panels and modals
    ├── picker.ts         # Two-column language candidate panel
    ├── position.ts       # Shared positioning and scrolling helpers
    ├── snippet-picker.ts # Template panel
    └── snippet-modals.ts # Template editing and import/export modals
```

`src/core/` deliberately has no DOM or editor dependency — that's what makes it
testable outside Obsidian. Keep it that way.

---

## Code style

The project is written in **TypeScript in `strict` mode**, formatted with **tabs**.
Beyond that, a few rules matter because of how Obsidian's plugin review works:

| Rule | Reason |
| --- | --- |
| Never `el.style.xxx = ...` | Review rejects inline styles. Use a CSS class, or `setCssProps()` with `--`-prefixed custom properties only |
| Never `document.createElement` | Use Obsidian's helpers: `createDiv()`, `createSpan()`, `createEl()` |
| No `h1`–`h6` for settings headings | Use `Setting.setName().setHeading()` |
| No `localStorage` | Use Obsidian's `getLanguage()` instead |
| No runtime dependencies | Everything ships inside `main.js`; do not add to `dependencies` |
| Colours come from theme variables | `var(--text-muted)`, `var(--background-secondary)`, … so light and dark themes both work |
| Wrap `ViewPlugin.update()` in `try/catch` | An exception escaping it breaks the editor until Obsidian is restarted |

**Comments are written in Chinese.** That is the maintainer's working language; it
keeps the reasoning close to the code for the person most likely to revisit it.
Code identifiers, user-facing strings and documentation are in English.

Every user-facing string must be added to **all six languages** in `src/i18n.ts`
(`zh`, `en`, `ru`, `fr`, `es`, `ar`). Language names are always written in their
own script. If you add a string and cannot translate it, say so in the pull
request — a missing entry renders the raw key, which is worse than an approximate
translation.

---

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep the change focused. A pull request mixing a bug fix with unrelated
   refactoring is hard to review.
3. Run `npm run build` and make sure it passes with no type errors.
4. If you touched `src/core/`, verify with a throwaway Node script as described
   above, and mention in the PR what you ran and what it printed.
5. Update `README.md` and `README_ZH.md` if the change is user-visible.
6. Describe **why** the change is needed, not just what it does.

Changes that affect the stored `data.json` shape should say so explicitly —
`mergeSettings()` is tolerant of unknown fields, but a migration note in the PR
saves a lot of guessing later.
