/** Offline is available after a successful initial installation, subject to browser storage. */
const emit=(name,detail={})=>window.dispatchEvent(new CustomEvent(`avenquellis:${name}`,{detail}));
const localHost=location.hostname==='localhost'||location.hostname.endsWith('.localhost')||location.hostname==='[::1]'||location.hostname==='::1'||/^127(?:\.\d{1,3}){3}$/.test(location.hostname);

function status(worker) {
  return new Promise(resolve=>{
    if(!worker)return resolve(null);
    const channel=new MessageChannel();
    const timer=setTimeout(()=>{channel.port1.close();resolve(null);},3000);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
    worker.postMessage({type:'AVENQUELLIS_OFFLINE_STATUS'},[channel.port2]);
  });
}
async function register() {
  if(!window.isSecureContext||location.protocol!=='https:'||localHost||!('serviceWorker'in navigator)) {
    emit('offline-unavailable',{reason:localHost?'local-preview':'unsupported-context'});return;
  }
  try {
    const registration=await navigator.serviceWorker.register(new URL('./sw.js',import.meta.url),{scope:new URL('./',import.meta.url).pathname,updateViaCache:'none'});
    const waiting=()=>{
      if(registration.waiting)emit('offline-update-ready',{message:'An update is saved. It opens when all app windows are ready; active work stays open.',activation:'when-all-windows-safe'});
    };
    waiting();
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)waiting();});
    });
    const ready=await navigator.serviceWorker.ready;
    const saved=await status(ready.active);
    if(saved?.ready)emit('offline-ready',{version:saved.version,assetCount:saved.assetCount,message:'App assets are saved for offline use. Generating new questions and official PDFs still require internet.'});
    else emit('offline-unavailable',{reason:'snapshot-unavailable'});
    // No automatic reload, skipWaiting, or forced activation: ongoing tests stay uninterrupted.
  } catch {emit('offline-unavailable',{reason:'installation-failed'});}
}
if(document.readyState==='complete')void register();
else window.addEventListener('load',()=>void register(),{once:true});
