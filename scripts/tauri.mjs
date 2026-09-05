/**
 * `npm run tauri` 的转发包装：参数原样透传给 @tauri-apps/cli（stdio 继承、退出码转发），
 * dev 等其余子命令行为不变；子命令为 build 且成功时，构建后同步在桌面生成/覆盖
 * 「追番计划」快捷方式（scripts/make-shortcut.mjs，指向 target/release 产物）。
 * CLI 入口按包内 bin 字段显式解析（node node_modules/@tauri-apps/cli/tauri.js），不依赖 PATH。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPkg = path.join(root, "node_modules", "@tauri-apps", "cli", "package.json");
const { bin } = JSON.parse(readFileSync(cliPkg, "utf8"));
const cliJs = path.join(path.dirname(cliPkg), typeof bin === "string" ? bin : bin.tauri);

if (!existsSync(cliJs)) {
  console.error(`[tauri] 未找到 CLI 入口：${cliJs}（先 npm install）`);
  process.exit(1);
}

const r = spawnSync(process.execPath, [cliJs, ...args], { stdio: "inherit" });

if (r.error) {
  console.error(`[tauri] 调用失败：${r.error.message}`);
  process.exit(1);
}
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}
if (args[0] === "build") {
  // Windows 下动态 import 必须用 file:// URL（裸盘符路径会被当作 e: 协议拒绝）
  await import(
    pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "make-shortcut.mjs")).href
  );
}
