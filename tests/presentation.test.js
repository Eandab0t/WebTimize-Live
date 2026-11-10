const assert = require("node:assert/strict");
const test = require("node:test");

const settingsApi = require("../src/shared/settings.js");
const presentation = require("../src/shared/presentation.js");

const now = new Date("2026-11-05T00:00:00Z");

function profile(overrides = {}) {
  return {
    id: "example",
    name: "Example",
    version: "1.2.3",
    domains: ["example.com"],
    features: { cleanup: true, layout: true, network: false },
    selectors: { hide: [".ad"] },
    styles: { cleanup: [], layout: [".x { max-width: none; }"] },
    networkRules: [],
    compatibility: { testedAt: "2026-10-30", testedViewports: ["1440x900"] },
    ...overrides
  };
}

test("an active site shows which features are on", () => {
  const view = presentation.siteView(profile(), settingsApi.normalize(), "www.example.com", now);
  assert.equal(view.active, true);
  assert.equal(view.statusText, "Active");
  assert.equal(view.mode, "inherit");
  assert.match(view.siteNote, /Inheriting global protection/);
  assert.equal(view.inheritanceText, "inherited defaults");
  assert.equal(view.cleanupOn, true);
  assert.equal(view.layoutOn, true);
  assert.equal(view.networkOn, false);
  assert.equal(view.networkAvailable, false);
  assert.equal(view.networkHint, "This profile does not use network filtering.");
  assert.match(view.profileMeta, /Example 1\.2\.3 · tested 2026-10-30/);
  assert.equal(view.stale, false);
});

test("a paused site says so and reports the pause", () => {
  const settings = settingsApi.setSite(settingsApi.normalize(), "example.com", { enabled: false });
  const view = presentation.siteView(profile(), settings, "example.com", now);
  assert.equal(view.active, false);
  assert.equal(view.paused, true);
  assert.equal(view.statusText, "Paused");
  assert.equal(view.mode, "paused");
});

test("an exception is distinct from a manual pause", () => {
  const settings = settingsApi.addException(settingsApi.normalize(), "example.com");
  const view = presentation.siteView(profile(), settings, "example.com", now);
  assert.equal(view.excepted, true);
  assert.equal(view.statusText, "Exception");
  assert.equal(view.paused, true);
  assert.equal(view.mode, "excepted");
});

test("global protection off is distinct from a site pause", () => {
  const settings = { ...settingsApi.normalize(), enabled: false };
  const view = presentation.siteView(profile(), settings, "example.com", now);
  assert.equal(view.active, false);
  assert.equal(view.statusText, "Global off");
  assert.equal(view.mode, "global-off");
});

test("a feature override is reported without claiming a site enable override", () => {
  const settings = settingsApi.setSite(settingsApi.normalize(), "example.com", { layout: false });
  const view = presentation.siteView(profile(), settings, "example.com", now);
  assert.equal(view.mode, "inherit");
  assert.equal(view.inheritanceText, "custom site settings");
  assert.equal(view.layoutOn, false);
});

test("profiles without network rules explain why the switch is unavailable", () => {
  const view = presentation.siteView(profile(), settingsApi.normalize(), "example.com", now);
  assert.equal(view.networkAvailable, false);
  const withFlag = presentation.siteView(
    profile({ features: { cleanup: true, layout: true, network: true } }),
    settingsApi.normalize(),
    "example.com",
    now
  );
  assert.equal(withFlag.networkAvailable, false);
  assert.equal(withFlag.networkHint, "This profile has no network rules yet.");
});

test("a stale compatibility date is surfaced", () => {
  const view = presentation.siteView(
    profile({ compatibility: { testedAt: "2025-01-01", testedViewports: ["1440x900"] } }),
    settingsApi.normalize(),
    "example.com",
    now
  );
  assert.equal(view.stale, true);
  assert.match(view.staleText, /last verified \d+ days ago/);
});

test("unsupported pages get a specific title", () => {
  assert.equal(presentation.unsupportedTitle("news.example"), "No profile for news.example");
  assert.equal(presentation.unsupportedTitle(""), "This page is not a website");
});
