// Runs a repository's Vercel CI configuration on a self-hosted runner, the way Vercel CI does:
// the install command (vercel.json ci.bootstrapping), then every turbo.json task tagged "ci",
// each with the constant env vercel.json ci.tasks gives it. Tasks that share an env run in one
// `turbo run`; groups run one after another, and every group runs even if another fails.
//
//   node run.mjs            from the repository root
//   node run.mjs --plan     prints the install command and task groups, runs nothing
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const ci = (existsSync("vercel.json") ? read("vercel.json").ci : undefined) ?? {};

export function constants(env = {}) {
  return Object.fromEntries(
    Object.entries(env).map(([name, value]) => {
      if (!value || typeof value !== "object" || !("constant" in value))
        throw new Error(`studio-ci: ${name}: only constant env values are supported`);
      return [name, String(value.constant.value)];
    }),
  );
}

export function installCommand(config, has = existsSync) {
  if (config.bootstrapping?.installCommand) return config.bootstrapping.installCommand;
  if (has("pnpm-lock.yaml")) return "pnpm install --frozen-lockfile";
  if (has("bun.lock") || has("bun.lockb")) return "bun install --frozen-lockfile";
  if (has("yarn.lock")) return "yarn install --immutable";
  return "npm ci";
}

const matches = (id, names) => names.some((name) => name === id || name === id.split("#").pop());
const list = (value) => (value ?? "").split(/[\s,]+/).filter(Boolean);

/**
 * The tagged tasks, grouped by the env their ci.tasks entry gives them (matched by full id or task
 * name). `include` keeps only the named tasks; `exclude` leaves the named ones out.
 */
export function taskGroups(turbo, config, { include = [], exclude = [] } = {}) {
  const tasks = turbo.tasks ?? {};
  const groups = new Map();
  for (const id of Object.keys(tasks).filter(
    (id) =>
      tasks[id].tags?.includes("ci") &&
      (include.length === 0 || matches(id, include)) &&
      !matches(id, exclude),
  )) {
    const entry = (config.tasks ?? []).find((t) => matches(id, [t.name]));
    const env = constants(entry?.env);
    const key = JSON.stringify(Object.entries(env).sort());
    if (!groups.has(key)) groups.set(key, { env, tasks: [] });
    groups.get(key).tasks.push(id);
  }
  return [...groups.values()];
}

/**
 * The turbo invocations for the groups: a task that starts a service with `with` runs on its own,
 * because turbo stops a service it shares between tasks when the first of them finishes. Vercel CI
 * gave every task its own machine, so tasks were written for a service of their own.
 */
export function invocations(groups, turbo) {
  const tasks = turbo.tasks ?? {};
  return groups.flatMap(({ env, tasks: ids }) => {
    const solo = ids.filter((id) => (tasks[id]?.with ?? []).length > 0);
    const rest = ids.filter((id) => !solo.includes(id));
    return [...(rest.length ? [{ env, tasks: rest }] : []), ...solo.map((id) => ({ env, tasks: [id] }))];
  });
}

function run(command, args, env, shell = false) {
  console.log(`::group::${shell ? command : [command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell, env: { ...process.env, ...env } });
  console.log("::endgroup::");
  return result.status ?? 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const install = installCommand(ci);
  const filter = { include: list(process.env.STUDIO_CI_INCLUDE), exclude: list(process.env.STUDIO_CI_EXCLUDE) };
  const turboConfig = read("turbo.json");
  const groups = invocations(taskGroups(turboConfig, ci, filter), turboConfig);
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify({ install, groups }, null, 2));
    process.exit(0);
  }
  if (groups.length === 0) {
    if (filter.include.length || filter.exclude.length) {
      console.log("studio-ci: no task tagged ci is left after include/exclude; nothing to run");
      process.exit(0);
    }
    throw new Error("studio-ci: turbo.json has no task tagged ci");
  }
  // Install scripts that read git history fetch from GitHub; give them the job's read-only token.
  const auth = process.env.GH_TOKEN
    ? {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString("base64")}`,
      }
    : {};
  if (run(install, [], { ...constants(ci.bootstrapping?.installEnv), ...auth }, true) !== 0) process.exit(1);
  const turbo = existsSync(join("node_modules", ".bin", "turbo")) ? join("node_modules", ".bin", "turbo") : "turbo";
  const concurrency = process.env.STUDIO_CI_CONCURRENCY || "4";
  let failed = 0;
  for (const group of groups)
    if (run(turbo, ["run", ...group.tasks, "--continue", "--env-mode=loose", `--concurrency=${concurrency}`], group.env) !== 0)
      failed++;
  if (failed) console.log(`studio-ci: ${failed} of ${groups.length} task groups failed`);
  process.exit(failed ? 1 : 0);
}
