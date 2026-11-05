/** Queue workers can outnumber model calls; avoid bursting the shared Codex server. */
export class ModelAdmission {
 private active=0;private successes=0;private blockedUntil=0;
 private waiting:{resolve:()=>void;reject:(error:Error)=>void}[]=[];
 constructor(private limit=8,private maximum=100,private now=()=>Date.now()){}
 private drain(){
  if(this.now()<this.blockedUntil){for(const waiter of this.waiting.splice(0))waiter.reject(Error('Codex rate limit cooldown'));return;}
  while(this.active<this.limit&&this.waiting.length){this.active++;this.waiting.shift()!.resolve();}
 }
 async run<T>(operation:()=>Promise<T>):Promise<T>{
  await new Promise<void>((resolve,reject)=>{this.waiting.push({resolve,reject});this.drain();});
  try{
   const result=await operation();if(++this.successes%32===0)this.limit=Math.min(this.maximum,this.limit+1);return result;
  }catch(error){
   if(/rate.?limit|429|overloaded|capacity/i.test(String(error))){this.limit=Math.max(1,Math.floor(this.limit/2));this.blockedUntil=this.now()+300000;this.successes=0;}
   throw error;
  }finally{this.active--;this.drain();}
 }
}
