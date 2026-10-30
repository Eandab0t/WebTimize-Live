const assert = require("node:assert/strict");
const test = require("node:test");

const settingsApi = require("../src/shared/settings.js");
const engine = require("../src/shared/engine.js");

const profile = {
  features: { cleanup: true, layout: true, network: false },
  selectors: { hide: [".ad-slot", "#leaderboard"] },
  styles: { cleanup: [".ad-slot { margin: 0; }"], layout: [".content { max-width: none; }"] }
};

test("defaults are enabled with cleanup and layout, network off", () => {
  const settings = settingsApi.normalize();
  assert.equal(settings.enabled, true);
  assert.equal(settings.features.cleanup, true);
  assert.equal(settings.features.layout, true);
  assert.equal(settings.features.network, false);
});

test("per-site settings override defaults and exceptions disable a site", () => {
  let settings = settingsApi.normalize();
  settings = settingsApi.setSite(settings, "www.coolmathgames.com", { layout: false });
  let site = settingsApi.siteFor(settings, "coolmathgames.com");
  assert.equal(site.layout, false);
  assert.equal(site.cleanup, true);
  settings = settingsApi.addException(settings, "www.coolmathgames.com");
  site = settingsApi.siteFor(settings, "coolmathgames.com");
  assert.equal(site.enabled, false);
  assert.equal(site.excepted, true);
});

test("global disable wins over a per-site enable", () => {
  let settings = settingsApi.normalize();
  settings = settingsApi.setSite(settings, "coolmathgames.com", { enabled: true });
  settings.enabled = false;
  assert.equal(settingsApi.siteFor(settings, "coolmathgames.com").enabled, false);
});

test("cleanup and layout CSS are independently toggleable", () => {
  const cleanup = engine.buildCss(profile, { cleanup: true, layout: false, network: false });
  assert.match(cleanup, /\.ad-slot/);
  assert.match(cleanup, /display: none !important/);
  assert.doesNotMatch(cleanup, /max-width: none/);

  const layout = engine.buildCss(profile, { cleanup: false, layout: true, network: false });
  assert.doesNotMatch(layout, /display: none !important/);
  assert.match(layout, /max-width: none/);
});

test("profile feature flags can veto user settings", () => {
  const features = engine.activeFeatures(
    { ...profile, features: { cleanup: true, layout: false, network: false } },
    { cleanup: true, layout: true, network: true }
  );
  assert.deepEqual(features, { cleanup: true, layout: false, network: false });
});
