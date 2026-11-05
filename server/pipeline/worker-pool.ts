import {stages,type Stage,type StageConfig} from './control.ts';

export type StageCapacity=Record<Stage,number>;
/** Independent admission per stage: an upstream call never blocks a downstream queue. */
export async function runStagePool(options:{
 capacities:StageCapacity;
 read:()=>Promise<{config:StageConfig;work:Record<Stage,boolean>;capacities?:StageCapacity}>;
 perform:(stage:Stage)=>Promise<unknown>;
 active:(counts:StageCapacity)=>Promise<void>;
 wait?:()=>Promise<void>;
}){
 const running=new Set<Promise<void>>(),counts:StageCapacity={collect:0,label:0,enrich:0};
 let failure:unknown;
 try{
  for(;;){
   if(failure)throw failure;
   const {config,work,capacities=options.capacities}=await options.read();
   for(const stage of stages){
    if(!config[stage]||!work[stage])continue;
    while(counts[stage]<capacities[stage]){
     counts[stage]++;
     let task:Promise<void>;
     task=Promise.resolve().then(()=>options.perform(stage)).then(()=>{},error=>{failure??=error;}).finally(()=>{counts[stage]--;running.delete(task);});
     running.add(task);
    }
   }
   await options.active({...counts});
   if(!running.size)break;
   await (options.wait?.()??new Promise(resolve=>setTimeout(resolve,1000)));
  }
 }finally{
  // Never close model sockets or release the run lock while a result is saving.
  await Promise.all(running);
 }
 if(failure)throw failure;
}
