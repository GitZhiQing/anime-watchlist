import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── helpers ──────────────────────────────────────────────────────────

function readJSON(p) {
  return JSON.parse(readFileSync(resolve(ROOT, p), "utf-8"));
}

function writeJSON(p, obj) {
  writeFileSync(resolve(ROOT, p), JSON.stringify(obj, null, 2) + "\n");
}

function parseVersion(v) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function incVersion(current, bump) {
  const v = parseVersion(current);
  switch (bump) {
    case "major":
      return formatVersion({ major: v.major + 1, minor: 0, patch: 0 });
    case "minor":
      return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
    case "patch":
      return formatVersion({ major: v.major, minor: v.minor, patch: v.patch + 1 });
    default:
      // explicit version string
      parseVersion(bump); // validate
      return bump;
  }
}

function run(cmd, opts = {}) {
  console.log(`  > ${cmd}`);
  return execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });
}

// ── main ─────────────────────────────────────────────────────────────

const bump = process.argv[2];
if (!bump) {
  console.error("Usage: node scripts/release.mjs <major|minor|patch|X.Y.Z>");
  process.exit(1);
}

// 1. read current version from package.json (single source of truth)
const pkg = readJSON("package.json");
const current = pkg.version;
const next = incVersion(current, bump);
const tag = `v${next}`;

// same version → just tag & push (first release / re-tag)
if (next === current) {
  console.log(`\n🏷  Tagging current version ${tag} (no bump needed) …`);
  run(`git tag ${tag}`);
  console.log(`\n⬆️  Pushing tag …`);
  run("git push --tags");
  console.log(`\n✅ Tagged ${tag}`);
  console.log(`   GitHub Actions will build and publish the release shortly.\n`);
  process.exit(0);
}

console.log(`\n🚀 Releasing v${current} → v${next}\n`);

// 2. update package.json
console.log("[1/5] Updating package.json …");
pkg.version = next;
writeJSON("package.json", pkg);

// 3. update Cargo.toml
console.log("[2/5] Updating src-tauri/Cargo.toml …");
let cargo = readFileSync(resolve(ROOT, "src-tauri/Cargo.toml"), "utf-8");
cargo = cargo.replace(/^version\s*=\s*".*"$/m, `version = "${next}"`);
writeFileSync(resolve(ROOT, "src-tauri/Cargo.toml"), cargo);

// 4. update tauri.conf.json
console.log("[3/5] Updating src-tauri/tauri.conf.json …");
const tauriConf = readJSON("src-tauri/tauri.conf.json");
tauriConf.version = next;
writeJSON("src-tauri/tauri.conf.json", tauriConf);

// 5. update Cargo.lock (anime-watchlist package version)
//    块锚定正则：只替换 name="anime-watchlist" 紧后的 version，避免误改其它包。
console.log("[4/5] Updating src-tauri/Cargo.lock …");
const lockPath = resolve(ROOT, "src-tauri/Cargo.lock");
let lock = readFileSync(lockPath, "utf-8");
const lockRe = /(\[\[package\]\]\nname = "anime-watchlist"\nversion = ")[^"]*(")/;
if (!lockRe.test(lock)) {
  throw new Error(`Could not find anime-watchlist package version in ${lockPath}`);
}
lock = lock.replace(lockRe, `$1${next}$2`);
writeFileSync(lockPath, lock);

// 6. update USER_AGENT in bgm.ts (e.g. "…/anime-watchlist/0.1.0 …")
console.log("[5/5] Updating src/lib/bgm.ts USER_AGENT …");
const bgmPath = resolve(ROOT, "src/lib/bgm.ts");
let bgm = readFileSync(bgmPath, "utf-8");
const uaRe = /(anime-watchlist\/)(\d+\.\d+\.\d+)/;
if (!uaRe.test(bgm)) {
  throw new Error(`Could not find USER_AGENT version pattern in ${bgmPath}`);
}
bgm = bgm.replace(uaRe, `$1${next}`);
writeFileSync(bgmPath, bgm);

// 7. git operations
console.log("\n📦 Committing …");
const files = [
  "package.json",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.lock",
  "src/lib/bgm.ts",
];
run(`git add ${files.join(" ")}`);
run(`git commit -m "chore: bump version to ${tag}"`);

console.log(`\n🏷  Tagging ${tag} …`);
run(`git tag ${tag}`);

console.log(`\n⬆️  Pushing …`);
run("git push");
run("git push --tags");

console.log(`\n✅ Released ${tag}`);
console.log(`   GitHub Actions will build and publish the release shortly.\n`);
