import {useEffect,useRef,useState} from 'react';
import {useLocation,useNavigationType} from 'react-router-dom';

interface CollectionView {pages:number;scrollY:number}
const storageKey=(key:string)=>`hacker.living.websites.view.${key}`;
function readView(key:string):CollectionView|null{
 try{const value=JSON.parse(sessionStorage.getItem(storageKey(key))??'null') as CollectionView|null;
  return value&&Number.isInteger(value.pages)&&value.pages>=1&&value.pages<=25001&&Number.isFinite(value.scrollY)&&value.scrollY>=0?value:null;
 }catch{return null;}
}
function saveView(key:string,view:CollectionView){try{sessionStorage.setItem(storageKey(key),JSON.stringify(view));}catch{/* Browser storage is optional. */}}
/** Restore loaded pages before the scroll offset, including browser Back after a detail-page reload. */
export function useWebsiteCollectionView(loading:boolean){
 const location=useLocation(),navigation=useNavigationType();
 const [initial]=useState(()=>navigation==='POP'?readView(location.key):null);
 const [pages,setPages]=useState(initial?.pages??1),pending=useRef(initial),position=useRef(initial?.scrollY??0);
 useEffect(()=>{
  const record=()=>{if(!pending.current)position.current=window.scrollY;};
  window.addEventListener('scroll',record,{passive:true});
  return()=>{window.removeEventListener('scroll',record);saveView(location.key,{pages,scrollY:position.current});};
 },[location.key,pages]);
 useEffect(()=>{
  if(loading||!pending.current)return;
  const view=pending.current;
  const frame=requestAnimationFrame(()=>{window.scrollTo({top:view.scrollY,behavior:'instant'});position.current=view.scrollY;pending.current=null;});
  return()=>cancelAnimationFrame(frame);
 },[loading,pages]);
 const remember=()=>{position.current=window.scrollY;saveView(location.key,{pages,scrollY:position.current});};
 return {pages,setPages,remember,returnState:{websiteCollection:{key:location.key,to:location.pathname+location.search}}};
}

export function websiteCollectionReturn(state:unknown):string|null{
 if(!state||typeof state!=='object'||!('websiteCollection' in state))return null;
 const value=state.websiteCollection;
 if(!value||typeof value!=='object'||!('to' in value)||typeof value.to!=='string')return null;
 return /^\/websites(?:\?[^#]*)?$/.test(value.to)?value.to:null;
}
