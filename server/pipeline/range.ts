export interface DateRange {from:string;to:string}
function parse(value:string,end:boolean){
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
  const ms=Date.parse(value+'T00:00:00.000Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value)throw Error('Use valid calendar dates');
  return ms+(end?86400000:0);
 }
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('Use YYYY-MM-DD or a UTC timestamp ending in Z');
 const ms=Date.parse(value);if(new Date(ms).toISOString().slice(0,10)!==value.slice(0,10))throw Error('Invalid calendar date');return ms;
}
export function parseRange(from:string,to:string,now=Date.now()):DateRange{
 const start=parse(from,false),end=parse(to,true);if(start>=end)throw Error('The end must be after the start');
 if(start<Date.parse('2006-10-09T00:00:00Z'))throw Error('HN history begins in October 2006');
 if(start>now||end>now+86400000)throw Error('The range cannot extend into the future');
 return {from:new Date(start).toISOString(),to:new Date(end).toISOString()};
}
export function monthSlices(range:DateRange){
 const slices:{month:string;from:string;to:string}[]=[];let cursor=Date.parse(range.from);const end=Date.parse(range.to);
 while(cursor<end){const date=new Date(cursor),next=Math.min(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1),end);slices.push({month:date.toISOString().slice(0,7),from:new Date(cursor).toISOString(),to:new Date(next).toISOString()});cursor=next;}
 return slices;
}
