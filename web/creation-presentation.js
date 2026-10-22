// Created scenarios use Sandbox simulation rules internally, but the player
// should see the authored community and journal rather than campaign labels.
export function creationPresentation(definition,{playtest=false}={}){
 if(!definition)return null;
 return {title:definition.title,badge:playtest?'Playtest':definition.journal?'Scenario':'Created village',
  intro:definition.journal?'Follow this village’s journal. Building availability and goals follow its authored chapters; supplies, resident work and other simulation rules follow the saved scenario.':'This created village follows its saved starting conditions and simulation rules. It has no authored journal.',
  start:playtest?'<b>Try your creation.</b> Use the regular game controls to plan, trade and guide the village. Save checkpoint keeps this playtest; Return to editor restores the separate draft.':'<b>Shape this village.</b> Use Build to plan work, Village to review supplies and services, and Journal for any authored goals. Your saved village is independent of its source creation.'};
}
