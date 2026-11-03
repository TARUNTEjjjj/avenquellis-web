// A short per-client cooldown complements the two in-flight slots in the grader.
// This limit is per isolate; the Workers Free account quota is the spending boundary.
const recent = new Map();
export function admitReview({request,env}) {
  const deny=(message,status,seconds)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store',...(seconds?{'Retry-After':String(seconds)}:{})}});
  if(env.AVENQUELLIS_HOSTED_GRADING !== 'enabled')return deny('Hosted marking is unavailable. Try on-device marking.',503);
  const origin=request.headers.get('origin');
  if(origin!==new URL(request.url).origin)return deny('Open the proof studio to request marking.',403);
  const ip=request.headers.get('CF-Connecting-IP');
  if(!ip)return deny('A Cloudflare client address is required.',403);
  const now=Date.now();
  if((recent.get(ip) || 0)>now)return deny('Wait a minute before requesting another model review.',429,60);
  if(recent.size>=2048){for(const [key,end] of recent)if(end<=now)recent.delete(key);if(recent.size>=2048)return deny('The grader is busy. Try again in a minute.',429,60);}
  recent.set(ip,now+60000);return true;
}
