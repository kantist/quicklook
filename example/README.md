# Example

This folder is a small manual playground for `@dvina/quicklook`.

## Quick start

```bash
npm install
npm run example
```

That command uses `example/fixtures/sample.md`, passes it as a stream, and writes the result to `example/output/sample.webp`.

## Useful commands

```bash
npm run example -- --help
npm run example -- --mode path --input example/fixtures/sample.md
npm run example -- --mode buffer --input example/fixtures/sample.json --format png
npm run example -- --probe --input example/fixtures/sample.md
```

## Notes

- Default mode is `stream` to mirror object-storage usage more closely.
- Text fixtures work without external system dependencies.
- Video, PDF, and office files require the runtime binaries detected by the package.
