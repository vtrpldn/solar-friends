import {verifyActivityEquipmentCycle} from './verify-activity-equipment-cycle.mjs';
const outputRoot=process.argv[2]??'assets/art-direction/character-prototype-v1';
const evidenceRevision=Number(process.argv[3]??2);
if(!Number.isSafeInteger(evidenceRevision)||evidenceRevision<1||evidenceRevision>99)throw Error('Choose an evidence revision from 1–99.');
await verifyActivityEquipmentCycle('feed',{outputRoot,evidenceRevision});
