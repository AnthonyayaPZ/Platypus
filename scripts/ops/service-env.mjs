// Run a maintenance command with an existing systemd service's environment.
// Secrets are inherited in memory, never included in command arguments or output.
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const [service, command, ...args] = process.argv.slice(2);
if (!service || !command || !/^[a-zA-Z0-9@_.-]+\.service$/.test(service)) {
  throw new Error("Usage: node service-env.mjs SERVICE COMMAND [ARGS...]");
}
const pid = execFileSync("systemctl", ["show", service, "-p", "MainPID", "--value"], { encoding: "utf8" }).trim();
if (!/^[1-9]\d*$/.test(pid)) throw new Error("The source service is not running");
const env = Object.fromEntries(readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter((entry) => entry.includes("=")).map((entry) => {
  const index = entry.indexOf("=");
  return [entry.slice(0, index), entry.slice(index + 1)];
}));
const result = spawnSync(command, args, { env: { ...process.env, ...env }, stdio: "inherit" });
if (result.error) throw new Error("The maintenance command could not start");
process.exitCode = result.status ?? 1;
