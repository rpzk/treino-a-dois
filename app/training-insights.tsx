'use client';
import {useState} from 'react';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip} from 'recharts';
import type {Session} from '@/lib/training';
import {inWeek,loadPoints,sessionDay,shiftDay,weekStart} from '@/lib/training-stats';

const shortDate=(day:string)=>`${day.slice(8,10)}/${day.slice(5,7)}`;
export default function TrainingInsights({sessions,person,today,onDetail}:{sessions:Session[];person:string;today:string;onDetail:(s:Session)=>void}){
 const [month,setMonth]=useState(today.slice(0,7)),[selected,setSelected]=useState(today),[exercise,setExercise]=useState(''),[variation,setVariation]=useState('*');
 const completed=sessions.filter(s=>s.finished);
 const names=[...new Set(completed.flatMap(s=>s.items.map(i=>i.name)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const chosen=names.includes(exercise)?exercise:names[0]??'';
 const variations=[...new Set(completed.flatMap(s=>s.items.filter(i=>i.name===chosen).map(i=>i.variation??'')))];
 const points=loadPoints(completed,chosen,variation==='*'?undefined:variation);
 const weekly=completed.filter(s=>inWeek(s,selected));
 const days=new Set(weekly.map(sessionDay)).size;
 const minutes=Math.round(weekly.reduce((sum,s)=>sum+Math.max(0,Date.parse(s.finished!)-Date.parse(s.started)),0)/60000);
 const first=`${month}-01`,start=weekStart(first),last=new Date(`${first}T12:00:00Z`);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
 const cells=Math.ceil((Number(last.toISOString().slice(8,10))+(Date.parse(first)-Date.parse(start))/86400000)/7)*7;
 const selectedSessions=completed.filter(s=>sessionDay(s)===selected);
 function moveMonth(offset:number){const d=new Date(`${first}T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+offset);setMonth(d.toISOString().slice(0,7));setSelected(d.toISOString().slice(0,10))}
 return <div className="insights">
  <section className="insight-card" aria-label={`Assiduidade de ${person}`}><h3>Assiduidade · {person}</h3><p>Segunda a domingo · horário de Curitiba. Conta o dia em que o treino foi finalizado.</p>
   <div className="calendar-heading"><button className="secondary" aria-label="Mês anterior" onClick={()=>moveMonth(-1)}>‹</button><strong>{new Date(`${first}T12:00:00Z`).toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'})}</strong><button className="secondary" aria-label="Próximo mês" onClick={()=>moveMonth(1)}>›</button></div>
   <div className="calendar-grid">{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d=><span className="weekday" key={d}>{d}</span>)}{Array.from({length:cells},(_,n)=>{const day=shiftDay(start,n),count=completed.filter(s=>sessionDay(s)===day).length;return <button type="button" key={day} className={`calendar-day ${day.slice(0,7)!==month?'outside':''} ${count?'trained':''} ${day===selected?'selected':''}`} aria-pressed={day===selected} aria-current={day===today?'date':undefined} aria-label={`${shortDate(day)}: ${count} treinos`} onClick={()=>setSelected(day)}><span>{Number(day.slice(8,10))}</span><small>{count?`${count}×`:'\u00a0'}</small></button>})}</div>
   <p className="week-caption">Semana de {shortDate(weekStart(selected))} a {shortDate(shiftDay(weekStart(selected),6))}</p><div className="weekly-totals"><div><strong>{weekly.length}</strong><span>treinos</span></div><div><strong>{days}</strong><span>dias ativos</span></div><div><strong>{minutes}</strong><span>minutos</span></div></div>
   <div className="day-sessions"><h4>{shortDate(selected)}</h4>{selectedSessions.length?selectedSessions.map(s=><button className="secondary" key={s.id} onClick={()=>onDetail(s)}>{s.name} · ver sessão</button>):<p>Nenhum treino registrado neste dia.</p>}</div>
  </section>
  <section className="insight-card" aria-label={`Evolução de cargas de ${person}`}><h3>Evolução de cargas</h3><p>Maior carga de uma série concluída em cada sessão, em kg. Campos vazios não entram no gráfico.</p>
   {names.length?<><label className="field">Exercício<select value={chosen} onChange={e=>{setExercise(e.target.value);setVariation('*')}}>{names.map(name=><option key={name}>{name}</option>)}</select></label><label className="field">Variação<select value={variation} onChange={e=>setVariation(e.target.value)}><option value="*">Todas as variações</option>{variations.map(v=><option key={v} value={v}>{v||'Sem variação'}</option>)}</select></label>
   {points.length?<><div className="load-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{top:15,right:20,left:0,bottom:10}} accessibilityLayer><CartesianGrid stroke="#394137" strokeDasharray="3 3"/><XAxis dataKey="id" tickFormatter={id=>shortDate(points.find(p=>p.id===id)!.day)} tick={{fill:'#acb5a5',fontSize:12}} minTickGap={25}/><YAxis domain={[0,'auto']} tick={{fill:'#acb5a5',fontSize:12}} width={45}/><Tooltip labelFormatter={id=>shortDate(points.find(p=>p.id===id)?.day??today)} formatter={value=>[`${Number(value).toLocaleString('pt-BR')} kg`,'Maior carga']} contentStyle={{background:'#1b201b',borderColor:'#596b40',color:'#f1f4ec'}}/><Line type="linear" dataKey="kg" stroke="#d5f77b" strokeWidth={3} dot={{r:4}} activeDot={{r:6}} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
   <details className="chart-records"><summary>Ver valores ({points.length} sessões)</summary>{points.map(p=><p key={p.id}>{shortDate(p.day)} · {p.kg.toLocaleString('pt-BR')} kg</p>)}</details></>:<p className="insight-empty">Ainda não há séries concluídas com carga informada para esta seleção.</p>}</>:<p className="insight-empty">Finalize um treino para acompanhar a evolução das cargas.</p>}
  </section>
 </div>
}
