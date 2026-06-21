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

if (next === current) {
  console.log(`Already at version ${current}. Nothing to do.`);
  process.exit(0);
}

console.log(`\n🚀 Releasing v${current} → v${next}\n`);

// 2. update package.json
console.log("[1/3] Updating package.json …");
pkg.version = next;
writeJSON("package.json", pkg);

// 3. update Cargo.toml
console.log("[2/3] Updating src-tauri/Cargo.toml …");
let cargo = readFileSync(resolve(ROOT, "src-tauri/Cargo.toml"), "utf-8");
cargo = cargo.replace(/^version\s*=\s*".*"$/m, `version = "${next}"`);
writeFileSync(resolve(ROOT, "src-tauri/Cargo.toml"), cargo);

// 4. update tauri.conf.json
console.log("[3/3] Updating src-tauri/tauri.conf.json …");
const tauriConf = readJSON("src-tauri/tauri.conf.json");
tauriConf.version = next;
writeJSON("src-tauri/tauri.conf.json", tauriConf);

// 5. git operations
console.log("\n📦 Committing …");
const tag = `v${next}`;
const files = [
  "package.json",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
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
