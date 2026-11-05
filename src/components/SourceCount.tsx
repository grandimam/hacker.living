/** An evidence count, not a vote or a popularity score. */
export function SourceCount({count}:{count:number}){
 return <span aria-label={`${count} distinct Hacker News source ${count===1?'comment':'comments'}`} title={`${count} distinct HN source ${count===1?'comment':'comments'}`} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-accent/15 bg-accent-soft px-2.5 py-1 text-accent">
  <span aria-hidden="true" className="size-1.5 rounded-full bg-accent"/>
  <span className="font-mono text-[11px] font-medium tabular-nums tracking-normal">{count}</span>
  <span className="text-[9px] font-normal normal-case tracking-normal">HN {count===1?'source':'sources'}</span>
 </span>;
}
