# Dvina Quicklook

This fixture exists so we can test the package manually without needing any external binaries.

- Input mode can be `path`, `buffer`, or `stream`
- Default sizing uses `maxEdge: 512`
- Unsupported formats throw typed errors

```ts
const result = await quicklook.generate(input, {
  kind: "preview",
  size: { maxEdge: 512 },
});
```
