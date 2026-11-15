import {handwritingLimits as limits,inspectPhoto} from './lib/handwriting-image.js';

function dataUrl(blob) {
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The photo could not be opened.'));reader.readAsDataURL(blob);});
}
async function bitmap(blob) {
  if(typeof createImageBitmap==='function'){
    try{return await createImageBitmap(blob);}catch{ /* Some browsers decode additional formats through HTMLImageElement. */ }
  }
  const image=new Image();image.src=await dataUrl(blob);await image.decode();return image;
}
export async function prepareHandwritingPhoto(file) {
  if(!file || !file.size)throw new Error('Choose a photograph first.');
  if(file.size>limits.sourceBytes)throw new Error('Choose a photo smaller than 12 MiB. Crop one page if needed.');
  const raw=new Uint8Array(await file.arrayBuffer()),info=inspectPhoto(raw);
  const image=await bitmap(new Blob([raw],{type:info.type}));
  try {
    const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
    if(!width||!height||width*height>limits.sourcePixels||Math.max(width,height)>limits.sourceEdge)throw new Error('Crop one page before uploading.');
    const scale=Math.min(1,limits.uploadEdge/Math.max(width,height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('This browser cannot prepare the photo.');
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    // Re-encoding from pixels strips the original camera file's metadata and bakes in its orientation.
    const encode=quality=>new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    let photo=await encode(0.88);if(photo?.size>limits.uploadBytes)photo=await encode(0.72);
    if(!photo||photo.type!=='image/jpeg'||photo.size>limits.uploadBytes)throw new Error('Crop the photo to one page so the handwriting remains legible.');
    return {blob:photo,width:canvas.width,height:canvas.height,preview:await dataUrl(photo)};
  } finally{image.close?.();}
}

export function appendReviewedWriting(existing,addition,maxLength) {
  const text=addition.trim();if(!text)throw new Error('The transcription is empty.');
  const joined=existing+(existing && !existing.endsWith('\n')?'\n':'')+text;
  if(joined.length>maxLength)throw new Error('This text would exceed the answer limit. Shorten the transcription before adding it.');
  return joined;
}

// One check per mounted panel: whether it holds work that redrawing its page would discard.
const panels=new Set();
/** Whether a mounted panel holds a photo, or a transcription that is running or not yet added to the answer. */
export const handwritingInUse=()=>[...panels].some(inUse=>inUse());

/** Mount after a single proof response field. No image or model call is made by mounting. */
export function mountHandwriting(field) {
  if(!field || field.nextElementSibling?.hasAttribute('data-handwriting'))return;
  const panel=document.createElement('details');panel.dataset.handwriting='';panel.className='handwriting-panel';
  panel.innerHTML=`<summary>✎ Add a handwritten page</summary>
    <div class="hw-body"><p>Photograph one well-lit page or choose an image. Review powers, minus signs and fractions before adding the text to your answer.</p>
    <div class="button-group"><button type="button" class="button small secondary" data-hw-open>Choose photo</button><button type="button" class="button small ghost" data-hw-camera>Take photo</button></div>
    <input type="file" accept="image/jpeg,image/png,image/webp" data-hw-file hidden><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-hw-capture hidden>
    <p class="tiny">JPEG, PNG or WebP, up to 12 MiB. A camera opens on supported devices.</p>
    <figure data-hw-figure hidden><img alt="Selected page of handwritten work" data-hw-preview><figcaption class="tiny" data-hw-caption></figcaption></figure>
    <p class="tiny">Choosing a photo previews it on this device. <strong>Transcribe photo</strong> sends the resized page to Cloudflare Workers AI. Photos are not included in your Avenquellis drafts or backups.</p>
    <div class="button-group"><button type="button" class="button small secondary" data-hw-send disabled>Transcribe photo</button><button type="button" class="button small ghost" data-hw-clear hidden>Remove page</button></div>
    <p data-hw-status class="tiny" role="status" aria-live="polite"></p>
    <div data-hw-review hidden><label class="hw-label">Check the transcription<textarea class="text-area hw-edit" data-hw-edit maxlength="12000" spellcheck="false"></textarea></label>
    <label class="hw-confirm"><input type="checkbox" data-hw-reviewed> I checked the text and symbols against my page.</label>
    <button type="button" class="button small secondary" data-hw-append disabled>Add reviewed text to my answer</button></div>
    </div>`;
  field.insertAdjacentElement('afterend',panel);
  const get=name=>panel.querySelector(`[data-hw-${name}]`);
  const file=get('file'),capture=get('capture'),send=get('send'),remove=get('clear'),review=get('review'),edit=get('edit'),checked=get('reviewed'),append=get('append'),status=get('status'),preview=get('preview');
  let prepared=null,preparing=false,revision=0,request=null,available=null,checkingStatus=false,hasAppended=false;
  const live=()=>panel.isConnected&&field.isConnected;
  const inUse=()=>live()&&(preparing||!!request||(!!prepared&&!hasAppended));panels.add(inUse);
  const update=()=>{send.disabled=!prepared||!!request||available===false;append.disabled=!checked.checked||!edit.value.trim()||hasAppended||field.disabled||field.readOnly;};
  const resetReview=()=>{review.hidden=true;edit.value='';checked.checked=false;hasAppended=false;};
  const clear=()=>{revision++;request?.abort();request=null;prepared=null;preparing=false;preview.removeAttribute('src');get('figure').hidden=true;remove.hidden=true;file.value='';capture.value='';resetReview();update();};
  const observer=new MutationObserver(()=>{if(!live()){clear();observer.disconnect();panels.delete(inUse);}});observer.observe(document.body,{subtree:true,childList:true});
  const capability=async()=>{
    if(checkingStatus)return;checkingStatus=true;
    try{const response=await fetch('./api/transcribe',{cache:'no-store',signal:AbortSignal.timeout(8000)});available=response.ok&&(await response.json()).available===true;}
    catch{available=false;}finally{checkingStatus=false;}
    if(!live())return;update();if(!available && !request)status.textContent='Transcription is unavailable on this connection. You can continue writing your answer.';
    else if(!request&&!prepared)status.textContent='';
  };
  panel.addEventListener('toggle',()=>{if(panel.open && available!==true)void capability();});
  get('open').onclick=()=>file.click();get('camera').onclick=()=>capture.click();
  const choose=async input=>{
    const selected=input.files?.[0];if(!selected)return;
    clear();const version=revision;preparing=true;status.textContent='Preparing a private local preview…';
    try{
      const image=await prepareHandwritingPhoto(selected);if(!live()||version!==revision)return;
      prepared=image;preview.src=image.preview;get('figure').hidden=false;remove.hidden=false;
      get('caption').textContent=`Local preview · ${image.width} × ${image.height} pixels`;
      status.textContent=available===false?'Preview ready. Transcription is unavailable on this connection.':'Preview ready. Open “Transcribe photo” to send this page.';
    }catch(error){if(live()&&version===revision)status.textContent=error.message||'Choose a readable JPEG, PNG or WebP photo.';}
    finally{if(version===revision)preparing=false;}
    update();
  };
  file.onchange=()=>void choose(file);capture.onchange=()=>void choose(capture);
  remove.onclick=()=>{clear();status.textContent='Photo removed. Your answer is unchanged.';};
  send.onclick=async()=>{
    if(!prepared||request||available===false)return;
    const version=revision,controller=new AbortController();request=controller;update();status.textContent='Transcribing the selected page…';
    const timer=setTimeout(()=>controller.abort(),55000);
    try{
      const response=await fetch('./api/transcribe',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:prepared.blob,credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if(!response.headers.get('Content-Type')?.includes('application/json'))throw new Error('Transcription is unavailable on this host.');
      const result=await response.json();if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'Transcription could not finish.');
      if(typeof result.text!=='string'||!result.text.trim()||result.text.length>limits.maxText)throw new Error('The service returned no usable transcription.');
      if(!live()||version!==revision)return;
      edit.value=result.text;review.hidden=false;checked.checked=false;hasAppended=false;edit.focus();
      status.textContent='Review this draft against the photo. [unclear] marks text the model could not read.';
    }catch(error){if(live()&&version===revision)status.textContent=controller.signal.aborted?'Transcription stopped. Your answer is unchanged.':error.message||'Transcription failed.';}
    finally{clearTimeout(timer);if(request===controller)request=null;if(live()&&version===revision)update();}
  };
  edit.oninput=()=>{checked.checked=false;hasAppended=false;update();};checked.onchange=update;
  append.onclick=()=>{
    if(append.disabled||!live()||field.disabled||field.readOnly)return;
    try{
      const value=appendReviewedWriting(field.value,edit.value,field.maxLength>=0?field.maxLength:50000);
      field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));hasAppended=true;checked.checked=false;update();field.focus();
      status.textContent='Reviewed text added. You can edit it in your answer before you submit.';
    }catch(error){status.textContent=error.message;}
  };
}
