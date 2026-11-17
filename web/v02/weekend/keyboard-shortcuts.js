export const PANEL_SHORTCUTS = {KeyB: 'build', KeyJ: 'projects-panel', KeyN: 'people', KeyT: 'terrain-panel'};
export const MANAGEMENT_SHORTCUTS = {KeyI: 'resources', KeyU: 'water', KeyP: 'power', KeyM: 'finances'};
export const SPEED_SHORTCUTS = {Digit1: 1, Digit2: 4, Digit3: 8, Digit4: 16};

export function ignoreGameShortcut(event, dialogOpen = false) {
  return dialogOpen || event.defaultPrevented || event.repeat || event.isComposing ||
    event.ctrlKey || event.metaKey || event.altKey ||
    !!event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
}
