import { rewriteSiteText } from "./site-routes.mjs";
import { cp, mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const web = path.join(root, "web"),
  out = path.join(root, "dist");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(web, path.join(out, "v1"), {
  recursive: true,
  filter: (p) =>
    !["v02", "dev-report"].includes(path.relative(web, p).split(path.sep)[0]),
});
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
// Keep immutable artwork URLs intact: resident bundle hashes include these paths.
await writeFile(
  path.join(out, "_redirects"),
  `/ /v2/menu.html 302\n/v1 /v1/ 301\n/v2 /v2/ 301\n/v02/weekend/* /v2/:splat 301\n/v02/* /v2/:splat 301\n/art/* /v1/art/:splat 200\n/fonts/* /v1/fonts/:splat 200\n`,
);
await writeFile(
  path.join(out, "index.html"),
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/v2/menu.html"><title>Solar Friends</title><a href="/v2/">Play v2</a> · <a href="/v1/">Play v1</a>',
);
console.log("Built dist/v1 and dist/v2 (game at /v2/, no weekend prefix).");
