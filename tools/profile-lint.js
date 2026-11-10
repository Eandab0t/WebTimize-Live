#!/usr/bin/env node
/**
 * Profile lint: validates the profile index and every profile, checks compatibility dates, and
 * flags selectors that could affect interactive or page-critical UI.
 *
 * Usage: node tools/profile-lint.js [--strict] [--json]
 * Exit code 1 when there are errors (or warnings with --strict), 0 otherwise.
 */
const fs = require("node:fs");
const path = require("node:path");

const profileApi = require("../src/shared/profile.js");

const ROOT = path.join(__dirname, "..");
const RISKY_SELECTOR = /(^|[\s>+~])(a|button|input|select|textarea|form|iframe|canvas|nav|header|footer)(?![\w-])|login|account|checkout|payment|cart|game/i;

function lintProfiles(root = ROOT, now = new Date()) {
  const errors = [];
  const warnings = [];
  const profiles = [];
  const indexPath = path.join(root, "profiles/index.json");
  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  } catch (error) {
    return { errors: [`cannot read profiles/index.json: ${error.message}`], warnings, profiles };
  }
  const indexErrors = profileApi.validateIndex(index);
  errors.push(...indexErrors.map((error) => `index: ${error}`));
  if (indexErrors.length) return { errors, warnings, profiles };

  const seenSelectors = new Set();
  for (const entry of index.profiles) {
    const relative = profileApi.safeProfilePath(entry.file);
    if (!relative) continue;
    const file = path.join(root, relative);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      errors.push(`${entry.file}: cannot read (${error.message})`);
      continue;
    }
    const problems = profileApi.validate(data);
    errors.push(...problems.map((problem) => `${entry.file}: ${problem}`));
    if (problems.length) continue;
    if (!profileApi.matches(entry.domain, data.domains)) {
      errors.push(`${entry.file}: does not declare indexed domain ${entry.domain}`);
    }

    const compatibility = profileApi.compatibilityInfo(data, now);
    if (compatibility.stale) warnings.push(`${entry.file}: ${compatibility.reason}; re-verify the selectors`);
    if (!compatibility.testedViewports.length) {
      warnings.push(`${entry.file}: no testedViewports recorded`);
    }

    const selectors = data.selectors?.hide || [];
    for (const selector of selectors) {
      const key = `${data.id}:${selector}`;
      if (seenSelectors.has(key)) warnings.push(`${entry.file}: duplicate selector ${selector}`);
      seenSelectors.add(key);
      if (RISKY_SELECTOR.test(selector)) {
        warnings.push(`${entry.file}: ${selector} may touch navigation, controls or game UI; confirm by hand`);
      }
    }

    for (const css of data.styles?.layout || []) {
      if (/display\s*:\s*none/i.test(css)) errors.push(`${entry.file}: layout styles must not hide content`);
      if (/position\s*:\s*fixed/i.test(css) && /inset\s*:\s*0/i.test(css)) {
        warnings.push(`${entry.file}: a fixed full-page overlay can block controls`);
      }
    }

    profiles.push({
      file: entry.file,
      id: data.id,
      name: data.name,
      version: data.version,
      domains: data.domains,
      selectors: selectors.length,
      styleRules: (data.styles?.cleanup?.length || 0) + (data.styles?.layout?.length || 0),
      networkRules: (data.networkRules || []).length,
      testedAt: compatibility.testedAt,
      ageDays: compatibility.ageDays,
      stale: compatibility.stale
    });
  }
  return { errors, warnings, profiles };
}

function formatReport(result) {
  const lines = [];
  for (const item of result.profiles) {
    const state = item.stale ? "STALE" : "ok";
    lines.push(`${item.file}  ${item.name} ${item.version}  [${state}]  ${item.selectors} selectors, ${item.styleRules} style rules, ${item.networkRules} network rules, tested ${item.testedAt || "never"}`);
  }
  for (const warning of result.warnings) lines.push(`warning: ${warning}`);
  for (const error of result.errors) lines.push(`error: ${error}`);
  lines.push(`${result.profiles.length} profile(s), ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  return lines.join("\n");
}

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  const result = lintProfiles();
  if (args.has("--json")) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(result)}\n`);
  }
  const failed = result.errors.length > 0 || (args.has("--strict") && result.warnings.length > 0);
  process.exitCode = failed ? 1 : 0;
}

module.exports = { lintProfiles, formatReport, RISKY_SELECTOR };
