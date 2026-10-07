import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const data=process.env.DATA_DIR||path.join(root,'data'); mkdirSync(data,{recursive:true});
const db=new DatabaseSync(path.join(data,'album.sqlite')); db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,name TEXT,role TEXT,message TEXT,photo TEXT,created INTEGER); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);');
const password=process.env.ADMIN_PASSWORD;
if(!password||password.length<12) throw Error('Set ADMIN_PASSWORD to a unique password of at least 12 characters before starting.');
const salt=randomBytes(32), hash=scryptSync(password,salt,64), sessions=new Map(), attempts=new Map();
const getSetting=()=>JSON.parse(db.prepare("SELECT value FROM settings WHERE key='intro'").get()?.value||'{"title":"Some goodbyes deserve more than a message.","letter":"To the people who made work feel like more than work: thank you. For the shared ideas, the patient guidance, the laughter between deadlines, and all the small moments I will carry with me. This is a little space for the words I wanted to leave with each of you.","signature":"With gratitude, Rahul"}');
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function auth(req){const sid=req.headers.cookie?.match(/(?:^|;\s*)session=([a-f0-9]+)/)?.[1];const expiry=sessions.get(sid); if(expiry>Date.now())return sid;if(sid)sessions.delete(sid);return null;}
async function body(req){let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>4_000_000)throw Error('Upload must be smaller than 3 MB.');text+=chunk;}try{return JSON.parse(text);}catch{throw Error('Invalid request.');}}
function entry(input){const name=String(input.name||'').trim(),role=String(input.role||'').trim(),message=String(input.message||'').trim(),photo=String(input.photo||'');if(!name||name.length>100||role.length>100||!message||message.length>10000)throw Error('Enter a name and message within the displayed limits.');if(photo){const match=photo.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Error('Use a JPG, PNG, or WebP photo.');const bytes=Buffer.from(match[2],'base64');if(bytes.length>3_000_000)throw Error('Photo must be smaller than 3 MB.');const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';if(!valid)throw Error('The photo format is invalid.');}return{name,role,message,photo};}
const server=http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
try{const url=new URL(req.url,'http://localhost');const p=url.pathname;
if(p.startsWith('/api/')){
if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}`)return send(res,403,{error:'Request origin rejected.'});
if(p==='/api/album'&&req.method==='GET')return send(res,200,{intro:getSetting(),entries:db.prepare('SELECT * FROM entries ORDER BY created DESC').all()});
if(p==='/api/session'&&req.method==='GET')return send(res,200,{authenticated:!!auth(req)});
if(p==='/api/login'&&req.method==='POST'){const key=req.socket.remoteAddress,now=Date.now();let a=attempts.get(key);if(!a||now-a.start>900000){a={start:now,count:0};attempts.set(key,a);}if(a.count>=8)return send(res,429,{error:'Too many attempts. Try again in 15 minutes.'});a.count++;const b=await body(req);if(typeof b.password!=='string'||b.password.length>1024||!timingSafeEqual(scryptSync(b.password,salt,64),hash))return send(res,401,{error:'Incorrect password.'});attempts.delete(key);const sid=randomBytes(32).toString('hex');sessions.set(sid,now+8*3600000);res.setHeader('Set-Cookie',`session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return send(res,200,{ok:true});}
if(!auth(req))return send(res,401,{error:'Please sign in.'});
if(p==='/api/logout'&&req.method==='POST'){sessions.delete(auth(req));res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true});}
if(p==='/api/intro'&&req.method==='PUT'){const b=await body(req);for(const key of ['title','letter','signature'])if(typeof b[key]!=='string'||!b[key].trim()||b[key].length>(key==='letter'?10000:200))throw Error('Complete all introduction fields within their limits.');db.prepare("INSERT OR REPLACE INTO settings VALUES ('intro',?)").run(JSON.stringify(b));return send(res,200,{ok:true});}
if(p==='/api/entries'&&req.method==='POST'){const b=entry(await body(req)),id=randomBytes(12).toString('hex');db.prepare('INSERT INTO entries VALUES(?,?,?,?,?,?)').run(id,b.name,b.role,b.message,b.photo,Date.now());return send(res,201,{id});}
const match=p.match(/^\/api\/entries\/([a-f0-9]{24})$/);if(match){if(!db.prepare('SELECT id FROM entries WHERE id=?').get(match[1]))return send(res,404,{error:'Message not found.'});if(req.method==='DELETE'){db.prepare('DELETE FROM entries WHERE id=?').run(match[1]);return send(res,200,{ok:true});}if(req.method==='PUT'){const b=entry(await body(req));db.prepare('UPDATE entries SET name=?,role=?,message=?,photo=? WHERE id=?').run(b.name,b.role,b.message,b.photo,match[1]);return send(res,200,{ok:true});}}
return send(res,404,{error:'Not found.'});}
if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed.'});
const files={'/':'index.html','/admin':'admin.html','/styles.css':'styles.css','/app.js':'app.js','/admin.js':'admin.js'};const file=files[p];if(!file)return send(res,404,{error:'Page not found.'});const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html';res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(req.method==='HEAD'?'':readFileSync(path.join(root,'public',file)));
}catch(e){send(res,400,{error:e.message});}});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Farewell album ready at http://localhost:${process.env.PORT||3000}`));
export {server,db};
