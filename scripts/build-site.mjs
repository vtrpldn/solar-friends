import {execFileSync} from 'node:child_process';
import { rewriteSiteText } from "./site-routes.mjs";
import { cp, mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const web = path.join(root, "web"),
  out = path.join(root, "dist");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.join(web, "fonts"), path.join(out, "fonts"), { recursive: true });
await cp(path.join(web, "v02"), path.join(out, "v2"), {
  recursive: true,
  filter: (p) =>
    path.relative(path.join(web, "v02"), p).split(path.sep)[0] !== "weekend",
});
await cp(path.join(web, "v02/weekend"), path.join(out, "v2"), {
  recursive: true,
});
async function rewrite(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await rewrite(file);
      continue;
    }
    if (!/\.(js|html|css)$/.test(file) || file.includes("/vendor/")) continue;
    let text = await readFile(file, "utf8");
    const rel = path.relative(out, file);
    text = rewriteSiteText(text, rel);
    await writeFile(file, text);
  }
}
await rewrite(out);
let revision=process.env.COMMIT_REF || process.env.GITHUB_SHA;
if(!revision){try{revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{revision='unknown';}}
await writeFile(path.join(out,'v2/build-info.js'),`export const BUILD_INFO = ${JSON.stringify({revision,builtAt:new Date().toISOString()})};\n`);

// The first version of the game was retired; old links land on the current one.
await writeFile(
  path.join(out, "_redirects"),
  `/ /v2/menu.html 302\n/v2 /v2/ 301\n/v1 /v2/ 302\n/v1/* /v2/ 302\n/v02/weekend/* /v2/:splat 301\n/v02/* /v2/:splat 301\n`,
);
await writeFile(
  path.join(out, "index.html"),
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/v2/menu.html"><title>Solar Friends</title><a href="/v2/">Play Solar Friends</a>',
);
console.log("Built dist/v2 (game at /v2/, no weekend prefix).");
