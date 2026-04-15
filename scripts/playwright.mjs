import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const artifactRoot = path.join(projectRoot, ".artifacts", "playwright");
const browserRoot = path.join(artifactRoot, "browsers");
const userDataRoot = path.join(artifactRoot, "user-data");
const downloadsRoot = path.join(artifactRoot, "downloads");

for (const dir of [artifactRoot, browserRoot, userDataRoot, downloadsRoot]) {
  mkdirSync(dir, { recursive: true });
}

const playwrightCli = path.join(
  projectRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

const args = process.argv.slice(2);
const command = args[0];
const finalArgs =
  command === "codegen" && !args.some((arg) => arg.startsWith("--user-data-dir"))
    ? [command, `--user-data-dir=${userDataRoot}`, ...args.slice(1)]
    : args;
const env = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: browserRoot,
  PLAYWRIGHT_DOWNLOAD_HOST: process.env.PLAYWRIGHT_DOWNLOAD_HOST,
  PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT:
    process.env.PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT,
};

const child = spawn(process.execPath, [playwrightCli, ...finalArgs], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
