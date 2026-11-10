const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const api = require("../src/shared/profile.js");

const root = path.join(__dirname, "..");
const index = JSON.parse(fs.readFileSync(path.join(root, "profiles/index.json"), "utf8"));
const shipped = JSON.parse(fs.readFileSync(path.join(root, "profiles/coolmathgames.com.json"), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));

test("the shipped index and profile pass the strict schema", () => {
  assert.deepEqual(api.validateIndex(index), []);
  assert.deepEqual(api.validate(shipped), []);
});

test("unknown profile fields are rejected instead of ignored", () => {
  const profile = { ...clone(shipped), script: "alert(1)" };
  assert.ok(api.validate(profile).some((error) => error.includes("unknown profile field script")));
});

test("ids, versions and dates are validated", () => {
  const badId = { ...clone(shipped), id: "Cool Math!" };
  const badVersion = { ...clone(shipped), version: "1.0" };
  const badDate = { ...clone(shipped), updated: "2026-02-31" };
  assert.ok(api.validate(badId).some((error) => error.includes("id must be")));
  assert.ok(api.validate(badVersion).some((error) => error.includes("MAJOR.MINOR.PATCH")));
  assert.ok(api.validate(badDate).some((error) => error.includes("updated must be")));
});

test("duplicate domains in one profile are rejected", () => {
  const profile = { ...clone(shipped), domains: ["example.com", "www.example.com"] };
  assert.ok(api.validate(profile).some((error) => error.includes("duplicate domain")));
});

test("selectors cannot inject CSS or target the whole page", () => {
  const injection = { ...clone(shipped), selectors: { hide: ["div { display: none }"] } };
  assert.ok(api.validate(injection).some((error) => error.includes("cannot appear in a selector")));
  for (const selector of ["*", "body", "html", ":root", ":is(html)", ":where(body)"]) {
    const whole = { ...clone(shipped), selectors: { hide: [selector] } };
    assert.ok(api.validate(whole).some((error) => error.includes("whole document")), selector);
  }
  const fine = { ...clone(shipped), selectors: { hide: ["a.ad-slot", "#adBanner .inner"] } };
  assert.deepEqual(api.validate(fine), []);
});

test("styles reject resources, directives and unbalanced braces", () => {
  for (const css of [
    ".x { background: url(https://cdn.example.com/a.png); }",
    ".x { background: url(//cdn.example.com/a.png); }",
    ".x { background: url(/same-origin-tracker.gif); }"
  ]) {
    const external = { ...clone(shipped), styles: { cleanup: [], layout: [css] } };
    assert.ok(api.validate(external).some((error) => error.includes("must not load resources")), css);
  }
  const unbalanced = { ...clone(shipped), styles: { cleanup: [".x {"], layout: [] } };
  assert.ok(api.validate(unbalanced).some((error) => error.includes("unbalanced braces")));
  const notArray = { ...clone(shipped), styles: { cleanup: "body { color: red }", layout: [] } };
  assert.ok(api.validate(notArray).some((error) => error.includes("styles.cleanup must be a string array")));
});

test("network rules validate their shape and resource types", () => {
  const base = { ...clone(shipped), features: { ...clone(shipped).features, network: true } };
  const valid = { ...base, networkRules: [{ urlFilter: "||ads.example.com^", resourceTypes: ["script", "image"] }] };
  assert.deepEqual(api.validate(valid), []);
  const bogusType = { ...base, networkRules: [{ urlFilter: "||ads.example.com^", resourceTypes: ["bogus"] }] };
  assert.ok(api.validate(bogusType).some((error) => error.includes("unknown type bogus")));
  const allowAction = { ...base, networkRules: [{ urlFilter: "||ads.example.com^", action: "allow" }] };
  assert.ok(api.validate(allowAction).some((error) => error.includes('must be "block"')));
  const missingFilter = { ...base, networkRules: [{ resourceTypes: ["script"] }] };
  assert.ok(api.validate(missingFilter).some((error) => error.includes("urlFilter is required")));
});

test("rules without the network feature flag are rejected", () => {
  const profile = { ...clone(shipped), networkRules: [{ urlFilter: "||ads.example.com^" }] };
  assert.ok(api.validate(profile).some((error) => error.includes("features.network is false")));
});

test("index validation rejects traversal, duplicates and bad schemas", () => {
  const traversal = { schemaVersion: 1, profiles: [{ domain: "example.com", file: "../secret.json" }] };
  assert.ok(api.validateIndex(traversal).some((error) => error.includes("plain file name")));
  const duplicated = {
    schemaVersion: 1,
    profiles: [
      { domain: "example.com", file: "a.json" },
      { domain: "www.example.com", file: "b.json" }
    ]
  };
  assert.ok(api.validateIndex(duplicated).some((error) => error.includes("domain is listed twice")));
  const sameFile = {
    schemaVersion: 1,
    profiles: [
      { domain: "a.com", file: "same.json" },
      { domain: "b.com", file: "same.json" }
    ]
  };
  assert.ok(api.validateIndex(sameFile).some((error) => error.includes("file is listed twice")));
  assert.ok(api.validateIndex({ schemaVersion: 2, profiles: [] }).length > 0);
});

test("safeProfilePath only resolves plain file names under profiles/", () => {
  assert.equal(api.safeProfilePath("coolmathgames.com.json"), "profiles/coolmathgames.com.json");
  for (const bad of ["../secret.json", "sub/a.json", "/etc/passwd", "a.txt", "A.json", "", null]) {
    assert.equal(api.safeProfilePath(bad), null, String(bad));
  }
});

test("domain matching does not accept a suffix without a dot boundary", () => {
  assert.equal(api.matches("sub.coolmathgames.com", ["coolmathgames.com"]), true);
  assert.equal(api.matches("notcoolmathgames.com", ["coolmathgames.com"]), false);
  assert.equal(api.matches("example.com.", ["example.com"]), true);
  assert.equal(api.validDomain("bad_domain.com"), false);
  for (const domain of ["example-.com", "example.-com", "example.com-"]) {
    assert.equal(api.validDomain(domain), false, domain);
  }
  assert.equal(api.validDomain("example.com."), true);
});

test("compatibilityInfo reports age and staleness", () => {
  const fresh = api.compatibilityInfo({ compatibility: { testedAt: "2026-10-01", testedViewports: ["1440x900"] } },
    new Date("2026-10-15T00:00:00Z"));
  assert.equal(fresh.stale, false);
  assert.equal(fresh.ageDays, 14);
  assert.deepEqual(fresh.testedViewports, ["1440x900"]);

  const stale = api.compatibilityInfo({ compatibility: { testedAt: "2025-01-01" } },
    new Date("2026-10-15T00:00:00Z"));
  assert.equal(stale.stale, true);
  assert.match(stale.reason, /last verified \d+ days ago/);

  const missing = api.compatibilityInfo({});
  assert.equal(missing.stale, true);
  assert.match(missing.reason, /no compatibility date/);
});
