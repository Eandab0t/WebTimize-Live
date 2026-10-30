(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebTimizeEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function selectorList(profile) {
    const selectors = profile?.selectors?.hide || [];
    return selectors.map((selector) => selector.trim()).filter(Boolean);
  }

  function buildCss(profile, features) {
    const parts = [];
    const selectors = selectorList(profile);
    if (features.cleanup && selectors.length) {
      parts.push(`${selectors.join(",\n")} { display: none !important; }`);
      parts.push(...(profile.styles?.cleanup || []));
    }
    if (features.layout) parts.push(...(profile.styles?.layout || []));
    return parts.filter(Boolean).join("\n\n");
  }

  function activeFeatures(profile, features) {
    return {
      cleanup: Boolean(features.cleanup && profile?.features?.cleanup),
      layout: Boolean(features.layout && profile?.features?.layout),
      network: Boolean(features.network && profile?.features?.network)
    };
  }

  return { selectorList, buildCss, activeFeatures };
});
