import {useEffect,useState} from 'react';
export function ProviderPools(){
 const [pools,setPools]=useState<{id:string;provider:string;model:string;workers:number;active:number;state:string;last_error:string|null}[]>([]);
 useEffect(()=>{let disposed=false,pending=false;const controller=new AbortController();const poll=async()=>{if(pending)return;pending=true;try{const response=await fetch('/api/pipeline/provider-pools',{signal:controller.signal});if(response.ok){const data=await response.json();if(!disposed)setPools(data.pools);}}catch{}finally{pending=false;}};void poll();const timer=setInterval(()=>{if(document.visibilityState==='visible')void poll();},5000);return()=>{disposed=true;controller.abort();clearInterval(timer);};},[]);
 if(!pools.length)return null;
 return <aside aria-label="Additional model workers" className="my-5 space-y-2 rounded border border-rule bg-white/20 px-4 py-3">{pools.map(pool=><div key={pool.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]"><p>Pi · EasyCLIProxy · <span className="font-mono text-[10px]">{pool.model.split('/').at(-1)}</span></p><p className="text-muted">{pool.active} active / {pool.workers} slots · {pool.state}{pool.state==='blocked'&&' · waiting for Claude authentication'}</p></div>)}</aside>;
}
