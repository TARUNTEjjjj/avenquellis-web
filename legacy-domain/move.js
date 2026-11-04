import {migrationDestination,readMigration} from './workspace.js';
const destination=migrationDestination(location.href), link=document.getElementById('destination');link.href=destination;
const message=document.getElementById('message'),choices=document.getElementById('profiles'),recovery=document.getElementById('recovery');
function download(name,text) {
  const blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
const count=(n,one,many)=>`${n} ${n===1?one:many}`;
let result;
try{result=readMigration(localStorage);}catch{result={accessible:false,snapshots:[],issues:[],originals:{}};}
if(!result.accessible){
  message.textContent='This browser does not allow access to its saved workspace. If you used this site before, open it in the same browser profile with site storage enabled. You can also continue to Avenquellis.';
}else if(!result.snapshots.length&&!result.issues.length){
  location.replace(destination);
}else{
  message.textContent='Download your workspace, then open Your progress on Avenquellis and choose Restore backup. Your saved work on this address stays in this browser. A full restore replaces the workspace already saved at the new address.';
  document.getElementById('restore').hidden=false;
  for(const [index,entry] of result.snapshots.entries()){
    const box=document.createElement('section'),heading=document.createElement('h2'),info=document.createElement('p'),button=document.createElement('button');
    heading.textContent=entry.name+' workspace';
    const b=entry.backup,parts=[count(b.history.length,'completed test','completed tests'),count(b.reviews.length,'recorded assessment','recorded assessments'),count(b.modelReviews?.length??0,'model review','model reviews')];
    info.textContent=parts.join(' · ');
    button.type='button';if(index===0)button.id='download';button.textContent='Download '+entry.name+' backup';button.onclick=()=>download(`${entry.name.toLowerCase()}-to-avenquellis-backup.json`,JSON.stringify(b));box.append(heading,info,button);
    if(b.session){const clock=document.createElement('p');const deadline=new Date(b.session.deadline);
      clock.textContent=Number.isFinite(deadline.getTime())?`Your saved test deadline is ${deadline.toLocaleString()}. The timer continues during transfer. Restore the backup to resume the saved answers; an expired test finishes when the new site detects the saved deadline.`:'The backup contains an active test. Its saved deadline is preserved.';box.append(clock);}
    choices.append(box);
  }
  if(result.snapshots.length>1){const p=document.createElement('p');p.textContent='This browser has distinct snapshots under more than one app name. Keep each download and choose the snapshot you want to restore.';choices.prepend(p);}
  if(result.issues.length){const warning=document.createElement('p');warning.textContent='Some records could not be included in an ordinary backup: '+result.issues.join('; ')+'. Download the original records as well.';choices.append(warning);}
  if(Object.keys(result.originals).length){recovery.hidden=false;recovery.onclick=()=>download('original-practice-records.json',JSON.stringify({format:'avenquellis-local-recovery-v1',records:result.originals}));}
}
