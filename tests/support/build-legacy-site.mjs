/** Package the five static migration assets as a self-contained Worker for the existing private Sites project. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const required=['index.html','move.js','workspace.js','sw.js'];
export async function buildSiteMigration(source,checkout){
 const assets={};for(const name of required)assets['/'+name]=await readFile(join(source,name),'utf8');
 // If there is no work on the historical Sites origin, still check the old Cloudflare origin before continuing.
 assets['/workspace-base.js']=assets['/workspace.js'];
 assets['/workspace.js']="import {migrationDestination as destination,readMigration} from './workspace-base.js';\nexport {readMigration};\nexport function migrationDestination(href){const next=new URL(destination(href));next.hostname='noether-math-lab.pages.dev';return next.href;}\n";
 assets['/index.html']=assets['/index.html'].replace('Continue to Avenquellis ↗','Check my previous Cloudflare workspace ↗');
 const worker=`const files=Object.freeze(${JSON.stringify(assets)});\n`+String.raw`export default {
  async fetch(request) {
    const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"};
    if(request.method!=='GET' && request.method!=='HEAD')return new Response('The application moved.',{status:410,headers});
    const path=new URL(request.url).pathname;
    const asset=Object.hasOwn(files,path)?path:(!path.startsWith('/api/') && !/\.[a-zA-Z0-9]+$/.test(path))?'/index.html':null;
    if(!asset)return new Response('This legacy resource has moved.',{status:410,headers});
    headers['Content-Type']=asset.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8';
    if(asset==='/sw.js')headers['Service-Worker-Allowed']='/';
    return new Response(request.method==='HEAD'?null:files[asset],{headers});
  }
};
`;
 const dist=join(checkout,'dist');await mkdir(join(dist,'server'),{recursive:true});await mkdir(join(dist,'.openai'),{recursive:true});
 const metadata=JSON.parse(await readFile(join(checkout,'.openai/hosting.json'),'utf8'));
 if(!metadata.project_id)throw Error('Existing Sites identity is required.');
 await writeFile(join(dist,'.openai/hosting.json'),JSON.stringify(metadata)+'\n');await writeFile(join(dist,'server/index.js'),worker);
 return worker;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(!process.argv[2]||!process.argv[3])throw Error('Pass migration asset directory and existing Sites checkout.');
 await buildSiteMigration(resolve(process.argv[2]),resolve(process.argv[3]));
}
