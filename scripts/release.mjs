import { readFileSync, writeFileSync, existsSync } from "fs";
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

/** 同步 5 处版本号（package.json 为权威源） */
function updateVersionFiles(next) {
  console.log("[1/5] Updating package.json …");
  const pkg = readJSON("package.json");
  pkg.version = next;
  writeJSON("package.json", pkg);

  console.log("[2/5] Updating src-tauri/Cargo.toml …");
  const cargoPath = resolve(ROOT, "src-tauri/Cargo.toml");
  let cargo = readFileSync(cargoPath, "utf-8");
  cargo = cargo.replace(/^version\s*=\s*".*"$/m, `version = "${next}"`);
  writeFileSync(cargoPath, cargo);

  console.log("[3/5] Updating src-tauri/tauri.conf.json …");
  const tauriConf = readJSON("src-tauri/tauri.conf.json");
  tauriConf.version = next;
  writeJSON("src-tauri/tauri.conf.json", tauriConf);

  console.log("[4/5] Updating src-tauri/Cargo.lock …");
  const lockPath = resolve(ROOT, "src-tauri/Cargo.lock");
  let lock = readFileSync(lockPath, "utf-8");
  const lockRe = /(\[\[package\]\]\nname = "anime-watchlist"\nversion = ")[^"]*(")/;
  if (!lockRe.test(lock)) {
    throw new Error(`Could not find anime-watchlist package version in ${lockPath}`);
  }
  lock = lock.replace(lockRe, `$1${next}$2`);
  writeFileSync(lockPath, lock);

  console.log("[5/5] Updating src/lib/bgm.ts USER_AGENT …");
  const bgmPath = resolve(ROOT, "src/lib/bgm.ts");
  let bgm = readFileSync(bgmPath, "utf-8");
  const uaRe = /(anime-watchlist\/)(\d+\.\d+\.\d+)/;
  if (!uaRe.test(bgm)) {
    throw new Error(`Could not find USER_AGENT version pattern in ${bgmPath}`);
  }
  bgm = bgm.replace(uaRe, `$1${next}`);
  writeFileSync(bgmPath, bgm);
}

const VERSION_FILES = [
  "package.json",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.lock",
  "src/lib/bgm.ts",
];

function commitVersion(tag) {
  console.log("\n📦 Committing …");
  run(`git add ${VERSION_FILES.join(" ")}`);
  run(`git commit -m "chore: bump version to ${tag}"`);
}

/**
 * 发版前置检查：release notes 一律发版前手写并入库（CI 不再自动生成）。
 * 缺文件 / 未提交都在本地拦截，避免 CI 构建数分钟后才在发布步骤失败。
 */
function assertReleaseNotes(tag) {
  const rel = `docs/release-notes/${tag}.md`;
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) {
    console.error(`\n❌ 缺少 release notes 文件：${rel}`);
    console.error(`   发版前须先按 commit 历史撰写精简版 notes 并提交入库：`);
    console.error(`   开头一句定位 + ✨新功能 / 🛠修复与改进 分节（用户视角，只列可感知变化）`);
    console.error(`   + 📥使用方式 + 完整变更 compare 链接；格式参考 docs/release-notes/v2.0.0.md`);
    process.exit(1);
  }
  // 文件存在但未提交：tag 会打在不含 notes 的提交上，CI checkout 后将找不到文件
  try {
    execSync(`git ls-files --error-unmatch "${rel}"`, { cwd: ROOT, stdio: "pipe" });
  } catch {
    console.error(`\n❌ ${rel} 尚未提交入库——请先 git add + commit 该文件再运行发版。`);
    process.exit(1);
  }
}

// ── main ─────────────────────────────────────────────────────────────

// 两种模式（「更新版本」和「发布版本」是两件事）：
//   node scripts/release.mjs <bump>            → 发布：bump + 提交 + 打 tag + 推送（触发 CI）
//   node scripts/release.mjs update <bump>     → 仅更新版本：改 5 处 + 提交，不打 tag 不推送
const args = process.argv.slice(2);
const updateOnly = args[0] === "update";
const bump = updateOnly ? args[1] : args[0];

if (!bump) {
  console.error(`Usage:
  node scripts/release.mjs <major|minor|patch|X.Y.Z>          # 发布（bump + 提交 + tag + 推送，触发 CI）
  node scripts/release.mjs update <major|minor|patch|X.Y.Z>   # 仅更新版本（改 5 处 + 提交，不打 tag 不推送）`);
  process.exit(1);
}

const pkg = readJSON("package.json");
const current = pkg.version;
const next = incVersion(current, bump);
const tag = `v${next}`;

// 仅更新版本：改版本号 + 提交即止
if (updateOnly) {
  if (next === current) {
    console.log(`\nℹ️  ${current} 已是目标版本，无需更新。\n`);
    process.exit(0);
  }
  console.log(`\n✏️  Updating v${current} → v${next}\n`);
  updateVersionFiles(next);
  commitVersion(tag);
  console.log(`\n✅ 版本已更新并提交为 ${tag}（未打 tag / 未推送）。`);
  console.log(`   确认发布时运行：npm run release ${next}\n`);
  process.exit(0);
}

// 版本已一致 → 只打 tag 并推送（首次发布 / 已 bump 后的发布）
if (next === current) {
  console.log(`\n🏷  Tagging current version ${tag} (no bump needed) …`);
  assertReleaseNotes(tag);
  run(`git tag ${tag}`);
  console.log(`\n⬆️  Pushing tag …`);
  run("git push --tags");
  console.log(`\n✅ Tagged ${tag}`);
  console.log(`   GitHub Actions will build and publish the release shortly.\n`);
  process.exit(0);
}

// 发版前置：notes 检查放在任何写操作之前，失败时零副作用
assertReleaseNotes(tag);

console.log(`\n🚀 Releasing v${current} → v${next}\n`);
updateVersionFiles(next);
commitVersion(tag);

console.log(`\n🏷  Tagging ${tag} …`);
run(`git tag ${tag}`);

console.log(`\n⬆️  Pushing …`);
run("git push");
run("git push --tags");

console.log(`\n✅ Released ${tag}`);
console.log(`   GitHub Actions will build and publish the release shortly.\n`);
