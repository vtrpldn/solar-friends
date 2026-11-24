import { brl } from "./money.js";
// Reference observations and explicit assumptions are documented separately in
// docs/economy-calibration.md. Never treat a proxy as a local supplier quote.
export const ECONOMY_REFERENCE = Object.freeze({
  region: 'Campinas, São Paulo',
  electricity: Object.freeze({baseReaisPerKwh:.739, taxAllowance:.22, capacityKw:4}),
  transport: Object.freeze({gasolineReaisPerLiter:6.47, kmPerLiter:10,
    roadKmPerHour:40, handlingMinutes:12}),
});
export const GRID_TARIFF = Math.round(ECONOMY_REFERENCE.electricity.baseReaisPerKwh /
  (1-ECONOMY_REFERENCE.electricity.taxAllowance)*100)/100;
export function tripEstimate(setting='drive') {
  const oneWayKm=({nearby:4,drive:6,remote:18})[setting]??6;
  const t=ECONOMY_REFERENCE.transport, km=oneWayKm*2;
  const liters=km/t.kmPerLiter;
  return {oneWayKm,km,liters,cost:Math.round(liters*t.gasolineReaisPerLiter*100)/100,
    minutes:km/t.roadKmPerHour*60+t.handlingMinutes};
}
export function tripEstimateText(setting){
 const q=tripEstimate(setting);
 return `${q.km} km round trip · about ${q.minutes} game minutes plus walking/parking · ${q.liters.toFixed(1)} L fuel · ${brl(q.cost)}. Fuel charged at departure; vehicle wear requires separate service materials and resident work.`;
}

// Scenario endowment after buying the land; not an income source or a price quote.
export const STARTING_CAPITAL=Object.freeze({tight:3_000, modest:10_000, comfortable:20_000});

// Scenario book values, not sale offers or current vehicle quotations.
export const STARTING_ENDOWMENT=Object.freeze({vehicles:2,bookValuePerVehicle:60000,landAlreadyOwned:true});
