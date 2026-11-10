(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebTimizeSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "webtimSettings";
  // Version 2 stores only the values a user actually set for a site. Version 1 materialized every
  // feature as a boolean, which made a site silently ignore later changes to global defaults.
  const SCHEMA_VERSION = 2;
  const FEATURE_KEYS = ["cleanup", "layout", "network"];

  function defaults() {
    return {
      schemaVersion: SCHEMA_VERSION,
      enabled: true,
      features: { cleanup: true, layout: true, network: false },
      sites: {},
      exceptions: []
    };
  }

  const DEFAULT_SETTINGS = defaults();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function domainKey(hostname) {
    return String(hostname || "").toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function validDomain(domain) {
    return /^(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
  }

  function normalizeFeatures(raw) {
    const source = isObject(raw) ? raw : {};
    return {
      cleanup: source.cleanup !== false,
      layout: source.layout !== false,
      network: source.network === true
    };
  }

  function siteOverrides(raw) {
    const overrides = {};
    if (!isObject(raw)) return overrides;
    // `enabled: true` is redundant: a site is enabled unless the global switch or an exception
    // says otherwise. Keeping only `false` means "resume" truly restores inherited behaviour.
    if (raw.enabled === false) overrides.enabled = false;
    for (const key of FEATURE_KEYS) {
      if (typeof raw[key] === "boolean") overrides[key] = raw[key];
    }
    return overrides;
  }

  function normalize(raw) {
    const source = isObject(raw) ? raw : {};
    const features = normalizeFeatures(source.features);
    const legacy = !(Number(source.schemaVersion) >= SCHEMA_VERSION);
    const sites = {};
    if (isObject(source.sites)) {
      for (const [key, value] of Object.entries(source.sites)) {
        const domain = domainKey(key);
        if (!domain || !validDomain(domain)) continue;
        const overrides = siteOverrides(value);
        if (legacy) {
          // Version 1 wrote every feature for every site, even ones the user never touched.
          // Dropping values equal to the current global default restores inheritance without
          // changing what any site does right now.
          for (const feature of FEATURE_KEYS) {
            if (overrides[feature] === features[feature]) delete overrides[feature];
          }
        }
        if (Object.keys(overrides).length) sites[domain] = overrides;
      }
    }
    const exceptions = [];
    if (Array.isArray(source.exceptions)) {
      for (const entry of source.exceptions) {
        const domain = domainKey(entry);
        if (domain && validDomain(domain) && !exceptions.includes(domain)) exceptions.push(domain);
      }
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      enabled: source.enabled !== false,
      features,
      sites,
      exceptions
    };
  }

  function siteFor(settings, hostname) {
    const normalized = normalize(settings);
    const key = domainKey(hostname);
    const site = normalized.sites[key] || {};
    const excepted = normalized.exceptions.includes(key);
    return {
      key,
      enabled: normalized.enabled && !excepted && site.enabled !== false,
      cleanup: site.cleanup ?? normalized.features.cleanup,
      layout: site.layout ?? normalized.features.layout,
      network: site.network ?? normalized.features.network,
      excepted,
      overrides: { ...site }
    };
  }

  /**
   * Merge a patch into one site. Only recognized keys are stored. `null` or `undefined` removes an
   * override so the site inherits the global setting again.
   */
  function setSite(settings, hostname, patch) {
    const normalized = normalize(settings);
    const key = domainKey(hostname);
    if (!key) return normalized;
    const site = { ...(normalized.sites[key] || {}) };
    if (patch?.enabled === true) {
      normalized.exceptions = normalized.exceptions.filter((item) => item !== key);
    }
    if (isObject(patch)) {
      for (const name of ["enabled", ...FEATURE_KEYS]) {
        if (!Object.prototype.hasOwnProperty.call(patch, name)) continue;
        const value = patch[name];
        if (value === null || value === undefined) {
          delete site[name];
        } else if (typeof value === "boolean") {
          if (name === "enabled" && value === true) delete site.enabled;
          else site[name] = value;
        }
      }
    }
    if (Object.keys(site).length) normalized.sites[key] = site;
    else delete normalized.sites[key];
    return normalized;
  }

  function resetSite(settings, hostname) {
    const normalized = normalize(settings);
    delete normalized.sites[domainKey(hostname)];
    return normalized;
  }

  function addException(settings, hostname) {
    const normalized = normalize(settings);
    const key = domainKey(hostname);
    if (key && !normalized.exceptions.includes(key)) normalized.exceptions.push(key);
    return normalized;
  }

  function removeException(settings, hostname) {
    const normalized = normalize(settings);
    const key = domainKey(hostname);
    normalized.exceptions = normalized.exceptions.filter((item) => item !== key);
    return normalized;
  }

  function hasStorage() {
    return Boolean(globalThis.WebTimizeBrowser?.storage?.available)
      || (typeof chrome !== "undefined" && Boolean(chrome.storage?.sync));
  }

  async function get() {
    if (!hasStorage()) return clone(DEFAULT_SETTINGS);
    const stored = globalThis.WebTimizeBrowser?.storage?.available
      ? await globalThis.WebTimizeBrowser.storage.get(STORAGE_KEY)
      : await chrome.storage.sync.get(STORAGE_KEY);
    return normalize(stored[STORAGE_KEY]);
  }

  async function save(settings) {
    const normalized = normalize(settings);
    if (hasStorage()) {
      if (globalThis.WebTimizeBrowser?.storage?.available) {
        await globalThis.WebTimizeBrowser.storage.set({ [STORAGE_KEY]: normalized });
      } else {
        await chrome.storage.sync.set({ [STORAGE_KEY]: normalized });
      }
    }
    return normalized;
  }

  async function ensureDefaults() {
    if (!hasStorage()) return;
    const stored = globalThis.WebTimizeBrowser?.storage?.available
      ? await globalThis.WebTimizeBrowser.storage.get(STORAGE_KEY)
      : await chrome.storage.sync.get(STORAGE_KEY);
    if (!stored[STORAGE_KEY]) await save(DEFAULT_SETTINGS);
  }

  return {
    STORAGE_KEY,
    SCHEMA_VERSION,
    DEFAULT_SETTINGS,
    FEATURE_KEYS,
    clone,
    defaults,
    domainKey,
    normalize,
    siteFor,
    setSite,
    resetSite,
    addException,
    removeException,
    get,
    save,
    ensureDefaults
  };
});
