export function syncStartingFresh(definition){definition.start.fresh_water=Math.fround((definition.start.liquids??[]).reduce((n,p)=>n+(p.contents.fresh??0),0));}
