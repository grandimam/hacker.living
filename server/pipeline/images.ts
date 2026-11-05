import {cachedJson} from './http.ts';
import {acceptableLicense,type ResearchIdentity} from './research-core.ts';
import {normalizeText} from '../../scripts/pipeline-core.ts';
import type {PlaceImage} from '../../shared/types.ts';
const api=(host:string,params:Record<string,string>)=>`https://${host}/w/api.php?${new URLSearchParams({format:'json',...params})}`;
export async function researchImage(identity:ResearchIdentity):Promise<{image:PlaceImage|null;reason:string;metadata?:unknown}>{
 if(!identity.wikipediaTitle)return {image:null,reason:'No reliably matched Wikipedia article for a credited photograph'};
 const data=await cachedJson(api(`${identity.wikipediaLanguage}.wikipedia.org`,{action:'query',titles:identity.wikipediaTitle,prop:'pageimages',piprop:'name',redirects:'1'}));
 const page=Object.values(data.query?.pages??{}).find((p:any)=>p.pageimage) as any;
 if(!page?.pageimage)return {image:null,reason:'The matched Wikipedia article has no freely reusable lead image'};
 const commons=await cachedJson(api('commons.wikimedia.org',{action:'query',titles:'File:'+page.pageimage,prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'800'}));
 const info=(Object.values(commons.query?.pages??{}) as any[]).find(p=>p.imageinfo)?.imageinfo[0];
 const m=info?.extmetadata,license=m?.LicenseShortName?.value??'',author=normalizeText(m?.Artist?.value??'');
 if(!info||!acceptableLicense(license)||!author)return {image:null,reason:'Photo lacks a supported reusable license or attribution'};
 const path=info.thumburl??info.url;
 const url=new URL(path);if(url.protocol!=='https:'||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(url.hostname))throw Error('Unexpected photo host');
 const response=await fetch(url,{headers:{'User-Agent':'hacker.living pipeline image checker'},signal:AbortSignal.timeout(15000)});await response.body?.cancel();
 if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error(`Photo fetch failed: ${response.status}`);
 const licenseUrl=m.LicenseUrl?.value||(license==='Public domain'?'https://creativecommons.org/publicdomain/mark/1.0/':license==='CC0'?'https://creativecommons.org/publicdomain/zero/1.0/':'');
 if(!licenseUrl)return {image:null,reason:'Missing license URL'};
 return {image:{path,alt:`${identity.canonicalName} — Wikimedia Commons photograph`,author,license,licenseUrl,sourceUrl:info.descriptionurl,modifications:'Displayed cropped to fit; original unmodified.'},reason:'Credited image from the matched Wikipedia article',metadata:{file:page.pageimage,pageTitle:page.title,wikipediaLanguage:identity.wikipediaLanguage,checkedAt:new Date().toISOString()}};
}
