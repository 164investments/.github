// A stand-in for the few docker commands CI scripts use to get a PostgreSQL server, on a runner
// with PostgreSQL on its PATH and no Docker:
//
//   docker run [--rm] [-d] [--name N] [-p [IP:]HOST:5432] [-e POSTGRES_*=V]... <postgres image> [server args]
//       starts a throwaway native cluster on HOST (5432 if no -p), in the foreground unless -d
//   docker exec [flags] N <command> [args]   waits for N's server, then runs command with PGPORT and
//       PGHOST (its socket, which trusts local connections, as inside the container) set
//   docker rm -f N | docker stop N | docker kill N   stops N
//
// Names are per runner (RUNNER_TEMP). Jobs on one machine that ask for the same host port take
// turns: the second server starts when the first stops, and `docker exec` waits for it.
// Anything else exits 127 and says it isn't available.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const state = join(process.env.RUNNER_TEMP || tmpdir(), "studio-ci-docker");
const locks = join(tmpdir(), "studio-ci-docker-ports");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const fail = (message, code = 127) => {
  console.error(`studio-ci docker: ${message}`);
  process.exit(code);
};

export function parseRun(args) {
  const run = { rm: false, detach: false, name: undefined, port: 5432, env: {}, image: undefined, serverArgs: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (run.image) run.serverArgs.push(arg);
    else if (arg === "--rm") run.rm = true;
    else if (arg === "-d" || arg === "--detach") run.detach = true;
    else if (arg === "--name") run.name = args[++i];
    else if (arg.startsWith("--name=")) run.name = arg.slice(7);
    else if (arg === "-p" || arg === "--publish") {
      const parts = args[++i].split(":");
      if (parts.at(-1) !== "5432") throw new Error(`-p ${args[i]}: only the container's port 5432 is supported`);
      run.port = Number(parts.at(-2));
    } else if (arg === "-e" || arg === "--env") {
      const [key, ...value] = args[++i].split("=");
      run.env[key] = value.join("=");
    } else if (arg.startsWith("-")) throw new Error(`docker run ${arg} isn't supported`);
    else run.image = arg;
  }
  if (!run.image || !/(^|\/)postgres(:|@|$)/.test(run.image))
    throw new Error(`docker run ${run.image ?? ""}: only PostgreSQL images run here (natively, PostgreSQL on PATH)`);
  if (!Number.isInteger(run.port) || run.port <= 0) throw new Error("invalid host port");
  run.name ??= `postgres-${run.port}`;
  return run;
}

/** pg tool args with an explicit container port 5432 rewritten to the host port. */
export function execArgs(args, port) {
  const out = [...args];
  for (let i = 0; i < out.length; i++)
    if ((out[i] === "-p" || out[i] === "--port") && out[i + 1] === "5432") out[i + 1] = String(port);
    else if (out[i] === "--port=5432") out[i] = `--port=${port}`;
  return out;
}

const record = (name) => join(state, `${name}.json`);
const read = (name) => (existsSync(record(name)) ? JSON.parse(readFileSync(record(name), "utf8")) : undefined);

async function takePort(port) {
  mkdirSync(locks, { recursive: true });
  const lock = join(locks, String(port));
  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, "owner"), String(process.pid));
      return lock;
    } catch {
      let owner = NaN;
      try {
        owner = Number(readFileSync(join(lock, "owner"), "utf8"));
      } catch {}
      if (Number.isInteger(owner) && !alive(owner)) {
        const server = Number(existsSync(join(lock, "server")) ? readFileSync(join(lock, "server"), "utf8") : NaN);
        if (Number.isInteger(server) && alive(server)) process.kill(server, "SIGQUIT");
        rmSync(lock, { recursive: true, force: true });
      } else await sleep(2000);
    }
  }
}

