#!/usr/bin/env node
/* Checks a built APK the way a phone does before the first frame is drawn.

   Google Play rejected Bubble Pop on 1 Nov 2026 for crashing at launch, and
   Chronicles of Elderon the same day for "App installs, but doesn't load":
   Elderon's manifest named an Application class
   (com.taugustincst.elderon.Application) that its dex did not hold, so the
   process died with a ClassNotFoundException before any activity was created.
   Both builds were wrappers generated outside their repositories. This is the
   check Elderon's repository runs on every build, so a wrapper built here
   cannot reach Play in that state:

     - every class the manifest names (application, activities, services,
       receivers, providers) is defined in the APK's dex files;
     - the launcher activity is one of them;
     - the package name is the one asked for, when --package names one
       (the Play listing is registered under com.taugustincst.bubblepop);
     - a Trusted Web Activity names the site it opens.

   Usage: node tools/check-apk.js <apk> [--package com.taugustincst.bubblepop]
   Needs the Android build-tools (aapt2 and dexdump) under $ANDROID_HOME or
   $ANDROID_SDK_ROOT, and unzip on the path. Exit code 1 on any failure. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const NAMED = new Set(['application', 'activity', 'service', 'receiver', 'provider', 'instrumentation']);

function fail(msg) { console.error(`check-apk: ${msg}`); process.exit(1); }

function buildTools() {
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean);
  for (const root of roots) {
    const dir = path.join(root, 'build-tools');
    if (!fs.existsSync(dir)) continue;
    const versions = fs.readdirSync(dir)
      .filter(v => fs.existsSync(path.join(dir, v, 'aapt2')))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (versions.length) return path.join(dir, versions[versions.length - 1]);
  }
  return fail('no Android build-tools found: set ANDROID_HOME to an SDK with build-tools installed');
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
}

/** Fully qualifies a class name the way the manifest merger does. */
function qualify(name, pkg) {
  if (name.startsWith('.')) return pkg + name;
  if (!name.includes('.')) return `${pkg}.${name}`;
  return name;
}

/** The classes the compiled manifest names, by element. */
function manifestClasses(aapt2, apk, pkg) {
  const tree = run(aapt2, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk]);
  const out = [];
  let element = null;
  for (const line of tree.split('\n')) {
    const e = line.match(/^\s*E: ([\w-]+) /);
    if (e) { element = e[1]; continue; }
    const a = line.match(/^\s*A: (?:http:\/\/schemas\.android\.com\/apk\/res\/)?android:(name|targetActivity)(?:\(0x[0-9a-f]+\))?="([^"]*)"/);
    if (!a) continue;
    const [, attr, value] = a;
    if (attr === 'targetActivity' && element === 'activity-alias') out.push({ element, name: qualify(value, pkg) });
    else if (attr === 'name' && NAMED.has(element)) out.push({ element, name: qualify(value, pkg) });
  }
  return out;
}

/** A string resource's value, looked up by id (0x7f...), or the id itself. */
function resourceString(aapt2, apk, id) {
  const lines = run(aapt2, ['dump', 'resources', apk]).split('\n');
  const at = lines.findIndex(l => l.includes(`resource ${id.replace(/^@/, "")} `));
  const v = at >= 0 && lines[at + 1] ? lines[at + 1].match(/"([^"]*)"/) : null;
  return v ? v[1] : `the site in its resources (${id})`;
}

/** Every class defined in the APK's dex files, as dotted names. */
function definedClasses(dexdump, apk, tmp) {
  run('unzip', ['-o', '-q', '-d', tmp, apk, 'classes*.dex']);
  const defined = new Set();
  for (const f of fs.readdirSync(tmp).filter(f => /^classes\d*\.dex$/.test(f))) {
    const dump = run(dexdump, ['-l', 'plain', path.join(tmp, f)]);
    for (const m of dump.matchAll(/Class descriptor\s*:\s*'L([^;']+);'/g)) defined.add(m[1].replace(/\//g, '.'));
  }
  return defined;
}

