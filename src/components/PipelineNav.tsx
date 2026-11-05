import {NavLink} from 'react-router-dom';
import {MapPin,Type} from 'lucide-react';
import {cn,controlClass} from '../lib';
export function PipelineNav(){return <nav aria-label="Pipeline product" className="mb-7 flex gap-2 border-b border-rule pb-4">{[{to:'/pipeline',label:'Places',Icon:MapPin},{to:'/pipeline/fonts',label:'Fonts',Icon:Type}].map(({to,label,Icon})=><NavLink end key={to} to={to} className={({isActive})=>cn(controlClass,'inline-flex items-center gap-2 rounded border px-4 py-2.5 text-xs',isActive?'border-ink bg-ink text-paper':'border-rule text-muted hover:text-ink')}><Icon aria-hidden="true" className="size-3.5"/>{label}</NavLink>)}</nav>;}
