import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canApplyAppUpdate} from '../dist/lib/app-update-guard.js';
const idle = {ready:true,storageOK:true,session:null,completingSession:null,page:'overview'};
test('idle study dashboard can update; active tests, failed saves and editor screens defer', () => {
  assert.equal(canApplyAppUpdate(idle),true);
  for(const change of [{ready:false},{storageOK:false},{session:{submittedAt:null}},
    {completingSession:{}},{page:'proof'},{page:'generator'},{page:'bank'},{page:'arithmetic'}])
    assert.equal(canApplyAppUpdate({...idle,...change}),false,JSON.stringify(change));
  assert.equal(canApplyAppUpdate({...idle,session:{submittedAt:123}}),true);
});

// Typing is saved after a short pause, and a reload would discard it.
test('typing still waiting to be saved defers an update', async () => {
  assert.equal(canApplyAppUpdate({...idle,savePending:true}),false);
  assert.equal(canApplyAppUpdate({...idle,savePending:false}),true);
  const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  const guard = source.slice(source.lastIndexOf('window.appUpdateCanReload'));
  assert.match(guard, /savePending:\s*saves\.pending/, 'The app must report a save that is still waiting.');
});
