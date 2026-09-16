/**
 * Post-build fix for Cloudflare deploys.
 *
 * As of 2026-08-04 the `nodejs_compat` compatibility flag became the platform
 * default and is now REJECTED when declared explicitly, which makes every SSR
 * request fail with "Internal server error" (502). Nitro still writes the flag
 * into the generated wrangler config, so strip it after the build.
 * No-op once the toolchain stops emitting the flag.
 */
import fs from "node:fs";
import path from "node:path";

const candidates = [
  "dist/server/wrangler.json",
  "dist/server/wrangler.jsonc",
  ".wrangler/deploy/wrangler.json",
];

for (const rel of candidates) {
  const file = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(file)) continue;
  try {
    const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(cfg.compatibility_flags)) continue;
    const next = cfg.compatibility_flags.filter((flag) => flag !== "nodejs_compat");
    if (next.length === cfg.compatibility_flags.length) continue;
    cfg.compatibility_flags = next;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    console.info(`[lovable] removed defaulted nodejs_compat flag from ${rel}`);
  } catch (error) {
    console.error(`[lovable] could not patch ${rel}`, error);
  }
}
