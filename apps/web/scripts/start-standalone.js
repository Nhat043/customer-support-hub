const fs = require("node:fs");
const path = require("node:path");

const nextDirectory = path.resolve(__dirname, "..", ".next");
const staticSource = path.join(nextDirectory, "static");
const standaloneDirectory = path.join(nextDirectory, "standalone", "apps", "web");
const staticDestination = path.join(standaloneDirectory, ".next", "static");
const serverPath = path.join(standaloneDirectory, "server.js");

if (!fs.existsSync(serverPath) || !fs.existsSync(staticSource)) {
  throw new Error("Next production build output is missing. Run pnpm --filter @customer-support-hub/web build first.");
}

// Next standalone output excludes browser assets; copy them for local/CI start.
fs.mkdirSync(path.dirname(staticDestination), { recursive: true });
fs.cpSync(staticSource, staticDestination, { recursive: true, force: true });

require(serverPath);
