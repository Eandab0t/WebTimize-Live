const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { lintProfiles, formatReport } = require("../tools/profile-lint.js");

function fixture(profileOverrides = {}, indexOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "webtim-lint-"));
  fs.mkdirSync(path.join(root, "profiles"));
  const profile = {
    schemaVersion: 1,
    id: "fixture",
    name: "Fixture",
    version: "1.0.0",
    updated: "2026-10-01",
    domains: ["fixture.example"],
    features: { cleanup: true, layout: true, network: false },
    selectors: { hide: [".ad-slot"] },
    styles: { cleanup: [], layout: [".content { max-width: none; }"] },
    networkRules: [],
    compatibility: { testedAt: "2026-10-01", testedViewports: ["1440x900"] },
    ...profileOverrides
  };
  const index = {
    schemaVersion: 1,
    profiles: [{ domain: "fixture.example", file: "fixture.example.json" }],
    ...indexOverrides
  };
  fs.writeFileSync(path.join(root, "profiles/index.json"), JSON.stringify(index));
  fs.writeFileSync(path.join(root, "profiles/fixture.example.json"), JSON.stringify(profile));
  return root;
}

test("the shipped profiles lint clean", () => {
  const result = lintProfiles(path.join(__dirname, ".."));
  assert.deepEqual(result.errors, []);
  assert.ok(result.profiles.length >= 1);
  assert.equal(result.profiles[0].stale, false);
});

test("layout rules that hide content are errors, not warnings", () => {
  const root = fixture({ styles: { cleanup: [], layout: [".x { display: none !important; }"] } });
  try {
    const result = lintProfiles(root, new Date("2026-11-05T00:00:00Z"));
    assert.ok(result.errors.some((error) => error.includes("layout styles must not hide content")));
    assert.match(formatReport(result), /^error: /m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stale compatibility dates and risky selectors are warned about", () => {
  const root = fixture({
    selectors: { hide: ["nav a", ".ad-slot", ".ad-slot"] },
    compatibility: { testedAt: "2025-01-01", testedViewports: [] }
  });
  try {
    const result = lintProfiles(root, new Date("2026-11-05T00:00:00Z"));
    assert.ok(result.warnings.some((warning) => warning.includes("re-verify")));
    assert.ok(result.warnings.some((warning) => warning.includes("no testedViewports")));
    assert.ok(result.warnings.some((warning) => warning.includes("may touch navigation")));
    assert.ok(result.warnings.some((warning) => warning.includes("duplicate selector")));
    assert.equal(result.profiles[0].stale, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an index that points outside profiles/ is a hard error", () => {
  const root = fixture({}, { profiles: [{ domain: "fixture.example", file: "../escape.json" }] });
  try {
    const result = lintProfiles(root);
    assert.ok(result.errors.some((error) => error.includes("plain file name")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a missing profile file is reported instead of crashing", () => {
  const root = fixture();
  try {
    fs.unlinkSync(path.join(root, "profiles/fixture.example.json"));
    const result = lintProfiles(root);
    assert.ok(result.errors.some((error) => error.includes("cannot read")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
