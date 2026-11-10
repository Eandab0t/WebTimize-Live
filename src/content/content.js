(function () {
  const settingsApi = globalThis.WebTimizeSettings;
  const engine = globalThis.WebTimizeEngine;
  const browserApi = globalThis.WebTimizeBrowser;
  if (!settingsApi || !engine || !browserApi) {
    console.warn("WebTimize Live: shared modules are missing; nothing applied");
    return Promise.resolve();
  }

  const hostname = location.hostname;
  let settings = settingsApi.normalize(settingsApi.DEFAULT_SETTINGS);
  let profile = null;
  let style = null;
  let loadState = "loading";
  let lastError = null;

  function warn(message) {
    console.warn(`WebTimize Live: ${message}`);
  }

  function contextAlive() {
    try {
      return Boolean(browserApi.runtime.id);
    } catch {
      return false;
    }
  }

  function removeStyle() {
    if (style) style.remove();
    style = null;
    if (document.documentElement) document.documentElement.removeAttribute("data-webtim-live");
  }

  function validSelectors(source) {
    const selectors = Array.isArray(source?.selectors?.hide) ? source.selectors.hide : [];
    return selectors.filter((selector) => {
      try {
        document.createDocumentFragment().querySelector(selector);
        return true;
      } catch {
        warn(`invalid selector ignored: ${selector}`);
        return false;
      }
    });
  }

  function applyStyles() {
    if (!contextAlive()) {
      removeStyle();
      return;
    }
    if (!profile) {
      removeStyle();
      return;
    }
    const site = settingsApi.siteFor(settings, hostname);
    const features = engine.activeFeatures(profile, site);
    const css = site.enabled ? engine.buildCss(profile, features) : "";
    if (!css) {
      removeStyle();
      return;
    }
    if (!style || !style.isConnected) {
      style = document.createElement("style");
      style.id = "webtim-live-style";
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = css;
    document.documentElement.setAttribute("data-webtim-live", "on");
  }

  function status() {
    const site = settingsApi.siteFor(settings, hostname);
    const features = profile
      ? engine.activeFeatures(profile, site)
      : { cleanup: false, layout: false, network: false };
    let hidden = 0;
    if (profile && site.enabled && features.cleanup && profile.selectors.hide.length) {
      try {
        hidden = document.querySelectorAll(profile.selectors.hide.join(",")).length;
      } catch {
        hidden = 0;
      }
    }
    return {
      supported: Boolean(profile),
      loading: loadState === "loading",
      active: Boolean(profile) && site.enabled,
      features,
      hidden,
      error: lastError,
      profile: profile
        ? {
          id: profile.id,
          name: profile.name,
          version: profile.version,
          networkRules: (profile.networkRules || []).length,
          compatibility: profile.compatibility || null
        }
        : null
    };
  }

  // Listeners are registered before any await so a popup that opens during startup still gets an
  // answer ("loading" or "unsupported") instead of a silent no-response error.
  try {
    browserApi.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !changes[settingsApi.STORAGE_KEY]) return;
      settings = settingsApi.normalize(changes[settingsApi.STORAGE_KEY].newValue);
      applyStyles();
    });
  } catch (error) {
    warn(`cannot watch settings (${error.message})`);
  }

  try {
    browserApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "webtim:status") {
        sendResponse(status());
        return false;
      }
      if (message?.type === "webtim:refresh") {
        settingsApi.get()
          .then((next) => {
            settings = next;
            applyStyles();
            sendResponse(status());
          })
          .catch((error) => {
            lastError = error.message;
            sendResponse(status());
          });
        return true;
      }
      return false;
    });
  } catch (error) {
    warn(`cannot listen for popup messages (${error.message})`);
  }

  async function start() {
    if (contextAlive()) {
      try {
        settings = await settingsApi.get();
      } catch (error) {
        warn(`settings could not be read, using defaults (${error.message})`);
        settings = settingsApi.normalize(settingsApi.DEFAULT_SETTINGS);
      }
      let response = null;
      try {
        response = await browserApi.runtime.sendMessage({ type: "webtim:get-profile", hostname });
      } catch (error) {
        // The service worker can be asleep or the extension can be reloading; retrying here would
        // race the next navigation, and no profile means no change to the page.
        warn(`profile lookup failed (${error.message})`);
      }
      if (response?.error) {
        lastError = response.error;
        warn(`profile lookup failed (${response.error})`);
      }
      if (response?.profile) {
        profile = { ...response.profile, selectors: { ...response.profile.selectors, hide: validSelectors(response.profile) } };
      }
    } else {
      warn("extension context is gone; no styles applied");
    }
    loadState = profile ? "ready" : "unsupported";
    applyStyles();
  }

  return start();
})();
