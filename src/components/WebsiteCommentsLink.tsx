import {MessageCircle} from 'lucide-react';
import {Link} from 'react-router-dom';
import {cn,controlClass} from '../lib';

export function WebsiteCommentsLink({id,name,count,state,onClick}:{id:string;name:string;count:number;state?:unknown;onClick?:()=>void}){
 return <Link to={`/websites/${id}/comments`} state={state} onClick={onClick} aria-label={`Read ${count} HN ${count===1?'comment':'comments'} about ${name}`} className={cn(controlClass,'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/15 bg-accent-soft px-3 py-1.5 text-[11px] text-accent hover:border-accent/40 hover:bg-accent/10')}><MessageCircle aria-hidden="true" className="size-3.5"/><span>{count} HN {count===1?'comment':'comments'}</span></Link>;
}
