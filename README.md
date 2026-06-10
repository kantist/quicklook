# @dvina/quicklook

Server-first, cross-platform preview and thumbnail generation for files.

`@dvina/quicklook` turns a file input into a single preview image. It is designed for backend use, works with object-storage style streams, avoids macOS-only Quick Look dependencies, and routes each file type through a strategy that fits the format.

## What it does

- Accepts `path`, `buffer`, or `stream` input
- Produces a single `image/webp` or `image/png` preview
- Uses `maxEdge` as the primary sizing model
- Selects a rendering strategy per file type
- Throws typed errors for unsupported files instead of inventing fallback cards

## How it works

The pipeline is intentionally simple:

1. Normalize the input into a local working file
2. Detect extension, MIME type, and source kind
3. Select the best strategy for the file
4. Render an intermediate image or extract one directly
5. Resize and encode the final preview output

Current strategies:

- `image` - direct image pipeline via `sharp`
- `video` - frame capture via `ffmpeg`
- `pdf` - first-page render via `pdftocairo` or `pdftoppm`
- `office` - `libreoffice -> pdf -> image`
- `epub` - cover-image extraction from the EPUB archive
- `html` - headless browser screenshot via external Chromium or Chrome
- `text` - plain white page with a width-aware text excerpt

## Install

```bash
npm install @dvina/quicklook
```

Runtime:

- Node `24+`

Optional system dependencies:

- `ffmpeg` for video previews
- `pdftocairo` or `pdftoppm` for PDF rendering
- `libreoffice` for `doc`, `docx`, `odt`, `rtf`, `ppt`, `pptx`, `xls`, `xlsx`, `csv`
- `chromium`, `google-chrome`, or another detected Chrome-family browser for HTML rendering

Example with Homebrew on macOS:

```bash
brew install ffmpeg poppler libreoffice
brew install --cask chromium
```

## Quick Start

```ts
import { createQuicklook } from "@dvina/quicklook";

const quicklook = createQuicklook({
  limits: {
    timeoutMs: 30_000,
    maxInputBytes: 100 * 1024 * 1024,
  },
});

const result = await quicklook.generate(
  {
    path: "/tmp/report.pdf",
  },
  {
    size: { maxEdge: 512 },
    format: "webp",
  },
);

console.log(result.mimeType); // image/webp
console.log(result.width, result.height);
console.log(result.strategy); // pdf
```

## Why this package exists

This package is built for server environments where macOS Quick Look is not available or not appropriate.

- No `qlmanage`
- No signed-URL requirement
- Good fit for object storage downloads streamed into the backend
- Strategy-based architecture that can grow format by format

## Input Models

```ts
type QuicklookInput =
  | { path: string; filename?: string; mimeType?: string }
  | { buffer: Buffer; filename: string; mimeType?: string }
  | {
      stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream;
      filename: string;
      mimeType?: string;
      size?: number;
    };
```

Recommended usage for object storage is `stream` input. The package will materialize the file into a temporary working file when the selected renderer needs one.

## Sizing

`maxEdge` is the default and recommended mode.

```ts
size: { maxEdge: 512 }
```

That keeps aspect ratio and resizes the longest edge to the requested value.

If you really need a fixed box, you can also use:

```ts
size: { width: 1200, height: 800, fit: "contain" }
```

Defaults:

- `format: "webp"`
- `size: { maxEdge: 512 }`
- `noUpscale: true`
- `page: 1`

## Usage Examples

Path input:

```ts
const result = await quicklook.generate(
  { path: "/tmp/file.pptx" },
  { size: { maxEdge: 512 } },
);
```

Buffer input:

```ts
const result = await quicklook.generate(
  {
    buffer: await fs.readFile("./note.md"),
    filename: "note.md",
    mimeType: "text/markdown",
  },
  {
    size: { maxEdge: 512 },
  },
);
```

Stream input from storage:

```ts
const object = await storage.get(key);

const result = await quicklook.generate(
  {
    stream: object.stream,
    filename: object.filename,
    mimeType: object.mimeType,
    size: object.size,
  },
  {
    size: { maxEdge: 512 },
  },
);
```

Probe before render:

```ts
const probe = await quicklook.probe({
  path: "/tmp/book.epub",
});

if (!probe.supported) {
  console.log(probe.reason);
} else {
  console.log(probe.strategyId);
}
```

Inspect runtime capabilities:

```ts
const runtime = await quicklook.getRuntimeCapabilities();

console.log(runtime.ffmpeg.available);
console.log(runtime.pdftocairo.available);
console.log(runtime.libreoffice.available);
console.log(runtime.chromium.available);
```

