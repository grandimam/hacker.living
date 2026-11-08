import {useEffect,useState} from 'react';
import {Link,useLocation,useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,ArrowUpRight,Globe2,MessageCircle} from 'lucide-react';
import type {Website} from '../../shared/websites';
import {cn,controlClass,formatDate} from '../lib';
import {websiteCollectionReturn} from '../website-navigation';

export default function WebsiteComments(){
 const {websiteId}=useParams(),location=useLocation(),navigate=useNavigate();
 const returnTo=websiteCollectionReturn(location.state);
 const [website,setWebsite]=useState<Website|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[missing,setMissing]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{
  const abort=new AbortController();setLoading(true);setError('');setMissing(false);setWebsite(null);document.title='HN comments — hacker.living';
  void (async()=>{try{
   const response=await fetch(`/api/websites/${encodeURIComponent(websiteId??'')}`,{signal:abort.signal});
   if(abort.signal.aborted)return;
   if(response.status===404){setMissing(true);return;}
   if(!response.ok)throw Error('These comments could not load. Try again shortly.');
   const data=await response.json() as Website;if(!abort.signal.aborted){setWebsite(data);document.title=`HN comments on ${data.name} — hacker.living`;}
  }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:String(e));}finally{if(!abort.signal.aborted)setLoading(false);}})();
  return()=>abort.abort();
 },[websiteId,revision]);
 return <section className="mx-auto max-w-[800px] py-9 sm:py-14">
  <Link to={returnTo??'/websites'} onClick={event=>{if(returnTo&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.button===0){event.preventDefault();navigate(-1);}}} className={cn(controlClass,'inline-flex items-center gap-2 text-xs text-muted hover:text-accent')}><ArrowLeft className="size-4"/>Back to Websites</Link>
  {loading?<p role="status" className="py-16 text-muted">Loading HN comments…</p>:missing?<div className="py-14"><h1 className="font-brand text-3xl font-semibold">This website isn’t in the collection.</h1><p className="mt-4 text-sm leading-relaxed text-muted">It may no longer have a recommendation that meets this collection’s criteria.</p></div>:error?<div role="alert" className="my-10 rounded-xl bg-accent-soft p-5"><p className="text-sm">{error}</p><button onClick={()=>setRevision(v=>v+1)} className={cn(controlClass,'mt-3 text-xs underline')}>Try again</button></div>:website&&<>
   <header className="mt-8 border-b border-rule/60 pb-8"><div className="flex flex-wrap items-start justify-between gap-5"><div className="min-w-0 flex-1"><p className="flex items-center gap-2 text-xs text-muted"><Globe2 className="size-4 shrink-0"/><span className="break-all">{website.hostname}</span></p><h1 className="mt-3 break-words font-brand text-[34px] font-semibold leading-tight tracking-[-1px] sm:text-[44px]">{website.name}</h1></div><a href={website.url} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'inline-flex items-center gap-2 rounded-xl border border-rule px-4 py-3 text-xs hover:bg-white')}>Visit website<ArrowUpRight className="size-4"/></a></div><p className="mt-5 text-sm leading-relaxed text-muted">What people on Hacker News said about this website’s visual design.</p><p className="mt-3 text-[11px] text-muted">Draft collection · {website.linkCheck?`Link last checked ${formatDate(website.linkCheck.checkedAt)}${website.linkCheck.status?` (HTTP ${website.linkCheck.status})`:'; check unsuccessful'}`:'Website not independently visited or verified'}</p></header>
   <div className="mb-1 mt-7 flex items-center gap-2"><MessageCircle className="size-4 text-accent"/><h2 className="text-sm font-medium">{website.sourceCount} HN {website.sourceCount===1?'comment':'comments'}</h2></div>
   <div className="divide-y divide-rule/60">{website.recommendations.map(source=><article id={`comment-${source.commentId}`} key={source.commentId} className="py-7 sm:py-8">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><a href={source.url} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'text-sm font-semibold hover:text-accent')}>{source.author??'An HN member'}</a><time dateTime={source.date} className="text-xs text-muted">{formatDate(source.date)}</time></div>
    {source.quote&&<div className="mt-5"><p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">From the original comment</p><blockquote className="border-l-2 border-accent/40 pl-4 text-base leading-[1.8] sm:text-lg">“{source.quote}”</blockquote></div>}
    <div className="mt-5"><p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">Recommendation summary · paraphrased</p><p className="text-sm leading-relaxed text-ink/75">{source.reason}</p></div>
    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-xs"><a href={source.url} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'inline-flex items-center gap-1 text-accent hover:underline')}>Read full HN comment<ArrowUpRight className="size-3"/></a><a href={source.discussionUrl} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'text-muted hover:text-accent hover:underline')}>View discussion</a><a href={source.recommendedUrl} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'text-muted hover:text-accent hover:underline')}>Original shared link</a></div>
   </article>)}</div>
   <p className="border-t border-rule/60 pt-5 text-[11px] leading-relaxed text-muted">These are excerpts from individual HN members, with links to the full comments. Summaries are paraphrases. Comment counts are distinct sources, not votes or community consensus.</p>
  </>}
 </section>;
}
