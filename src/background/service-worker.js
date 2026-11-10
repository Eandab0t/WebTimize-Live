if (typeof importScripts === "function") {
  importScripts("../shared/browser-api.js", "../shared/settings.js", "../shared/profile.js", "../shared/rules.js");
}

const browserApi = WebTimizeBrowser;

const PROFILE_INDEX = "profiles/index.json";

async function fetchJson(path) {
  const response = await fetch(browserApi.runtime.getURL(path));
  if (!response.ok) throw new Error(`cannot load ${path}`);
  return response.json();
}

/**
 * Load every indexed profile, refusing the whole index when it is malformed and skipping any
 * profile that fails validation or disagrees with its index entry. Nothing outside profiles/ is
 * ever fetched: index file names go through safeProfilePath.
 */
async function listProfiles() {
  const index = await fetchJson(PROFILE_INDEX);
  const indexErrors = WebTimizeProfile.validateIndex(index);
  if (indexErrors.length) {
    console.warn("WebTimize Live: profile index is invalid", indexErrors);
    return [];
  }
  const profiles = [];
  const seenIds = new Set();
  for (const entry of index.profiles) {
    const path = WebTimizeProfile.safeProfilePath(entry.file);
    if (!path) {
      console.warn(`WebTimize Live: refusing profile path ${entry.file}`);
      continue;
    }
    try {
      const profile = await fetchJson(path);
      const errors = WebTimizeProfile.validate(profile);
      if (errors.length) {
        console.warn(`WebTimize Live: ignoring ${entry.file}`, errors);
        continue;
      }
      if (!WebTimizeProfile.matches(entry.domain, profile.domains)) {
        console.warn(`WebTimize Live: ${entry.file} does not declare ${entry.domain}`);
        continue;
      }
      if (seenIds.has(profile.id)) {
        console.warn(`WebTimize Live: duplicate profile id ${profile.id}`);
        continue;
      }
      seenIds.add(profile.id);
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
  if (!browserApi.dnr.available) {
    return { count: 0, skipped: [], reason: "declarativeNetRequest unavailable" };
  }
  const settings = await WebTimizeSettings.get();
  const profiles = await listProfiles();
  const { rules, skipped } = WebTimizeRules.buildRules(settings, profiles);
  for (const item of skipped) {
    console.warn(`WebTimize Live: skipped network rule (${item.profile})`, item.reason);
  }
  const existing = await browserApi.dnr.getDynamicRules();
  try {
    await browserApi.dnr.updateDynamicRules({
      removeRuleIds: existing.map((rule) => rule.id),
      addRules: rules
    });
  } catch (error) {
    console.warn("WebTimize Live: could not update network rules", error);
    throw error;
  }
  return { count: rules.length, skipped };
}

function report(operation) {
  operation.catch((error) => console.warn("WebTimize Live: background task failed", error));
}

let syncQueue = Promise.resolve();
function syncSerialized() {
  const operation = syncQueue.then(syncNetworkRules, syncNetworkRules);
  syncQueue = operation.catch(() => {});
  return operation;
}

browserApi.runtime.onInstalled.addListener(() => {
  report((async () => {
    await WebTimizeSettings.ensureDefaults();
    await syncSerialized();
  })());
});

browserApi.runtime.onStartup.addListener(() => {
  report(syncSerialized());
});

browserApi.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[WebTimizeSettings.STORAGE_KEY]) report(syncSerialized());
});

browserApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
  if (message?.type === "webtim:sync-network-rules") {
    syncSerialized()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
