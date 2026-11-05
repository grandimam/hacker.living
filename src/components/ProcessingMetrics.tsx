import {useEffect,useState} from 'react';
import type {ProcessingMetricsData} from '../../shared/metrics';
const number=new Intl.NumberFormat('en-US');
export function ProcessingMetrics(){
 const [data,setData]=useState<ProcessingMetricsData|null>(null),[error,setError]=useState(false);
 useEffect(()=>{
  let disposed=false,pending=false;const controller=new AbortController();
  const refresh=async()=>{
   if(pending)return;pending=true;
   try{const response=await fetch('/api/metrics',{signal:controller.signal});if(!response.ok)throw Error('Metrics unavailable');const next=await response.json() as ProcessingMetricsData;if(!disposed){setData(next);setError(false);}}
   catch{if(!disposed)setError(true);}finally{pending=false;}
  };
  void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);
  return()=>{disposed=true;controller.abort();clearInterval(timer);};
 },[]);
 const metrics=[
  {label:'Comments collected',value:data?number.format(data.collected):'—'},
  {label:'Comments processed',value:data?number.format(data.processed):'—'},
  {label:'Processing now',value:data?number.format(data.processing):'—'},
  {label:'Cost so far',value:data?`$${number.format(data.costUsd)}`:'$419'},
 ];
 return <section aria-label="Collection progress" className="my-5 border-y border-rule py-4">
  <dl className="grid grid-cols-2 gap-y-5 sm:grid-cols-4 sm:divide-x sm:divide-rule">{metrics.map(metric=><div key={metric.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pr-3 sm:justify-center sm:px-4">
   <dt className="order-2 text-[10px] text-muted">{metric.label.toLocaleLowerCase()}</dt>
   <dd className="order-1 font-mono text-sm font-medium tabular-nums tracking-tight text-ink">{metric.value}</dd>
  </div>)}</dl>
  <p className="mt-3 text-center text-[9px] text-muted" title="Processed counts unique comments analyzed for Places or Fonts. Cost reported by the maker.">{error?'Progress temporarily unavailable':data?(data.paused?(data.processing?'Paused · finishing current work':'Processing paused'):'Processing active'):'Loading progress…'}</p>
 </section>;
}
