(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebTimizePresentation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const settingsApi = (typeof globalThis !== "undefined" && globalThis.WebTimizeSettings)
    ? globalThis.WebTimizeSettings
    : (typeof require === "function" ? require("./settings.js") : null);
  const profileApi = (typeof globalThis !== "undefined" && globalThis.WebTimizeProfile)
    ? globalThis.WebTimizeProfile
    : (typeof require === "function" ? require("./profile.js") : null);

  /**
   * Everything the popup and options page display for one site, as plain data. Keeping this out of
   * the DOM makes the rules testable and keeps both pages saying the same thing.
   */
  function siteView(profile, settings, hostname, now = new Date()) {
    const site = settingsApi.siteFor(settings, hostname);
    const compatibility = profileApi.compatibilityInfo(profile, now);
    const networkAvailable = Boolean(profile.features.network && (profile.networkRules || []).length);
    const pausedBySite = site.overrides.enabled === false;
    const globalOff = !settings.enabled;
    const mode = site.excepted ? "excepted" : (pausedBySite ? "paused" : (globalOff ? "global-off" : "inherit"));
    const overrideCount = Object.keys(site.overrides).filter((key) => key !== "enabled").length;
    const siteNote = site.excepted
      ? "A site exception disables Live here. Enabling the site removes it."
      : (pausedBySite
        ? "This site is paused. Enabling it here leaves other sites unchanged."
        : (globalOff
          ? "Global protection is off. This site stays unchanged even if enabled here."
          : "Inheriting global protection and defaults."));
    return {
      supported: true,
      key: site.key,
      active: site.enabled,
      excepted: site.excepted,
      paused: !site.enabled,
      mode,
      statusText: site.excepted ? "Exception" : (site.enabled ? "Active" : (globalOff ? "Global off" : "Paused")),
      siteNote,
      inheritanceText: overrideCount ? "custom site settings" : "inherited defaults",
      cleanupAvailable: Boolean(profile.features.cleanup),
      layoutAvailable: Boolean(profile.features.layout),
      networkAvailable,
      cleanupOn: Boolean(profile.features.cleanup && site.cleanup),
      layoutOn: Boolean(profile.features.layout && site.layout),
      networkOn: Boolean(networkAvailable && site.network),
      networkHint: networkAvailable
        ? ""
        : (profile.features.network
          ? "This profile has no network rules yet."
          : "This profile does not use network filtering."),
      profileMeta: `${profile.name} ${profile.version} · tested ${compatibility.testedAt || "never"}`,
      stale: compatibility.stale,
      staleText: compatibility.stale ? `Compatibility check: ${compatibility.reason}.` : "",
      testedViewports: compatibility.testedViewports
    };
  }

  function unsupportedTitle(hostname) {
    return hostname ? `No profile for ${hostname}` : "This page is not a website";
  }

  return { siteView, unsupportedTitle };
});
