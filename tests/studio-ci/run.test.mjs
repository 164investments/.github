import assert from "node:assert/strict";
import test from "node:test";
import { constants, installCommand, taskGroups } from "../../actions/studio-ci/run.mjs";

test("only constant env values are accepted", () => {
  assert.deepEqual(constants({ A: { constant: { value: "x" } }, B: { constant: { value: 3 } } }), { A: "x", B: "3" });
  assert.deepEqual(constants(undefined), {});
  assert.throws(() => constants({ KEY: { secret: { name: "KEY" } } }), /only constant env values/);
});

test("the install command is the configured one, else the lockfile's", () => {
  assert.equal(installCommand({ bootstrapping: { installCommand: "npm ci && make" } }), "npm ci && make");
  assert.equal(installCommand({}, (f) => f === "pnpm-lock.yaml"), "pnpm install --frozen-lockfile");
  assert.equal(installCommand({}, (f) => f === "bun.lock"), "bun install --frozen-lockfile");
  assert.equal(installCommand({}, () => false), "npm ci");
});

test("tagged tasks are grouped by the env their ci.tasks entry gives them", () => {
  const turbo = {
    tasks: {
      typecheck: { tags: ["ci"] },
      lint: { tags: ["ci"] },
      "web#build": { tags: ["ci"] },
      "//#test:db": { tags: ["ci"] },
      dev: {},
      "sr-only": { tags: ["sr-tests"] },
    },
  };
  const config = {
    tasks: [
      { name: "build", env: { URL: { constant: { value: "https://example.test" } } } },
      { name: "//#test:db", env: { URL: { constant: { value: "https://example.test" } } } },
    ],
  };
  assert.deepEqual(taskGroups(turbo, config), [
    { env: {}, tasks: ["typecheck", "lint"] },
    { env: { URL: "https://example.test" }, tasks: ["web#build", "//#test:db"] },
  ]);
  assert.deepEqual(taskGroups({ tasks: { dev: {} } }, {}), []);
});
