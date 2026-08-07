import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { exportLocalGuide } from './local-guide-portability.ts';
const output=process.argv[2];if(!output)throw new Error('Usage: npm run local-guide:export -- <output.json>');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
try{await writeFile(output,`${JSON.stringify(await exportLocalGuide(pool),null,2)}\n`,'utf8');console.log(`Exported Local Guide to ${output}.`)}finally{await pool.end()}
