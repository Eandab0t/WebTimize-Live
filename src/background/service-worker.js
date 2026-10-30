importScripts("../shared/settings.js", "../shared/profile.js");

const PROFILE_INDEX = "profiles/index.json";

async function fetchJson(path) {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) throw new Error(`cannot load ${path}`);
  return response.json();
}

async function listProfiles() {
  const index = await fetchJson(PROFILE_INDEX);
  const profiles = [];
  for (const entry of index.profiles || []) {
    try {
      const profile = await fetchJson(`profiles/${entry.file}`);
      const errors = WebTimizeProfile.validate(profile);
      if (errors.length) {
        console.warn(`WebTimize Live: ignoring ${entry.file}`, errors);
        continue;
      }
      profiles.push(profile);
    } catch (error) {
      console.warn(`WebTimize Live: cannot load ${entry.file}`, error);
    }
  }
  return profiles;
}

async function loadProfile(hostname) {
  const profiles = await listProfiles();
  return profiles.find((profile) => WebTimizeProfile.matches(hostname, profile.domains)) || null;
}

async function syncNetworkRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  const settings = await WebTimizeSettings.get();
  const profiles = await listProfiles();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = [];
  if (settings.enabled) {
    profiles.forEach((profile, profileIndex) => {
      const site = WebTimizeSettings.siteFor(settings, profile.domains[0]);
      if (!site.enabled || !site.network || !profile.features.network) return;
      (profile.networkRules || []).forEach((rule, ruleIndex) => {
        addRules.push({
          id: profileIndex * 100 + ruleIndex + 1,
          priority: 1,
          action: { type: "block" },
          condition: {
            urlFilter: rule.urlFilter,
            resourceTypes: rule.resourceTypes || ["script", "image", "xmlhttprequest", "sub_frame"],
            initiatorDomains: profile.domains
          }
        });
      });
    });
  }
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((rule) => rule.id),
      addRules
    });
  } catch (error) {
    console.warn("WebTimize Live: could not update network rules", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  WebTimizeSettings.ensureDefaults()
    .then(syncNetworkRules)
    .catch((error) => console.warn("WebTimize Live: install setup failed", error));
});

chrome.runtime.onStartup.addListener(() => {
  syncNetworkRules().catch((error) => console.warn("WebTimize Live: startup sync failed", error));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    syncNetworkRules().catch((error) => console.warn("WebTimize Live: rule sync failed", error));
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "webtim:get-profile") {
    loadProfile(message.hostname)
      .then((profile) => sendResponse({ profile }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message?.type === "webtim:list-profiles") {
    listProfiles()
      .then((profiles) => sendResponse({ profiles }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  return false;
});
