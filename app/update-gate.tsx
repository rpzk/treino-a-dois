'use client';
import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogAction} from '@/components/ui/alert-dialog';
import {APP_VERSION} from '@/lib/app-version';

export default function UpdateGate({defer=false}:{defer?:boolean}){
 const [required,setRequired]=useState(false);
 useEffect(()=>{
  let disposed=false,request:AbortController|null=null;
  async function check(){
   if(disposed||defer||document.visibilityState==='hidden')return;
   request?.abort();const controller=new AbortController();request=controller;
   try{const response=await fetch(`/api/version?check=${Date.now()}`,{cache:'no-store',signal:controller.signal});if(!response.ok)return;const current=await response.json() as {version?:string};if(!disposed&&current.version&&current.version!==APP_VERSION)setRequired(true);}catch{}
  }
  void check();const interval=setInterval(check,60000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
  return()=>{disposed=true;request?.abort();clearInterval(interval);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check)};
 },[defer]);
 return <AlertDialog open={required}><AlertDialogContent className="update-dialog"><AlertDialogHeader><AlertDialogTitle>Tem uma versão nova</AlertDialogTitle><AlertDialogDescription>Atualize agora para continuar usando o app com as melhorias mais recentes.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogAction onClick={()=>window.location.reload()}><RefreshCw size={18}/>Atualizar agora</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
