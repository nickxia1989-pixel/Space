import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { __resetBrowserMockFileSystemForTests } from "../src/api";

beforeEach(() => {
  __resetBrowserMockFileSystemForTests();
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});
