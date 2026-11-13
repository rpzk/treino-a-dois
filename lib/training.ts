import { z } from 'zod';
export const exerciseGroups: Record<string,string[]> = {
Peito:['Supino reto com barra','Supino reto com halteres','Supino inclinado com halteres','Supino na máquina','Crucifixo com halteres','Crucifixo na máquina','Crossover','Flexão de braços'],
Costas:['Puxada frontal','Puxada com pegada neutra','Remada baixa','Remada curvada','Remada unilateral com halter','Remada na máquina','Pulldown','Barra fixa'],
Pernas:['Agachamento livre','Agachamento no Smith','Agachamento goblet','Leg press 45°','Hack squat','Cadeira extensora','Mesa flexora','Cadeira flexora','Stiff com halteres','Levantamento terra romeno','Afundo com halteres','Agachamento búlgaro','Cadeira adutora','Cadeira abdutora','Elevação pélvica','Glúteo na polia','Panturrilha em pé','Panturrilha sentado'],
Ombros:['Desenvolvimento com halteres','Desenvolvimento na máquina','Elevação lateral','Elevação frontal','Crucifixo inverso','Face pull','Encolhimento com halteres'],
Bíceps:['Rosca direta','Rosca alternada','Rosca martelo','Rosca Scott','Rosca na polia'],
Tríceps:['Tríceps corda','Tríceps na polia com barra','Tríceps testa','Tríceps francês','Mergulho na máquina'],
Abdômen:['Abdominal no solo','Abdominal na máquina','Abdominal na polia','Elevação de pernas']
};
export const exercises=Object.entries(exerciseGroups).flatMap(([group,names])=>names.map(name=>({name,group})));
const setSchema=z.object({kg:z.number().min(0).max(2000).nullable(),reps:z.number().int().min(0).max(1000),done:z.boolean()});
export const itemSchema=z.object({id:z.string().max(100),name:z.string().min(1).max(120),group:z.string().max(50),variation:z.string().max(300).optional(),sets:z.number().int().min(1).max(20),reps:z.number().int().min(1).max(1000),rest:z.number().int().min(0).max(1800)});
export const workoutSchema=z.object({id:z.string().max(100),name:z.string().trim().min(1).max(80),createdAt:z.string().datetime().optional(),items:z.array(itemSchema).min(1).max(40)});
export const sessionSchema=z.object({id:z.string().max(100),workoutId:z.string().max(100).optional(),name:z.string().max(80),started:z.string().datetime(),finished:z.string().datetime().nullable(),items:z.array(itemSchema.extend({logs:z.array(setSchema).min(1).max(20)})).min(1).max(40)});
export const stateSchema=z.object({workouts:z.array(workoutSchema).max(100),workoutOrder:z.array(z.string().max(100)).max(100).optional(),sessions:z.array(sessionSchema).max(3000),active:sessionSchema.nullable(),timer:z.object({end:z.number().nullable(),left:z.number().min(0),total:z.number().min(0)}).nullable(),planCycleStartedAt:z.string().datetime().optional()});
export type Item=z.infer<typeof itemSchema>; export type Workout=z.infer<typeof workoutSchema>; export type Session=z.infer<typeof sessionSchema>; export type State=z.infer<typeof stateSchema>;
export const blank:State={workouts:[],sessions:[],active:null,timer:null};
