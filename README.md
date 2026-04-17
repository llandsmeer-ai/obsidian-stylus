# Stylus — Inline SVG Drawing for Obsidian

Freehand drawing directly inside your Obsidian notes. Embed an SVG with the `|stylus` alias and get an interactive pen canvas inline — no popups, no separate windows.

## Usage

1. Create a drawing: run the **Stylus: Create new SVG** command (Ctrl/Cmd+P → "Stylus: Create")
2. Or embed any SVG manually:
   ```markdown
   ![[my-drawing.svg|stylus]]
   ```
3. Click the canvas to start drawing. Use the toolbar to switch colors, widths, eraser, undo/redo, or resize.

Plain `![[file.svg]]` embeds (without `|stylus`) render normally and are not affected.

## Features

- **Inline canvas** — draws directly in your note (Live Preview and Reading view)
- **Pen tool** — 6 color presets, 4 width presets, configurable stroke smoothing
- **Eraser** — click/tap a stroke to remove it
- **Undo / Redo** — Ctrl+Z / Ctrl+Shift+Z
- **Stylus hardware support** — eraser tip auto-activates eraser; barrel button is configurable (cycle color, toggle tool, or undo)
- **Resizable canvas** — change dimensions via toolbar
- **Portable SVG** — strokes are saved as native `<path>` elements; files stay valid SVGs
- **Auto-save** — debounced 2-second save via `vault.modify()`

## Installation

### BRAT (recommended for beta testing)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)
2. In BRAT settings, click **Add Beta plugin**
3. Enter: `https://github.com/llandsmeer-ai/obsidian-stylus`

### Manual

1. Go to the [latest release](https://github.com/llandsmeer-ai/obsidian-stylus/releases/latest)
2. Download `main.js`, `manifest.json`, and `styles.css`
3. Create a folder: `<your-vault>/.obsidian/plugins/obsidian-stylus/`
4. Copy the three files into that folder
5. Reload Obsidian and enable the plugin in Settings → Community plugins

## Development

```bash
git clone https://github.com/llandsmeer-ai/obsidian-stylus.git
cd obsidian-stylus
npm install
npm run dev
```

Then symlink or copy the repo into your vault's `.obsidian/plugins/obsidian-stylus/` directory.

## Releasing

```bash
npm version patch   # bumps version in package.json, manifest.json, versions.json
git push && git push --tags
```

The GitHub Actions workflow builds and creates a draft release with the plugin assets.

## License

MIT
