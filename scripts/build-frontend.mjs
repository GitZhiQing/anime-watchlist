import { execSync } from "child_process";
import { cpSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

console.log("Building frontend …");
execSync("npm run build", { cwd: ROOT, stdio: "inherit" });

console.log("Copying dist/ → src-tauri/dist/ …");
cpSync(resolve(ROOT, "dist"), resolve(ROOT, "src-tauri", "dist"), {
  recursive: true,
});

console.log("Done.");
