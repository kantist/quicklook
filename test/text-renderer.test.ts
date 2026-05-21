import assert from "node:assert/strict";
import test from "node:test";

import { extractPreviewLines, layoutExcerpt, normalizePreviewText } from "../src/renderers/text-preview.ts";

test("normalizes markdown into readable plain text", () => {
  const normalized = normalizePreviewText(
    "# Hello\n\n- **Bold** item with [link](https://example.com)\n\n`const x = 1;`",
    "md",
  );

  assert.match(normalized, /Hello/);
  assert.match(normalized, /- Bold item with link/);
  assert.match(normalized, /const x = 1;/);
  assert.doesNotMatch(normalized, /\*\*/);
  assert.doesNotMatch(normalized, /https:\/\//);
});

test("wraps and truncates text to fit the available preview area", () => {
  const excerpt = layoutExcerpt(
    "This is a fairly long paragraph that should be wrapped into multiple lines and then truncated once there is no more room left in the preview area.",
    {
      maxCharsPerLine: 18,
      maxLines: 3,
    },
  );

  assert.equal(excerpt.lines.length, 3);
  assert.equal(excerpt.truncated, true);
  assert.match(excerpt.lines[2]?.text ?? "", /…$/);
});

test("preserves headings and list structure in markdown excerpts", () => {
  const lines = extractPreviewLines(
    "# Heading\n\n- first item\n- second item with extra details",
    "md",
  );

  const excerpt = layoutExcerpt(lines, {
    maxCharsPerLine: 24,
    maxLines: 6,
  });

  assert.equal(excerpt.lines[0]?.kind, "heading");
  assert.equal(excerpt.lines[0]?.text, "Heading");
  assert.equal(excerpt.lines[1]?.kind, "body");
  assert.equal(excerpt.lines[1]?.text, "- first item");
  assert.match(excerpt.lines[2]?.text ?? "", /^- second item/);
  assert.match(excerpt.lines[3]?.text ?? "", /^  /);
});
