import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import { writeFile, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const jwks = JSON.stringify({
  keys: [{ use: "sig", ...(await exportJWK(keys.publicKey)) }],
});
const path = ".env.auth.local";
await writeFile(
  path,
  `JWT_PRIVATE_KEY="${privateKey.trimEnd().replace(/\n/g, " ")}"\nJWKS=${jwks}\nSITE_URL=http://localhost:5173\n`,
  { mode: 0o600 },
);
await chmod(path, 0o600);
const result = spawnSync(
  "node_modules/.bin/convex",
  ["env", "set", "--from-file", path],
  { stdio: "pipe", encoding: "utf8" },
);
if (result.status !== 0) {
  console.error(
    "Could not configure auth. Start the local Convex deployment and rerun this script.",
  );
  process.exit(1);
}
console.log(
  "Local authentication keys configured. Values remain in ignored .env.auth.local.",
);
