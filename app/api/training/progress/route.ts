import {database} from '@/lib/training-db';
import {summarizeProgress,type ProfileId} from '@/lib/training-progress';
import type {Session} from '@/lib/training';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(){
 try{
  // Read just the current and last session; never download the entire history to poll progress.
  const result=await database().prepare("SELECT profile, json_extract(data,'$.active') AS active, json_extract(data,'$.sessions[0]') AS latest FROM training WHERE profile IN (?,?)").bind('lucas','natalia').all<{profile:ProfileId;active:string|null;latest:string|null}>();
  const now=Date.now();
  const profiles={lucas:summarizeProgress(null,null,now),natalia:summarizeProgress(null,null,now)};
  for(const row of result.results){profiles[row.profile]=summarizeProgress(row.active?JSON.parse(row.active) as Session:null,row.latest?JSON.parse(row.latest) as Session:null,now);}
  return Response.json({profiles},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){console.error('Could not read shared training progress',error);return Response.json({error:'Não foi possível atualizar o progresso.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
