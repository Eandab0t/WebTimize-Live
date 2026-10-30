(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebTimizeProfile = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FORBIDDEN_CSS = /(@import|javascript:|expression\s*\(|behavior\s*:)/i;

  function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim());
  }

  function validate(profile) {
    const errors = [];
    if (!profile || typeof profile !== "object") return ["profile must be an object"];
    if (profile.schemaVersion !== 1) errors.push("schemaVersion must be 1");
    for (const key of ["id", "name", "version"]) {
      if (typeof profile[key] !== "string" || !profile[key].trim()) errors.push(`${key} is required`);
    }
    if (!isStringArray(profile.domains) || profile.domains.length === 0) errors.push("domains must be a non-empty string array");
    if (!profile.features || typeof profile.features !== "object") {
      errors.push("features must be an object");
    } else {
      for (const key of ["cleanup", "layout", "network"]) {
        if (typeof profile.features[key] !== "boolean") errors.push(`features.${key} must be boolean`);
      }
    }
    const selectors = profile.selectors || {};
    if (!isStringArray(selectors.hide) && selectors.hide !== undefined) errors.push("selectors.hide must be a string array");
    const styles = profile.styles || {};
    for (const key of ["cleanup", "layout"]) {
      if (!isStringArray(styles[key]) && styles[key] !== undefined) errors.push(`styles.${key} must be a string array`);
    }
    const allCss = [...(styles.cleanup || []), ...(styles.layout || [])].join("\n");
    if (FORBIDDEN_CSS.test(allCss)) errors.push("styles contain a forbidden directive");
    if (!Array.isArray(profile.networkRules)) {
      errors.push("networkRules must be an array");
    } else {
      profile.networkRules.forEach((rule, index) => {
        if (!rule || typeof rule.urlFilter !== "string" || !rule.urlFilter.trim()) {
          errors.push(`networkRules[${index}].urlFilter is required`);
        }
        if (rule.resourceTypes !== undefined && !isStringArray(rule.resourceTypes)) {
          errors.push(`networkRules[${index}].resourceTypes must be a string array`);
        }
      });
    }
    return errors;
  }

  function matches(hostname, domains) {
    const host = String(hostname || "").toLowerCase();
    return (domains || []).some((domain) => {
      const clean = String(domain || "").toLowerCase().replace(/^www\./, "");
      return host === clean || host.endsWith(`.${clean}`);
    });
  }

  return { validate, matches };
});
