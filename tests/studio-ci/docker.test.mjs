import assert from "node:assert/strict";
import test from "node:test";
import { execArgs, parseRun } from "../../actions/studio-ci/bin/docker.mjs";

test("docker run reads the PostgreSQL flags CI scripts use", () => {
  assert.deepEqual(
    parseRun(["--rm", "--name", "ci-postgres", "-p", "127.0.0.1:5434:5432", "-e", "POSTGRES_PASSWORD=a=b", "-e", "POSTGRES_DB=test", "mirror.gcr.io/library/postgres:17-alpine", "-c", "jit=off"]),
    { rm: true, detach: false, name: "ci-postgres", port: 5434, env: { POSTGRES_PASSWORD: "a=b", POSTGRES_DB: "test" }, image: "mirror.gcr.io/library/postgres:17-alpine", serverArgs: ["-c", "jit=off"] },
  );
  assert.equal(parseRun(["-p", "5433:5432", "postgres:17"]).port, 5433);
  assert.equal(parseRun(["postgres"]).name, "postgres-5432");
  assert.equal(parseRun(["-d", "postgres@sha256:abc"]).detach, true);
});

test("docker run refuses what it can't stand in for", () => {
  assert.throws(() => parseRun(["redis:7"]), /only PostgreSQL images/);
  assert.throws(() => parseRun(["-p", "8080:80", "postgres:17"]), /only the container's port 5432/);
  assert.throws(() => parseRun(["--network", "host", "postgres:17"]), /isn't supported/);
  assert.throws(() => parseRun(["--rm"]), /only PostgreSQL images/);
});

test("docker exec points an explicit container port at the host port", () => {
  assert.deepEqual(execArgs(["-h", "127.0.0.1", "-p", "5432", "-U", "postgres"], 5434), ["-h", "127.0.0.1", "-p", "5434", "-U", "postgres"]);
  assert.deepEqual(execArgs(["--port=5432"], 5433), ["--port=5433"]);
  assert.deepEqual(execArgs(["-U", "postgres"], 5433), ["-U", "postgres"]);
});
