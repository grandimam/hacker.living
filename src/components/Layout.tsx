import { useEffect } from 'react';
import { Bookmark, Search } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context';
import { cn, controlClass, buttonClass } from '../lib';

export function Layout() {
  const {saved,loading,error} = useApp(); const {pathname,hash} = useLocation();const independentView=pathname==='/'||pathname==='/about'||pathname.startsWith('/fonts')||pathname.startsWith('/websites')||pathname.startsWith('/pipeline');
  useEffect(() => {
    const frame=requestAnimationFrame(()=>{const anchor=hash?document.getElementById(hash.slice(1)):null;if(anchor)anchor.scrollIntoView();else window.scrollTo({top:0,behavior:'instant'});});
    return()=>cancelAnimationFrame(frame);
  },[pathname,hash]);
  return <div className="min-h-dvh bg-paper font-sans text-sm text-ink antialiased selection:bg-accent/20 [&_button]:cursor-pointer [&_button:disabled]:cursor-wait">
    <a className="fixed -top-24 left-4 z-[3000] bg-ink p-3 text-white focus:top-3" href="#main">Skip to content</a>
    <div className="mx-auto max-w-[1512px] px-5 md:px-7 xl:px-[42px]">
      <header className="mx-auto flex min-h-[84px] max-w-[1120px] flex-wrap items-center justify-between gap-3 py-4">
        <Link className={cn(controlClass,'flex shrink-0 items-center gap-2.5 whitespace-nowrap font-brand text-[23px] font-semibold leading-none tracking-[-1px] sm:text-[27px]')} to="/" aria-label="hacker.living home"><span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-accent pb-0.5 text-[29px] font-medium leading-none tracking-normal text-white">h</span>hacker.living</Link>
        <nav aria-label="Main navigation" className="order-last flex w-full items-center justify-center gap-2 sm:order-none sm:w-auto sm:gap-3">{[{to:'/',label:'Discover',active:pathname==='/'&&!hash},{to:'/#collections',label:'Collections',active:hash==='#collections'||['/places','/fonts','/websites'].some(p=>pathname.startsWith(p))},{to:'/about',label:'About',active:pathname==='/about'}].map(item=><Link key={item.label} to={item.to} aria-current={item.active?'page':undefined} className={cn(controlClass,'rounded-xl px-4 py-2.5 text-sm',item.active?'bg-ink text-paper':'hover:bg-ink/5')}>{item.label}</Link>)}</nav>
        <div className="flex items-center gap-4 sm:gap-6"><Link to="/websites" aria-label="Search websites" className={cn(controlClass,'hover:text-accent')}><Search className="size-5" strokeWidth={1.7}/></Link><Link to="/saved" aria-label={`Saved places${saved.size?`: ${saved.size}`:''}`} className={cn(controlClass,'relative hover:text-accent')}><Bookmark className="size-5" strokeWidth={1.7}/>{saved.size>0&&<span className="absolute -right-2 -top-2 rounded-full bg-accent px-1 text-[9px] text-white">{saved.size}</span>}</Link></div>
      </header>
      <main id="main" tabIndex={-1} className="outline-none">{independentView ? <Outlet/> : loading ? <div role="status" className="grid min-h-[65vh] place-items-center font-editorial text-3xl">Gathering good finds…</div> : error ? <div className="py-24"><h1 className="font-editorial text-5xl">A brief pause.</h1><p className="mt-5 text-muted">{error}</p><button className={cn(buttonClass,'mt-6')} onClick={() => location.reload()}>Try again</button></div> : <Outlet/>}</main>
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule py-4 text-[9px] text-muted"><Link to="/" className={cn(controlClass,'border-r border-rule pr-5 font-brand text-[15px] font-semibold tracking-[-.5px] text-ink')}>hacker.living</Link><Link to="/credits" className={cn(controlClass,'hover:text-accent')}>Photo credits</Link><a href="https://x.com/thegrandimam" target="_blank" rel="noopener noreferrer" className={cn(controlClass,'hover:text-accent')}>Organized by grandimam</a>{import.meta.env.DEV&&<Link to="/pipeline/websites" className={cn(controlClass,'hover:text-accent')}>Websites pipeline</Link>}<span className="max-w-52 leading-relaxed sm:ml-auto sm:max-w-none">Recommendations from individual HN members. Independent of HN and Y Combinator.</span></footer>
    </div>
  </div>;
}
