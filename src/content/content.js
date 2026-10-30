(async function () {
  const hostname = location.hostname;
  let settings = await WebTimizeSettings.get();
  const response = await chrome.runtime.sendMessage({ type: "webtim:get-profile", hostname }).catch(() => null);
  const profile = response?.profile;
  if (!profile) return;

  const validSelectors = (profile.selectors?.hide || []).filter((selector) => {
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch {
      console.warn(`WebTimize Live: invalid selector ignored: ${selector}`);
      return false;
    }
  });
  const safeProfile = { ...profile, selectors: { hide: validSelectors } };
  let style = null;

  function removeStyle() {
    if (style) style.remove();
    style = null;
    document.documentElement.removeAttribute("data-webtim-live");
  }

  function apply() {
    const site = WebTimizeSettings.siteFor(settings, hostname);
    const features = WebTimizeEngine.activeFeatures(safeProfile, site);
    const css = site.enabled ? WebTimizeEngine.buildCss(safeProfile, features) : "";
    if (!css) {
      removeStyle();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = "webtim-live-style";
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = css;
    document.documentElement.setAttribute("data-webtim-live", "on");
  }

  function status() {
    const site = WebTimizeSettings.siteFor(settings, hostname);
    const features = WebTimizeEngine.activeFeatures(safeProfile, site);
    let hidden = 0;
    if (site.enabled && features.cleanup && validSelectors.length) {
      try {
        hidden = document.querySelectorAll(validSelectors.join(",")).length;
      } catch {
        hidden = 0;
      }
    }
    return {
      supported: true,
      active: site.enabled,
      features,
      hidden,
      profile: {
        id: profile.id,
        name: profile.name,
        version: profile.version,
        networkRules: (profile.networkRules || []).length
      }
    };
  }

  apply();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    WebTimizeSettings.get().then((next) => {
      settings = next;
      apply();
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "webtim:status") {
      sendResponse(status());
      return false;
    }
    if (message?.type === "webtim:refresh") {
      WebTimizeSettings.get().then((next) => {
        settings = next;
        apply();
        sendResponse(status());
      });
      return true;
    }
    return false;
  });
})();
