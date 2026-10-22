export function mergeResidentCredits(...sources){
  const credits=[],seen=new Set();
  for(const source of sources){
    if(!Array.isArray(source)||source.length>16)throw Error('This resident has unsupported source credits. Keep the original file.');
    for(const credit of source){
      if(!credit||Object.keys(credit).some(key=>!['release','revision','author'].includes(key))||typeof credit.release!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(credit.release)||!Number.isInteger(credit.revision)||credit.revision<1||credit.revision>0xffffffff||typeof credit.author!=='string'||!credit.author.trim()||[...credit.author].length>80)throw Error('This resident has unsupported source credits. Keep the original file.');
      const key=JSON.stringify([credit.release,credit.revision,credit.author]);
      if(!seen.has(key)){seen.add(key);credits.push(structuredClone(credit));}
    }
  }
  if(credits.length>16)throw Error('This resident already has the maximum source credits. Keep the original file; no credits were removed.');
  return credits;
}

export function residentFromPackage(file){
  if(file?.format!=='solar-friends-resident'||![1,2].includes(file.schema))throw Error('This resident package is unsupported. Keep the original file.');
  const resident=structuredClone(file.resident);
  const credits=mergeResidentCredits(resident.source_credits??[],file.credits??[],file.schema===2?[{release:file.id,revision:file.content_revision,author:file.author}]:[]);
  if(credits.length)resident.source_credits=credits;
  return resident;
}
