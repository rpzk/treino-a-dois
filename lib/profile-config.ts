import type {ProfileId} from './training-progress';

// Personalize apenas estes nomes antes de publicar, se desejar.
// Os IDs internos devem continuar como "lucas" e "natalia" para manter
// compatibilidade com o banco, as APIs e os temas existentes.
export const profileConfig:Record<ProfileId,{name:string;shortName:string}>={
  lucas:{name:'Rafael',shortName:'Rafael'},
  natalia:{name:'Ana Amélia',shortName:'Ana'},
};
