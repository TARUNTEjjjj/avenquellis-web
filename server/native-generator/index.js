import {loadModule} from '#generator-module';
import {createNativeGenerator} from './adapter.mjs';

let instance;
export function getNativeGenerator() {
  if(!instance) instance=Promise.resolve().then(loadModule).then(createNativeGenerator).catch(error=>{
    instance=undefined;
    throw error;
  });
  return instance;
}
