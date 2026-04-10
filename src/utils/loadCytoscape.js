/**
 * Loads Cytoscape.js from CDN once and returns the constructor.
 * Caches the promise so the script is only injected once per page load.
 */
let _promise = null;

export function loadCytoscape() {
  if (typeof window !== "undefined" && window.cytoscape) {
    return Promise.resolve(window.cytoscape);
  }
  if (_promise) return _promise;
  _promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/cytoscape@3.30.2/dist/cytoscape.min.js";
    script.crossOrigin = "anonymous";
    script.onload  = () => resolve(window.cytoscape);
    script.onerror = () => reject(new Error("Failed to load Cytoscape from CDN"));
    document.head.appendChild(script);
  });
  return _promise;
}
