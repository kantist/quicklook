import { readFile, writeFile } from "node:fs/promises";
import { basename, join, posix } from "node:path";

import { unzipSync } from "fflate";

import { QuicklookRenderError, QuicklookUnsupportedError } from "../errors.js";
import { normalizeExtension } from "./mime.js";

interface EpubArchive {
  entries: Map<string, Uint8Array>;
}

export async function extractEpubCover(args: { epubPath: string; workDir: string }): Promise<string> {
  const archive = await readEpubArchive(args.epubPath);
  const containerXml = readArchiveText(archive, "META-INF/container.xml");
  const opfPath = extractRootOpfPath(containerXml);
  const opfXml = readArchiveText(archive, opfPath);
  const coverEntryPath = resolveCoverEntryPath(archive, opfPath, opfXml);
  const coverEntry = archive.entries.get(coverEntryPath);

  if (!coverEntry) {
    throw new QuicklookUnsupportedError("EPUB cover image could not be extracted.");
  }

  const extension = normalizeExtension(posix.extname(coverEntryPath)) ?? "img";
  const filePath = join(args.workDir, `epub-cover.${extension}`);

  await writeFile(filePath, Buffer.from(coverEntry));
  return filePath;
}

async function readEpubArchive(epubPath: string): Promise<EpubArchive> {
  try {
    const buffer = await readFile(epubPath);
    const unzipped = unzipSync(buffer);
    const entries = new Map<string, Uint8Array>();

    for (const [entryPath, entryData] of Object.entries(unzipped)) {
      entries.set(normalizeArchivePath(entryPath), entryData);
    }

    return { entries };
  } catch (error) {
    throw new QuicklookRenderError(`Failed to read EPUB archive: ${basename(epubPath)}`, { cause: error as Error });
  }
}

function extractRootOpfPath(containerXml: string): string {
  const rootfileTag = matchTag(containerXml, "rootfile");
  const fullPath = rootfileTag ? getAttribute(rootfileTag, "full-path") : undefined;

  if (!fullPath) {
    throw new QuicklookUnsupportedError("EPUB package metadata is missing a root OPF path.");
  }

  return normalizeArchivePath(fullPath);
}

function resolveCoverEntryPath(archive: EpubArchive, opfPath: string, opfXml: string): string {
  const manifestItems = parseManifestItems(opfXml);
  const opfDirectory = posix.dirname(opfPath);
  const manifestCover = manifestItems.find((item) => item.properties?.split(/\s+/u).includes("cover-image"));

  if (manifestCover?.href) {
    return resolveArchivePath(opfDirectory, manifestCover.href);
  }

  const metadataCoverId = extractMetadataCoverId(opfXml);

  if (metadataCoverId) {
    const coverById = manifestItems.find((item) => item.id === metadataCoverId);

    if (coverById?.href) {
      return resolveArchivePath(opfDirectory, coverById.href);
    }
  }

  const guideCoverHref = extractGuideCoverHref(opfXml);

  if (guideCoverHref) {
    const resolvedGuidePath = resolveArchivePath(opfDirectory, guideCoverHref);
    const guideEntryPath = resolveImageFromArchiveEntry(archive, resolvedGuidePath);

    if (guideEntryPath) {
      return guideEntryPath;
    }
  }

  const guessedCover = findLikelyCoverEntry(archive, opfDirectory);

  if (guessedCover) {
    return guessedCover;
  }

  throw new QuicklookUnsupportedError("EPUB does not expose a usable cover image.");
}

function parseManifestItems(opfXml: string): Array<{ id?: string; href?: string; mediaType?: string; properties?: string }> {
  return matchTags(opfXml, "item").map((tag) => ({
    id: getAttribute(tag, "id"),
    href: getAttribute(tag, "href"),
    mediaType: getAttribute(tag, "media-type"),
    properties: getAttribute(tag, "properties"),
  }));
}

function extractMetadataCoverId(opfXml: string): string | undefined {
  for (const tag of matchTags(opfXml, "meta")) {
    if (getAttribute(tag, "name") === "cover") {
      return getAttribute(tag, "content");
    }
  }

  return undefined;
}

function extractGuideCoverHref(opfXml: string): string | undefined {
  for (const tag of matchTags(opfXml, "reference")) {
    if (getAttribute(tag, "type") === "cover") {
      return getAttribute(tag, "href");
    }
  }

  return undefined;
}

function resolveImageFromArchiveEntry(archive: EpubArchive, entryPath: string): string | undefined {
  if (isImagePath(entryPath) && archive.entries.has(entryPath)) {
    return entryPath;
  }

  if (!entryPath.endsWith(".xhtml") && !entryPath.endsWith(".html") && !entryPath.endsWith(".htm")) {
    return undefined;
  }

  const xhtml = readArchiveText(archive, entryPath);
  const imageTag = matchTag(xhtml, "img");
  const imageSource = imageTag ? getAttribute(imageTag, "src") : undefined;

  if (!imageSource) {
    return undefined;
  }

  return resolveArchivePath(posix.dirname(entryPath), imageSource);
}

function findLikelyCoverEntry(archive: EpubArchive, opfDirectory: string): string | undefined {
  const candidates = [...archive.entries.keys()]
    .filter((entryPath) => entryPath.startsWith(opfDirectory) && isImagePath(entryPath))
    .sort((left, right) => scoreCoverCandidate(right) - scoreCoverCandidate(left));

  return candidates[0];
}

function scoreCoverCandidate(entryPath: string): number {
  const lower = entryPath.toLowerCase();

  if (lower.includes("cover")) {
    return 100;
  }

  if (lower.includes("title")) {
    return 80;
  }

  if (lower.includes("images/")) {
    return 30;
  }

  return 10;
}

function readArchiveText(archive: EpubArchive, entryPath: string): string {
  const entry = archive.entries.get(normalizeArchivePath(entryPath));

  if (!entry) {
    throw new QuicklookUnsupportedError(`EPUB archive entry not found: ${entryPath}`);
  }

  return Buffer.from(entry).toString("utf8");
}

function resolveArchivePath(baseDirectory: string, relativePath: string): string {
  return normalizeArchivePath(posix.normalize(posix.join(baseDirectory, relativePath)));
}

function normalizeArchivePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\//u, "");
}

function isImagePath(value: string): boolean {
  const extension = normalizeExtension(posix.extname(value));
  return new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "svg", "heic", "heif"]).has(extension ?? "");
}

function matchTag(xml: string, tagName: string): string | undefined {
  return matchTags(xml, tagName)[0];
}

function matchTags(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}(?=\\s|/|>)[^>]*>`, "giu");
  return xml.match(pattern) ?? [];
}

function getAttribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, "iu");
  const match = pattern.exec(tag);
  return match?.[2];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
