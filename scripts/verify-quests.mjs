// Required Story outcomes have a deliberately small, fresh playable route.
// Run the complete alternative-building replay separately when reviewing it.
await import(process.env.SOLAR_STORY_ALL_PATHS==='1'?'./story-all-paths.mjs':'./story-planning-run.mjs');
