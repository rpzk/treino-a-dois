import type {Item, Session, Workout} from './training';

export const trainingZone='America/Sao_Paulo';
const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:trainingZone,year:'numeric',month:'2-digit',day:'2-digit'});
export function localDay(value:string|number|Date){
 const parts=dateFormatter.formatToParts(new Date(value));
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-');
}
export function shiftDay(day:string,offset:number){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}
export function weekStart(day:string){const weekday=new Date(`${day}T12:00:00Z`).getUTCDay();return shiftDay(day,-((weekday+6)%7))}
export function sessionDay(session:Session){return localDay(session.finished??session.started)}
export function inWeek(session:Session,day:string){return !!session.finished&&weekStart(sessionDay(session))===weekStart(day)}
export function weeklyCount(workout:Workout,sessions:Session[],day:string){
 // Older sessions have no workout ID. Their recorded name is the only legacy link.
 return sessions.filter(s=>inWeek(s,day)&&(s.workoutId?s.workoutId===workout.id:s.name===workout.name)).length;
}
export function estimateSeconds(items:Pick<Item,'sets'|'reps'|'rest'>[]){return items.reduce((sum,i)=>sum+i.sets*i.reps*3+Math.max(0,i.sets-1)*i.rest,0)}
export function elapsedCalendarDays(start:string,day:string){return Math.max(0,Math.floor((Date.parse(day)-Date.parse(localDay(start)))/86400000))}
export function cycleDue(start:string|undefined,day:string){return !!start&&elapsedCalendarDays(start,day)>=42}
export function moveSessionToDay(session:Session,day:string):Session{
 const finished=Date.parse(session.finished??session.started),started=Date.parse(session.started),duration=Math.max(0,finished-started);
 const nextFinished=Date.parse(`${day}T12:00:00-03:00`);
 return {...session,started:new Date(nextFinished-duration).toISOString(),finished:new Date(nextFinished).toISOString()};
}
export function suggestedWorkout(workouts:Workout[],sessions:Session[],day:string){
 return workouts.reduce<Workout|undefined>((best,w)=>!best||weeklyCount(w,sessions,day)<weeklyCount(best,sessions,day)?w:best,undefined);
}
export function stableWorkoutList(workouts:Workout[],order:string[]|undefined){
 const byId=new Map(workouts.map(workout=>[workout.id,workout]));
 const ordered=(order??[]).flatMap(id=>{const workout=byId.get(id);if(!workout)return[];byId.delete(id);return[workout]});
 return [...ordered,...workouts.filter(workout=>byId.has(workout.id))];
}
export function initialWorkoutOrder(workouts:Workout[]){
 const label=(name:string)=>{const letter=/^\s*(?:(?:treino|ficha)\s+)?([a-z])(?:\s|[-–—·:]|$)/i.exec(name)?.[1];return letter?letter.toUpperCase().charCodeAt(0)-65:null};
 return workouts.map((workout,index)=>({workout,index,rank:label(workout.name)})).sort((a,b)=>a.rank===null&&b.rank===null?a.index-b.index:a.rank===null?1:b.rank===null?-1:a.rank-b.rank||a.index-b.index).map(({workout})=>workout.id);
}
export function displayKg(kg:number|null){return kg===null?'sem carga informada':`${kg.toLocaleString('pt-BR')} kg`}
export function parseWeight(raw:string):number|null|undefined{
 if(raw==='')return null;
 if(!/^\d*(?:[.,]\d*)?$/.test(raw))return undefined;
 const number=Number(raw.replace(',','.'));
 return /\d/.test(raw)&&Number.isFinite(number)&&number>=0&&number<=2000?number:undefined;
}
export function loadPoints(sessions:Session[],name:string,variation?:string){
 return sessions.filter(s=>s.finished).flatMap(s=>{
  const logs=s.items.filter(i=>i.name===name&&(variation===undefined||(i.variation??'')===variation)).flatMap(i=>i.logs).filter(l=>l.done&&l.kg!==null);
  return logs.length?[{id:s.id,day:sessionDay(s),finished:s.finished!,kg:Math.max(...logs.map(l=>l.kg!))}]:[];
 }).sort((a,b)=>a.finished.localeCompare(b.finished));
}
