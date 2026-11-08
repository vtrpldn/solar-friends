// Small, deterministic illustrations: no fonts, network requests or WebGL work.
const path = (d, fill = "#c99560") => `<path d="${d}" fill="${fill}"/>`;
const rect = (x, y, w, h, fill = "#c99560") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}"/>`;
const ellipse = (x, y, rx, ry, fill) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const leaf = (x, y) =>
  path(
    `M${x} ${y}q-19 -18 -21 -3q8 12 21 3q5 -23 19 -17q1 15 -19 17`,
    "#8da85c",
  );
const sprout = leaf(32, 30) + path("M32 28v23", "none");
const pot = path("M20 40h24l-4 17H24Z", "#bf8057");
const bolt = path("M36 9L19 35h12l-3 20 18-28H34Z", "#efc668");
export const RESOURCE_ART = {
  wood:
    path("M10 29l33-16 12 8-34 17Z") +
    path("M10 29v13l11 8V38M21 50l34-17V21", "#a77649") +
    path("M16 32l31-15M26 39l23-11", "none"),
  hardware:
    path("M17 14l25 34m-27-30 8-7M33 14l-15 37m9-36 12 2", "none") +
    path("M43 32l11 6v13l-11 6-11-6V38Z", "#a4b2a7") +
    ellipse(43, 44, 4, 5, "#fff4d3"),
  roofing:
    path("M9 25l31-13 16 27-32 13Z", "#a2b7b1") +
    path("M17 22l15 27M26 18l15 27M35 15l15 27", "none"),
  tarp:
    path("M10 18h38l7 28H16Z", "#81a99b") +
    path("M17 18l7 28M33 18l7 28", "none") +
    ellipse(44, 46, 11, 7, "#e5c184") +
    ellipse(44, 46, 6, 3, "#81a99b"),
  tank:
    rect(13, 18, 38, 32, "#86b4bc") +
    ellipse(32, 18, 19, 7, "#b6d8d1") +
    path("M14 32q18 10 36 0M14 44q18 10 36 0", "none"),
  plumbing:
    path("M13 50V24h25V13h12v23H25v14Z", "#8eafb5") +
    path("M10 45h18M33 16h20", "none"),
  sanitation:
    rect(15, 11, 26, 22, "#d3ddd0") +
    ellipse(35, 34, 19, 8, "#f5ead2") +
    path("M20 36q0 15 13 15v6h16V43", "#e9dfc7") +
    ellipse(35, 33, 11, 4, "#9cb5ab"),
  bamboo: [16, 30, 44]
    .map(
      (x) =>
        rect(x, 12, 9, 43, "#98ac61") + path(`M${x} 24h9M${x} 40h9`, "none"),
    )
    .join(""),
  earth:
    path("M8 49l10-16 12-4 8-14 10 20 9 14Z", "#bf9067") +
    path("M18 45l10-6m9 5 6-5", "none"),
  stone:
    path("M8 43l7-21 18-8 19 12 5 20-22 9Z", "#a4aaa0") +
    path("M15 22l18 12 19-8M33 34l2 21", "none"),
  salvage:
    rect(10, 24, 24, 29, "#aa976c") +
    path("M19 24V11h23v13M34 35l12-8 10 18-12 8Z", "#7b9b96") +
    path("M18 32v12m28-6 4 7", "none"),
  frames:
    path("M12 12h40v43H12Zm9 9v25h22V21Z", "#cfaa75") +
    path("M15 52l34-37", "none"),
  walls:
    rect(8, 20, 48, 33, "#d5aa7b") +
    path("M8 31h48M8 42h48M24 20v11m17 0v11M24 42v11", "none"),
  tiles:
    [0, 12, 24]
      .map((x) => path(`M${9 + x} 48V24q6-17 12 0v24Z`, "#ce8256"))
      .join("") + path("M9 35h36", "none"),
  electrical:
    ellipse(31, 34, 19, 20, "#688d87") +
    ellipse(31, 34, 10, 12, "#fff4d3") +
    path("M46 44h8V23M51 23v-7m6 7v-7", "none"),
  covering:
    path("M13 15h32l8 36H21Z", "#c4ddd1") +
    path("M20 20l21 27M28 19l15 16", "none") +
    ellipse(16, 34, 6, 20, "#e3eee0"),
  panels:
    path("M12 12h39l-6 39H6Z", "#678f9e") +
    path("M10 25h39M8 38h39M25 12l-6 39M38 12l-6 39M25 52v6h17", "none"),
  batteries:
    rect(15, 16, 34, 39, "#799e87") + rect(24, 9, 16, 7, "#b3b9a2") + bolt,
  pumps:
    rect(17, 29, 31, 22, "#7ca9aa") +
    ellipse(32, 40, 9, 9, "#d8dfc6") +
    path("M12 45H6V29h11M43 29V17h12", "none"),
  tools:
    path("M13 51l28-32M31 14l10-6 16 17-9 9Z", "#acb8aa") +
    path("M15 14l33 38M9 12l8-6 9 15-8 6Z", "#cc9a65"),
  food:
    ellipse(26, 39, 16, 15, "#d28b59") +
    leaf(26, 24) +
    path("M42 29l13 5-15 22Z", "#dfaa57") +
    path("M48 30l3-14m-3 14-7-12", "none"),
  meals:
    ellipse(32, 43, 25, 12, "#b3c5a3") +
    path("M12 37h40q-2 20-20 20T12 37", "#ece0bc") +
    ellipse(32, 36, 20, 7, "#dfa45d") +
    path("M24 26q-7-5 0-11m15 10q-7-5 0-11", "none"),
  eggs: ellipse(22, 38, 13, 18, "#f2ddae") + ellipse(43, 34, 12, 18, "#ffedc5"),
  compost:
    path("M12 27h40l-4 29H16Z", "#9a8059") +
    ellipse(32, 27, 20, 7, "#795e45") +
    leaf(32, 24),
  scraps:
    path("M12 43q5-27 18-13t23 11l-15 13Z", "#a4ad64") +
    path("M16 20q10 24 26 11q-9 23-25 4Z", "#e0bd64"),
  seedlings: pot + sprout,
  tree_starts:
    pot +
    path("M32 42V17", "none") +
    path("M16 31L23 19l-1-6 12-7 13 10-3 16Z", "#7f9f56"),
  bamboo_starts:
    pot +
    rect(28, 11, 7, 31, "#8fa65b") +
    leaf(32, 26) +
    path("M28 19h7M28 35h7", "none"),
  fodder:
    rect(9, 23, 46, 29, "#dbbd70") +
    path(
      "M23 23v29m18-29v29M14 30h4m10 13h8m11-10h4M17 17l6 6m9-11v11m14-7-5 7",
      "none",
    ),
  milk:
    path("M24 9h16v12l7 9v24H17V30l7-9Z", "#e8e8d1") +
    rect(24, 8, 16, 8, "#88aaa7") +
    rect(18, 33, 28, 13, "#b7cebe"),
  honey:
    rect(17, 20, 30, 35, "#e2b25b") +
    rect(19, 13, 26, 8, "#bd935b") +
    ellipse(32, 38, 9, 10, "#f4d48c") +
    path("M32 30l-4 9h7l-3 7", "none"),
  goats:
    path("M21 23l-9-7 1 14 10 7M43 23l9-7-1 14-10 7", "#d9c7a6") +
    path("M24 20l-5-11m21 11 5-11", "none") +
    path("M22 18h20l4 24-14 15-14-15Z", "#eee1be") +
    path("M25 32v2m14-2v2m-10 9h6", "none"),
  bees:
    ellipse(22, 22, 10, 12, "#d7e6d9") +
    ellipse(42, 22, 10, 12, "#d7e6d9") +
    ellipse(32, 37, 15, 18, "#e5bf64") +
    path("M19 30h26M18 40h28M23 49h18M27 19l-3-7m13 7 3-7", "none"),
  hens:
    path("M15 33L7 22l1 22q5 14 25 10q19-4 17-24L39 17 29 30Z", "#e4cca0") +
    path("M38 18q-7-13-11-3q-1-13 8-10q9-3 9 10", "#c57753") +
    path("M47 24l10 5-10 4Z", "#dab365") +
    ellipse(39, 25, 2, 2, "#5e624b") +
    path("M25 54v5m14-6v6", "none"),
  money:
    ellipse(27, 38, 19, 17, "#d4a95e") +
    ellipse(36, 26, 19, 17, "#efd18a") +
    path("M36 17v18m6-15q-15-7-12 5q18 0 9 8h-9", "none"),
  power: bolt,
  water:
    path("M32 8Q7 35 16 48q16 17 32 0Q57 35 32 8Z", "#85b9be") +
    path("M21 37q-3 9 6 12", "none"),
};
export function resourceIcon(id) {
  const art = RESOURCE_ART[id];
  if (!art) throw new Error(`Missing resource icon: ${id}`);
  return `<svg class="resource-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><g stroke="#59634c" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${art}</g></svg>`;
}
