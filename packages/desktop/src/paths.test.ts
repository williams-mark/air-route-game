import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInside } from "./paths";

const root = path.resolve("/tmp/game-root");

describe("resolveInside", () => {
  it("maps root to index.html", () => {
    expect(resolveInside(root, "/")).toBe(path.join(root, "index.html"));
  });
  it("maps nested assets", () => {
    expect(resolveInside(root, "/assets/a.js")).toBe(path.join(root, "assets", "a.js"));
  });
  it("blocks traversal, including encoded", () => {
    for (const p of ["/../secret", "/%2e%2e/secret", "/..%2f..%2fsecret", "/a/../../x", "/a\\..\\..\\x", "/%00", "/%zz"]) {
      const r = resolveInside(root, p);
      expect(r === null || r.startsWith(root + path.sep)).toBe(true);
    }
    expect(resolveInside(root, "/%00")).toBeNull();
    expect(resolveInside(root, "/%zz")).toBeNull();
    expect(resolveInside(root, "/a\\..\\..\\x")).toBeNull();
  });
});
