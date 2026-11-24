// Every V2 development fixture and workbench, listed once for the main menu and
// the in-game View & options popover. Preview scenes are unsaved: they never
// load from or autosave over a village. Each opens in a new tab so the current
// village or menu stays where it was.
export const DEV_TOOL_GROUPS = [
  {
    title: "Preview scenes",
    tools: [
      ["Arrival", "./?arrival-preview", "First arrival on a fixed plot"],
      ["Wildlife", "./?wildlife-preview", "Animals around the fixed plot"],
      ["Utilities", "./?utilities-preview", "Water, power and waste in a built camp"],
      ["Utilities with interactions", "./?utilities-preview&interactions", "Same camp, residents using props"],
      ["Night lighting", "./?utilities-preview&lighting-hour=21", "Utilities camp frozen at 21:00"],
      ["Rainy lighting", "./?utilities-preview&lighting-hour=15&lighting-rain", "Utilities camp frozen in afternoon rain"],
      ["Basic needs", "./?needs-preview", "Residents with varied needs"],
      ["Rest", "./?rest-preview", "Sleep and rest behaviour"],
      ["Downtime", "./?downtime-preview", "Leisure when no work calls"],
      ["Dream lighting · all buildings", "./?scale-preview=dream", "Compare three lighting treatments across the build catalog"],
      ["Scale · village", "./?scale-preview", "Core buildings side by side"],
      ["Scale · homes", "./?scale-preview=homes", "Every home design"],
      ["Scale · new homes", "./?scale-preview=new-homes", "Library home designs"],
      ["Scale · sites", "./?scale-preview=sites", "Shared sites and facilities"],
      ["Farm look", "./?scale-preview=farm", "Every bed state, a garden and a greenhouse"],
      ["Frame timings", "./?downtime-preview&performance", "Downtime scene with a performance readout"],
    ],
  },
  {
    title: "Workbenches",
    tools: [
      ["Art collection", "../library/", "Browse every model"],
      ["Asset garden", "../land/", "Compose models on a live plot"],
      ["Model workshop", "../workshop/", "Orbit and export a single model"],
      ["Resident rehearsals", "../residents/", "Poses, walks and prop interactions"],
    ],
  },
];

export function renderDevTools(container) {
  if (!container) return;
  const summary = document.createElement("summary");
  summary.textContent = "Developer tools";
  const note = document.createElement("small");
  note.textContent = "Previews open in a new tab and never touch your saves.";
  const body = document.createElement("div");
  body.className = "dev-tools-body";
  body.append(note);
  container.replaceChildren(summary, body);
  for (const group of DEV_TOOL_GROUPS) {
    const heading = document.createElement("h3");
    heading.textContent = group.title;
    const list = document.createElement("ul");
    for (const [name, href, detail] of group.tools) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener";
      link.title = detail;
      link.textContent = `${name} ↗`;
      item.append(link);
      list.append(item);
    }
    body.append(heading, list);
  }
}
