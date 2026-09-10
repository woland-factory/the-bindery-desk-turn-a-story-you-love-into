import "@testing-library/jest-dom/vitest";

// jsdom does not implement Blob.prototype.arrayBuffer (real browsers do).
// Polyfill it via FileReader so File reads in the import path are exercised
// exactly as they run in production.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
