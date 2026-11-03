/** Read only the app's known keys. The migration page never writes, deletes or transmits browser storage. */
const profiles=[
  {name:'Avenquellis',workspace:'avenquellis.workspace.v1',models:'avenquellis.prose-reviews.v1'},
  {name:'Veyra',workspace:'veyra.workspace.v1',models:'veyra.prose-reviews.v1'},
  {name:'Noether',workspace:'noether.v1',models:'noether.prose-reviews.v1'},
];
const object=x=>x!==null && typeof x==='object' && !Array.isArray(x);
const cap=(list,maximum,latestFirst=true)=>latestFirst?list.slice(0,maximum):list.slice(-maximum);
const safePath=path=>'/'+path.replace(/^(?:[/\\]|%(?:25)*(?:2f|5c))+/i,'');

export function migrationDestination(current) {
  const from=new URL(current),to=new URL('https://avenquellis.pages.dev/');
  to.pathname=safePath(from.pathname);to.pathname=to.pathname.replace(/^\/{2,}/,'/');
  to.search=from.search;
  for(const key of [...to.searchParams.keys()]) if(/token|session|secret|credential|password|^(code|state|ticket|key)$/i.test(key))to.searchParams.delete(key);
  if(!/(?:^#|[?&#])(?:access_token|id_token|code|secret|password|credential)=/i.test(from.hash))to.hash=from.hash;
  return to.href;
}

function makeBackup(workspace,models,stamp,warnings) {
  const w=workspace||{};
  const array=(key,max,last=false)=>{
    if(w[key]==null)return [];
    if(!Array.isArray(w[key])){warnings.push(key+' could not be read');return [];}
    if(w[key].length>max)warnings.push(key+' exceeds the import limit');
    return cap(w[key],max,!last);
  };
  const drafts=object(w.proofDrafts)?Object.entries(w.proofDrafts):[];
  if(drafts.length>500)warnings.push('proof drafts exceed the import limit');
  const backup={schema:'avenquellis-backup-v1',exportedAt:stamp,history:array('history',100),reviews:array('reviews',100),
    session:object(w.session)?w.session:null,proofDraft:typeof w.proofDraft==='string'?w.proofDraft:'',proofId:w.proofId??null,
    reviewQuestion:w.reviewQuestion??null,proofDrafts:Object.fromEntries(drafts.slice(-500)),proofAttemptId:w.proofAttemptId??null,bookmarks:array('bookmarks',500,true)};
  if(models!==null){if(models.length>40)warnings.push('model reviews exceed the import limit');backup.modelReviews=models.slice(0,40);}
  return backup;
}
const meaningful=w=>w.session||w.history.length||w.reviews.length||w.bookmarks.length||w.proofDraft.trim()||w.reviewQuestion||Object.values(w.proofDrafts).some(x=>typeof x==='string'&&x.trim())||w.modelReviews?.length;

export function readMigration(storage,stamp=new Date().toISOString()) {
  const snapshots=[],originals={},issues=[],seen=new Set();
  let accessible=true;
  const read=(key,test)=>{
    let raw;
    try{raw=storage.getItem(key);}catch{accessible=false;return null;}
    if(raw===null)return null;
    originals[key]=raw;
    try{const value=JSON.parse(raw);if(!test(value))throw new Error();return value;}
    catch{issues.push(key+' could not be decoded');return null;}
  };
  for(const profile of profiles){
    const w=read(profile.workspace,object),reviews=read(profile.models,Array.isArray);
    const warnings=[];const backup=makeBackup(w,reviews,stamp,warnings);
    if(!meaningful(backup))continue;
    const json=JSON.stringify(backup);
    if(seen.has(json))continue;seen.add(json);
    const size=new TextEncoder().encode(json).length;
    if(size>10_000_000){issues.push(profile.name+' workspace exceeds the new site’s 10 MB import limit');continue;}
    for(const warning of warnings)issues.push(profile.name+' '+warning);
    snapshots.push({name:profile.name,backup});
  }
  return {accessible,snapshots,issues,originals};
}
