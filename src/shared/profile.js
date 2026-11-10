(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebTimizeProfile = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCHEMA_VERSION = 1;
  const STALE_DAYS = 180;
  const RESOURCE_TYPES = [
    "main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object",
    "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport",
    "webbundle", "other"
  ];
  const DOMAIN_RE = /^(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
  const VERSION_RE = /^\d+\.\d+\.\d+$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const FILE_RE = /^[a-z0-9][a-z0-9.-]*\.json$/;
  const SELECTOR_FORBIDDEN = /[{};<>@]/;
  const WHOLE_PAGE_SELECTOR = /^(?:\*|html|body|:root)(?![\w-])|^:(?:is|where)\(\s*(?:html|body|:root)\s*\)/i;
  const FORBIDDEN_CSS = /(@import|@charset|javascript:|expression\s*\(|behavior\s*:|-moz-binding)/i;
  const CSS_RESOURCE = /url\s*\(/i;
  const KNOWN_KEYS = [
    "schemaVersion", "id", "name", "version", "updated", "domains", "features",
    "selectors", "styles", "networkRules", "compatibility"
  ];

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim());
  }

  function isDate(text) {
    if (typeof text !== "string" || !DATE_RE.test(text)) return false;
    const date = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
  }

  function normalizeDomain(domain) {
    return String(domain || "").trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  }

  function validDomain(domain) {
    return typeof domain === "string" && DOMAIN_RE.test(normalizeDomain(domain));
  }

  function checkSelectors(selectors, errors) {
    if (selectors === undefined) return;
    if (!Array.isArray(selectors)) {
      errors.push("selectors.hide must be a string array");
      return;
    }
    selectors.forEach((selector, index) => {
      const label = `selectors.hide[${index}]`;
      if (typeof selector !== "string" || !selector.trim()) {
        errors.push(`${label} must be a non-empty string`);
        return;
      }
      if (SELECTOR_FORBIDDEN.test(selector)) {
        errors.push(`${label} contains characters that cannot appear in a selector`);
      }
      if (WHOLE_PAGE_SELECTOR.test(selector.trim())) {
        errors.push(`${label} targets the whole document, which is never a cleanup`);
      }
    });
  }

  function checkStyles(styles, errors) {
    if (styles === undefined) return;
    if (!isObject(styles)) {
      errors.push("styles must be an object");
      return;
    }
    for (const key of ["cleanup", "layout"]) {
      if (styles[key] !== undefined && !isStringArray(styles[key])) {
        errors.push(`styles.${key} must be a string array`);
      }
    }
    const rules = [...(Array.isArray(styles.cleanup) ? styles.cleanup : []),
      ...(Array.isArray(styles.layout) ? styles.layout : [])];
    for (const css of rules) {
      if (FORBIDDEN_CSS.test(css)) errors.push("styles contain a forbidden directive");
      if (CSS_RESOURCE.test(css)) errors.push("styles must not load resources");
      const open = (css.match(/{/g) || []).length;
      const close = (css.match(/}/g) || []).length;
      if (open !== close) errors.push("styles contain unbalanced braces");
    }
  }

  function checkNetworkRules(rules, errors) {
    if (!Array.isArray(rules)) {
      errors.push("networkRules must be an array");
      return;
    }
    rules.forEach((rule, index) => {
      const label = `networkRules[${index}]`;
      if (!isObject(rule)) {
        errors.push(`${label} must be an object`);
        return;
      }
      if (typeof rule.urlFilter !== "string" || !rule.urlFilter.trim()) {
        errors.push(`${label}.urlFilter is required`);
      } else if (rule.urlFilter.length > 2000) {
        errors.push(`${label}.urlFilter is too long`);
      }
      if (rule.action !== undefined && rule.action !== "block") {
        errors.push(`${label}.action must be "block"`);
      }
      if (rule.resourceTypes === undefined) return;
      if (!isStringArray(rule.resourceTypes)) {
        errors.push(`${label}.resourceTypes must be a string array`);
        return;
      }
      for (const type of rule.resourceTypes) {
        if (!RESOURCE_TYPES.includes(type)) errors.push(`${label}.resourceTypes has unknown type ${type}`);
      }
    });
  }

  function checkCompatibility(compatibility, errors) {
    if (compatibility === undefined) return;
    if (!isObject(compatibility)) {
      errors.push("compatibility must be an object");
      return;
    }
    if (compatibility.testedAt !== undefined && !isDate(compatibility.testedAt)) {
      errors.push("compatibility.testedAt must be a YYYY-MM-DD date");
    }
    if (compatibility.notes !== undefined && typeof compatibility.notes !== "string") {
      errors.push("compatibility.notes must be a string");
    }
    if (compatibility.testedViewports !== undefined) {
      if (!isStringArray(compatibility.testedViewports)
        || !compatibility.testedViewports.every((entry) => /^\d+x\d+$/.test(entry))) {
        errors.push("compatibility.testedViewports must be entries like 1440x900");
      }
    }
  }

  function validate(profile) {
    const errors = [];
    if (!isObject(profile)) return ["profile must be an object"];
    for (const key of Object.keys(profile)) {
      if (!KNOWN_KEYS.includes(key)) errors.push(`unknown profile field ${key}`);
    }
    if (profile.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
    if (typeof profile.id !== "string" || !ID_RE.test(profile.id)) {
      errors.push("id must be a lowercase slug (letters, digits, hyphens)");
    }
    if (typeof profile.name !== "string" || !profile.name.trim() || profile.name.length > 80) {
      errors.push("name is required (max 80 characters)");
    }
    if (typeof profile.version !== "string" || !VERSION_RE.test(profile.version)) {
      errors.push("version must be MAJOR.MINOR.PATCH");
    }
    if (!isDate(profile.updated)) errors.push("updated must be a YYYY-MM-DD date");
    if (!isStringArray(profile.domains) || !profile.domains.length) {
      errors.push("domains must be a non-empty string array");
    } else {
      const seen = new Set();
      for (const domain of profile.domains) {
        if (!validDomain(domain)) errors.push(`invalid domain ${domain}`);
        const key = normalizeDomain(domain);
        if (seen.has(key)) errors.push(`duplicate domain ${domain}`);
        seen.add(key);
      }
    }
    if (!isObject(profile.features)) {
      errors.push("features must be an object");
    } else {
      for (const key of ["cleanup", "layout", "network"]) {
        if (typeof profile.features[key] !== "boolean") errors.push(`features.${key} must be boolean`);
      }
    }
    if (profile.selectors !== undefined && !isObject(profile.selectors)) {
      errors.push("selectors must be an object");
    } else {
      checkSelectors(profile.selectors?.hide, errors);
    }
    checkStyles(profile.styles, errors);
    checkNetworkRules(profile.networkRules, errors);
    checkCompatibility(profile.compatibility, errors);
    if (profile.features?.network === false && Array.isArray(profile.networkRules) && profile.networkRules.length) {
      errors.push("networkRules are present but features.network is false");
    }
    return [...new Set(errors)];
  }

  function safeProfilePath(file) {
    if (typeof file !== "string" || !FILE_RE.test(file)) return null;
    if (file.includes("/") || file.includes("\\") || file.includes("..")) return null;
    return `profiles/${file}`;
  }

  function validateIndex(index) {
    const errors = [];
    if (!isObject(index)) return ["index must be an object"];
    if (index.schemaVersion !== SCHEMA_VERSION) errors.push(`index schemaVersion must be ${SCHEMA_VERSION}`);
    if (!Array.isArray(index.profiles) || !index.profiles.length) {
      errors.push("index profiles must be a non-empty array");
      return errors;
    }
    const files = new Set();
    const domains = new Set();
    index.profiles.forEach((entry, position) => {
      const label = `profiles[${position}]`;
      if (!isObject(entry)) {
        errors.push(`${label} must be an object`);
        return;
      }
      if (!safeProfilePath(entry.file)) errors.push(`${label}.file must be a plain file name under profiles/`);
      else if (files.has(entry.file)) errors.push(`${label}.file is listed twice`);
      else files.add(entry.file);
      if (!validDomain(entry.domain)) {
        errors.push(`${label}.domain must be a domain like example.com`);
      } else {
        const key = normalizeDomain(entry.domain);
        if (domains.has(key)) errors.push(`${label}.domain is listed twice`);
        domains.add(key);
      }
    });
    return errors;
  }

  function matches(hostname, domains) {
    const host = normalizeDomain(hostname);
    return (Array.isArray(domains) ? domains : []).some((domain) => {
      const clean = normalizeDomain(domain);
      return clean && (host === clean || host.endsWith(`.${clean}`));
    });
  }

  function compatibilityInfo(profile, now = new Date()) {
    const testedAt = profile?.compatibility?.testedAt;
    if (!isDate(testedAt)) {
      return {
        testedAt: null,
        ageDays: null,
        stale: true,
        reason: "this profile has no compatibility date",
        testedViewports: []
      };
    }
    const tested = new Date(`${testedAt}T00:00:00Z`);
    const ageDays = Math.max(0, Math.floor((now.getTime() - tested.getTime()) / 86400000));
    return {
      testedAt,
      ageDays,
      stale: ageDays > STALE_DAYS,
      reason: ageDays > STALE_DAYS ? `last verified ${ageDays} days ago` : "",
      testedViewports: Array.isArray(profile.compatibility.testedViewports)
        ? [...profile.compatibility.testedViewports]
        : []
    };
  }

  return {
    SCHEMA_VERSION,
    STALE_DAYS,
    RESOURCE_TYPES,
    validate,
    validateIndex,
    safeProfilePath,
    matches,
    compatibilityInfo,
    validDomain,
    normalizeDomain,
    isDate
  };
});
