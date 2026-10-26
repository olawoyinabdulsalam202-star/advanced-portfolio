import 'dotenv/config';
import {createClient} from '@supabase/supabase-js';
if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY){console.error('Missing Supabase configuration. Check .env.');process.exit(1)}
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000)})}});
let failed=false;
for(const table of ['projects','portfolio_profile','comments','messages','site_state']){const {error}=await db.from(table).select('*').limit(1);console.log(table+': '+(error?'FAILED ('+(error.code||'connection')+'). Check network access and run supabase/schema.sql.':'OK'));failed ||=!!error;}
const {data,error}=await db.storage.getBucket(process.env.SUPABASE_BUCKET||'project-images');console.log('Image bucket: '+(error?'FAILED. Check bucket configuration.':data.public?'OK (public)':'Must be public for project covers.'));failed ||=!!error||!data?.public;
process.exitCode=failed?1:0;
