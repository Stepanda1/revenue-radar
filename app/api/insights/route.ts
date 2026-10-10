import {env} from 'cloudflare:workers';
import {handleInsights} from '../../../lib/ai';
export const dynamic='force-dynamic';
export function GET(request:Request) { return handleInsights(request,env); }
export function POST(request:Request) { return handleInsights(request,env); }
