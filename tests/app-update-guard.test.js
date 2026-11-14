import test from 'node:test';
import assert from 'node:assert/strict';
import {canApplyAppUpdate} from '../dist/lib/app-update-guard.js';
const idle = {ready:true,storageOK:true,session:null,completingSession:null,page:'overview'};
test('idle study dashboard can update; active tests, failed saves and editor screens defer', () => {
  assert.equal(canApplyAppUpdate(idle),true);
  for(const change of [{ready:false},{storageOK:false},{session:{submittedAt:null}},
    {completingSession:{}},{page:'proof'},{page:'generator'},{page:'bank'},{page:'arithmetic'}])
    assert.equal(canApplyAppUpdate({...idle,...change}),false,JSON.stringify(change));
  assert.equal(canApplyAppUpdate({...idle,session:{submittedAt:123}}),true);
});
