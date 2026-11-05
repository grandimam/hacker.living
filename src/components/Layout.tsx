import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { useApp } from '../context';
import { cn, controlClass, buttonClass } from '../lib';

export function Layout() {
  const {saved,loading,error} = useApp(); const {pathname} = useLocation();
  useEffect(() => { window.scrollTo({top:0,behavior:'instant'}); },[pathname.split('/')[1]]);
  return <div className="min-h-dvh bg-paper font-sans text-sm text-ink antialiased selection:bg-accent/20 [&_button]:cursor-pointer [&_button:disabled]:cursor-wait">
    <a className="fixed -top-24 left-4 z-[3000] bg-ink p-3 text-white focus:top-3" href="#main">Skip to content</a>
    <div className="mx-auto max-w-[1512px] px-5 md:px-7 xl:px-[42px]">
      <header className="flex min-h-[68px] items-center justify-between gap-3 border-b border-rule py-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link className={cn(controlClass,'flex shrink-0 items-center gap-2.5 whitespace-nowrap font-editorial text-[24px] font-semibold tracking-[-1px] sm:text-[29px]')} to="/" aria-label="hacker.living home"><span aria-hidden="true" className="grid h-8 w-[29px] place-items-center rounded-[2px] bg-accent pb-1 text-[33px] font-normal leading-none tracking-normal text-white">h</span>hacker.living</Link>
          <span aria-hidden="true" className="hidden text-xl font-light text-muted sm:inline">/</span>
          <Link to="/" aria-current={pathname==='/'||pathname.startsWith('/places')?'page':undefined} className={cn(controlClass,'hidden text-sm hover:text-accent sm:inline')}>Places</Link>
        </div>
        <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-4 text-xs sm:gap-7"><Link to="/saved" aria-current={pathname==='/saved'?'page':undefined} className={cn(controlClass,'flex items-center gap-1.5 hover:text-accent')}><Bookmark aria-hidden="true" className="size-4" strokeWidth={1.5}/><span>Saved</span>{saved.size > 0 && <span className="rounded-full bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] text-accent">{saved.size}</span>}</Link><NavLink className={cn(controlClass,'hover:text-accent')} to="/about">About</NavLink></nav>
      </header>
      <main id="main" tabIndex={-1} className="outline-none">{loading ? <div role="status" className="grid min-h-[65vh] place-items-center font-editorial text-3xl">Gathering good finds…</div> : error ? <div className="py-24"><h1 className="font-editorial text-5xl">A brief pause.</h1><p className="mt-5 text-muted">{error}</p><button className={cn(buttonClass,'mt-6')} onClick={() => location.reload()}>Try again</button></div> : <Outlet/>}</main>
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule py-4 text-[9px] text-muted"><Link to="/" className={cn(controlClass,'border-r border-rule pr-5 font-editorial text-lg font-bold tracking-[-.7px] text-ink')}>hacker.living</Link><Link className={cn(controlClass,'hover:text-accent')} to="/credits">Photo credits</Link><span className="max-w-52 leading-relaxed sm:ml-auto sm:max-w-none">An independent collection. Not affiliated with Hacker News.</span></footer>
    </div>
  </div>;
}
