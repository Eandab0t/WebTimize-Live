const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { validate, matches } = require("../src/shared/profile.js");

const root = path.join(__dirname, "..");
const index = JSON.parse(fs.readFileSync(path.join(root, "profiles/index.json"), "utf8"));
const profiles = index.profiles.map((entry) => ({
  file: entry.file,
  data: JSON.parse(fs.readFileSync(path.join(root, "profiles", entry.file), "utf8"))
}));

test("every indexed profile is valid", () => {
  assert.ok(profiles.length > 0);
  for (const profile of profiles) assert.deepEqual(validate(profile.data), [], profile.file);
});

test("Coolmath profile targets verified ad containers only", () => {
  const coolmath = profiles.find((entry) => entry.data.id === "coolmathgames");
  assert.ok(coolmath);
  assert.ok(coolmath.data.selectors.hide.includes("[id^=\"leaderboard-\"]"));
  assert.ok(coolmath.data.selectors.hide.includes("[id^=\"med-rect-\"]"));
  assert.ok(coolmath.data.selectors.hide.includes("[id^=\"sky-\"]"));
  assert.ok(!coolmath.data.selectors.hide.some((selector) => selector.includes("iframe")));
});

test("domain matching includes subdomains and strips www ambiguity", () => {
  assert.equal(matches("www.coolmathgames.com", ["coolmathgames.com"]), true);
  assert.equal(matches("coolmathgames.com", ["www.coolmathgames.com"]), true);
  assert.equal(matches("example.com", ["coolmathgames.com"]), false);
});

test("invalid profiles are rejected", () => {
  assert.ok(validate(null).length > 0);
  assert.ok(validate({ schemaVersion: 2 }).length > 0);
  assert.ok(validate({
    schemaVersion: 1,
    id: "x",
    name: "X",
    version: "1",
    domains: ["example.com"],
    features: { cleanup: true, layout: true, network: false },
    selectors: { hide: ["div"] },
    styles: { layout: ["@import url('https://example.com/x.css')"] },
    networkRules: []
  }).some((error) => error.includes("forbidden")));
});
