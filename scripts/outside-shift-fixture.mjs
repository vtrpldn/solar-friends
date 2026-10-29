import assert from 'node:assert/strict';
// Author ordinary public resident fields; never inject a task, trip or runtime
// clock state. The simulation must independently send every person to work.
export function outsideShiftFixture(game,definition){
 const value=structuredClone(definition),jobs=JSON.parse(game.scenario_catalog()).occupations.filter(j=>j.key!=='none');assert(jobs.length);
 value.title='Outside shifts · automatic time';value.start.minutes=540;
 value.start.resident_setup=value.start.residents.map(p=>({resident:p.id,needs:{energy:90,hunger:20,social:90}}));
 let expectedIncome=0;
 for(const [i,p]of value.start.residents.entries()){const job=jobs[i%jobs.length];p.occupation=job.key;p.outside_shifts=true;expectedIncome+=job.income;}
 const validation=JSON.parse(game.validate_scenario(JSON.stringify(value)));assert(validation.ok,JSON.stringify(validation.issues.filter(i=>i.severity==='error').slice(0,4)));
 return {definition:value,expectedIncome};
}