function main() {
  const args = process.argv.slice(2);
  const apk = args.find(a => !a.startsWith('--'));
  const pkgArg = args.indexOf('--package');
  const wantPkg = pkgArg >= 0 ? args[pkgArg + 1] : null;
  if (!apk || !fs.existsSync(apk)) fail('usage: node tools/check-apk.js <apk> [--package name]');

  const bt = buildTools();
  const aapt2 = path.join(bt, 'aapt2');
  const dexdump = path.join(bt, 'dexdump');
  if (!fs.existsSync(dexdump)) fail(`no dexdump in ${bt}`);

  const badging = run(aapt2, ['dump', 'badging', apk]);
  const pkg = (badging.match(/^package: name='([^']+)'/m) || [])[1];
  const versionCode = (badging.match(/versionCode='([^']+)'/) || [])[1];
  const versionName = (badging.match(/versionName='([^']+)'/) || [])[1];
  const launcher = (badging.match(/^launchable-activity: name='([^']+)'/m) || [])[1];
  if (!pkg) fail('aapt2 found no package name in the manifest');
  console.log(`${path.basename(apk)}: ${pkg} ${versionName || '?'} (${versionCode || '?'})`);

  const problems = [];
  if (wantPkg && pkg !== wantPkg) problems.push(`package is ${pkg}, not ${wantPkg}`);
  if (!launcher) problems.push('no launchable activity');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-apk-'));
  try {
    const defined = definedClasses(dexdump, apk, tmp);
    const named = manifestClasses(aapt2, apk, pkg);
    if (launcher) named.push({ element: 'launcher', name: launcher });
    for (const { element, name } of named) {
      const ok = defined.has(name);
      console.log(`  ${ok ? 'ok     ' : 'MISSING'} ${element}: ${name}`);
      if (!ok) problems.push(`${element} ${name} is not defined in any dex`);
    }
    if (!named.some(n => n.element === 'activity')) problems.push('the manifest names no activity');

    // The game's files, when the app carries them. Everything index.html
    // links to must be in the assets, or the page loads with holes in it. A
    // Trusted Web Activity carries no page: it opens the site.
    const entries = new Set(run('unzip', ['-Z1', apk]).split('\n').filter(Boolean));
    // A bundled game can sit at assets/index.html or, when the app serves a
    // folder through WebViewAssetLoader (Bubble Pop), assets/www/index.html.
    const assetRoot = entries.has('assets/index.html') ? 'assets/'
      : entries.has('assets/www/index.html') ? 'assets/www/' : null;
    if (assetRoot) {
      const wanted = [assetRoot + 'index.html'];
      const html = run('unzip', ['-p', apk, assetRoot + 'index.html']);
      for (const m of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"#?]+)"/g)) {
        const ref = m[1];
        if (/^(?:https?:|data:|\/\/)/.test(ref) || ref === 'sw.js') continue; // sw.js is left out on purpose
        wanted.push(assetRoot + ref.replace(/^\.\//, ''));
      }
      let present = 0;
      for (const w of wanted) {
        if (entries.has(w)) present++;
        else problems.push(`${w} is not in the APK`);
      }
      console.log(`  assets: ${present}/${wanted.length} files index.html needs are in the APK`);
    } else {
      // The start URL sits in the meta-data element after its name, as a
      // literal or as a reference into the resources.
      const lines = run(aapt2, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk]).split('\n');
      let site = null;
      const at = lines.findIndex(l => /android:name\(0x[0-9a-f]+\)="android\.support\.customtabs\.trusted\.DEFAULT_URL"/.test(l));
      for (let i = at + 1; at >= 0 && i < lines.length && !/^\s*E: /.test(lines[i]); i++) {
        const v = lines[i].match(/android:value\(0x[0-9a-f]+\)=(?:"([^"]+)"|(@0x[0-9a-f]+))/);
        if (v) { site = v[1] || resourceString(aapt2, apk, v[2]); break; }
      }
      console.log(`  no game in the assets: a Trusted Web Activity${site ? ' opening ' + site : ''}`);
      if (!site) problems.push('neither a game in the assets nor a DEFAULT_URL to open');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (problems.length) {
    for (const p of problems) console.error(`  FAIL ${p}`);
    fail(`${problems.length} problem(s) in ${apk}`);
  }
  console.log(`  ${apk} would load: every class the manifest names is in the dex`);
}

main();
