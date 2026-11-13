'use client';
import {useState,useEffect,useRef} from 'react';
import {Users,CheckCircle2,CloudOff} from 'lucide-react';
import {Progress} from '@/components/ui/progress';
import {summarizeProgress,type SharedProgress,type ProfileId} from '@/lib/training-progress';
import type {State} from '@/lib/training';
import {profileConfig} from '@/lib/profile-config';
export default function TogetherBar({profile,data,revision,loading}:{profile:ProfileId;data:State;revision:number;loading:boolean}){
 const [snapshot,setSnapshot]=useState<SharedProgress|null>(null);
 const [unavailable,setUnavailable]=useState(false);
 const [lastUpdate,setLastUpdate]=useState(0);
 const panel=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  let disposed=false,request:AbortController|null=null,poll:ReturnType<typeof setTimeout>|undefined;
  let deadline:ReturnType<typeof setTimeout>|undefined;
  function cancel(){clearTimeout(poll);clearTimeout(deadline);request?.abort();request=null;}
  async function refresh(){
   cancel();
   if(disposed||document.visibilityState==='hidden')return;
   if(!navigator.onLine){setUnavailable(true);poll=setTimeout(refresh,5000);return;}
   const controller=new AbortController();request=controller;
   deadline=setTimeout(()=>controller.abort(),12000);
   try{
    const response=await fetch('/api/training/progress',{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Error('Progress unavailable');
    const result=await response.json() as SharedProgress;
    if(!disposed&&request===controller){setSnapshot(result);setLastUpdate(Date.now());setUnavailable(false);}
   }catch{
    if(!disposed&&request===controller)setUnavailable(true);
   }finally{
    if(!disposed&&request===controller){clearTimeout(deadline);request=null;poll=setTimeout(refresh,5000);}
   }
  }
  function offline(){cancel();setUnavailable(true);}
  void refresh();
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('focus',refresh);
  window.addEventListener('online',refresh);
  window.addEventListener('offline',offline);
  return()=>{disposed=true;cancel();document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);window.removeEventListener('offline',offline);};
 },[revision]);
 const own=loading?null:summarizeProgress(data.active,data.sessions[0]??null);
 const profiles={lucas:snapshot?.profiles.lucas??null,natalia:snapshot?.profiles.natalia??null};
 if(own)profiles[profile]=own;
 const visible=profiles.lucas?.status==='active'&&profiles.natalia?.status==='active';
 // Reserve the actual height, including enlarged text and the iPhone safe area.
 useEffect(()=>{
  const element=panel.current;
  if(!visible||!element)return;
  function measure(){document.documentElement.style.setProperty('--together-bar-space',`${element!.getBoundingClientRect().height+16}px`);}
  measure();const observer=new ResizeObserver(measure);observer.observe(element);
  return()=>{observer.disconnect();document.documentElement.style.removeProperty('--together-bar-space');};
 },[visible]);
 if(!visible)return null;
 const stale=unavailable||(lastUpdate>0&&Date.now()-lastUpdate>20000);
 return <aside ref={panel} className="together-bar" aria-label={`Progresso do treino de ${profileConfig.lucas.name} e ${profileConfig.natalia.name}`}>
  <div className="together-inner">
   <div className="together-heading"><span><Users size={16}/>Treinando juntos</span><small role="status">{stale?<><CloudOff size={14}/>Sem atualização · último progresso</>:snapshot?'Atualiza a cada 5 s':'Sincronizando…'}</small></div>
   <div className="together-profiles">{(['lucas','natalia'] as const).map(id=>{
    const p=profiles[id],name=profileConfig[id].shortName;
    return <div className={`together-person together-${id}`} key={id}>
     <div className="together-person-heading"><span>{name}{profile===id&&<small>você</small>}</span><strong>{p?.status==='idle'?'—':p?`${p.percent}%`:'—'}</strong></div>
     <Progress value={p?.percent??0} aria-label={`Progresso de ${name}`}/>
     <p>{!p?'Aguardando sincronização':p.status==='idle'?'Não iniciou um treino':<>{p.status==='finished'&&<CheckCircle2 size={13}/>}<span>{p.status==='finished'?'Finalizado · ':''}{p.done}/{p.total} séries</span></>}</p>
    </div>;
   })}</div>
  </div>
 </aside>;
}
