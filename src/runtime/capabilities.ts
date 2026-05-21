import type { QuicklookSourceKind, RuntimeCapabilities } from "../types.js";

export function hasPdfRenderingSupport(runtime: RuntimeCapabilities): boolean {
  return runtime.pdftocairo.available || runtime.pdftoppm.available;
}

export function hasOfficeRenderingSupport(runtime: RuntimeCapabilities): boolean {
  return runtime.libreoffice.available && hasPdfRenderingSupport(runtime);
}

export function getMissingDependenciesForSourceKind(
  sourceKind: QuicklookSourceKind,
  runtime: RuntimeCapabilities,
): string[] {
  switch (sourceKind) {
    case "video":
      return runtime.ffmpeg.available ? [] : ["ffmpeg"];
    case "pdf":
      return hasPdfRenderingSupport(runtime) ? [] : ["pdftocairo or pdftoppm"];
    case "office": {
      const missing: string[] = [];

      if (!runtime.libreoffice.available) {
        missing.push("libreoffice");
      }

      if (!hasPdfRenderingSupport(runtime)) {
        missing.push("pdftocairo or pdftoppm");
      }

      return missing;
    }
    default:
      return [];
  }
}
