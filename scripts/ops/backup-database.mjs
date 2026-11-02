import { chmodSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const destination = process.argv[2];
if (!destination || !path.isAbsolute(destination) || !process.env.DATABASE_URL) throw new Error("Provide an absolute backup directory and DATABASE_URL in the environment");
const database = new URL(process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(database.protocol)) throw new Error("Expected PostgreSQL");
mkdirSync(destination, { recursive: true, mode: 0o700 });
chmodSync(destination, 0o700);
const file = path.join(destination, "database.dump");
const env = { ...process.env, PGPASSWORD: decodeURIComponent(database.password), PGCONNECT_TIMEOUT: "10" };
const result = spawnSync("/usr/lib/postgresql/16/bin/pg_dump", ["--format=custom", "--file", file, "--host", database.hostname, "--port", database.port || "5432", "--username", decodeURIComponent(database.username), "--dbname", decodeURIComponent(database.pathname.slice(1))], { env, stdio: ["ignore", "ignore", "pipe"] });
if (result.status !== 0) throw new Error("Database backup failed; details withheld to protect connection credentials");
chmodSync(file, 0o600);
const listing = spawnSync("/usr/lib/postgresql/16/bin/pg_restore", ["--list", file], { stdio: "pipe" });
if (listing.status !== 0 || !statSync(file).size) throw new Error("Backup archive validation failed");
console.log(JSON.stringify({ backup: file, bytes: statSync(file).size, archiveValidated: true }));
