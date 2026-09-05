/**
 * 生成「追番计划」桌面快捷方式：指向 Tauri release 产物 exe，每次构建后同步覆盖。
 * 用法：node scripts/make-shortcut.mjs [输出目录]（缺省为当前用户桌面，经 PowerShell 解析以兼容 OneDrive 重定向）。
 * 由 scripts/tauri.mjs 在 `npm run tauri build` 成功后自动调用；exe 不存在则跳过（不阻塞构建链）；
 * CI 环境（release.yml 的 windows-latest 也跑 tauri build）直接跳过，不在 runner 桌面建快捷方式。
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 仅直接运行本脚本时才接受输出目录参数；被 tauri.mjs 动态 import 时 argv 是包装进程的
// （argv[2] 会是 "build"），必须忽略，一律写到桌面
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
const outDirArg = isMain ? process.argv[2] : undefined;

if (process.env.CI) {
  console.log("[shortcut] CI 环境，跳过快捷方式生成");
  process.exit(0);
}

// 快捷方式显示名 = tauri.conf.json 的 productName（本产品即「追番计划」）
const { productName } = JSON.parse(
  readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
);

// 产物 exe 名以 Cargo 包名为准（bundle.active=false 不打安装包，CI 复制的也是 anime-watchlist.exe）；
// 兜底 productName 命名，防 Tauri CLI 未来改为按 productName 重命名产物
const releaseDir = path.join(root, "src-tauri", "target", "release");
const cargoName = readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8")
  .match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1]; // [package] 是本 Cargo.toml 首个 section，首个 name 即包名
const candidates = [cargoName, productName]
  .filter(Boolean)
  .map((name) => path.join(releaseDir, `${name}.exe`));
const exe = candidates.find((p) => existsSync(p));

if (!exe) {
  console.warn(`[shortcut] 未找到构建产物（尝试过 ${candidates.join("、")}），跳过快捷方式生成`);
  process.exit(0);
}

// PowerShell 单引号字面量转义（'' 表示一个单引号）
const psStr = (s) => `'${s.replace(/'/g, "''")}'`;

try {
  // WScript.Shell 不建父目录：指定输出目录时先确保存在
  if (outDirArg) mkdirSync(path.resolve(outDirArg), { recursive: true });
  const dirExpr = outDirArg
    ? psStr(path.resolve(outDirArg))
    : "[Environment]::GetFolderPath('Desktop')";
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    // 产物/快捷方式名含中文，统一 UTF-8 输出避免日志乱码
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    `$dir = ${dirExpr}`,
    "$ws = New-Object -ComObject WScript.Shell",
    `$lnk = $ws.CreateShortcut((Join-Path $dir ${psStr(`${productName}.lnk`)}))`,
    `$lnk.TargetPath = ${psStr(exe)}`,
    `$lnk.WorkingDirectory = ${psStr(path.dirname(exe))}`,
    `$lnk.IconLocation = ${psStr(`${exe},0`)}`,
    `$lnk.Description = ${psStr(productName)}`,
    "$lnk.Save()",
    `Write-Output (Join-Path $dir ${psStr(`${productName}.lnk`)})`,
  ].join("; ");

  const { stdout } = await run(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { windowsHide: true },
  );
  console.log(`[shortcut] 已同步生成快捷方式：${stdout.trim()}`);
} catch (e) {
  console.warn(`[shortcut] 快捷方式生成失败：${e.stderr ?? e.message}`);
  process.exit(1);
}
