import {createPagesReviewHandler} from '../../server/grader/pages.js';
import {resolveQuestionRef} from '../../dist/lib/questions.js';
import {admitReview} from '../../server/admission.js';
export const onRequest = createPagesReviewHandler({
  resolveQuestion:({questionId,reference})=>resolveQuestionRef({...reference,id:questionId}),
  admit:admitReview
});
