import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function loadModule() {
  const [bytes,raw]=await Promise.all(['avenquellis-questions.wasm','manifest.json'].map(name=>readFile(new URL(name,import.meta.url))));
  const manifest=JSON.parse(raw);
  if(bytes.length!==manifest.bytes || createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Native generator artifact mismatch.');
  return WebAssembly.compile(bytes);
}
