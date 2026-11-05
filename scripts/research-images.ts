import {readFile,writeFile} from 'node:fs/promises';
const titles:Record<string,string>={
 'Assyrian section of the British Museum':'British Museum',
 "Goya's museum":'Museo Goya',
 'IKEA museum':'IKEA Museum',
 'National Gallery of Art':'National Gallery of Art',
 'New York Transit Museum':'New York Transit Museum',
 'Oodi library':'Helsinki Central Library Oodi',
 'Rijksmuseum':'Rijksmuseum',
 'The Ho Chi Minh City History Museum':'Ho Chi Minh City Museum of History',
 'The National Museum of Computing':'The National Museum of Computing',
 'Toyota commemorative Museum':'Toyota Commemorative Museum of Industry and Technology'
};
async function request(host:string,params:Record<string,string>){const url=new URL('/w/api.php',host);url.search=new URLSearchParams({format:'json',...params}).toString();const response=await fetch(url,{headers:{'User-Agent':'hacker.living photo attribution research (https://github.com/grandimam/hacker.living)'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`${host}: ${response.status}`);return response.json();}
const pages=await request('https://en.wikipedia.org',{action:'query',titles:Object.values(titles).join('|'),prop:'pageimages',piprop:'name|thumbnail',pithumbsize:'800',redirects:'1'});
const redirects=new Map((pages.query.redirects??[]).map((r:{from:string;to:string})=>[r.from,r.to]));
const images=Object.values(pages.query.pages) as {title:string;pageimage?:string;thumbnail?:{source:string}}[];
const goya=await request('https://es.wikipedia.org',{action:'query',titles:'Museo Goya - Colección Ibercaja - Museo Camón Aznar',prop:'pageimages',piprop:'name|thumbnail',pithumbsize:'800'});
for(const page of Object.values(goya.query.pages) as typeof images){images.push({...page,title:'Museo Goya'});}
const files=images.filter(p=>p.pageimage).map(p=>'File:'+p.pageimage);
const metadata=await request('https://commons.wikimedia.org',{action:'query',titles:files.join('|'),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'800'});
const byFile=new Map((Object.values(metadata.query.pages) as {title:string;imageinfo?:any[]}[]).map(p=>[p.title.replaceAll('_',' '),p.imageinfo?.[0]]));
const clean=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'");
const out=[];
for(const [name,title]of Object.entries(titles)){
 const page=images.find(p=>p.pageimage&&p.title===(redirects.get(title)??title));const info=page?.pageimage?byFile.get(('File:'+page.pageimage).replaceAll('_',' ')):null;
 if(!info){console.log(`No credited image: ${name}`);continue;}
 const m=info.extmetadata;
 const image={path:info.thumburl??info.url,alt:`${title} — Wikimedia Commons photograph`,author:clean(m.Artist?.value??'Unknown'),license:m.LicenseShortName?.value??'',licenseUrl:m.LicenseUrl?.value??'',sourceUrl:info.descriptionurl,modifications:'Displayed cropped to fit the card; original unmodified.'};
 if(!image.license||(!/^(CC|Public domain)/i.test(image.license))){console.log(`Unsupported license: ${name} ${image.license}`);continue;}
 out.push({name,title,image,checkedAt:new Date().toISOString()});console.log(`${name}: ${image.license} — ${image.author}`);
}
await writeFile(new URL('../data/research/place-images.json',import.meta.url),JSON.stringify(out,null,2)+'\n');