async function run(spec) {
  if (spec.detach) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "run", ...process.argv.slice(3).filter((a) => a !== "-d" && a !== "--detach")], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    console.log(spec.name);
    return;
  }
  mkdirSync(state, { recursive: true });
  if (read(spec.name) && alive(read(spec.name).pid)) fail(`a server named ${spec.name} is already running`, 125);
  writeFileSync(record(spec.name), JSON.stringify({ pid: process.pid, port: spec.port, ready: false }));
  const lock = await takePort(spec.port);
  const user = spec.env.POSTGRES_USER || "postgres";
  const database = spec.env.POSTGRES_DB || user;
  const trust = spec.env.POSTGRES_HOST_AUTH_METHOD === "trust" || !spec.env.POSTGRES_PASSWORD;
  const data = mkdtempSync(join(tmpdir(), "studio-ci-pg-"));
  let server;
  const stop = (code) => {
    if (server && alive(server.pid)) {
      server.kill("SIGINT");
      spawnSync("sh", ["-c", `while kill -0 ${server.pid} 2>/dev/null; do sleep 0.2; done`], { timeout: 30000 });
    }
    rmSync(data, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
    rmSync(record(spec.name), { force: true });
    process.exit(code);
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stop(0));
  const pwfile = join(data, "..", `${data.split("/").pop()}.pw`);
  writeFileSync(pwfile, spec.env.POSTGRES_PASSWORD || "postgres");
  const initdb = spawnSync(
    "initdb",
    ["-D", join(data, "db"), "-U", user, "--pwfile", pwfile, "-E", "UTF8", "--no-sync", "--auth-local=trust", `--auth-host=${trust ? "trust" : "scram-sha-256"}`],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  rmSync(pwfile, { force: true });
  if (initdb.error) console.error(`studio-ci docker: initdb: ${initdb.error.message} (is PostgreSQL on the runner's PATH?)`);
  if (initdb.status !== 0) stop(1);
  server = spawn(
    "postgres",
    ["-D", join(data, "db"), "-p", String(spec.port), "-k", data, "-c", "listen_addresses=localhost", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off", ...spec.serverArgs],
    { stdio: "inherit" },
  );
  server.on("error", (error) => {
    console.error(`studio-ci docker: postgres: ${error.message}`);
    stop(1);
  });
  writeFileSync(join(lock, "server"), String(server.pid));
  server.on("exit", (code) => stop(code ?? 1));
  const env = { ...process.env, PGPASSWORD: spec.env.POSTGRES_PASSWORD || "" };
  for (let i = 0; spawnSync("pg_isready", ["-q", "-h", "127.0.0.1", "-p", String(spec.port), "-U", user], { env }).status !== 0; i++) {
    if (i > 120) stop(1);
    await sleep(250);
  }
  if (database !== "postgres")
    if (spawnSync("createdb", ["-h", "127.0.0.1", "-p", String(spec.port), "-U", user, database], { env, stdio: "inherit" }).status !== 0) stop(1);
  writeFileSync(record(spec.name), JSON.stringify({ pid: process.pid, port: spec.port, socket: data, ready: true }));
  console.log(`studio-ci docker: ${spec.image} as native PostgreSQL on port ${spec.port} (${spec.name})`);
}

async function exec(args) {
  let i = 0;
  while (args[i]?.startsWith("-")) i += ["-e", "--env", "-u", "--user", "-w", "--workdir"].includes(args[i]) ? 2 : 1;
  const name = args[i];
  const command = args.slice(i + 1);
  if (!name || command.length === 0) fail("docker exec needs a name and a command", 125);
  for (;;) {
    const entry = read(name);
    if (!entry || !alive(entry.pid)) fail(`no running server named ${name}`, 1);
    if (entry.ready) {
      const result = spawnSync(command[0], execArgs(command.slice(1), entry.port), {
        stdio: "inherit",
        env: { ...process.env, PGPORT: String(entry.port), PGHOST: entry.socket },
      });
      process.exit(result.status ?? 1);
    }
    await sleep(1000);
  }
}

async function remove(args) {
  for (const name of args.filter((a) => !a.startsWith("-"))) {
    const entry = read(name);
    if (!entry || !alive(entry.pid)) continue;
    process.kill(entry.pid, "SIGTERM");
    while (alive(entry.pid)) await sleep(200);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/docker.mjs")) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === "run") await run(parseRun(args));
    else if (command === "exec") await exec(args);
    else if (command === "rm" || command === "stop" || command === "kill") await remove(args);
    else fail(`docker ${command ?? ""} isn't available on the self-hosted runners; only run (PostgreSQL), exec, rm, stop and kill`);
  } catch (error) {
    fail(error.message, 125);
  }
}
