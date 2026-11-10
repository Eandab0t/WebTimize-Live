(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebTimizeRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MAX_RULES = 5000;
  const ID_SPACE = 1000000;
  const DEFAULT_RESOURCE_TYPES = ["script", "image", "xmlhttprequest", "sub_frame"];
  const RESOURCE_TYPES = [
    "main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object",
    "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport",
    "webbundle", "other"
  ];

  const settingsApi = (typeof globalThis !== "undefined" && globalThis.WebTimizeSettings)
    ? globalThis.WebTimizeSettings
    : (typeof require === "function" ? require("./settings.js") : null);

  function fnv1a(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash;
  }

  function ruleKey(profile, rule) {
    const domains = (profile.domains || []).map((domain) => String(domain).toLowerCase()).join(",");
    return `${rule.urlFilter.trim()}|${(rule.resourceTypes || DEFAULT_RESOURCE_TYPES).join(",")}|${domains}`;
  }

  function normalizeTypes(types) {
    if (!Array.isArray(types) || !types.length) return [...DEFAULT_RESOURCE_TYPES];
    const known = types.filter((type) => RESOURCE_TYPES.includes(type));
    return [...new Set(known)].sort();
  }

  /**
   * Build the complete dynamic-rule set for the current settings.
   *
   * Rule IDs come from a stable hash of the rule's content, so adding a profile or a rule cannot
   * renumber (and therefore silently replace) unrelated rules. Collisions are resolved by probing
   * in sorted key order, which keeps the result deterministic for identical input.
   */
  function buildRules(settings, profiles, options = {}) {
    const maxRules = Number.isInteger(options.maxRules) ? options.maxRules : MAX_RULES;
    const skipped = [];
    const candidates = new Map();
    if (!settings?.enabled) return { rules: [], skipped, truncated: 0 };

    const ordered = [...(profiles || [])].sort((left, right) => String(left.id).localeCompare(String(right.id)));
    for (const profile of ordered) {
      if (!profile?.features?.network) continue;
      const rules = Array.isArray(profile.networkRules) ? profile.networkRules : [];
      if (!rules.length) continue;
      const scopes = [...new Set((profile.domains || []).map(settingsApi.domainKey).filter(Boolean))];
      for (const initiatorDomain of scopes) {
        const site = settingsApi.siteFor(settings, initiatorDomain);
        if (!site.enabled || !site.network) continue;
        rules.forEach((rule, position) => {
          if (!rule || typeof rule.urlFilter !== "string" || !rule.urlFilter.trim()) {
            skipped.push({ profile: profile.id, rule: position, reason: "urlFilter is missing" });
            return;
          }
          if (rule.action !== undefined && rule.action !== "block") {
            skipped.push({ profile: profile.id, rule: position, reason: "only block rules are supported" });
            return;
          }
          const types = normalizeTypes(rule.resourceTypes);
          if (!types.length) {
            skipped.push({ profile: profile.id, rule: position, reason: "no known resource types" });
            return;
          }
          const key = `${ruleKey(profile, { ...rule, resourceTypes: types })}|${initiatorDomain}`;
          if (candidates.has(key)) return; // identical rule and initiator scope: one rule is enough
          candidates.set(key, {
            priority: 1,
            action: { type: "block" },
            condition: {
              urlFilter: rule.urlFilter.trim(),
              resourceTypes: types,
              initiatorDomains: [initiatorDomain]
            }
          });
        });
      }
    }

    const keys = [...candidates.keys()].sort();
    const used = new Set();
    const rules = [];
    for (const key of keys) {
      let id = (fnv1a(key) % ID_SPACE) + 1;
      while (used.has(id)) id = (id % ID_SPACE) + 1;
      used.add(id);
      const rule = candidates.get(key);
      rules.push({ id, ...rule });
    }
    rules.sort((left, right) => left.id - right.id);

    let truncated = 0;
    if (rules.length > maxRules) {
      truncated = rules.length - maxRules;
      rules.length = maxRules;
      skipped.push({ profile: "*", rule: -1, reason: `${truncated} rules exceed the ${maxRules}-rule limit` });
    }
    return { rules, skipped, truncated };
  }

  return { MAX_RULES, RESOURCE_TYPES, DEFAULT_RESOURCE_TYPES, buildRules, ruleKey, fnv1a };
});
