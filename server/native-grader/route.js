import {createPagesReviewHandler} from '../grader/pages.js';
import {admitReview} from '../admission.js';
import {getNativeGenerator} from '../native-generator/index.js';
import {getNativeGrader} from './index.js';

export function nativeProofRoute(assessmentOnly=false){
  return createPagesReviewHandler({
    assessmentOnly, admit:admitReview, loadGrader:getNativeGrader,
    async resolveQuestion({questionId,reference}){
      if(reference && Object.hasOwn(reference,'id') && reference.id !== questionId)return null;
      return (await getNativeGenerator()).resolve({...reference,id:questionId});
    }
  });
}
