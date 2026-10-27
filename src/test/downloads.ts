import { vi } from "vitest";

/** Captures files the app offers for download, instead of letting jsdom try to navigate. */
export function captureDownloads(): { name: string; blob: Blob }[] {
  const files: { name: string; blob: Blob }[] = [];
  const blobs = new Map<string, Blob>();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static override createObjectURL(blob: Blob): string {
        const url = `blob:test/${blobs.size}`;
        blobs.set(url, blob);
        return url;
      }
      static override revokeObjectURL(url: string): void {
        blobs.delete(url);
      }
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    files.push({ name: this.download, blob: blobs.get(this.getAttribute("href")!)! });
  });
  return files;
}
