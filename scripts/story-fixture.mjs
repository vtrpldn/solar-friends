// Mechanics fixtures start after Story's unlocks; they still pay real costs.
export function unlockStory(game) {
  const fixture=JSON.parse(game.snapshot());
  fixture.village.progress.completed=[true,true,true,true];
  fixture.village.progress.later_completed=Array(9).fill(true);
  if(!game.restore(JSON.stringify(fixture)))throw new Error('Invalid story fixture');
}
