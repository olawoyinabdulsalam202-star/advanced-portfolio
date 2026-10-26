import 'dotenv/config';
import {createClient} from '@supabase/supabase-js';
import {createApp} from './backend/app.js';
const configured=process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY&&!/YOUR_|placeholder/i.test(process.env.SUPABASE_URL+process.env.SUPABASE_SERVICE_ROLE_KEY);
const db=configured?createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(8000)})}}):null;
const app=createApp({db});
if(!process.env.VERCEL)app.listen(process.env.PORT||3000,()=>console.log(`Portfolio ready on port ${process.env.PORT||3000}`));
export default app;
