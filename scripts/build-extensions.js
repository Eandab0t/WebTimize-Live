'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SOURCE = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const FIREFOX_ID = 'webtimize-live@webtimize.dev';
const FIREFOX_BACKGROUND = [
  'src/shared/browser-api.js',
  'src/shared/settings.js',
  'src/shared/profile.js',
  'src/shared/rules.js',
  'src/background/service-worker.js'
];

function manifestFor(browser) {
  const manifest = structuredClone(SOURCE);
  if (browser === 'firefox') {
    manifest.background = { scripts: FIREFOX_BACKGROUND };
    manifest.browser_specific_settings = {
      gecko: {
        id: FIREFOX_ID,
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] }
      }
    };
  } else {
    delete manifest.browser_specific_settings;
    if (!manifest.background?.service_worker) throw new Error('Chrome manifest has no background service worker');
  }
  return manifest;
}

function referencedFiles(manifest) {
  return [
    manifest.background?.service_worker,
    ...(manifest.background?.scripts || []),
    manifest.options_ui?.page,
    manifest.action?.default_popup,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    ...(manifest.content_scripts || []).flatMap((entry) => entry.js)
  ].filter(Boolean);
}

function validate(manifest, browser, directory) {
  const packageVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const errors = [];
  if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
  if (manifest.version !== packageVersion) errors.push('manifest and package versions differ');
  if (JSON.stringify(manifest).includes('<all_urls>')) errors.push('broad host access is not allowed');
  if (!manifest.permissions?.includes('storage')) errors.push('storage permission is missing');
  if (!manifest.permissions?.includes('activeTab')) errors.push('activeTab permission is missing');
  if (browser === 'chrome' && manifest.background?.scripts) errors.push('Chrome build must not use background.scripts');
  if (browser === 'firefox') {
    if (manifest.background?.service_worker) errors.push('Firefox build must not use background.service_worker');
    if (!manifest.background?.scripts?.length) errors.push('Firefox build needs background.scripts');
    if (manifest.browser_specific_settings?.gecko?.id !== FIREFOX_ID) errors.push('Firefox extension id is missing');
    if (manifest.browser_specific_settings?.gecko?.strict_min_version !== '140.0') errors.push('Firefox minimum version must be 140.0');
    const data = manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required;
    if (!Array.isArray(data) || data.length !== 1 || data[0] !== 'none') {
      errors.push('Firefox data_collection_permissions must be ["none"]');
    }
  } else if (manifest.browser_specific_settings) {
    errors.push('Chrome build must not contain browser_specific_settings');
  }
  for (const file of referencedFiles(manifest)) {
    if (!fs.existsSync(path.join(directory, file))) errors.push(`referenced file is missing: ${file}`);
  }
  if (errors.length) throw new Error(`${browser} build is invalid:\n- ${errors.join('\n- ')}`);
}

function build(browser) {
  if (!['chrome', 'firefox'].includes(browser)) throw new Error(`unknown browser: ${browser}`);
  const directory = path.join(DIST, browser);
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  for (const entry of ['icons', 'profiles', 'src']) {
    fs.cpSync(path.join(ROOT, entry), path.join(directory, entry), { recursive: true });
  }
  const manifest = manifestFor(browser);
  fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  validate(manifest, browser, directory);
  return directory;
}

function main() {
  const requested = process.argv[2];
  const browsers = requested ? [requested] : ['chrome', 'firefox'];
  for (const browser of browsers) {
    const directory = build(browser);
    const fileCount = fs.readdirSync(directory, { recursive: true }).filter((file) => fs.statSync(path.join(directory, file)).isFile()).length;
    console.log(`${browser}: ${path.relative(ROOT, directory)} (${fileCount} files)`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { FIREFOX_ID, manifestFor, build, validate, referencedFiles };
