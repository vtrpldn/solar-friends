// The one place browser checks get Chromium from.
//
// Run on its own, a check launches a private headless Chromium. Under `scripts/check.mjs` the runner
// launches Chromium once and passes its address in CHECK_BROWSER_WS; each check then connects to it and
// gets fresh, isolated contexts, and `browser.close()` only closes that check's contexts.
import {chromium} from 'playwright';

// SOLAR_RENDERER picks the ANGLE backend (for example `swiftshader` to reproduce CI's software WebGL).
// Otherwise macOS uses the GPU through Metal and Linux, which has no GPU in CI, uses SwiftShader.
const renderer=process.env.SOLAR_RENDERER||{darwin:'metal',linux:'swiftshader'}[process.platform];
export const browserArgs=['--mute-audio',...(renderer?[`--use-angle=${renderer}`]:[]),...(renderer==='swiftshader'?['--enable-unsafe-swiftshader']:[])];
export const launchOptions={headless:true,args:browserArgs};

export function launchBrowser(){
  const shared=process.env.CHECK_BROWSER_WS;
  return shared?chromium.connect(shared):chromium.launch(launchOptions);
}
