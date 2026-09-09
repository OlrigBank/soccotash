import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
process.env.DATABASE_URL ||= `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@127.0.0.1:${process.env.POSTGRES_PORT || 5433}/${process.env.POSTGRES_DB}`;
if (!['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Booker fixtures require a local database.');
Object.assign(process.env,{DATABASE_SSL:'false',HOST:'127.0.0.1',PORT:'8082',NODE_ENV:'production',BOOKER_VERIFICATION_SECRET:crypto.randomBytes(32).toString('hex'),EMAIL_PROVIDER:'smtp',SMTP_HOST:'127.0.0.1',SMTP_PORT:'1026',SMTP_USER:'',SMTP_PASSWORD:'',SMTP_SECURE:'false',BOOKING_EMAIL_FROM:'Olrig Bank <fixture@example.test>',BOOKING_EMAIL_BCC:'',BOOKING_EMAIL_REPLY_TO:'',BOOKING_ADMIN_EMAIL:'',BOOKING_PUBLIC_URL:'http://127.0.0.1:8082',WHATSAPP_DELIVERY_ENABLED:'false',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',TWILIO_VERIFY_SERVICE_SID:''});
const messages=[];
const smtp=net.createServer(socket=>{
  socket.setEncoding('utf8');socket.write('220 local fixture\r\n');let buffer='',data=false,body='',recipients=[];
  socket.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\r\n')){
    const index=buffer.indexOf('\r\n');const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
    if(data){if(line==='.') {messages.push({recipients,body});data=false;body='';socket.write('250 saved\r\n');}else body+=line+'\n';continue;}
    if(line.startsWith('EHLO'))socket.write('250 local\r\n');
    else if(line.startsWith('MAIL')){recipients=[];socket.write('250 ok\r\n');}
    else if(line.startsWith('RCPT')){recipients.push(line);socket.write('250 ok\r\n');}
    else if(line==='DATA'){data=true;socket.write('354 continue\r\n');}
    else if(line==='QUIT'){socket.end('221 bye\r\n');}else socket.write('250 ok\r\n');
  }});
});
smtp.listen(1026,'127.0.0.1');
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');const recipient=url.searchParams.get('recipient');
 const found=messages.filter(item=>item.recipients.some(value=>value.includes(recipient || '\u0000'))).at(-1);
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:found?.body.match(/code is (\d{6})/)?.[1],count:messages.length}));
}).listen(1027,'127.0.0.1');
await import('../../site/dist/server/entry.mjs');
