// Manual, opt-in real-provider probe. Never imports the application or writes profiles.
import { build } from "esbuild";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imagePath = process.argv[2];
if (!imagePath) throw new Error("Usage: node scripts/probe-business-analysis.mjs <image-path>");
const temp = await mkdtemp(path.join(root, ".analysis-probe-"));
try {
  await build({
    entryPoints: [path.join(root, "src/services/siteAnalysis.ts")],
    outfile: path.join(temp, "analysis.mjs"),
    bundle: true, platform: "node", format: "esm", external: ["@google/genai"],
    plugins: [{
      name: "no-profile-side-effects",
      setup(b) {
        b.onResolve({ filter: /^@workspace\/db$/ }, () => ({
          path: path.resolve(root, "../../lib/db/src/schema/businessProfile.ts"),
        }));
        b.onResolve({ filter: /\/businessProfile\.js$/ }, () => ({ path: "profile", namespace: "stub" }));
        b.onResolve({ filter: /(^|\/)logger\.js$/ }, () => ({ path: "logger", namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, ({ path: p }) => ({
          contents: p === "logger"
            ? "export const logger = {info(){},warn(fields){console.warn(JSON.stringify(fields))},error(){}};"
            : "export const updateProfile = () => {throw Error('No writes allowed')}; export const setAnalysisStatus=updateProfile; export const tryAcquireAnalysis=updateProfile;",
        }));
      },
    }],
  });
  const { assistFromImage } = await import(path.join(temp, "analysis.mjs"));
  const started = Date.now();
  try {
    const draft = await assistFromImage(await readFile(imagePath), "image/jpeg");
    console.log(JSON.stringify({
      ok: true, elapsedMs: Date.now() - started,
      hasName: Boolean(draft.name), hasDescription: Boolean(draft.description),
      offerings: draft.offerings?.length, links: draft.publicLinks?.length,
    }));
  } catch (e) {
    console.log(JSON.stringify({
      ok: false, elapsedMs: Date.now() - started, type: e.name,
      status: e.status ?? e.statusCode,
      category: String(e.message).match(/timeout|timed out|deadline|aborted|quota|overloaded|JSON|API key|fetch failed|legível|demorou|temporariamente/gi),
    }));
    process.exitCode = 1;
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}