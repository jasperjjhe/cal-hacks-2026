// Fails if the retired project name reappears anywhere in tracked text files.
// The pattern is assembled from parts so this file does not match itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const retired = new RegExp(["buyer", "union"].join("[\\s_.-]?"), "i");

test("the project is named Converge everywhere", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const hits = [];
  for (const file of files) {
    const bytes = readFileSync(resolve(root, file));
    if (bytes.includes(0)) continue; // binary
    const lines = bytes.toString("utf8").split("\n");
    lines.forEach((line, i) => retired.test(line) && hits.push(`${file}:${i + 1}`));
  }
  assert.deepEqual(hits, [], `Retired project name found; use Converge:\n${hits.join("\n")}`);
});
