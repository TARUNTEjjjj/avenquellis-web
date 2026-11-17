/**
 * The key the per-address limits count by. One IPv6 client controls every address in its /64 network, so
 * those addresses count as one. An IPv4 address counts by itself, also when written as an IPv4-mapped IPv6
 * address, and so does a Teredo address, whose /64 names a relay shared by many clients. Text that is not
 * an address is its own key.
 */
export function clientKey(address) {
  const text=String(address).trim().toLowerCase();
  if(!text.includes(':'))return text;
  const halves=text.split('::');if(halves.length>2)return text;
  const head=halves[0]?halves[0].split(':'):[],tail=halves[1]?halves[1].split(':'):[],end=tail.length?tail:head;
  const quad=end.at(-1)?.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  if(quad){if(quad.some(part=>part>255))return text;end.splice(-1,1,(quad[0]<<8|quad[1]).toString(16),(quad[2]<<8|quad[3]).toString(16));}
  const missing=8-head.length-tail.length;
  if(halves.length===2?missing<1:missing!==0)return text;
  const groups=[...head,...Array(missing).fill('0'),...tail];
  if(!groups.every(group=>/^[0-9a-f]{1,4}$/.test(group)))return text;
  const words=groups.map(group=>parseInt(group,16)),hex=list=>list.map(word=>word.toString(16)).join(':');
  if(words.slice(0,5).every(word=>word===0)&&words[5]===0xffff)return [words[6]>>8,words[6]&255,words[7]>>8,words[7]&255].join('.');
  return words[0]===0x2001&&words[1]===0?hex(words):hex(words.slice(0,4))+'::/64';
}
