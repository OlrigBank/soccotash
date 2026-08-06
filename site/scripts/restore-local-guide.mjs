import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { restoreLocalGuide } from './local-guide-portability.ts';
const input=process.argv[2];if(!input)throw new Error('Usage: npm run local-guide:restore -- <input.json>');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
try{await restoreLocalGuide(JSON.parse(await readFile(input,'utf8')),pool);console.log(`Restored Local Guide from ${input}.`)}finally{await pool.end()}
