import { describe, expect, it } from "vitest";
import { breadcrumbs, formatBytes, parentPath, pathName } from "../src/pathUtils";

describe("path utilities", () => {
  it("parses Windows paths into names, parents, and breadcrumbs", () => {
    expect(pathName("C:\\Users\\Traveler\\Downloads")).toBe("Downloads");
    expect(parentPath("C:\\Users\\Traveler\\Downloads")).toBe("C:\\Users\\Traveler");
    expect(parentPath("C:\\")).toBe("C:\\");
    expect(breadcrumbs("C:\\Users\\Traveler")).toEqual([
      { label: "C:", path: "C:\\" },
      { label: "Users", path: "C:\\Users" },
      { label: "Traveler", path: "C:\\Users\\Traveler" }
    ]);
  });

  it("formats byte sizes for compact status bars", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });
});
