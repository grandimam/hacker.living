import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Bookmark } from 'lucide-react';
import { useApp } from '../context';
import { buttonClass, cn, controlClass, textLinkClass } from '../lib';
import { Eyebrow, ExternalLink, Photo } from '../components/ui';
import { PlaceCard } from '../components/PlaceCard';

function useTitle(title:string){useEffect(()=>{document.title=`${title} — hacker.living`;},[title]);}
const heading='my-4 font-editorial font-medium text-[54px] leading-[.99] tracking-[-1.7px] sm:text-[68px]';

export function Saved(){
  const{places,saved}=useApp();const items=places.filter(p=>saved.has(p.id));useTitle('Your saved places');
  return <><section className="pb-8 pt-12 sm:pt-16"><Eyebrow>For another day</Eyebrow><h1 className={heading}>Your next detours<span className="text-accent">.</span></h1><p className="text-xs text-muted">Good finds, kept close. Saved on this browser.</p></section><section className="min-h-[45vh]">{items.length?<><div className="flex items-center justify-between gap-4 border-y border-rule py-4"><h2 className="font-editorial text-[27px]">{items.length} {items.length===1?'place':'places'} worth keeping</h2><Link className={cn(textLinkClass,'text-[10px]')} to="/places">Keep exploring <ArrowRight className="size-3"/></Link></div><div className="mb-10 mt-5 grid border-l border-rule sm:grid-cols-2 xl:grid-cols-3 [&>article]:border-r [&>article]:border-rule">{items.map(p=><PlaceCard key={p.id} place={p}/>)}</div></>:<div className="mx-auto max-w-md px-5 py-14 text-center"><Bookmark className="mx-auto mb-5 size-9 text-accent" strokeWidth={1.2}/><h2 className="font-editorial text-[35px] leading-none">Your next detour starts here.</h2><p className="mb-6 mt-4 text-xs leading-[1.8] text-muted">Save a place that catches your eye. It’ll be waiting here when you’re ready to explore.</p><Link to="/places" className={buttonClass}>Explore places <ArrowRight className="size-3.5"/></Link></div>}</section></>;
}
export function About(){
  const{places}=useApp();useTitle('About the maker');
  const profile='https://x.com/thegrandimam';
  return <section className="mx-auto max-w-[1000px] py-10 sm:py-16">
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-16">
      <div>
        <Eyebrow>A little about the maker</Eyebrow>
        <h1 className="mt-4 font-editorial text-[38px] font-normal leading-[1.12] tracking-[-.025em] sm:text-[52px]">Hey, I’m <a href={profile} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'decoration-accent/40 underline-offset-8 hover:underline')}>grandimam</a>.</h1>
        <p className="mt-6 max-w-[590px] text-base leading-[1.85] sm:text-lg">I’m building hacker.living to turn passing recommendations on Hacker News into places you can actually go.</p>
        <p className="mt-4 max-w-[590px] text-sm leading-[1.9] text-muted">A tiny museum. A working observatory. A Victorian engine house that looks like a cathedral. Good threads are full of these discoveries; I wanted a map that makes them easier to find.</p>
      </div>
      <aside aria-label="Follow the maker" className="rounded-lg border border-rule bg-[#f2efe7] p-6 lg:mt-1">
        <span aria-hidden="true" className="grid size-11 place-items-center rounded-[4px] bg-accent pb-1 font-editorial text-[42px] leading-none text-white">h</span>
        <h2 className="mt-5 text-lg font-semibold tracking-[-.3px]">Follow along.</h2>
        <p className="mt-2 text-xs leading-[1.85] text-muted">For more from the person behind hacker.living, find me on Twitter / X.</p>
        <a href={profile} target="_blank" rel="noopener noreferrer" className={cn(buttonClass,'mt-5 w-full justify-between gap-3 text-[11px]')}>Follow grandimam <ArrowUpRight aria-hidden="true" className="size-4 shrink-0"/></a>
      </aside>
    </div>

    <section className="mt-10 border-t border-rule pt-8 sm:mt-14">
      <h2 className="font-editorial text-[30px] font-normal leading-tight tracking-[-.5px]">A map with a reason behind every pin.</h2>
      <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:gap-12">
        <div><h3 className="text-sm font-semibold">The recommendation comes with it.</h3><p className="mt-2 text-xs leading-[1.9] text-muted">Every published place links to the original HN comment and discussion, with context about why someone recommended it. Any direct quote is marked and attributed.</p></div>
        <div><h3 className="text-sm font-semibold">Small, and growing.</h3><p className="mt-2 text-xs leading-[1.9] text-muted">There are {places.length} reviewed places so far, mostly in London. New finds go through a review queue before appearing on the map, with an official website and a dated link check.</p></div>
      </div>
    </section>

    <section className="mt-9 flex flex-col items-start justify-between gap-4 border-y border-rule py-6 sm:flex-row sm:items-center sm:gap-8">
      <div><h2 className="text-sm font-semibold">Know a place that belongs here?</h2><p className="mt-1.5 text-xs leading-relaxed text-muted">Send me the place and, if you have it, the HN thread.</p></div>
      <ExternalLink href={profile} className="shrink-0 text-xs font-medium">Say hello on X</ExternalLink>
    </section>

    <details className="mt-7 text-xs text-muted">
      <summary className={cn(controlClass,'w-fit cursor-pointer hover:text-ink')}>A few practical details</summary>
      <div className="mt-4 max-w-[700px] space-y-3 leading-[1.9]">
        <p>A successful official-link check doesn’t guarantee opening hours, admission, or accessibility. Pins indicate buildings, rather than verified accessible entrances. Check the official site before travelling.</p>
        <p>Saved places stay in your browser. “Near me” asks for location when you press it, and distances are calculated locally. The map loads tiles from OpenStreetMap. No account is needed.</p>
        <p>This is an independent project, not affiliated with or endorsed by Hacker News or Y Combinator.</p>
      </div>
    </details>
    <Link to="/places" className={cn(textLinkClass,'mt-8 text-xs font-medium')}>Back to the places <ArrowRight aria-hidden="true" className="size-3.5"/></Link>
  </section>;
}
export function Credits(){
  const{places}=useApp();useTitle('Photo credits');
  return <section className="mx-auto my-12 max-w-[870px] sm:my-16"><Eyebrow>Through someone else’s lens</Eyebrow><h1 className={heading}>A little credit<span className="text-accent">.</span></h1><p className="mt-6 max-w-[700px] text-sm leading-[1.9]">Real photographs of real places, shared by their photographers. Images are displayed with responsive cropping; original files and license terms are linked below.</p><div className="mt-9 grid gap-x-12 gap-y-10 border-t border-rule pt-9 sm:grid-cols-2">{places.filter(p=>p.image).map(p=><section key={p.id}><div className="mb-5 h-[200px] overflow-hidden rounded"><Photo place={p}/></div><h2 className="mb-2 font-editorial text-[30px] leading-none">{p.name}</h2><p className="text-xs leading-relaxed text-muted">{p.image!.author}</p><div className="my-3 flex flex-wrap gap-3"><ExternalLink href={p.image!.sourceUrl} className="text-[10px]">Original photograph</ExternalLink><ExternalLink href={p.image!.licenseUrl} className="text-[10px]">{p.image!.license}</ExternalLink></div><p className="text-[10px] leading-relaxed text-muted">{p.image!.modifications}</p></section>)}</div></section>;
}
export function NotFound(){useTitle('Page not found');return <section className="min-h-[65vh] py-16"><Eyebrow>A small detour</Eyebrow><h1 className={heading}>This trail ends here.</h1><p className="mb-7 mt-5 text-sm text-muted">That page isn’t in the collection.</p><Link className={buttonClass} to="/">Back to discover <ArrowRight className="size-3.5"/></Link></section>;}
