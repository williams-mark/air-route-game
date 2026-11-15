import path from "node:path";

/** Resolve a request pathname inside root; returns null on traversal or malformed input. */
export function resolveInside(root: string, pathname: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel.includes("\0") || rel.includes("\\")) return null;
  if (rel === "/" || rel === "") rel = "/index.html";
  const full = path.resolve(root, "." + path.posix.normalize("/" + rel));
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}
