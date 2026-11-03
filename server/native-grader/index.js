import {loadGraderModule} from '#avenquellis-grader-module';
import {instantiateGrader} from '../../dist/lib/native-grade/runtime.js';
let loading;
export function getNativeGrader(){
  if(!loading)loading=Promise.resolve().then(loadGraderModule).then(instantiateGrader).catch(error=>{loading=undefined;throw error;});
  return loading;
}
