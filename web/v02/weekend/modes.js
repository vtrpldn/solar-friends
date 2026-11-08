export const STORY_SAVE = "solar-friends-v02-first-weekend-2";
export const SANDBOX_SAVE = "solar-friends-v02-sandbox-1";
export const saveKey = (mode) =>
  mode === "sandbox" ? SANDBOX_SAVE : STORY_SAVE;
