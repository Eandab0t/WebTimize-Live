const assert = require("node:assert/strict");
const test = require("node:test");

const api = require("../src/shared/settings.js");

test("per-site overrides stay sparse so global defaults still apply", () => {
  let settings = api.normalize();
  settings = api.setSite(settings, "coolmathgames.com", { layout: false });
  assert.deepEqual(settings.sites["coolmathgames.com"], { layout: false });
  settings = api.normalize({ ...settings, features: { ...settings.features, cleanup: false } });
  const site = api.siteFor(settings, "coolmathgames.com");
  assert.equal(site.layout, false, "the explicit override wins");
  assert.equal(site.cleanup, false, "the untouched feature follows the global switch");
});

test("changing a global default after a site override reaches that site", () => {
  let settings = api.setSite(api.normalize(), "example.com", { layout: false });
  settings.features.cleanup = false;
  settings = api.normalize(settings);
  assert.equal(api.siteFor(settings, "example.com").cleanup, false);
});

test("legacy materialized site objects migrate without changing current behaviour", () => {
  const legacy = {
    enabled: true,
    features: { cleanup: false, layout: true, network: false },
    sites: {
      "www.example.com": { enabled: true, cleanup: true, layout: false, network: false }
    },
    exceptions: []
  };
  const settings = api.normalize(legacy);
  assert.equal(settings.schemaVersion, 2);
  // cleanup: true differs from the global false, so it was a real choice and is kept.
  assert.deepEqual(settings.sites["example.com"], { cleanup: true, layout: false });
  assert.equal(api.siteFor(settings, "example.com").cleanup, true);
});

test("legacy values equal to the global default are dropped so inheritance resumes", () => {
  const legacy = {
    features: { cleanup: true, layout: true, network: false },
    sites: { "example.com": { enabled: true, cleanup: true, layout: true, network: false } }
  };
  const settings = api.normalize(legacy);
  assert.deepEqual(settings.sites, {});
  assert.equal(api.siteFor(settings, "example.com").cleanup, true);
});

test("migration never loses an explicit site pause", () => {
  const settings = api.normalize({
    features: { cleanup: true, layout: true, network: false },
    sites: { "example.com": { enabled: false, cleanup: true, layout: true, network: false } }
  });
  assert.equal(api.siteFor(settings, "example.com").enabled, false);
  assert.deepEqual(settings.sites["example.com"], { enabled: false });
});

test("turning a site back on removes the override and keeps other overrides", () => {
  let settings = api.setSite(api.normalize(), "example.com", { enabled: false, cleanup: false });
  settings = api.setSite(settings, "example.com", { enabled: true });
  assert.deepEqual(settings.sites["example.com"], { cleanup: false });
  assert.equal(api.siteFor(settings, "example.com").enabled, true);
});

test("null clears an override back to inherited", () => {
  let settings = api.setSite(api.normalize(), "example.com", { cleanup: false });
  settings = api.setSite(settings, "example.com", { cleanup: null });
  assert.equal(settings.sites["example.com"], undefined);
  assert.equal(api.siteFor(settings, "example.com").cleanup, true);
});

test("resetSite removes every override for one domain", () => {
  let settings = api.setSite(api.normalize(), "example.com", { cleanup: false, layout: false });
  settings = api.resetSite(settings, "www.example.com");
  assert.deepEqual(settings.sites, {});
});

test("global disable still wins over a site that was never paused", () => {
  const settings = { ...api.normalize(), enabled: false };
  assert.equal(api.siteFor(settings, "example.com").enabled, false);
});

test("exceptions disable a site but keep their overrides", () => {
  let settings = api.setSite(api.normalize(), "example.com", { layout: false });
  settings = api.addException(settings, "www.example.com");
  const site = api.siteFor(settings, "example.com");
  assert.equal(site.enabled, false);
  assert.equal(site.excepted, true);
  assert.equal(site.layout, false);
  settings = api.removeException(settings, "example.com");
  assert.equal(api.siteFor(settings, "example.com").enabled, true);
});

test("normalize is idempotent and rejects invalid stored values", () => {
  const messy = {
    schemaVersion: "nope",
    enabled: "yes",
    features: { cleanup: "true", layout: null, network: 1 },
    sites: {
      "Example.COM": { cleanup: "false", layout: 0, network: "yes" },
      "bad key!": { cleanup: false },
      "sub.example.com": { enabled: false }
    },
    exceptions: ["WWW.Example.com", "example.com", "", 7]
  };
  const once = api.normalize(messy);
  assert.deepEqual(once, api.normalize(once));
  assert.equal(once.enabled, true);
  assert.deepEqual(once.features, { cleanup: true, layout: true, network: false });
  assert.equal(once.sites["example.com"], undefined);
  assert.equal(once.sites["bad key!"], undefined);
  assert.deepEqual(once.sites["sub.example.com"], { enabled: false });
  assert.deepEqual(once.exceptions, ["example.com"]);
});

test("domain keys are lowercased, www and a trailing dot are stripped", () => {
  assert.equal(api.domainKey("WWW.Example.COM"), "example.com");
  assert.equal(api.domainKey("example.com."), "example.com");
  assert.equal(api.domainKey(""), "");
  assert.equal(api.domainKey(undefined), "");
});

test("domain labels cannot start or end with a hyphen", () => {
  for (const domain of ["-example.com", "example-.com", "example.-com", "example.com-"]) {
    assert.equal(api.domainKey(domain), domain, domain);
    assert.equal(api.normalize({ exceptions: [domain] }).exceptions.length, 0, domain);
  }
});

test("enabling a site clears its exception without adding a redundant override", () => {
  let settings = api.addException(api.normalize(), "example.com");
  settings = api.setSite(settings, "example.com", { enabled: true });
  assert.equal(api.siteFor(settings, "example.com").enabled, true);
  assert.equal(api.siteFor(settings, "example.com").excepted, false);
  assert.deepEqual(settings.sites, {});
});

test("get and save round-trip through chrome.storage.sync", async () => {
  const store = {};
  const previous = globalThis.chrome;
  globalThis.chrome = {
    storage: {
      sync: {
        async get(key) {
          return { [key]: store[key] };
        },
        async set(values) {
          Object.assign(store, values);
        }
      }
    }
  };
  try {
    const saved = await api.save(api.setSite(api.DEFAULT_SETTINGS, "example.com", { cleanup: false }));
    assert.equal(store.webtimSettings.schemaVersion, 2);
    const loaded = await api.get();
    assert.deepEqual(loaded.sites["example.com"], { cleanup: false });
    await api.ensureDefaults();
    assert.ok(store.webtimSettings);
  } finally {
    globalThis.chrome = previous;
  }
});
