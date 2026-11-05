import {object,text,publicHttpsUrl} from '../../scripts/pipeline-core.ts';
import {placeCategories} from '../../shared/types.ts';
const str={type:'string'},nullable={type:['string','null']};
export const record=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const researchSchema=record({canonicalName:str,city:str,country:str,countryCode:str,address:str,category:{type:'string',enum:placeCategories},officialUrl:nullable,officialEvidenceExcerpt:nullable,identityConfidence:{type:'string',enum:['high','medium','low']},wikipediaTitle:nullable,wikipediaLanguage:{type:'string',enum:['en','es','fr','de','ja','fi','sv','nl','vi']},geocodeQueries:{type:'array',items:str},notes:str,sources:{type:'array',items:record({url:str,title:str})}});
export interface ResearchIdentity{canonicalName:string;city:string;country:string;countryCode:string;address:string;category:typeof placeCategories[number];officialUrl:string|null;officialEvidenceExcerpt:string|null;identityConfidence:'high'|'medium'|'low';wikipediaTitle:string|null;wikipediaLanguage:string;geocodeQueries:string[];notes:string;sources:{url:string;title:string}[]}
export function parseResearch(value:unknown):ResearchIdentity{
 const row=object(value,'place research');for(const key of ['canonicalName','city','country','countryCode','address','notes'])text(row[key],key);
 row.countryCode=String(row.countryCode).toLowerCase();
 if(!/^[a-z]{2}$/.test(String(row.countryCode)))throw Error('Research requires an ISO country code');
 if(!placeCategories.includes(row.category as any)||!['high','medium','low'].includes(String(row.identityConfidence)))throw Error('Invalid research classification');
 if(row.officialUrl!==null)publicHttpsUrl(text(row.officialUrl,'official URL'));
 if(row.officialEvidenceExcerpt!==null){const quote=text(row.officialEvidenceExcerpt,'official excerpt');if(quote.split(/\s+/).length>25)throw Error('Official excerpt exceeds 25 words');}
 if(!Array.isArray(row.geocodeQueries)||row.geocodeQueries.length>3||!row.geocodeQueries.every(q=>typeof q==='string'&&q.trim().length>0&&q.length<250))throw Error('Invalid geocoding queries');
 if(!Array.isArray(row.sources)||row.sources.length>8)throw Error('Invalid research sources');
 for(const source of row.sources){const s=object(source,'source');publicHttpsUrl(text(s.url,'source URL'));text(s.title,'source title');}
 if(!['en','es','fr','de','ja','fi','sv','nl','vi'].includes(String(row.wikipediaLanguage)))throw Error('Unsupported Wikipedia language');
 if(row.wikipediaTitle!==null)text(row.wikipediaTitle,'Wikipedia title');
 return row as unknown as ResearchIdentity;
}
export const matchSchema=record({index:{type:['integer','null']},confidence:{type:'string',enum:['high','medium','low']},explanation:str});
export function selectGeocode(value:unknown,matches:any[],countryCode:string){
 const row=object(value,'coordinate match');
 if(row.index===null)return null;
 if(!Number.isInteger(row.index)||Number(row.index)<0||Number(row.index)>=matches.length)throw Error('Invalid geocoding selection');
 if(!['high','medium','low'].includes(String(row.confidence)))throw Error('Invalid geocoding confidence');
 const match=matches[Number(row.index)];
 const lat=Number(match.lat),lon=Number(match.lon);
 if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)throw Error('Invalid coordinate bounds');
 // A street, city or postcode is never a museum pin.
 if(row.confidence!=='high'||['highway','place','boundary'].includes(match.category)||match.address?.country_code!==countryCode||!['node','way','relation'].includes(match.osm_type)||!Number.isSafeInteger(match.osm_id))return null;
 return {coordinates:[lat,lon] as [number,number],coordinateSource:`https://www.openstreetmap.org/${match.osm_type}/${match.osm_id}`,match,explanation:String(row.explanation)};
}
export function acceptableLicense(license:string){return /^(CC0|CC BY(?:-SA)? [1-4]\.\d|Public domain)$/i.test(license);}
