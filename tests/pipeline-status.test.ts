import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveState } from '../scripts/pipeline-status.ts';
const now=Date.parse('2026-11-05T12:00:00Z');
test('pipeline telemetry marks activity only for recent writes and preserves idle/failure states',()=>{
  assert.equal(archiveState(0,0,0,null,now),'waiting');
  assert.equal(archiveState(239,79,0,'2026-11-05T11:59:50Z',now),'active');
  assert.equal(archiveState(239,79,0,'2026-11-05T11:58:00Z',now),'idle');
  assert.equal(archiveState(239,79,1,'2026-11-05T11:58:00Z',now),'failed');
  assert.equal(archiveState(239,79,1,'2026-11-05T11:59:50Z',now),'active');
  assert.equal(archiveState(239,239,0,'2026-11-04T12:00:00Z',now),'complete');
  assert.equal(archiveState(239,79,0,'2026-11-05T12:10:00Z',now),'idle');
});
