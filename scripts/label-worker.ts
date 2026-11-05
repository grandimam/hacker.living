import {getPool,transaction,closeDatabase} from '../server/db/connection.ts';
import {claimJob,completeJob,failJob,enqueueJob,type Job} from '../server/db/jobs.ts';
import {parseStoredCandidate} from '../server/db/catalog.ts';
import {CodexLabeler} from './codex-labeler.ts';
import {labelingPrompt,labelSchema,parseLabels,promptVersion} from './labeling-core.ts';
import {fileURLToPath} from 'node:url';
async function main(){
 const index=process.argv.indexOf('--max-comments'),max=index<0?Infinity:Number(process.argv[index+1]);if(!(max>0))throw new Error('--max-comments must be positive');
 const model=new CodexLabeler();let completed=0;
 try{
  await model.initialize();
  while(completed<max){
   const jobs:Job[]=[];for(let i=0;i<Math.min(15,max-completed);i++){const job=await claimJob('label_comment',`codex-${process.pid}`);if(!job)break;jobs.push(job);}if(!jobs.length)break;
   try{
    const records=await Promise.all(jobs.map(async job=>{const result=await getPool().query('SELECT payload,input_hash FROM candidates WHERE id=$1',[job.payload.candidateId]);if(!result.rows.length)throw new Error('Missing candidate');return result.rows[0];}));
    const candidates=records.map(r=>parseStoredCandidate(r.payload));
    const response=await model.classify(labelingPrompt(candidates),labelSchema,fileURLToPath(new URL('../',import.meta.url)));
    const labels=parseLabels(JSON.parse(response.text),candidates);
    await transaction(async c=>{
     for(let index=0;index<jobs.length;index++){
      const job=jobs[index],candidate=candidates[index],label=labels.find(l=>l.candidateId===candidate.id)!;
      const result=await c.query<{id:string}>('INSERT INTO labels(candidate_id,input_hash,prompt_version,model,output,usage) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(candidate_id,input_hash,prompt_version,model) DO UPDATE SET candidate_id=excluded.candidate_id RETURNING id',[candidate.id,records[index].input_hash,promptVersion,response.model,JSON.stringify(label),JSON.stringify(response.usage)]);
      const id=result.rows[0].id;
      let proposals=0;
      if(label.decision==='recommendation')for(const [ordinal,place] of label.places.entries())if(place.stance==='positive'&&place.confidence!=='low'){
       const inserted=await c.query<{id:string}>('INSERT INTO place_proposals(label_id,ordinal,name,city,country,reason,confidence) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(label_id,ordinal) DO UPDATE SET name=excluded.name RETURNING id',[id,ordinal,place.name,place.city,place.country,place.reason,place.confidence]);
       await enqueueJob('resolve_place',`proposal:${inserted.rows[0].id}`,{proposalId:inserted.rows[0].id},c);proposals++;
      }
      await c.query("UPDATE candidates SET state=$2,updated_at=now() WHERE id=$1",[candidate.id,proposals?'review':label.decision==='software'||label.decision==='not-a-place'?'rejected':'labeled']);
      await completeJob(c,job,{labelId:id,decision:label.decision,proposals});
     }
     await c.query("INSERT INTO pipeline_events(stage,message,details) VALUES('label',$1,$2)",[`Labeled ${labels.length} archive candidate comments`,JSON.stringify({model:response.model,usage:response.usage})]);
    });
    completed+=jobs.length;console.log(`Completed ${completed} comment labels`);
   }catch(error){for(const job of jobs)await failJob(job,error);throw error;}
  }
  console.log(JSON.stringify({completed,remaining:Number((await getPool().query("SELECT count(*) FROM pipeline_jobs WHERE kind='label_comment' AND state IN ('queued','running')")).rows[0].count)}));
 }finally{model.close();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Worker failed');process.exitCode=1;}).finally(closeDatabase);
