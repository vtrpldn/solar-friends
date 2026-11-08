import { freshLandSeed } from "./land-layout.js";
import { createWeekend, createSandbox, save, restore, beginArrival } from "./simulation.js";
import { saveKey } from "./modes.js";
const $ = (id) => document.getElementById(id);
let pending = null;
function existing(mode) {
  try {
    return restore(localStorage.getItem(saveKey(mode)));
  } catch {
    return null;
  }
}
function enter(mode) {
  location.href = `./?mode=${mode}`;
}
const story = existing("story"),
  sandbox = existing("sandbox");
$("continue-game").hidden = !story;
$("continue-sandbox").hidden = !sandbox;
if (!story)
  document.querySelector('[data-start="story"]').classList.add("primary");
if (story)
  $("continue-label").textContent =
    story.stage === "arrival"
      ? "Choose a place for your tents."
      : `${story.projects.length} ${story.projects.length === 1 ? "project" : "projects"} · R$${story.money.toFixed(2)} shared savings`;
$("continue-game").onclick = () => enter("story");
$("continue-sandbox").onclick = () => enter("sandbox");
function start(mode) {
  try {
    localStorage.setItem(
      saveKey(mode),
      save(
        beginArrival(mode === "sandbox"
          ? createSandbox(freshLandSeed())
          : createWeekend(freshLandSeed())),
      ),
    );
    enter(mode);
  } catch {
    $("menu-status").textContent =
      "This browser could not save your village. Allow local storage and try again.";
  }
}
document.querySelectorAll("[data-start]").forEach(
  (b) =>
    (b.onclick = () => {
      pending = b.dataset.start;
      if (existing(pending)) {
        $("replace-copy").textContent =
          `This replaces your ${pending === "sandbox" ? "sandbox" : "story"} save. Your other mode is kept.`;
        $("replace-save").showModal();
      } else start(pending);
    }),
);
$("cancel-new").onclick = () => $("replace-save").close();
$("confirm-new").onclick = () => start(pending);
