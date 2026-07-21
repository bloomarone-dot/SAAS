/** Navigation History API partagée (pas de react-router). */
export function navigate(path, { replace = false } = {}) {
  const method = replace ? "replaceState" : "pushState";
  if (window.location.pathname !== path || replace) {
    window.history[method]({}, "", path);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function cleanPathname(path = window.location.pathname) {
  return path.replace(/\/+$/, "") || "/";
}
