'use client';
import {useState,useEffect,useRef,type InputHTMLAttributes} from 'react';
import {Dumbbell,Plus,Play,Timer,History,BookOpen,Check,ArrowUp,ArrowDown,Trash2,Pencil,Pause,SkipForward,ChevronRight,ChevronDown,CheckCircle2,Cloud,Save,RefreshCw,Sparkles,Camera,Images,X,Search,Wrench} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import TrainingInsights from './training-insights';
import UpdateGate from './update-gate';
import WorkoutCurationDialog from './workout-curation-dialog';
import {localDay,trainingZone,weeklyCount,estimateSeconds,displayKg,parseWeight,suggestedWorkout,cycleDue,elapsedCalendarDays,moveSessionToDay,stableWorkoutList,initialWorkoutOrder} from '@/lib/training-stats';
import {Checkbox} from '@/components/ui/checkbox';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Progress} from '@/components/ui/progress';
import {Skeleton} from '@/components/ui/skeleton';
import {Toaster,toast} from 'sonner';
import {summarizeProgress} from '@/lib/training-progress';
import {PORTAL_HOME_URL,displayNameForProfile} from '@/lib/profile-config';
import {isValidTrainingProfileId} from '@/lib/training-profile';
import {exercises,exerciseGroups,blank,workoutSchema,sessionSchema,type State,type Workout,type Session,type Item} from '@/lib/training';
import {isResearchableMachine,normalizeEquipmentItems,type EquipmentItem} from '@/lib/equipment-inventory';
const uid=()=>crypto.randomUUID();
const legacyWorkoutCreatedAt='2026-09-14T15:00:00.000Z';
const fmt=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
const count=(s:Session)=>s.items.flatMap(i=>i.logs).filter(l=>l.done).length;
async function logoutFitCore(){try{await fetch("/api/auth/logout",{method:"POST",credentials:"include"});}catch{/* still leave */}window.location.href=PORTAL_HOME_URL;}
function playRestAlert(context:AudioContext){
 const start=context.currentTime;
 for(let index=0;index<5;index++){
  const tone=context.createOscillator(),volume=context.createGain(),at=start+index*.25;
  tone.type='sine';tone.frequency.setValueAtTime(880,at);
  volume.gain.setValueAtTime(.001,at);
  volume.gain.exponentialRampToValueAtTime(.38,at+.02);
  volume.gain.exponentialRampToValueAtTime(.001,at+.17);
  tone.connect(volume);volume.connect(context.destination);
  tone.start(at);tone.stop(at+.18);
 }
}
// Keep the text being edited separate from the persisted numeric value.
// An empty draft stays empty while focused; leaving it empty restores the last value.
function NumericInput({value,onValueChange,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'> & {value:number,onValueChange:(n:number)=>void}){
 const [draft,setDraft]=useState(String(value));
 const focused=useRef(false);
 useEffect(()=>{if(!focused.current)setDraft(String(value));},[value]);
 return <input {...props} type="number" value={draft}
  onFocus={e=>{focused.current=true;props.onFocus?.(e)}}
  onChange={e=>{const raw=e.target.value;setDraft(raw);if(raw!==''&&Number.isFinite(Number(raw)))onValueChange(Number(raw));}}
  onBlur={e=>{focused.current=false;setDraft(String(value));props.onBlur?.(e)}}/>;
}
function WeightInput({value,onValueChange,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'> & {value:number|null,onValueChange:(n:number|null)=>void}){
 const [draft,setDraft]=useState(value===null?'':String(value).replace('.',','));
 const focused=useRef(false);
 useEffect(()=>{if(!focused.current)setDraft(value===null?'':String(value).replace('.',','));},[value]);
 return <input {...props} type="text" inputMode="decimal" value={draft}
 onFocus={()=>{focused.current=true}}
 onChange={e=>{const raw=e.target.value;const number=parseWeight(raw);if(number===undefined)return;setDraft(raw);onValueChange(number)}}
 onBlur={()=>{focused.current=false;setDraft(value===null?'':String(value).replace('.',','))}}/>;
}
function ExercisePicker({onAdd}:{onAdd:(name:string)=>void}){
 const [query,setQuery]=useState('');
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const matches=exercises.filter(e=>normalize(e.name).includes(normalize(query)));
 return <details className="exercise-picker"><summary>Adicionar exercício da biblioteca</summary><label className="field">Buscar exercício<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nome do exercício…"/></label><div className="picker-results">{matches.map(e=><button type="button" className="picker-option" key={e.name} onClick={()=>{onAdd(e.name);toast.success(`${e.name} adicionado`);}}><span>{e.name}<small>{e.group}</small></span><Plus size={18}/></button>)}{!matches.length&&<p>Nenhum exercício encontrado.</p>}</div></details>;
}
function Numeric({label,value,onChange,min=0,max=2000,step=1}:{label:string,value:number,onChange:(n:number)=>void,min?:number,max?:number,step?:number}){return <label className="number-field"><span>{label}</span><NumericInput aria-label={label} inputMode={step<1?'decimal':'numeric'} min={min} max={max} step={step} value={value} onValueChange={onChange}/></label>}
const EQUIP_MAX_PHOTOS=8,EQUIP_MAX_ITEMS=30,EQUIP_MAX_EDGE=1600,EQUIP_MAX_DECODED=1.4*1024*1024;
const EQUIP_ACCEPT='image/jpeg,image/png,image/webp,image/*';
function mergeEquipment(a:EquipmentItem[],b:EquipmentItem[]):EquipmentItem[]{return normalizeEquipmentItems([...a,...b]).slice(0,EQUIP_MAX_ITEMS);}
function friendlyHttpError(status:number):string{
 if(status===401)return 'Sessão expirada. Volte ao portal e abra o FitCore de novo.';
 if(status===403)return 'Sem permissão para esta ação. Volte ao portal do paciente.';
 if(status===413)return 'As fotos ficaram grandes demais. Tente com menos fotos ou mais de perto.';
 if(status===422)return 'Não entendemos a identificação. Tente outras fotos ou adicione à mão.';
 if(status===429)return 'Muitas tentativas em pouco tempo. Aguarde um minuto.';
 if(status>=500)return 'Serviço temporariamente indisponível. Tente de novo em instantes.';
 return 'Não foi possível concluir. Tente de novo.';
}
function userFacingError(e:unknown,fallback:string):string{
 const msg=(e instanceof Error?e.message:String(e??'')).trim();
 if(!msg||msg==='undefined'||msg==='null')return fallback;
 if(/failed to fetch|networkerror|load failed|network request failed/i.test(msg))return 'Sem conexão. Verifique a internet e tente de novo.';
 if(/unexpected token|is not valid json|json\.parse|syntaxerror/i.test(msg))return fallback;
 if(/healthcore|fitcore_|openai|stack|at\s+\S+\s+\(/i.test(msg))return fallback;
 return msg;
}
async function readApiJson<T=Record<string,unknown>>(r:Response):Promise<T & {error?:string}>{
 const text=await r.text();
 if(!text){
  if(!r.ok)throw new Error(friendlyHttpError(r.status));
  return {} as T & {error?:string};
 }
 try{return JSON.parse(text) as T & {error?:string};}
 catch{throw new Error(friendlyHttpError(r.status||502));}
}
function isLikelyImageFile(file:File):boolean{
 const type=(file.type||'').toLowerCase();
 if(type.startsWith('image/'))return true;
 // Some mobile cameras omit MIME; accept common extensions.
 return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);
}
function isHeicLike(file:File):boolean{
 const type=(file.type||'').toLowerCase();
 const name=file.name.toLowerCase();
 return type.includes('heic')||type.includes('heif')||name.endsWith('.heic')||name.endsWith('.heif');
}
function decodedBase64Bytes(base64:string):number{
 const padding=base64.endsWith('==')?2:base64.endsWith('=')?1:0;
 return Math.floor((base64.length*3)/4)-padding;
}
// Downscale + re-encode as JPEG in memory only; the photo is never stored anywhere.
async function compressPhoto(file:File):Promise<{mime:string;data_base64:string}>{
 if(isHeicLike(file))throw new Error('Fotos HEIC/HEIF não são suportadas neste aparelho. Tire de novo em JPEG ou escolha outra foto da galeria.');
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise<HTMLImageElement>((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('Não foi possível ler a foto. Tente JPEG ou PNG.'));i.src=url;});
  if(!img.naturalWidth||!img.naturalHeight)throw new Error('Não foi possível ler a foto. Tente JPEG ou PNG.');
  const scale=Math.min(1,EQUIP_MAX_EDGE/Math.max(img.naturalWidth,img.naturalHeight));
  const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Não foi possível processar a foto neste navegador.');
  ctx.drawImage(img,0,0,w,h);
  for(const quality of [0.7,0.55,0.4]){
   const dataUrl=canvas.toDataURL('image/jpeg',quality);
   const comma=dataUrl.indexOf(',');
   if(comma<0)continue;
   const data_base64=dataUrl.slice(comma+1);
   if(data_base64&&decodedBase64Bytes(data_base64)<=EQUIP_MAX_DECODED){
    canvas.width=0;canvas.height=0;
    return {mime:'image/jpeg',data_base64};
   }
  }
  canvas.width=0;canvas.height=0;
  throw new Error('Foto muito grande mesmo após compactar. Tire mais de perto ou com menor resolução.');
 }finally{URL.revokeObjectURL(url);}
}
export default function TrainingApp(){
 const [profile,setProfile]=useState(''),[data,setData]=useState<State>(blank),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[tab,setTab]=useState('workouts'),[edit,setEdit]=useState<Workout|null>(null),[detail,setDetail]=useState<Session|null>(null),[historyEdit,setHistoryEdit]=useState<Session|null>(null),[remove,setRemove]=useState<string|null>(null),[removeSession,setRemoveSession]=useState<string|null>(null),[finish,setFinish]=useState(false),[discard,setDiscard]=useState(false),[search,setSearch]=useState(''),[group,setGroup]=useState('all'),[tick,setTick]=useState(Date.now()),[dirty,setDirty]=useState(false),[reminderDismissed,setReminderDismissed]=useState(false);
 const [profileReady,setProfileReady]=useState(false);
 const [sessionError,setSessionError]=useState('');
 const [sessionDisplayName,setSessionDisplayName]=useState<string|null>(null);
 const [healthConsent,setHealthConsent]=useState<boolean|null>(null);
 const [curationOpen,setCurationOpen]=useState(false);
 const [curationFocus,setCurationFocus]=useState('');
 const [curationInventory,setCurationInventory]=useState<EquipmentItem[]|null>(null);
 const [equipWizard,setEquipWizard]=useState<'closed'|'capture'|'review'>('closed');
 const [equipDraft,setEquipDraft]=useState<EquipmentItem[]>([]);
 const [equipBusy,setEquipBusy]=useState(false);
 const [equipStatus,setEquipStatus]=useState('');
 const [equipError,setEquipError]=useState('');
 const [equipPhotos,setEquipPhotos]=useState<{id:string;file:File;url:string}[]>([]);
 const [equipNew,setEquipNew]=useState('');
 const equipUrls=useRef<string[]>([]);
 const [coachTips,setCoachTips]=useState<Record<string,{tip_technique:string;tip_progression:string|null}>>({});
 const [coachingKey,setCoachingKey]=useState<string|null>(null);
 const [exerciseOpen,setExerciseOpen]=useState<Record<string,boolean>>({});
 const audio=useRef<AudioContext|null>(null),notified=useRef<number|null>(null),lock=useRef(false),generation=useRef(0);
 useEffect(()=>()=>{equipUrls.current.forEach(u=>URL.revokeObjectURL(u));},[]);
 const person=displayNameForProfile(profile, sessionDisplayName);
 const today=localDay(tick);
 const orderedWorkouts=stableWorkoutList(data.workouts,data.workoutOrder);
 const suggested=suggestedWorkout(orderedWorkouts,data.sessions,today);
 const suggestedTimes=suggested?weeklyCount(suggested,data.sessions,today):0;
 const showCycleReminder=!reminderDismissed&&cycleDue(data.planCycleStartedAt,today);
 const cycleDays=data.planCycleStartedAt?elapsedCalendarDays(data.planCycleStartedAt,today):0;
 async function load(){const gen=++generation.current;setLoading(true);setError('');try{const r=await fetch(`/api/training?profile=${profile}`,{cache:'no-store'});const j=await readApiJson<{state:State;revision:number;error?:string}>(r);if(!r.ok)throw Error(j.error||friendlyHttpError(r.status));if(gen!==generation.current)return;let state=j.state,rev=j.revision;if(!state.planCycleStartedAt||state.workouts.some(w=>!w.createdAt)||!state.workoutOrder){const migrated={...state,planCycleStartedAt:state.planCycleStartedAt??new Date().toISOString(),workouts:state.workouts.map(w=>({...w,createdAt:w.createdAt??legacyWorkoutCreatedAt})),workoutOrder:state.workoutOrder??initialWorkoutOrder(state.workouts)};const mr=await fetch('/api/training',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,revision:rev,state:migrated})});if(mr.ok){const mj=await readApiJson<{revision:number}>(mr);state=migrated;rev=mj.revision;}}if(gen!==generation.current)return;setData(state);setRevision(rev);setDirty(false);}catch(e){if(gen===generation.current)setError(userFacingError(e,'Não foi possível carregar seus treinos. Tente novamente.'));}finally{if(gen===generation.current)setLoading(false);}}
 useEffect(()=>{(async()=>{
  try{
   const r=await fetch('/api/session',{cache:'no-store'});
   if(r.status===401){setSessionError('Abra o FitCore pelo portal do paciente (HealthCore).');setProfileReady(false);return;}
   const j=await r.json() as {profile:string|null;authenticated?:boolean;display_name?:string|null;health_mode?:{consented:boolean}|null};
   setHealthConsent(j.health_mode?j.health_mode.consented:null);
   if(j.profile&&isValidTrainingProfileId(j.profile)){setProfile(j.profile);setSessionDisplayName(j.display_name??null);setProfileReady(true);return;}
   if(j.authenticated){setSessionError('Seu perfil de treino ainda não foi vinculado pela clínica.');setProfileReady(false);return;}
   setSessionError('Abra o FitCore pelo portal do paciente (HealthCore).');
   setProfileReady(false);
  }catch{
   setSessionError('Não foi possível validar sua sessão. Volte ao portal e tente de novo.');
   setProfileReady(false);
  }
 })();},[]);
 useEffect(()=>{if(profileReady)load();return()=>{generation.current++}},[profile,profileReady]);

 useEffect(()=>{const id=setInterval(()=>setTick(Date.now()),250);return()=>clearInterval(id)},[]);
 useEffect(()=>{const fn=(e:BeforeUnloadEvent)=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn)},[dirty,busy]);
 const timer=data.timer,remaining=timer?(timer.end?Math.max(0,Math.ceil((timer.end-tick)/1000)):timer.left):0;
 useEffect(()=>{if(timer?.end&&remaining===0&&notified.current!==timer.end){notified.current=timer.end;toast.success('Descanso concluído. Próxima série!');if(audio.current?.state==='running')playRestAlert(audio.current);navigator.vibrate?.([160,80,160,80,160,80,160,80,220]);}},[remaining,timer?.end]);
 function enableAudio(){try{if(!audio.current)audio.current=new AudioContext();void audio.current.resume()}catch{}}
 async function save(next:State){if(lock.current)return false;lock.current=true;setBusy(true);setError('');try{const r=await fetch('/api/training',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,revision,state:next})});const j=await readApiJson<{state?:State;revision:number;error?:string}>(r);if(!r.ok)throw Error(j.error||friendlyHttpError(r.status));setData(next);setRevision(j.revision);setDirty(false);return true;}catch(e){setError(userFacingError(e,'Não foi possível salvar. Tente novamente.'));return false;}finally{lock.current=false;setBusy(false)}}
 function newWorkout(){setEdit({id:uid(),name:'',createdAt:new Date().toISOString(),items:[]})}
 async function askCoach(item:Item,key:string,setIndex:number){
  setCoachingKey(key);
  try{
   const same=(x:Item)=>x.name===item.name&&(x.variation??'')===(item.variation??'');
   const previous=data.sessions.find(s=>s.items.some(same))?.items.find(same);
   const lastDone=previous?.logs.filter(l=>l.done).at(-1);
   const r=await fetch('/api/training/coach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exerciseName:item.name,group:item.group,equipment:item.equipment,sets:item.sets,reps:item.reps,rest:item.rest,previousKg:lastDone?.kg??null,previousReps:lastDone?.reps??null,setIndex:setIndex>=0?setIndex+1:item.sets})});
   const j=await readApiJson<{tip_technique?:string;tip_progression?:string|null;error?:string}>(r);
   if(!r.ok)throw Error(j.error||friendlyHttpError(r.status));
   if(!j.tip_technique)throw Error('A dica veio incompleta. Tente de novo.');
   setCoachTips(prev=>({...prev,[key]:{tip_technique:j.tip_technique!,tip_progression:j.tip_progression??null}}));
  }catch(e){toast.error(userFacingError(e,'Não foi possível gerar a dica agora.'))}finally{setCoachingKey(null)}
 }
 function openCuration(focus='',inventory?:EquipmentItem[]){
  setCurationFocus(focus);
  setCurationInventory(inventory??null);
  setCurationOpen(true);
 }
 function clearEquipPhotos(){equipUrls.current.forEach(u=>URL.revokeObjectURL(u));equipUrls.current=[];setEquipPhotos([]);}
 function closeEquipWizard(){if(equipBusy)return;clearEquipPhotos();setEquipNew('');setEquipError('');setEquipStatus('');setEquipWizard('closed');}
 function openEquipWizard(initialStep:'capture'|'review'='capture'){clearEquipPhotos();setEquipDraft(data.equipment_inventory??[]);setEquipNew('');setEquipError('');setEquipStatus('');setEquipWizard(initialStep);}
 function pickEquipPhotos(files:FileList|null){
  // Snapshot FileList synchronously BEFORE caller resets e.target.value = '' (which empties the live FileList!).
  const all=files?Array.from(files):[];
  if(!all.length)return;
  setEquipError('');
  const room=EQUIP_MAX_PHOTOS-equipPhotos.length;
  if(room<=0){toast.error(`Máximo de ${EQUIP_MAX_PHOTOS} fotos.`);return;}
  if(all.length>room)toast.error(`Máximo de ${EQUIP_MAX_PHOTOS} fotos (selecionadas as primeiras ${room}).`);
  const heic=all.filter(isHeicLike);
  if(heic.length)toast.error('Fotos HEIC/HEIF não são suportadas. Use JPEG/PNG ou a câmera do app.');
  const candidates=all.filter(f=>isLikelyImageFile(f)&&!isHeicLike(f));
  const skipped=all.length-candidates.length-heic.length;
  if(skipped>0)toast.error('Algumas fotos foram ignoradas (formato não suportado).');
  const picked=candidates.slice(0,Math.max(0,room));
  if(!picked.length)return;
  const added=picked.map(file=>{const url=URL.createObjectURL(file);equipUrls.current.push(url);return {id:uid(),file,url};});
  setEquipPhotos(cur=>[...cur,...added].slice(0,EQUIP_MAX_PHOTOS));
 }
 function removeEquipPhoto(id:string){setEquipPhotos(cur=>{const ph=cur.find(x=>x.id===id);if(ph){URL.revokeObjectURL(ph.url);equipUrls.current=equipUrls.current.filter(u=>u!==ph.url);}return cur.filter(x=>x.id!==id);});}
 async function researchEquipment(targetItems:EquipmentItem[],quiet=false):Promise<EquipmentItem[]>{
  if(!targetItems.length)return targetItems;
  setEquipBusy(true);setEquipError('');setEquipStatus('Pesquisando estações e exercícios das máquinas…');
  try{
   const r=await fetch('/api/training/equipment/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:targetItems})});
   const j=await readApiJson<{items?:EquipmentItem[];researchedCount?:number;error?:string}>(r);
   if(!r.ok)throw Error(j.error||friendlyHttpError(r.status));
   const enriched=j.items?.length?j.items:targetItems;
   setEquipDraft(enriched);
   if(!quiet)toast.success('Pesquisa concluída! Estações e exercícios atualizados.');
   return enriched;
  }catch(e){
   const msg=userFacingError(e,'Não foi possível pesquisar as máquinas agora.');
   if(!quiet){setEquipError(msg);toast.error(msg);}
   return targetItems;
  }finally{setEquipBusy(false);setEquipStatus('');}
 }
 async function scanEquipment(){
  if(!equipPhotos.length||equipBusy)return;
  setEquipBusy(true);setEquipError('');setEquipStatus('Identificando equipamentos nas fotos…');
  try{
   // Sequential compress avoids mobile OOM with several large camera shots.
   const images:{mime:string;data_base64:string}[]=[];
   for(const photo of equipPhotos)images.push(await compressPhoto(photo.file));
   const r=await fetch('/api/training/equipment/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images})});
   const j=await readApiJson<{items?:EquipmentItem[];empty?:boolean;error?:string}>(r);
   if(!r.ok)throw Error(j.error||friendlyHttpError(r.status));
   const items=j.items??[];
   const merged=mergeEquipment(equipDraft,items);
   setEquipDraft(merged);
   clearEquipPhotos();
   setEquipWizard('review');
   if(!items.length||j.empty){
    const msg='Não detectamos equipamentos nas fotos. Adicione à mão ou tire outras fotos.';
    setEquipError(msg);toast.message(msg);
   }else{
    toast.success(`${items.length} equipamento${items.length===1?'':'s'} identificado${items.length===1?'':'s'}.`);
    const needsResearch=merged.some(it=>isResearchableMachine(it)&&!(it.researched_exercises?.length));
    if(needsResearch){
     setEquipStatus('Pesquisando estações e exercícios das máquinas identificadas…');
     try{
      const rr=await fetch('/api/training/equipment/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:merged})});
      const rj=await readApiJson<{items?:EquipmentItem[];error?:string}>(rr);
      if(rr.ok&&rj.items?.length){
       setEquipDraft(rj.items);
       toast.success('Detalhes e exercícios das máquinas pesquisados!');
      }
     }catch{/* non-fatal: user already has scanned items */}
    }
   }
  }catch(e){
   const msg=userFacingError(e,'Não foi possível identificar os equipamentos agora.');
   setEquipError(msg);toast.error(msg);
  }finally{setEquipBusy(false);setEquipStatus('');}
 }
 function addEquipItem(){const next=mergeEquipment(equipDraft,[{label:equipNew}]);if(next.length===equipDraft.length){if(equipNew.trim())toast.error(equipDraft.length>=EQUIP_MAX_ITEMS?'Limite de itens atingido.':'Esse item já está na lista.');return;}setEquipDraft(next);setEquipNew('');}
 async function saveEquipInventory(){const next:State={...data};if(equipDraft.length)next.equipment_inventory=equipDraft;else delete next.equipment_inventory;if(await save(next)){toast.success('Inventário salvo.');closeEquipWizard();}}
 async function clearEquipInventory(){const next:State={...data};delete next.equipment_inventory;if(await save(next))toast.success('Inventário removido.');}
 async function suggestFromEquipDraft(){
  const inv=equipDraft;
  if(inv.length){
   const next:State={...data,equipment_inventory:inv};
   await save(next);
  }
  clearEquipPhotos();setEquipWizard('closed');
  openCuration('',inv);
 }
 async function saveWorkoutObject(workout:Workout):Promise<boolean>{
  const parsed=workoutSchema.safeParse(workout);
  if(!parsed.success){toast.error('Dê um nome ao treino, adicione exercícios e confira os valores.');return false;}
  const original=data.workouts.find(w=>w.id===workout.id);
  const exists=!!original;
  const contentChanged=!!original?.prescribed_at&&!original.patient_edited_at&&JSON.stringify({name:original.name,items:original.items})!==JSON.stringify({name:parsed.data.name,items:parsed.data.items});
  const toSave=contentChanged?{...parsed.data,patient_edited_at:new Date().toISOString()}:parsed.data;
  const order=data.workoutOrder??data.workouts.map(w=>w.id);
  const ok=await save({...data,workouts:exists?data.workouts.map(w=>w.id===workout.id?toSave:w):[...data.workouts,toSave],workoutOrder:exists?order:[...order,toSave.id],planCycleStartedAt:new Date().toISOString()});
  if(ok){setReminderDismissed(true);toast.success('Treino salvo. Novo ciclo de 6 semanas iniciado.');}
  return ok;
 }

 function add(name:string|null){if(!name||!edit)return;const ex=exercises.find(x=>x.name===name);if(ex)setEdit({...edit,items:[...edit.items,{...ex,id:uid(),sets:3,reps:10,rest:90}]});}
 function editItem(index:number,patch:Partial<Item>){if(edit)setEdit({...edit,items:edit.items.map((x,i)=>i===index?{...x,...patch}:x)})}
 async function saveWorkout(){if(!edit)return;if(await saveWorkoutObject(edit))setEdit(null);}
 async function start(w:Workout){enableAudio();const session:Session={id:uid(),workoutId:w.id,name:w.name,started:new Date().toISOString(),finished:null,items:w.items.map(i=>{const previous=data.sessions.find(s=>s.items.some(x=>x.name===i.name&&(x.variation??'')===(i.variation??'')))?.items.find(x=>x.name===i.name&&(x.variation??'')===(i.variation??''));return {...i,logs:Array.from({length:i.sets},(_,n)=>({kg:previous?.logs[n]?.kg??null,reps:i.reps,done:false}))}})};if(await save({...data,active:session,timer:null}))setTab('session')}
 function logEdit(i:number,n:number,k:'kg'|'reps',v:number|null){if(!data.active)return;const next=structuredClone(data);if(k==='kg')next.active!.items[i].logs.forEach((log,index)=>{if(index>=n)log.kg=v});else if(v!==null)next.active!.items[i].logs[n].reps=v;setData(next);setDirty(true)}
 async function completeSet(i:number,n:number,done:boolean){if(!data.active)return;enableAudio();const next=structuredClone(data);next.active!.items[i].logs[n].done=done;const rest=next.active!.items[i].rest;if(done&&rest>0)next.timer={end:Date.now()+rest*1000,left:rest,total:rest};if(await save(next)){
 setTick(Date.now());
 const item=next.active!.items[i];
 const key=`${next.active!.id}-${item.id}`;
 const completed=item.logs.every(log=>log.done);
 if(completed){
  const trigger=document.getElementById(`exercise-toggle-${key}`);
  if(trigger?.closest('article')?.contains(document.activeElement))trigger.focus();
 }
 setExerciseOpen(previous=>({...previous,[key]:!completed}));
 }}
 async function finishSession(){if(!data.active)return;const completed={...data.active,finished:new Date().toISOString()};if(await save({...data,sessions:[completed,...data.sessions],active:null,timer:null})){setCoachTips({});setFinish(false);setTab('history');toast.success('Treino registrado!')}}
 async function discardSession(){if(!data.active)return;if(await save({...data,active:null,timer:null})){setCoachTips({});setDiscard(false);setTab('workouts');toast.success('Sessão descartada. Nenhum treino foi registrado.')}}
 function historyItemEdit(index:number,patch:Partial<Item>){if(historyEdit)setHistoryEdit({...historyEdit,items:historyEdit.items.map((item,i)=>i===index?{...item,...patch}:item)})}
 function historyLogEdit(itemIndex:number,logIndex:number,patch:{kg?:number|null,reps?:number,done?:boolean}){if(!historyEdit)return;const next=structuredClone(historyEdit);next.items[itemIndex].logs[logIndex]={...next.items[itemIndex].logs[logIndex],...patch};setHistoryEdit(next)}
 async function saveHistory(){if(!historyEdit)return;const parsed=sessionSchema.safeParse(historyEdit);if(!parsed.success){toast.error('Confira os dados desta sessão.');return;}if(await save({...data,sessions:data.sessions.map(s=>s.id===parsed.data.id?parsed.data:s)})){setHistoryEdit(null);setDetail(null);toast.success('Histórico atualizado.')}}
 async function restartCycle(){if(await save({...data,planCycleStartedAt:new Date().toISOString()})){setReminderDismissed(true);toast.success('Novo ciclo de 6 semanas iniciado.')}}
  const active=data.active,total=active?.items.reduce((s,i)=>s+i.logs.length,0)??0,done=active?count(active):0,canFinishAtBottom=total>0&&done/total>=.75;
 const trainingProgress=active?summarizeProgress(active,null):null;
 const filtered=exercises.filter(x=>(group==='all'||x.group===group)&&x.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()));
 if(sessionError)return <div className="app-shell"><header className="topbar"><div className="topbar-inner"><a href="/" className="brand"><span className="brand-icon"><Dumbbell size={20}/></span><span className="brand-meta"><span className="brand-eyebrow">FitCore</span><span className="brand-sub">HealthCore · treino</span></span></a><a className="portal-link" href={PORTAL_HOME_URL}>Voltar ao portal</a></div></header><div className="session-gate"><h1>FitCore</h1><p>{sessionError}</p><p>Use “Abrir sala de treino” no portal do paciente.</p><a className="primary" href={PORTAL_HOME_URL} style={{display:'inline-flex',marginTop:8}}>Voltar ao portal</a></div></div>;
 return <div className="app-shell"><Toaster theme="light" position="top-center" richColors/><UpdateGate defer={!profileReady||loading||!!active||dirty||busy}/><header className="topbar"><div className="topbar-inner"><a href="/" className="brand"><span className="brand-icon"><Dumbbell size={20}/></span><span className="brand-meta"><span className="brand-eyebrow">FitCore</span><span className="brand-sub">HealthCore · treino</span></span></a><div className="profile-control"><span className="profile-badge">{person}</span>{healthConsent===true&&<span className="profile-badge health-badge" title="Sugestões e dicas consideram seu contexto de saúde">Modo saúde</span>}<a className="portal-link" href={PORTAL_HOME_URL}>Voltar ao portal</a><button type="button" className="portal-link" onClick={()=>void logoutFitCore()}>Sair</button></div></div></header>
 <main><div className="page-heading"><div><p className="eyebrow">SEU TREINO</p><h1>Olá, {person}<span className="lime">.</span></h1></div><div className="save-status"><Cloud size={16}/>{busy?'Salvando…':dirty?'Alterações não salvas':'Treinos e histórico sincronizados'}</div></div>
 {healthConsent===false&&<div className="health-cta" role="note"><span>Ative o <strong>Modo saúde</strong> no portal para que sugestões e dicas considerem seu contexto de saúde.</span><a className="portal-link" href={PORTAL_HOME_URL}>Abrir portal</a></div>}
 {error&&<div className="error" role="alert"><p>{error}</p><button onClick={load} disabled={busy}>Recarregar dados</button></div>}
 <Tabs value={tab} onValueChange={setTab}><TabsList className="main-tabs"><TabsTrigger value="workouts"><Dumbbell/>Fichas</TabsTrigger><TabsTrigger value="session"><Play/>{active?'Em andamento':'Treinar'}</TabsTrigger><TabsTrigger value="history"><History/>Histórico</TabsTrigger><TabsTrigger value="library"><BookOpen/>Exercícios</TabsTrigger></TabsList>
 {loading?<div className="loading"><Skeleton className="h-48 w-full"/><Skeleton className="h-48 w-full"/></div>:<>
 <TabsContent value="workouts"><div className="section-heading"><div><h2>Suas fichas</h2><p>{data.workouts.length?`${data.workouts.length} ficha${data.workouts.length===1?'':'s'} configurada${data.workouts.length===1?'':'s'}`:'Monte sua divisão e deixe tudo pronto para treinar.'}</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button className="secondary" onClick={()=>openEquipWizard('capture')} disabled={busy||!!error}><Camera size={18}/>Fotografar equipamentos</button><button className="secondary" onClick={()=>openCuration()} disabled={busy||!!error}><Sparkles size={18}/>{healthConsent===true?'Sugerir com modo saúde':'Sugerir com IA'}</button><button className="primary" onClick={newWorkout} disabled={busy||!!error}><Plus size={18}/>Criar treino</button></div></div>{!!data.equipment_inventory?.length&&<div className="equip-saved"><div className="equip-saved-head"><strong>Seus equipamentos ({data.equipment_inventory.length})</strong><div style={{display:'flex',gap:10}}><button type="button" className="equip-clear" onClick={()=>openEquipWizard('review')} disabled={busy}>Editar / Pesquisar</button><button type="button" className="equip-clear" onClick={()=>void clearEquipInventory()} disabled={busy}>Limpar</button></div></div><div className="equip-chips">{data.equipment_inventory.map(it=><span className="equip-chip" key={it.label} title={[it.brand_model,it.stations?.join(' · '),it.notes].filter(Boolean).join(' — ')||undefined}>{it.label}{it.brand_model&&<small className="equip-sub"> · {it.brand_model}</small>}{!!it.stations?.length&&<small className="equip-sub"> ({it.stations.length} estações)</small>}</span>)}</div></div>}{data.planCycleStartedAt&&<div className="cycle-status"><RefreshCw size={17}/><span>Ciclo atual: semana {Math.min(6,Math.floor(cycleDays/7)+1)} de 6</span><small>As 6 semanas são corridas, mesmo se houver semanas sem treino.</small></div>}
 {active&&<button className="resume-banner" onClick={()=>setTab('session')}><span><span className="eyebrow">EM ANDAMENTO</span><strong>{active.name}</strong><small>{done} de {total} séries concluídas</small></span><span className="resume-link">Continuar <ChevronRight/></span></button>}
 {!data.workouts.length?<div className="empty-workout"><div className="empty-emblem"><Dumbbell size={38}/></div><p className="eyebrow">COMECE PELO SEU TREINO</p><h2>Seu próximo treino<br/>começa aqui.</h2><p>Fotografe os aparelhos da sua academia, escolha os exercícios<br className="desktop"/> sugeridos e receba instruções de como executar cada um.</p><button className="primary" onClick={newWorkout} disabled={!!error}><Plus size={18}/>Montar primeiro treino</button><button className="secondary" onClick={()=>openEquipWizard('capture')} disabled={!!error||busy}><Camera size={18}/>Fotografar equipamentos</button><button className="secondary" onClick={()=>openCuration()} disabled={!!error||busy}><Sparkles size={18}/>Sugerir com IA</button><div className="empty-footer"><span>{exercises.length} exercícios na biblioteca</span><span>Liberado pelo portal HealthCore</span></div></div>:<div className="workout-grid">{orderedWorkouts.map((w,index)=>{const times=weeklyCount(w,data.sessions,today);return <article className="workout-card" key={w.id}><div className="card-top"><span className="workout-number">{String(index+1).padStart(2,'0')}</span><div><button className="icon-button" aria-label={`Editar ${w.name}`} onClick={()=>setEdit(structuredClone(w))}><Pencil size={17}/></button><button className="icon-button" aria-label={`Excluir ${w.name}`} onClick={()=>setRemove(w.id)}><Trash2 size={17}/></button></div></div>{w.prescribed_at&&<p className="prescribed-badge" data-testid="prescribed-badge"><span className="outline-tag">Prescrito{w.prescribed_by_name?` · ${w.prescribed_by_name}`:''}</span>{w.patient_edited_at&&<small className="patient-edited"> ajustado por você</small>}</p>}<h3>{w.name}</h3><p>{w.items.length} exercícios · {w.items.reduce((a,x)=>a+x.sets,0)} séries · ~{Math.ceil(estimateSeconds(w.items)/60)} min</p><p className="created-date">Criada em {new Date(w.createdAt??legacyWorkoutCreatedAt).toLocaleDateString('pt-BR',{timeZone:trainingZone})}</p><p className="weekly-badge">{times?`Feito ${times}x nesta semana`:'Ainda não feito nesta semana'}</p><div className="muscle-tags">{[...new Set(w.items.map(i=>i.group))].map(g=><span key={g}>{g}</span>)}</div><ol>{w.items.slice(0,4).map(i=><li key={i.id}><span>{i.name}</span><small>{i.sets} × {i.reps}</small></li>)}</ol>{w.items.length>4&&<p className="more">+{w.items.length-4} exercícios</p>}<button className="primary full" disabled={busy||!!active} onClick={()=>start(w)}><Play size={17}/>{active?'Há um treino em andamento':times?'Repetir treino':'Iniciar treino'}</button></article>})}</div>}
 </TabsContent>
 <TabsContent value="session">{!active?<div className="simple-empty"><Play size={36}/>{suggested?<><p className="eyebrow">SUGESTÃO DA SEMANA</p><h2>{suggested.name}</h2><p>{suggestedTimes?`Todos os treinos já foram feitos nesta semana. Que tal repetir este? Feito ${suggestedTimes}x nesta semana.`:'Próximo treino ainda não feito nesta semana, seguindo a ordem da sua lista.'}</p><p>{suggested.items.length} exercícios · ~{Math.ceil(estimateSeconds(suggested.items)/60)} min</p><button className="primary" disabled={busy||!!error} onClick={()=>start(suggested)}><Play size={18}/>{suggestedTimes?'Repetir treino':'Iniciar treino'}</button><button className="secondary" onClick={()=>setTab('workouts')}>Escolher outro treino</button><p className="estimate-note">Semana de segunda a domingo, no horário de Curitiba.</p></>:<><h2>Pronto para começar?</h2><p>Monte seu primeiro treino para receber uma sugestão aqui.</p><button className="primary" onClick={()=>setTab('workouts')}>Ver meus treinos</button></>}</div>:<><div className="section-heading"><div><p className="eyebrow">TREINO EM ANDAMENTO</p><h2>{active.name}</h2><p>{done} de {total} séries · estimativa total ~{Math.ceil(estimateSeconds(active.items)/60)} min · iniciado às {new Date(active.started).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:trainingZone})}</p></div><button className="secondary" disabled={busy} onClick={()=>setFinish(true)}><CheckCircle2 size={18}/>Finalizar</button></div><Progress value={total?done/total*100:0} className="session-progress"/>
 <div className="session-layout"><div className="session-exercises">{active.items.map((i,index)=>{const exerciseDone=i.logs.filter(log=>log.done).length;const nextSet=i.logs.findIndex(log=>!log.done);const completed=nextSet===-1;const key=`${active.id}-${i.id}`;const isOpen=exerciseOpen[key]??!completed;const previous=data.sessions.find(s=>s.items.some(x=>x.name===i.name&&(x.variation??'')===(i.variation??'')))?.items.find(x=>x.name===i.name&&(x.variation??'')===(i.variation??''));return <Collapsible key={key} open={isOpen} onOpenChange={open=>setExerciseOpen(previous=>({...previous,[key]:open}))} asChild><article className={`exercise-card ${completed?'exercise-card-finished':''}`}><CollapsibleTrigger asChild><button type="button" id={`exercise-toggle-${key}`} className="exercise-toggle" aria-label={`${i.name}, ${exerciseDone} de ${i.logs.length} séries concluídas${completed?', exercício concluído':''}`}><span className="exercise-index">{completed?<CheckCircle2 size={26} className="completed-check" aria-hidden="true"/>:String(index+1).padStart(2,'0')}</span><span className="exercise-title"><span className="eyebrow">{i.group}</span><span className="exercise-name">{i.name}</span><span className="exercise-summary">{completed?'Concluído · ':''}{exerciseDone} de {i.logs.length} séries{i.equipment?` · ${i.equipment}`:''}</span></span><span className="rest-label"><Timer size={15}/>{fmt(i.rest)}</span><ChevronDown size={19} className="exercise-chevron" aria-hidden="true"/></button></CollapsibleTrigger><CollapsibleContent className="exercise-body"><div className="session-exercise-meta">{i.equipment&&<span className="curate-equip-tag"><Wrench size={13}/>{i.equipment}</span>}<button type="button" className="secondary coach-tip-btn" disabled={busy||coachingKey===key} onClick={e=>{e.preventDefault();e.stopPropagation();void askCoach(i,key,nextSet)}}><Sparkles size={16}/>{coachingKey===key?'Gerando dica…':'Dica'}</button></div>{i.instructions&&<details className="session-exec-guide"><summary>Como executar</summary><div className="exec-guide-body">{i.instructions.split(/\r?\n/).filter(Boolean).map((line,li)=><p key={li}>{line}</p>)}</div></details>}<label className="field variation-field">Variação<input aria-label={`Variação de ${i.name}`} placeholder="Ex.: pegada neutra, banco inclinado…" maxLength={300} disabled={busy} value={i.variation??''} onChange={e=>{const next=structuredClone(data);next.active!.items[index].variation=e.target.value;setData(next);setDirty(true)}}/></label><div className={`exercise-counter ${exerciseDone===i.logs.length?'exercise-complete':''}`} aria-live="polite" aria-atomic="true"><div><strong>{exerciseDone}<span> / {i.logs.length}</span></strong><span>séries concluídas</span></div><p>{nextSet===-1?<><CheckCircle2 size={17}/>Exercício concluído</>:<>Próxima: série {nextSet+1}</>}</p></div><Progress value={exerciseDone/i.logs.length*100} className="exercise-progress" aria-label={`Progresso de ${i.name}`}/><div className="set-head"><span>SÉRIE</span><span>KG</span><span>REPS</span><span>FEITA</span></div>{i.logs.map((l,n)=><div className={`set-row ${l.done?'done':''}`} key={n}><span className="set-index">{n+1}</span><WeightInput aria-label={`Carga da série ${n+1} de ${i.name}`} inputMode="decimal" min="0" max="2000" step="0.5" value={l.kg} disabled={busy} onValueChange={value=>logEdit(index,n,'kg',value)}/><NumericInput aria-label={`Repetições da série ${n+1} de ${i.name}`} inputMode="numeric" min="0" max="1000" value={l.reps} disabled={busy} onValueChange={value=>logEdit(index,n,'reps',value)}/><Checkbox className="series-check" aria-label={`Concluir série ${n+1} de ${i.name}`} checked={l.done} disabled={busy} onCheckedChange={v=>completeSet(index,n,!!v)}/></div>)}<p className="last-session">{previous?`Última sessão: ${previous.logs.filter(l=>l.done).map(l=>`${displayKg(l.kg)} × ${l.reps}`).join(' · ')||'sem séries concluídas'}`:'Primeiro registro deste exercício.'}</p>{coachTips[key]&&<div className="coach-tip" role="status"><div className="coach-tip-head"><span className="eyebrow">COACH</span><button type="button" className="icon-button" aria-label="Fechar dica" onClick={()=>setCoachTips(prev=>{const next={...prev};delete next[key];return next})}>×</button></div><p>{coachTips[key].tip_technique}</p>{coachTips[key].tip_progression&&<p className="coach-tip-progress">{coachTips[key].tip_progression}</p>}</div>}</CollapsibleContent></article></Collapsible>})}<button className="secondary full" disabled={busy||!dirty} onClick={()=>save(data)}><Save size={18}/>{dirty?'Salvar alterações do treino':'Todas as alterações salvas'}</button>{canFinishAtBottom&&<button className="primary full" disabled={busy} onClick={()=>setFinish(true)}><CheckCircle2 size={18}/>Finalizar treino</button>}</div>
 <aside className={`timer-card ${timer?'timer-card-active':''}`}>
  <div className="timer-title"><Timer size={20}/><h3>Descanso</h3></div>
  <div className={`timer-digits ${timer&&remaining===0?'timer-complete':''}`} role="timer" aria-label={`${remaining} segundos de descanso`}>{fmt(remaining)}</div>
  <p aria-live="polite">{!timer?'Começa ao concluir uma série.':remaining===0?'Hora da próxima série.':timer.end?'Respire. Sua próxima série vem aí.':'Timer pausado.'}</p>
  {timer&&<><Progress value={timer.total?Math.min(100,remaining/timer.total*100):0}/><div className="timer-actions"><button className="secondary" disabled={busy||remaining===0} onClick={()=>save({...data,timer:{...timer,end:timer.end?null:Date.now()+remaining*1000,left:remaining}})}>{timer.end?<Pause size={16}/>:<Play size={16}/>}<span>{timer.end?'Pausar':'Retomar'}</span></button><button className="secondary" disabled={busy} onClick={()=>save({...data,timer:{...timer,end:timer.end?Date.now()+(remaining+30)*1000:null,left:remaining+30,total:Math.max(timer.total,remaining+30)}})}>+30 s</button></div><button className="text-button full" disabled={busy} onClick={()=>save({...data,timer:null})}><SkipForward size={17}/>Pular descanso</button></>}
  <small>Mantenha o app aberto para ouvir o aviso. A contagem é retomada ao voltar.</small>
  {trainingProgress&&<div className="timer-workout-progress">
   <div className="timer-workout-progress-heading"><span>Treino concluído</span><strong>{trainingProgress.percent}%</strong></div>
   <Progress value={trainingProgress.percent} aria-label={`Progresso do treino: ${trainingProgress.percent}%`}/>
   <small>{trainingProgress.done}/{trainingProgress.total} séries concluídas</small>
  </div>}
 </aside></div></> }</TabsContent>
 <TabsContent value="history"><div className="section-heading"><div><h2>Seu histórico</h2><p>{data.sessions.length} treinos registrados</p></div><span className="outline-tag">{person}</span></div><TrainingInsights key={profile} sessions={data.sessions} person={person} today={today} onDetail={setDetail}/>{!data.sessions.length?<div className="simple-empty"><History size={36}/><h2>Uma sessão de cada vez.</h2><p>Seus treinos concluídos aparecerão aqui.</p></div>:<div className="history-list">{data.sessions.map(s=><button key={s.id} className="history-row" onClick={()=>setDetail(s)}><div className="date-tile"><strong>{Number(localDay(s.finished??s.started).slice(8,10))}</strong><small>{new Date(s.finished??s.started).toLocaleDateString('pt-BR',{month:'short',timeZone:trainingZone})}</small></div><div><h3>{s.name}</h3><p>{new Date(s.finished??s.started).toLocaleDateString('pt-BR',{timeZone:trainingZone})} · {count(s)} séries concluídas · {Math.max(1,Math.round((Date.parse(s.finished!)-Date.parse(s.started))/60000))} min</p></div><ChevronRight size={20}/></button>)}</div>}</TabsContent>
 <TabsContent value="library"><div className="section-heading"><div><h2>Biblioteca de exercícios</h2><p>{exercises.length} exercícios para montar seus treinos.</p></div></div><div className="library-filters"><input placeholder="Buscar exercício…" aria-label="Buscar exercício" value={search} onChange={e=>setSearch(e.target.value)}/><Select value={group} onValueChange={setGroup}><SelectTrigger aria-label="Grupo muscular"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos os grupos</SelectItem>{Object.keys(exerciseGroups).map(g=><SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div><div className="library-grid">{filtered.map(e=><div className="library-item" key={e.name}><span className="library-icon"><Dumbbell size={20}/></span><div><h3>{e.name}</h3><p>{e.group}</p></div></div>)}</div>{!filtered.length&&<p className="simple-empty">Nenhum exercício encontrado.</p>}</TabsContent>
 </> }</Tabs>
 </main><footer className="footer"><span>FitCore · HealthCore</span><span>Seu ritmo. Seu registro.</span></footer>
 <Dialog open={equipWizard!=='closed'} onOpenChange={o=>{if(!o)closeEquipWizard()}}><DialogContent className="editor-dialog equip-dialog" showCloseButton={!equipBusy}><DialogHeader><DialogTitle>{equipWizard==='review'?'Confirme seus equipamentos':'Fotografar equipamentos'}</DialogTitle><DialogDescription>{equipWizard==='review'?'Confira as máquinas, estações detectadas e exercícios pesquisados. Você pode remover, adicionar à mão ou pesquisar novamente.':`Até ${EQUIP_MAX_PHOTOS} fotos da academia (incluindo vários ângulos e etiquetas de marca de estações compactas). As fotos não são guardadas.`}</DialogDescription></DialogHeader>{equipError&&<div className="equip-alert" role="alert">{equipError}</div>}{equipStatus&&<div className="equip-status" role="status"><RefreshCw size={15} className="animate-spin"/><span>{equipStatus}</span></div>}{equipWizard==='capture'&&<><div className={`equip-pickers${equipPhotos.length>=EQUIP_MAX_PHOTOS?' disabled':''}`}><label className="equip-picker"><Camera size={22}/><span>{equipPhotos.length?'Outra foto (câmera)':'Tirar foto'}</span><input type="file" accept={EQUIP_ACCEPT} capture="environment" disabled={equipBusy||equipPhotos.length>=EQUIP_MAX_PHOTOS} onChange={e=>{pickEquipPhotos(e.target.files);e.target.value='';}}/></label><label className="equip-picker"><Images size={22}/><span>{equipPhotos.length?'Outras da galeria':'Escolher da galeria'}</span><input type="file" accept={EQUIP_ACCEPT} multiple disabled={equipBusy||equipPhotos.length>=EQUIP_MAX_PHOTOS} onChange={e=>{pickEquipPhotos(e.target.files);e.target.value='';}}/></label></div>{!equipPhotos.length&&<p className="equip-hint">Dica: fotografe todos os lados da estação compacta, a etiqueta da marca/modelo e os pesos livres. Evite HEIC.</p>}{!!equipPhotos.length&&<div className="equip-thumbs">{equipPhotos.map(ph=>(<div className="equip-thumb" key={ph.id}><img src={ph.url} alt="Foto de equipamento"/><button type="button" aria-label="Remover foto" disabled={equipBusy} onClick={()=>removeEquipPhoto(ph.id)}><X size={14}/></button></div>))}</div>}<div className="equip-actions"><button type="button" className="secondary" onClick={closeEquipWizard} disabled={equipBusy}>Cancelar</button><button type="button" className="primary" onClick={()=>void scanEquipment()} disabled={equipBusy||!equipPhotos.length}><Sparkles size={18}/>{equipBusy?'Analisando…':`Identificar (${equipPhotos.length})`}</button></div>{!!equipDraft.length&&<button type="button" className="equip-link" onClick={()=>{setEquipError('');setEquipWizard('review');}} disabled={equipBusy}>Editar lista atual ({equipDraft.length})</button>}</>}{equipWizard==='review'&&<>{equipDraft.some(it=>it.brand_model||it.stations?.length||it.researched_exercises?.length)&&<div className="equip-detail-cards">{equipDraft.filter(it=>it.brand_model||it.stations?.length||it.researched_exercises?.length).map(it=>(<div className="equip-detail-card" key={`detail-${it.label}`}><div className="equip-detail-head"><div><strong>{it.label}</strong>{it.brand_model&&<span className="equip-model-badge">{it.brand_model}</span>}</div><button type="button" className="icon-button" aria-label={`Remover ${it.label}`} disabled={equipBusy} onClick={()=>setEquipDraft(cur=>cur.filter(x=>x.label!==it.label))}><X size={15}/></button></div>{it.notes&&<p className="equip-detail-notes">{it.notes}</p>}{!!it.stations?.length&&<ul className="equip-stations">{it.stations.map(st=><li key={st}>{st}</li>)}</ul>}{!!it.researched_exercises?.length&&<p className="equip-researched-count">{it.researched_exercises.length} exercícios mapeados para este aparelho</p>}</div>))}</div>}<div className="equip-chips">{equipDraft.length?equipDraft.filter(it=>!(it.brand_model||it.stations?.length||it.researched_exercises?.length)).map(it=>(<span className="equip-chip removable" key={it.label}>{it.label}<button type="button" aria-label={`Remover ${it.label}`} disabled={equipBusy} onClick={()=>setEquipDraft(cur=>cur.filter(x=>x.label!==it.label))}><X size={13}/></button></span>)):<p className="equip-empty">Nenhum equipamento na lista. Adicione à mão ou tire novas fotos.</p>}</div><form className="equip-add" onSubmit={e=>{e.preventDefault();addEquipItem();}}><input placeholder="Adicionar equipamento ou modelo (ex.: BodyCraft X4)…" aria-label="Adicionar equipamento" maxLength={40} value={equipNew} onChange={e=>setEquipNew(e.target.value)}/><button type="submit" className="secondary" disabled={!equipNew.trim()||equipBusy}><Plus size={16}/>Adicionar</button></form><div className="equip-actions"><button type="button" className="secondary" onClick={()=>{setEquipError('');setEquipWizard('capture');}} disabled={busy||equipBusy}><Camera size={18}/>Mais fotos</button><button type="button" className="secondary" onClick={()=>void researchEquipment(equipDraft)} disabled={busy||equipBusy||!equipDraft.length}><Search size={17}/>{equipBusy?'Pesquisando…':'Pesquisar máquinas'}</button><button type="button" className="secondary" onClick={()=>void saveEquipInventory()} disabled={busy||equipBusy||!!error}><Save size={18}/>Salvar lista</button><button type="button" className="primary" onClick={()=>void suggestFromEquipDraft()} disabled={busy||equipBusy||!!error||!equipDraft.length}><Sparkles size={18}/>Montar treino</button></div></>}</DialogContent></Dialog>
 <WorkoutCurationDialog open={curationOpen} onOpenChange={setCurationOpen} inventory={curationInventory??data.equipment_inventory??[]} healthConsent={healthConsent} initialFocus={curationFocus} busy={busy} onSaveWorkout={saveWorkoutObject} onOpenInEditor={w=>setEdit(w)} readApiJson={readApiJson} friendlyHttpError={friendlyHttpError} userFacingError={userFacingError}/>
 <Dialog open={!!edit} onOpenChange={open=>{if(!open&&!busy)setEdit(null)}}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>{data.workouts.some(w=>w.id===edit?.id)?'Editar treino':'Montar treino'}</DialogTitle><DialogDescription>Configure o treino de {person}. Ao salvar uma ficha nova ou alterada, começa um novo ciclo de 6 semanas.</DialogDescription></DialogHeader>{edit&&<><label className="field">Nome do treino<input placeholder="Ex.: Treino A · Peito e tríceps" maxLength={80} value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></label><ExercisePicker onAdd={add}/><div className="editor-list">{!edit.items.length&&<div className="editor-empty" style={{display:"grid",gap:12,justifyItems:"center"}}><p>Selecione um exercício ou monte opções com IA.</p><button type="button" className="secondary" disabled={busy} onClick={()=>{const f=edit.name;setEdit(null);openCuration(f);}}><Sparkles size={17}/>Montar com IA</button></div>}{edit.items.map((i,index)=><div className="editor-item" key={i.id}><div className="editor-item-heading"><div><span className="eyebrow">{i.group}</span><h3>{index+1}. {i.name}</h3></div><div className="reorder-buttons"><button className="icon-button" aria-label={`Mover ${i.name} para cima`} disabled={index===0} onClick={()=>{const a=[...edit.items];[a[index-1],a[index]]=[a[index],a[index-1]];setEdit({...edit,items:a})}}><ArrowUp size={16}/></button><button className="icon-button" aria-label={`Mover ${i.name} para baixo`} disabled={index===edit.items.length-1} onClick={()=>{const a=[...edit.items];[a[index+1],a[index]]=[a[index],a[index+1]];setEdit({...edit,items:a})}}><ArrowDown size={16}/></button><button className="icon-button" aria-label={`Remover ${i.name}`} onClick={()=>setEdit({...edit,items:edit.items.filter(x=>x.id!==i.id)})}><Trash2 size={16}/></button></div></div><label className="field variation-field">Equipamento / estação<input aria-label={`Equipamento de ${i.name}`} placeholder="Ex.: BodyCraft X4 · Estação 2 (Puxador alto)" maxLength={160} value={i.equipment??''} onChange={e=>editItem(index,{equipment:e.target.value})}/></label><label className="field variation-field">Variação<input aria-label={`Variação de ${i.name}`} placeholder="Ex.: pegada neutra, banco inclinado…" maxLength={300} value={i.variation??''} onChange={e=>editItem(index,{variation:e.target.value})}/></label><label className="field variation-field">Instruções de execução<textarea className="exec-textarea" aria-label={`Instruções de ${i.name}`} placeholder="1. Ajuste do aparelho…&#10;2. Execução do movimento…&#10;3. Postura e respiração…" maxLength={1200} rows={3} value={i.instructions??''} onChange={e=>editItem(index,{instructions:e.target.value})}/></label><div className="edit-numbers"><Numeric label="Séries" value={i.sets} min={1} max={20} onChange={n=>editItem(index,{sets:n})}/><Numeric label="Repetições" value={i.reps} min={1} max={1000} onChange={n=>editItem(index,{reps:n})}/><Numeric label="Descanso (s)" value={i.rest} max={1800} onChange={n=>editItem(index,{rest:n})}/></div></div>)}</div><p className="estimate-note">Tempo estimado: ~{Math.ceil(estimateSeconds(edit.items)/60)} min. Considera 3 s por repetição e os descansos entre séries, sem descanso após a última série de cada exercício. Não inclui aquecimento ou troca de aparelhos.</p>{error&&<p className="error" role="alert">{error}</p>}<button className="primary full" disabled={busy} onClick={saveWorkout}><Check size={18}/>{busy?'Salvando…':'Salvar treino'}</button></>}</DialogContent></Dialog>
 <Dialog open={!!detail} onOpenChange={o=>{if(!o)setDetail(null)}}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>{detail?.name}</DialogTitle><DialogDescription>{detail&&new Date(detail.started).toLocaleString('pt-BR',{timeZone:trainingZone})}</DialogDescription></DialogHeader>{detail?.items.map(i=><div className="detail-exercise" key={i.id}><h3>{i.name}</h3>{i.variation&&<p>Variação: {i.variation}</p>}<p>{i.logs.map((l,n)=>l.done?`${n+1}ª: ${displayKg(l.kg)} × ${l.reps} reps`:`${n+1}ª: não concluída`).join(' / ')}</p></div>)}{detail&&<div className="history-actions"><button className="secondary" onClick={()=>{setHistoryEdit(structuredClone(detail));setDetail(null)}}><Pencil size={17}/>Editar registro</button><button className="danger-button" onClick={()=>{setRemoveSession(detail.id);setDetail(null)}}><Trash2 size={17}/>Excluir registro</button></div>}</DialogContent></Dialog>
 <Dialog open={!!historyEdit} onOpenChange={open=>{if(!open&&!busy)setHistoryEdit(null)}}><DialogContent className="editor-dialog history-editor"><DialogHeader><DialogTitle>Editar histórico</DialogTitle><DialogDescription>Corrija a data, o nome, as cargas, repetições, variações e séries concluídas.</DialogDescription></DialogHeader>{historyEdit&&<><label className="field">Nome do treino<input maxLength={80} value={historyEdit.name} onChange={e=>setHistoryEdit({...historyEdit,name:e.target.value})}/></label><label className="field">Data do treino<input type="date" value={localDay(historyEdit.finished??historyEdit.started)} onChange={e=>e.target.value&&setHistoryEdit(moveSessionToDay(historyEdit,e.target.value))}/></label><div className="editor-list">{historyEdit.items.map((item,itemIndex)=><div className="editor-item" key={item.id}><div className="editor-item-heading"><div><span className="eyebrow">{item.group}</span><h3>{item.name}</h3></div></div><label className="field variation-field">Variação<input maxLength={300} value={item.variation??''} onChange={e=>historyItemEdit(itemIndex,{variation:e.target.value})}/></label><div className="set-head"><span>SÉRIE</span><span>KG</span><span>REPS</span><span>FEITA</span></div>{item.logs.map((log,logIndex)=><div className={`set-row ${log.done?'done':''}`} key={logIndex}><span className="set-index">{logIndex+1}</span><WeightInput aria-label={`Carga da série ${logIndex+1} de ${item.name}`} value={log.kg} onValueChange={kg=>historyLogEdit(itemIndex,logIndex,{kg})}/><NumericInput aria-label={`Repetições da série ${logIndex+1} de ${item.name}`} min="0" max="1000" value={log.reps} onValueChange={reps=>historyLogEdit(itemIndex,logIndex,{reps})}/><Checkbox className="series-check" aria-label={`Série ${logIndex+1} concluída`} checked={log.done} onCheckedChange={done=>historyLogEdit(itemIndex,logIndex,{done:!!done})}/></div>)}</div>)}</div><button className="primary full" disabled={busy} onClick={saveHistory}><Save size={18}/>{busy?'Salvando…':'Salvar correções'}</button></>}</DialogContent></Dialog>
 <AlertDialog open={!!remove} onOpenChange={v=>{if(!v)setRemove(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir este treino?</AlertDialogTitle><AlertDialogDescription>O histórico das sessões já registradas será preservado.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={async e=>{e.preventDefault();if(await save({...data,workouts:data.workouts.filter(w=>w.id!==remove),workoutOrder:(data.workoutOrder??data.workouts.map(w=>w.id)).filter(id=>id!==remove),planCycleStartedAt:new Date().toISOString()})){setRemove(null);setReminderDismissed(true)}}}>Excluir treino</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <AlertDialog open={!!removeSession} onOpenChange={v=>{if(!v)setRemoveSession(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir este registro?</AlertDialogTitle><AlertDialogDescription>Ele será removido do histórico, do calendário, das contagens semanais e dos gráficos. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={async e=>{e.preventDefault();if(await save({...data,sessions:data.sessions.filter(s=>s.id!==removeSession)})){setRemoveSession(null);toast.success('Registro excluído do histórico.')}}}>Excluir registro</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <AlertDialog open={finish} onOpenChange={setFinish}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Finalizar treino?</AlertDialogTitle><AlertDialogDescription>{done===total?'Todas as séries foram concluídas.':`${done} de ${total} séries concluídas. Se salvar, as demais ficarão marcadas como não concluídas.`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Continuar treinando</AlertDialogCancel><button type="button" className="danger-button" disabled={busy} onClick={()=>{setFinish(false);setDiscard(true)}}><Trash2 size={17}/>Descartar sessão</button><AlertDialogAction disabled={busy} onClick={e=>{e.preventDefault();finishSession()}}>Salvar sessão</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Descartar esta sessão?</AlertDialogTitle><AlertDialogDescription>O treino em andamento e o descanso serão cancelados. Nenhuma sessão será salva no histórico. Suas fichas e treinos anteriores serão preservados.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Voltar ao treino</AlertDialogCancel><AlertDialogAction className="danger-button" disabled={busy} onClick={e=>{e.preventDefault();discardSession()}}>Sim, descartar sessão</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <AlertDialog open={showCycleReminder}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Hora de revisar o treino</AlertDialogTitle><AlertDialogDescription>Já se passaram 6 semanas corridas desde o início deste ciclo. Revise exercícios, séries e cargas para começar uma nova etapa.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={()=>{setReminderDismissed(true);setTab('workouts')}}>Ver meus treinos</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e=>{e.preventDefault();restartCycle()}}><RefreshCw size={17}/>Já revisei · iniciar novo ciclo</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>
}