## Supported Formats

This reflects the current implementation.

| Group | Formats | Strategy | Notes |
|---|---|---|---|
| Images | `avif`, `gif`, `jpeg`, `jpg`, `png`, `svg`, `tif`, `tiff`, `webp` | `image` | Direct image processing via `sharp` |
| Video | `mov`, `mp4`, `webm` | `video` | Requires `ffmpeg` |
| PDF | `pdf` | `pdf` | First page by default; requires Poppler |
| Office docs | `doc`, `docx`, `odt`, `rtf`, `ppt`, `pptx`, `xls`, `xlsx`, `csv` | `office` | Requires `libreoffice` and Poppler |
| EPUB | `epub` | `epub` | Uses cover image if available |
| HTML | `html`, `htm`, `xhtml` | `html` | Requires external Chromium or Chrome |
| Text-like | `txt`, `md`, `markdown`, `json`, `xml`, `js`, `jsx`, `ts`, `tsx`, `py`, `go`, `rs`, `yaml`, `yml`, `css`, `scss`, `sql`, `sh` | `text` | Renders a width-aware plain text excerpt |

Notes:

- `csv` currently goes through the `office` strategy, not the `text` strategy
- Spreadsheet-like formats have whitespace trimming enabled after render so they do not keep full A4 margins
- `epub` support is cover-first; if an EPUB does not expose a usable cover image, it stays unsupported

## Format Behavior

### Text-like files

Text previews are intentionally plain.

- White background
- No decorative card UI
- No filename header
- Width-aware excerpt only
- Markdown headings and lists are preserved as text structure

### HTML files

HTML previews are rendered in a real headless browser and then resized through the normal image pipeline.

- Uses an external Chromium or Chrome binary; no bundled browser download
- Loads the local file with `file://` so path inputs can keep relative CSS, JS, and image references
- `buffer` and `stream` inputs work best when the HTML is self-contained or points at remote assets
- Uses a portrait-leaning default viewport so document-style pages preview more naturally
- Captures the top of the page instead of reducing extremely tall pages into unreadable full-page miniatures

### EPUB

EPUB previews do not go through LibreOffice.

- The package opens the EPUB archive
- Reads the package metadata
- Finds the cover image
- Sends that image through the normal image pipeline

This matches the expected behavior much better than trying to convert the book through a document renderer.

### Office and spreadsheets

Office files are rendered through LibreOffice, then PDF, then image.

- `ppt` and `pptx` usually render naturally
- `xls`, `xlsx`, and `csv` are trimmed after render to remove excessive print-layout whitespace
- A small white margin is intentionally kept after trimming so the preview does not feel over-cropped

## API

```ts
const quicklook = createQuicklook(options);

await quicklook.generate(input, request);
await quicklook.probe(input);
await quicklook.getRuntimeCapabilities();
```

Request shape:

```ts
type QuicklookRequest = {
  size?:
    | { maxEdge: number }
    | { width: number; height: number; fit?: "contain" | "cover" };
  format?: "webp" | "png";
  page?: number;
  noUpscale?: boolean;
};
```

Result shape:

```ts
type QuicklookResult = {
  buffer: Buffer;
  mimeType: "image/webp" | "image/png";
  width: number;
  height: number;
  strategy: string;
  sourceKind: string;
  meta?: {
    page?: number;
    pageCount?: number;
    durationMs?: number;
  };
};
```

## Error Model

The package does not generate fallback cards for unsupported files. Consumers handle that decision.

Typed errors:

- `QuicklookUnsupportedError`
- `QuicklookDependencyError`
- `QuicklookInputError`
- `QuicklookRenderError`

Typical flow:

```ts
try {
  const result = await quicklook.generate(input, request);
} catch (error) {
  if (error instanceof QuicklookUnsupportedError) {
    // consumer decides what fallback UI to show
  }
}
```

## Example Playground

This repo includes a manual playground.

```bash
npm run example
```

Useful commands:

```bash
npm run example -- --help
npm run example -- --mode path --input example/fixtures/sample.md
npm run example -- --mode buffer --input example/fixtures/sample.json --format png
npm run example -- --probe --input /tmp/book.epub
```

Default output directory:

- `example/output/`

## Current Non-Goals

- No remote URL fetching in the package itself
- No built-in object storage client
- No fallback placeholder generation
- No audio waveform or album-art strategy yet
- No bundled browser binaries
- No full browser-based Markdown page rendering

## Development Notes

Common commands:

```bash
npm run check
npm test
npm run example
```
