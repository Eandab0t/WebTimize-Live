const settingsApi = WebTimizeSettings;
const elements = {
  globalToggle: document.getElementById("globalToggle"),
  globalState: document.getElementById("globalState"),
  siteCard: document.getElementById("siteCard"),
  siteName: document.getElementById("siteName"),
  siteStatus: document.getElementById("siteStatus"),
  cleanupToggle: document.getElementById("cleanupToggle"),
  layoutToggle: document.getElementById("layoutToggle"),
  networkToggle: document.getElementById("networkToggle"),
  networkHint: document.getElementById("networkHint"),
  profileMeta: document.getElementById("profileMeta"),
  unsupportedCard: document.getElementById("unsupportedCard"),
  unsupportedTitle: document.getElementById("unsupportedTitle"),
  settingsButton: document.getElementById("settingsButton"),
  version: document.getElementById("version")
};

let settings;
let tab;
let hostname;
let profile;

function setBusy(busy) {
  for (const input of document.querySelectorAll("input")) input.disabled = busy || input.disabled;
}

async function refreshTab() {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "webtim:refresh" });
  } catch {
    // The active tab has no content script (unsupported page or reload in progress).
  }
}

function render() {
  const site = hostname ? settingsApi.siteFor(settings, hostname) : null;
  elements.globalToggle.checked = settings.enabled;
  elements.globalState.textContent = settings.enabled ? "On" : "Off";
  elements.globalState.classList.toggle("off", !settings.enabled);

  const supported = Boolean(profile);
  elements.siteCard.hidden = !supported;
  elements.unsupportedCard.hidden = supported;
  if (!supported) {
    elements.unsupportedTitle.textContent = hostname
      ? `No profile for ${hostname}`
      : "This page is not a website";
    return;
  }

  elements.siteName.textContent = profile.name;
  elements.siteStatus.textContent = site.enabled ? "Active" : "Paused";
  elements.siteStatus.classList.toggle("paused", !site.enabled);

  const cleanupAvailable = profile.features.cleanup;
  const layoutAvailable = profile.features.layout;
  const networkAvailable = profile.features.network && (profile.networkRules || []).length > 0;
  elements.cleanupToggle.checked = cleanupAvailable && site.cleanup;
  elements.layoutToggle.checked = layoutAvailable && site.layout;
  elements.networkToggle.checked = networkAvailable && site.network;
  elements.cleanupToggle.disabled = !cleanupAvailable;
  elements.layoutToggle.disabled = !layoutAvailable;
  elements.networkToggle.disabled = !networkAvailable;
  elements.networkHint.hidden = networkAvailable;
  elements.networkHint.textContent = profile.features.network
    ? "This profile has no network rules yet."
    : "This profile does not use network filtering.";
  elements.profileMeta.textContent = `Profile ${profile.version} · ${hostname}`;
}

async function update(patch) {
  settings = await settingsApi.save(patch);
  render();
  await refreshTab();
}

async function init() {
  elements.version.textContent = `v${chrome.runtime.getManifest().version}`;
  settings = await settingsApi.get();
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    hostname = "";
  }
  if (hostname) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "webtim:get-profile", hostname });
      profile = response?.profile || null;
    } catch {
      profile = null;
    }
  }
  setBusy(false);
  render();
}

elements.globalToggle.addEventListener("change", () => {
  settings.enabled = elements.globalToggle.checked;
  update(settings);
});

elements.cleanupToggle.addEventListener("change", () => {
  update(settingsApi.setSite(settings, hostname, { cleanup: elements.cleanupToggle.checked }));
});

elements.layoutToggle.addEventListener("change", () => {
  update(settingsApi.setSite(settings, hostname, { layout: elements.layoutToggle.checked }));
});

elements.networkToggle.addEventListener("change", () => {
  update(settingsApi.setSite(settings, hostname, { network: elements.networkToggle.checked }));
});

elements.settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

init().catch((error) => {
  elements.unsupportedCard.hidden = false;
  elements.siteCard.hidden = true;
  elements.unsupportedTitle.textContent = "Could not load WebTimize Live";
  console.warn("WebTimize Live popup:", error);
});
