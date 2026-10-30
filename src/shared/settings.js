(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebTimizeSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "webtimSettings";
  const DEFAULT_SETTINGS = {
    enabled: true,
    features: { cleanup: true, layout: true, network: false },
    sites: {},
    exceptions: []
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function domainKey(hostname) {
    return String(hostname || "").toLowerCase().replace(/^www\./, "");
  }

  function normalize(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const features = source.features && typeof source.features === "object" ? source.features : {};
    const sites = {};
    if (source.sites && typeof source.sites === "object") {
      for (const [key, value] of Object.entries(source.sites)) {
        if (!value || typeof value !== "object") continue;
        sites[domainKey(key)] = {
          enabled: value.enabled !== false,
          cleanup: value.cleanup !== false,
          layout: value.layout !== false,
          network: value.network === true
        };
      }
    }
    return {
      enabled: source.enabled !== false,
      features: {
        cleanup: features.cleanup !== false,
        layout: features.layout !== false,
        network: features.network === true
      },
      sites,
      exceptions: Array.isArray(source.exceptions)
        ? [...new Set(source.exceptions.map(domainKey).filter(Boolean))]
        : []
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
      excepted
    };
  }

  function setSite(settings, hostname, patch) {
    const normalized = normalize(settings);
    const key = domainKey(hostname);
    normalized.sites[key] = { ...(normalized.sites[key] || {}), ...patch };
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

  async function get() {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) return clone(DEFAULT_SETTINGS);
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    return normalize(stored[STORAGE_KEY]);
  }

  async function save(settings) {
    const normalized = normalize(settings);
    if (typeof chrome !== "undefined" && chrome.storage?.sync) {
      await chrome.storage.sync.set({ [STORAGE_KEY]: normalized });
    }
    return normalized;
  }

  async function ensureDefaults() {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    if (!stored[STORAGE_KEY]) await save(DEFAULT_SETTINGS);
  }

  return {
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    clone,
    domainKey,
    normalize,
    siteFor,
    setSite,
    addException,
    removeException,
    get,
    save,
    ensureDefaults
  };
});
