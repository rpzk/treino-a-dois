import {APP_VERSION} from '@/lib/app-version';
export function GET(){return Response.json({version:APP_VERSION},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate'}})}
