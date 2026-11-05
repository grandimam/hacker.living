import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Bookmark } from 'lucide-react';
import { useApp } from '../context';
import { buttonClass, cn, controlClass, textLinkClass } from '../lib';
import { Eyebrow, ExternalLink, Photo } from '../components/ui';
import { ProcessingMetrics } from '../components/ProcessingMetrics';
import { PlaceCard } from '../components/PlaceCard';

function useTitle(title:string){useEffect(()=>{document.title=`${title} — hacker.living`;},[title]);}
const heading='my-4 font-editorial font-medium text-[54px] leading-[.99] tracking-[-1.7px] sm:text-[68px]';

export function Saved(){
  const{places,saved}=useApp();const items=places.filter(p=>saved.has(p.id));useTitle('Your saved places');
  return <><section className="pb-8 pt-12 sm:pt-16"><Eyebrow>For another day</Eyebrow><h1 className={heading}>Your saved places<span className="text-accent">.</span></h1><p className="text-xs text-muted">Good finds, kept close. Saved on this browser.</p></section><section className="min-h-[45vh]">{items.length?<><div className="flex items-center justify-between gap-4 border-y border-rule py-4"><h2 className="font-editorial text-[27px]">{items.length} {items.length===1?'place':'places'} worth keeping</h2><Link className={cn(textLinkClass,'text-[10px]')} to="/places">Keep exploring <ArrowRight className="size-3"/></Link></div><div className="mb-10 mt-5 grid border-l border-rule sm:grid-cols-2 xl:grid-cols-3 [&>article]:border-r [&>article]:border-rule">{items.map(p=><PlaceCard key={p.id} place={p}/>)}</div></>:<div className="mx-auto max-w-md px-5 py-14 text-center"><Bookmark className="mx-auto mb-5 size-9 text-accent" strokeWidth={1.2}/><h2 className="font-editorial text-[35px] leading-none">Keep a place for later.</h2><p className="mb-6 mt-4 text-xs leading-[1.8] text-muted">Save a place that catches your eye. It’ll be waiting here when you’re ready to explore.</p><Link to="/places" className={buttonClass}>Explore places <ArrowRight className="size-3.5"/></Link></div>}</section></>;
}
export function About(){
  useTitle('About grandimam & the data');
  return <section className="mx-auto max-w-[1000px] py-10 sm:py-16">
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-16">
      <div>
        <Eyebrow>The person behind hacker.living</Eyebrow>
        <h1 className="mt-4 font-editorial text-[44px] font-normal leading-[1.08] tracking-[-.025em] sm:text-[64px]">Hi, I’m <a href="https://x.com/thegrandimam" target="_blank" rel="noopener noreferrer" className={cn(controlClass,'text-accent underline decoration-accent/25 underline-offset-8 hover:decoration-accent')}>grandimam.</a></h1>
        <p className="mt-7 max-w-[590px] text-base leading-[1.85]">I’m building hacker.living to make useful recommendations from Hacker News easier to find.</p>
        <p className="mt-4 max-w-[590px] text-sm leading-[1.9] text-muted">A museum someone loved. A typeface they use every day. Useful discoveries often sit inside a conversation, long after that conversation leaves the front page. I wanted a place to browse them, with a path back to the person who shared them.</p>
        <p className="mt-4 max-w-[590px] text-sm leading-[1.9] text-muted">My part is building the tools to collect, organize, and research these recommendations. The discoveries and the credit belong to the people who contributed them.</p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
          <ExternalLink href="https://x.com/thegrandimam" className="text-xs">Follow grandimam on X</ExternalLink>
          <ExternalLink href="https://github.com/grandimam/hacker.living" className="text-xs font-normal text-muted">View the code</ExternalLink>
        </div>
      </div>
      <aside aria-label="Get in touch" className="rounded-lg border border-rule bg-accent-soft/40 p-6">
        <span aria-hidden="true" className="grid size-11 place-items-center rounded-md bg-accent font-brand text-3xl font-semibold text-white">g</span>
        <h2 className="mt-5 font-brand text-lg font-semibold">Built by grandimam</h2>
        <p className="mt-3 text-xs leading-[1.85] text-muted">Have an idea, found a mistake, or just want to follow the build? Come say hello.</p>
        <a href="https://x.com/thegrandimam" target="_blank" rel="noopener noreferrer" className={cn(buttonClass,'mt-5 w-full justify-between text-[11px]')}>Find me on X <ArrowUpRight aria-hidden="true" className="size-4"/></a>
      </aside>
    </div>

    <section aria-labelledby="data-heading" className="mt-12 border-t border-rule pt-8 sm:mt-16">
      <Eyebrow>About the data</Eyebrow>
      <h2 id="data-heading" className="mt-3 font-editorial text-[32px] leading-tight tracking-[-.5px] sm:text-[38px]">Community recommendations, with their sources.</h2>
      <p className="mt-4 max-w-[720px] text-sm leading-[1.9] text-muted">The catalog is extracted from public Hacker News comments. Places and Fonts use the saved comments to find recommendations relevant to each collection. This is a work in progress, with incomplete coverage of HN.</p>
      <div className="mt-8 grid gap-7 sm:grid-cols-3 sm:gap-8">
        {[
          {step:'01',title:'Collect the conversations',body:<>Comments come from the <a href="https://huggingface.co/datasets/open-index/hacker-news" target="_blank" rel="noopener noreferrer" className={cn(controlClass,'text-ink underline underline-offset-2')}>open-index Hacker News archive</a> and the <a href="https://hn.algolia.com/api" target="_blank" rel="noopener noreferrer" className={cn(controlClass,'text-ink underline underline-offset-2')}>HN Search API</a>. Original source links, authors, and dates are retained.</>},
          {step:'02',title:'Find recommendations',body:<>AI helps distinguish a recommendation from a passing mention and extract its context. Summaries are paraphrases; source counts represent distinct HN comments, not votes or unique people.</>},
          {step:'03',title:'Research the details',body:<>For Places, research adds coordinates and official links where a match can be found. Font identities, official links, licenses, and specimens still need verification.</>},
        ].map(item=><div key={item.step}><span className="font-mono text-[10px] text-accent">{item.step}</span><h3 className="mt-2 text-sm font-semibold">{item.title}</h3><p className="mt-3 text-xs leading-[1.9] text-muted">{item.body}</p></div>)}
      </div>
    </section>

    <section aria-labelledby="progress-heading" className="mt-10">
      <h2 id="progress-heading" className="text-sm font-semibold">The build so far</h2>
      <p className="mt-2 text-xs leading-[1.85] text-muted">Counts below come from the saved data. A processed comment may contain no recommendation. The cost is my reported spend on the project.</p>
      <ProcessingMetrics/>
    </section>

    <div className="mt-8 grid gap-7 border-b border-rule pb-8 sm:grid-cols-2 sm:gap-12">
      <section><h2 className="text-sm font-semibold">How to read the catalog</h2><p className="mt-3 text-xs leading-[1.9] text-muted">A recommendation reflects its author’s view. A higher source count means more distinct comments in this collection; it isn’t an endorsement from HN. Current entries are research previews, and AI extraction or identity matching can be wrong. Original comments are there so you can read the context yourself.</p></section>
      <section><h2 className="text-sm font-semibold">Help make it better</h2><p className="mt-3 text-xs leading-[1.9] text-muted">Found an incorrect location, a duplicate, or a misread recommendation? Send the entry and its original HN link so I can look into it and preserve the contributor’s credit.</p><ExternalLink href="https://github.com/grandimam/hacker.living/issues/new" className="mt-4 text-[11px]">Report an issue or suggest a recommendation</ExternalLink></section>
    </div>
    <p className="mt-6 max-w-[750px] text-[10px] leading-[1.9] text-muted">Saved places stay in your browser. Maps use OpenStreetMap tiles. This is an independent project, not affiliated with or endorsed by Hacker News or Y Combinator.</p>
    <div className="mt-7 flex flex-wrap gap-6"><Link to="/places" className={cn(textLinkClass,'text-xs')}>Explore Places <ArrowRight aria-hidden="true" className="size-3.5"/></Link><Link to="/fonts" className={cn(textLinkClass,'text-xs')}>Explore Fonts <ArrowRight aria-hidden="true" className="size-3.5"/></Link></div>
  </section>;
}
export function Credits(){
  const{places}=useApp();useTitle('Photo credits');
  return <section className="mx-auto my-12 max-w-[870px] sm:my-16"><Eyebrow>Through someone else’s lens</Eyebrow><h1 className={heading}>A little credit<span className="text-accent">.</span></h1><p className="mt-6 max-w-[700px] text-sm leading-[1.9]">Real photographs of real places, shared by their photographers. Images are displayed with responsive cropping; original files and license terms are linked below.</p><div className="mt-9 grid gap-x-12 gap-y-10 border-t border-rule pt-9 sm:grid-cols-2">{places.filter(p=>p.image).map(p=><section key={p.id}><div className="mb-5 h-[200px] overflow-hidden rounded"><Photo place={p}/></div><h2 className="mb-2 font-editorial text-[30px] leading-none">{p.name}</h2><p className="text-xs leading-relaxed text-muted">{p.image!.author}</p><div className="my-3 flex flex-wrap gap-3"><ExternalLink href={p.image!.sourceUrl} className="text-[10px]">Original photograph</ExternalLink><ExternalLink href={p.image!.licenseUrl} className="text-[10px]">{p.image!.license}</ExternalLink></div><p className="text-[10px] leading-relaxed text-muted">{p.image!.modifications}</p></section>)}</div></section>;
}
export function NotFound(){useTitle('Page not found');return <section className="min-h-[65vh] py-16"><Eyebrow>Page not found</Eyebrow><h1 className={heading}>This trail ends here.</h1><p className="mb-7 mt-5 text-sm text-muted">That page isn’t in the collection.</p><Link className={buttonClass} to="/">Back to discover <ArrowRight className="size-3.5"/></Link></section>;}
