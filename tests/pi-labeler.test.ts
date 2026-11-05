import test from 'node:test';
import assert from 'node:assert/strict';
import {piRpcArguments,parsePiJson} from '../scripts/pi-labeler.ts';
import {safeProviderError} from '../server/pipeline/pi-pool.ts';
import {limitedProvider} from '../server/pipeline/model-backpressure.ts';
test('Pi RPC exclusively selects EasyCLIProxy Claude and disables tool/context discovery',()=>{
 const args=piRpcArguments('claude-sonnet-4-6');
 assert.equal(args[args.indexOf('--provider')+1],'cliproxyapi');assert.equal(args[args.indexOf('--mode')+1],'rpc');
 for(const flag of ['--no-tools','--no-session','--no-context-files','--no-skills','--no-extensions'])assert.ok(args.includes(flag));
 assert.equal(args.includes('openrouter'),false);assert.equal(args.includes('--api-key'),false);
 assert.throws(()=>piRpcArguments('openrouter/claude'),/Claude model/);
});
test('Pi accepts only a complete JSON response and sanitizes provider errors',()=>{
 assert.equal(parsePiJson('```json\n{"ok":true}\n```'),'{"ok":true}');
 assert.throws(()=>parsePiJson('Here is the result: {"ok":true}'));
 const safe=safeProviderError('Bearer secret123 refresh_token=privatevalue sk-privatevalue');
 assert.equal(safe.includes('secret123'),false);assert.equal(safe.includes('privatevalue'),false);
 assert.equal(limitedProvider(new Error('Pi Claude: auth_unavailable invalid_grant')),'pi');
 assert.equal(limitedProvider(new Error('Codex 429 rate limit')),'codex');
});
