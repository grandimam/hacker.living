import test from 'node:test';
import assert from 'node:assert/strict';
import {fontNameKey,fontPrompt,parseFontLabels} from '../server/fonts/core.ts';
import type {Candidate} from '../scripts/pipeline-data.ts';
const candidate={id:'c1',evidence:{text:'I prefer Iosevka in my terminal for its clear glyphs.',storyTitle:'Fonts'}} as Candidate;
const font={name:'Iosevka',stance:'positive',confidence:'high',reason:'Prefers the glyph clarity in a terminal.',quote:'I prefer Iosevka',contexts:['terminal'],features:['clear glyphs']};
const output=()=>({labels:[{candidateId:'c1',decision:'recommendation',fonts:[{...font}]}]});
test('font extraction preserves exact evidence and requires complete, unambiguous IDs',()=>{
 assert.equal(parseFontLabels(output(),[candidate])[0].fonts[0].name,'Iosevka');
 assert.throws(()=>parseFontLabels({labels:[]},[candidate]),/Missing candidate/);
 const duplicate=output();duplicate.labels.push(duplicate.labels[0]);assert.throws(()=>parseFontLabels(duplicate,[candidate]),/duplicate/);
 const wrong=output();wrong.labels[0].candidateId='c2';assert.throws(()=>parseFontLabels(wrong,[candidate]),/Unexpected/);
 const invented=output();invented.labels[0].fonts[0].quote='The best typeface';assert.throws(()=>parseFontLabels(invented,[candidate]),/exact source/);
 const neutral=output();neutral.labels[0].fonts[0].stance='neutral';assert.throws(()=>parseFontLabels(neutral,[candidate]),/without a positive/);
 const invalid=output();invalid.labels[0].fonts[0].contexts=['tourism'];assert.throws(()=>parseFontLabels(invalid,[candidate]),/Invalid font enum/);
});
test('font identities merge case and whitespace conservatively, keeping variants distinct',()=>{
 assert.equal(fontNameKey('  Fira   Code '),fontNameKey('fira code'));
 assert.notEqual(fontNameKey('Fira Code'),fontNameKey('Fira Mono'));
 assert.match(fontPrompt([candidate]),/licenses/);assert.match(fontPrompt([candidate]),/untrusted data/);
 const long={...candidate,evidence:{...candidate.evidence,text:Array(26).fill('word').join(' ')}};
 const data=output();data.labels[0].fonts[0].quote=long.evidence.text;assert.throws(()=>parseFontLabels(data,[long]),/25 quoted words/);
});
