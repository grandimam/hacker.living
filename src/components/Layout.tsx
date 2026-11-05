import { useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context';
import { cn, controlClass, buttonClass } from '../lib';

export function Layout() {
  const {saved,loading,error} = useApp(); const {pathname} = useLocation();const fontsView=pathname.startsWith('/fonts');
  useEffect(() => { window.scrollTo({top:0,behavior:'instant'}); },[pathname.split('/')[1]]);
  return <div className="min-h-dvh bg-paper font-sans text-sm text-ink antialiased selection:bg-accent/20 [&_button]:cursor-pointer [&_button:disabled]:cursor-wait">
    <a className="fixed -top-24 left-4 z-[3000] bg-ink p-3 text-white focus:top-3" href="#main">Skip to content</a>
    <div className="mx-auto max-w-[1512px] px-5 md:px-7 xl:px-[42px]">
      <header className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link className={cn(controlClass,'flex shrink-0 items-center gap-2 whitespace-nowrap font-brand text-[20px] font-semibold leading-none tracking-[-.9px] sm:gap-2.5 sm:text-[26px]')} to="/" aria-label="hacker.living home"><span aria-hidden="true" className="grid size-7 place-items-center rounded-[4px] bg-accent pb-0.5 text-[23px] font-semibold leading-none tracking-normal text-white sm:size-8 sm:text-[26px]">h</span>hacker.living</Link>
        </div>
        <nav aria-label="Explore collections" className="order-last flex w-full items-center gap-1 sm:order-none sm:mr-auto sm:w-auto">{[{to:'/places',label:'Places',active:!fontsView&&(pathname==='/'||pathname.startsWith('/places'))},{to:'/fonts',label:'Fonts',active:fontsView}].map(item=><Link key={item.to} to={item.to} aria-current={item.active?'page':undefined} className={cn(controlClass,'rounded px-3 py-2 text-xs',item.active?'bg-ink text-paper':'text-muted hover:text-ink')}>{item.label}</Link>)}</nav>
        <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-4 text-xs sm:gap-7">{!fontsView&&<Link to="/saved" className={cn(controlClass,'flex items-center gap-1.5 hover:text-accent')}><Bookmark aria-hidden="true" className="size-4"/><span className="sr-only sm:not-sr-only">Saved</span>{saved.size>0&&<span className="font-mono text-[9px]">{saved.size}</span>}</Link>}<NavLink className={cn(controlClass,'hover:text-accent')} to="/about">About</NavLink></nav>
      </header>
      <main id="main" tabIndex={-1} className="outline-none">{(pathname==='/about'||pathname.startsWith('/pipeline')||fontsView) ? <Outlet/> : loading ? <div role="status" className="grid min-h-[65vh] place-items-center font-editorial text-3xl">Gathering good finds…</div> : error ? <div className="py-24"><h1 className="font-editorial text-5xl">A brief pause.</h1><p className="mt-5 text-muted">{error}</p><button className={cn(buttonClass,'mt-6')} onClick={() => location.reload()}>Try again</button></div> : <Outlet/>}</main>
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule py-4 text-[9px] text-muted"><Link to="/" className={cn(controlClass,'border-r border-rule pr-5 font-brand text-[15px] font-semibold tracking-[-.5px] text-ink')}>hacker.living</Link><Link to="/credits" className={cn(controlClass,'hover:text-accent')}>Photo credits</Link><span className="max-w-52 leading-relaxed sm:ml-auto sm:max-w-none">Recommendations from the HN community. An independent project.</span></footer>
    </div>
  </div>;
}
