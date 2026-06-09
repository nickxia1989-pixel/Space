export interface BreadcrumbPart {
  label: string;
  path: string;
}

export function pathName(filePath: string): string {
  const normalized = trimTrailingSeparator(filePath);
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? filePath;
}

export function parentPath(filePath: string): string {
  const normalized = trimTrailingSeparator(filePath);
  if (/^[A-Za-z]:$/.test(normalized)) return `${normalized}\\`;
  if (/^[A-Za-z]:\\?$/.test(filePath)) return filePath;

  const separator = filePath.includes("\\") ? "\\" : "/";
  const index = normalized.lastIndexOf(separator);
  if (index <= 0) {
    return separator === "\\" && /^[A-Za-z]:/.test(normalized) ? `${normalized.slice(0, 2)}\\` : "/";
  }
  return normalized.slice(0, index) || "/";
}

export function trimTrailingSeparator(filePath: string): string {
  if (/^[A-Za-z]:\\?$/.test(filePath)) return filePath.slice(0, 2);
  if (filePath === "/") return filePath;
  return filePath.replace(/[\\/]+$/, "");
}

export function breadcrumbs(filePath: string): BreadcrumbPart[] {
  if (!filePath) return [];
  const parts: BreadcrumbPart[] = [];
  const isWindows = /^[A-Za-z]:[\\/]/.test(filePath) || /^[A-Za-z]:$/.test(filePath);
  if (isWindows) {
    const drive = filePath.slice(0, 2);
    parts.push({ label: drive, path: `${drive}\\` });
    const remainder = filePath.slice(2).replace(/^[\\/]+/, "");
    let current = `${drive}\\`;
    for (const segment of remainder.split(/[\\/]+/).filter(Boolean)) {
      current = current.endsWith("\\") ? `${current}${segment}` : `${current}\\${segment}`;
      parts.push({ label: segment, path: current });
    }
    return parts;
  }

  parts.push({ label: "/", path: "/" });
  let current = "";
  for (const segment of filePath.split("/").filter(Boolean)) {
    current += `/${segment}`;
    parts.push({ label: segment, path: current });
  }
  return parts;
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return value === 0 ? "0 B" : "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const formatted = size >= 10 || unitIndex === 0 || Number.isInteger(size) ? size.toFixed(0) : size.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
}

export function formatDate(value: number): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function containsPath(paths: string[], filePath: string): boolean {
  return paths.some((path) => path.toLowerCase() === filePath.toLowerCase());
}
