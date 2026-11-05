import {claimLabelBatch} from './claim-labels.ts';
import {fileURLToPath} from 'node:url';
import {getPool,transaction} from '../db/connection.ts';
import {completeJob,failJob,enqueueJob} from '../db/jobs.ts';
import {parseStoredCandidate} from '../db/catalog.ts';
import {CodexLabeler} from '../../scripts/codex-labeler.ts';
import {labelingPrompt,labelSchema,parseLabels,promptVersion} from '../../scripts/labeling-core.ts';
import {runEvent} from './runs.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
export async function labelRun(runId:string,model:Pick<CodexLabeler,'classify'>,guard:()=>Promise<void>=async()=>{},maxBatches=Infinity,coverage=false,workerId=`date-label-${runId}`){
 let batchSize=15,batches=0;
 for(;;){
  if(batches>=maxBatches)return batches;
  await guard();
  const jobs=await claimLabelBatch(runId,'label_comment',promptVersion,workerId,batchSize,coverage);
  if(!jobs.length)return batches;
  batches++;
  try{
   const found=(await getPool().query('SELECT id,payload,input_hash FROM candidates WHERE id=ANY($1::text[])',[jobs.map(job=>job.payload.candidateId)])).rows;
   const records=jobs.map(job=>found.find(row=>row.id===job.payload.candidateId)!);
   const candidates=records.map(r=>parseStoredCandidate(r.payload));
   await runEvent(runId,'label',`Codex reading ${candidates.length} comments (${coverage?'coverage':'recommendation priority'})`);
   // Short, request-local IDs avoid transcription errors on hashed database IDs.
   const inputs=candidates.map((candidate,index)=>({...candidate,id:`c${index+1}`}));
   const ids=new Map(inputs.map((input,index)=>[input.id,candidates[index].id]));
   const response=await model.classify(labelingPrompt(inputs),labelSchema,root);
   const labels=parseLabels(JSON.parse(response.text),inputs).map(label=>({...label,candidateId:ids.get(label.candidateId)!}));
   for(let i=0;i<jobs.length;i++){
    await transaction(async c=>{
     const candidate=candidates[i],label=labels.find(l=>l.candidateId===candidate.id)!;
     const inserted=await c.query('INSERT INTO labels(candidate_id,input_hash,prompt_version,model,output,usage) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(candidate_id,input_hash,prompt_version,model) DO UPDATE SET candidate_id=excluded.candidate_id RETURNING id',[candidate.id,records[i].input_hash,promptVersion,response.model,JSON.stringify(label),JSON.stringify(response.usage)]);
     let proposals=0;
     if(label.decision==='recommendation')for(const [ordinal,place]of label.places.entries())if(place.stance==='positive'&&place.confidence!=='low'){
      const proposal=(await c.query('INSERT INTO place_proposals(label_id,ordinal,name,city,country,reason,confidence) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(label_id,ordinal) DO UPDATE SET name=excluded.name RETURNING id',[inserted.rows[0].id,ordinal,place.name,place.city,place.country,place.reason,place.confidence])).rows[0].id;
      await enqueueJob('resolve_place',`proposal:${proposal}`,{proposalId:proposal},c);proposals++;
     }
     await c.query("UPDATE candidates SET state=$2,updated_at=now() WHERE id=$1",[candidate.id,proposals?'review':['software','not-a-place'].includes(label.decision)?'rejected':'labeled']);
     await completeJob(c,jobs[i],{labelId:inserted.rows[0].id,decision:label.decision,proposals});
    });
   }
   await runEvent(runId,'label',`Labeled ${labels.length} comments`,{model:response.model,threadId:response.threadId,usage:response.usage});
  }catch(error){for(const job of jobs)await failJob(job,error);batchSize=1;await runEvent(runId,'label',`Batch needs retry: ${error instanceof Error?error.message:String(error)}`);}
 }
 return batches;
}
