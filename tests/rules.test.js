const assert = require("node:assert/strict");
const test = require("node:test");

const settingsApi = require("../src/shared/settings.js");
const rules = require("../src/shared/rules.js");

function profile(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "example",
    name: "Example",
    version: "1.0.0",
    updated: "2026-10-30",
    domains: ["example.com"],
    features: { cleanup: true, layout: true, network: true },
    selectors: { hide: [".ad"] },
    styles: { cleanup: [], layout: [] },
    networkRules: [],
    compatibility: { testedAt: "2026-10-30", testedViewports: ["1440x900"] },
    ...overrides
  };
}

function settingsWithNetwork(enabled = true) {
  return settingsApi.normalize({
    features: { cleanup: true, layout: true, network: enabled }
  });
}

test("network filtering is off by default", () => {
  const ruleset = rules.buildRules(settingsApi.normalize(), [profile({ networkRules: [{ urlFilter: "||ads.example.com^" }] })]);
  assert.deepEqual(ruleset.rules, []);
});

test("rules are only built for profiles with verified rules and an enabled site", () => {
  const target = profile({ networkRules: [{ urlFilter: "||ads.example.com^" }] });
  const off = profile({ id: "other", domains: ["other.com"], features: { cleanup: true, layout: true, network: false }, networkRules: [] });
  const built = rules.buildRules(settingsWithNetwork(), [target, off]);
  assert.equal(built.rules.length, 1);
  assert.equal(built.rules[0].action.type, "block");
  assert.deepEqual(built.rules[0].condition.resourceTypes.sort(), ["image", "script", "sub_frame", "xmlhttprequest"]);
  assert.deepEqual(built.rules[0].condition.initiatorDomains, ["example.com"]);
});

test("a paused site or an exception removes its rules", () => {
  const target = profile({ networkRules: [{ urlFilter: "||ads.example.com^" }] });
  let settings = settingsWithNetwork();
  settings = settingsApi.setSite(settings, "example.com", { enabled: false });
  assert.equal(rules.buildRules(settings, [target]).rules.length, 0);
  settings = settingsApi.addException(settingsWithNetwork(), "example.com");
  assert.equal(rules.buildRules(settings, [target]).rules.length, 0);
});

test("the global switch removes every rule", () => {
  const target = profile({ networkRules: [{ urlFilter: "||ads.example.com^" }] });
  const settings = { ...settingsWithNetwork(), enabled: false };
  assert.equal(rules.buildRules(settings, [target]).rules.length, 0);
});

test("a per-site network override turns rules off even when the global default is on", () => {
  const target = profile({ networkRules: [{ urlFilter: "||ads.example.com^" }] });
  const settings = settingsApi.setSite(settingsWithNetwork(), "example.com", { network: false });
  assert.equal(rules.buildRules(settings, [target]).rules.length, 0);
});

test("rule ids stay unique when profiles carry more than 100 rules", () => {
  const many = Array.from({ length: 130 }, (_, index) => ({ urlFilter: `||ads${index}.example.com^` }));
  const first = profile({ networkRules: many });
  const second = profile({
    id: "second",
    domains: ["second.example"],
    networkRules: [{ urlFilter: "||tracker.second.example^" }, { urlFilter: "||pixel.second.example^" }]
  });
  const built = rules.buildRules(settingsWithNetwork(), [first, second]);
  assert.equal(built.rules.length, 132);
  const ids = built.rules.map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length, "ids must not collide");
  for (const rule of built.rules) {
    assert.ok(Number.isInteger(rule.id) && rule.id > 0);
  }
});

test("the same input always produces byte-identical rules", () => {
  const target = profile({ networkRules: [{ urlFilter: "||ads.example.com^" }, { urlFilter: "||track.example.com^" }] });
  const first = rules.buildRules(settingsWithNetwork(), [target]);
  const second = rules.buildRules(settingsWithNetwork(), [target]);
  assert.deepEqual(first, second);
  const reordered = rules.buildRules(settingsWithNetwork(), [profile({ ...target, networkRules: [...target.networkRules].reverse() })]);
  assert.deepEqual(reordered, first);
});

test("identical rules from two profiles are emitted once", () => {
  const rule = { urlFilter: "||shared.example^", resourceTypes: ["script"] };
  const left = profile({ domains: ["shared.example"], networkRules: [rule] });
  const right = profile({ id: "right", domains: ["shared.example"], networkRules: [rule] });
  const built = rules.buildRules(settingsWithNetwork(), [left, right]);
  assert.equal(built.rules.length, 1);
});

test("multi-domain profiles scope rules to each enabled site", () => {
  const target = profile({
    domains: ["one.example", "two.example"],
    networkRules: [{ urlFilter: "||ads.example^", resourceTypes: ["script"] }]
  });
  let settings = settingsWithNetwork();
  settings = settingsApi.setSite(settings, "two.example", { network: false });
  let built = rules.buildRules(settings, [target]);
  assert.equal(built.rules.length, 1);
  assert.deepEqual(built.rules[0].condition.initiatorDomains, ["one.example"]);

  built = rules.buildRules(settingsWithNetwork(), [target]);
  assert.equal(built.rules.length, 2);
  assert.deepEqual(
    built.rules.map((rule) => rule.condition.initiatorDomains[0]).sort(),
    ["one.example", "two.example"]
  );
});

test("unknown resource types are never silently widened", () => {
  const target = profile({ networkRules: [{ urlFilter: "||ads.example.com^", resourceTypes: ["bogus"] }] });
  const built = rules.buildRules(settingsWithNetwork(), [target]);
  assert.equal(built.rules.length, 0);
  assert.equal(built.skipped[0].reason, "no known resource types");
});

test("rules that are not block actions are skipped and reported", () => {
  const target = profile({ networkRules: [{ urlFilter: "||ads.example.com^", action: "allow" }] });
  const built = rules.buildRules(settingsWithNetwork(), [target]);
  assert.equal(built.rules.length, 0);
  assert.match(built.skipped[0].reason, /only block rules/);
});

test("the chrome rule limit truncates deterministically and reports it", () => {
  const many = Array.from({ length: 12 }, (_, index) => ({ urlFilter: `||ads${index}.example.com^` }));
  const target = profile({ networkRules: many });
  const built = rules.buildRules(settingsWithNetwork(), [target], { maxRules: 5 });
  assert.equal(built.rules.length, 5);
  assert.equal(built.truncated, 7);
  assert.ok(built.skipped.some((item) => /limit/.test(item.reason)));
});
