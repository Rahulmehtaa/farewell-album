import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cwd=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('authentication, colleague CRUD, photo validation and persistent content',async()=>{
const dir=mkdtempSync(path.join(tmpdir(),'farewell-test-'));const port=34000+Math.floor(Math.random()*10000);let running;
async function start(){process.env.PORT=String(port);process.env.DATA_DIR=dir;process.env.ADMIN_PASSWORD='a-long-test-password';running=await import('../server.mjs?run='+Date.now());if(!running.server.listening)await new Promise(resolve=>running.server.once('listening',resolve));}
async function stop(){await new Promise(resolve=>running.server.close(resolve));running.db.close();}
let cookie='';async function call(url,method='GET',data,origin){return fetch(`http://localhost:${port}${url}`,{method,headers:{'Content-Type':'application/json',Connection:'close',Cookie:cookie,...(origin?{Origin:origin}:{})},body:data?JSON.stringify(data):undefined});}
try{await start();assert.equal((await call('/api/entries','POST',{name:'A',message:'B'})).status,401);assert.equal((await call('/api/login','POST',{password:'wrong'})).status,401);let r=await call('/api/login','POST',{password:'a-long-test-password'});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];assert.equal((await call('/api/entries','POST',{name:'A',message:'B'},'https://evil.example')).status,403);
assert.equal((await call('/api/entries','POST',{name:'A',message:'B',photo:'data:image/jpeg;base64,YmFk'})).status,400);
const payload={name:'A real colleague',role:'Designer',message:'Thank you! <script>alert(1)</script>',photo:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='};r=await call('/api/entries','POST',payload);assert.equal(r.status,201);const{id}=await r.json();let album=await(await call('/api/album')).json();assert.equal(album.entries[0].photo,payload.photo);assert.equal(album.entries[0].message,payload.message);
assert.equal((await call('/api/entries/'+id,'PUT',{...payload,message:'Updated farewell'})).status,200);const intro={title:'A new chapter',letter:'Thank you, everyone.',signature:'Rahul'};assert.equal((await call('/api/intro','PUT',intro)).status,200);
await stop();await start();cookie='';album=await(await call('/api/album')).json();assert.equal(album.entries[0].message,'Updated farewell');assert.deepEqual(album.intro,intro);assert.equal((await call('/api/session').then(r=>r.json())).authenticated,false);
r=await call('/api/login','POST',{password:'a-long-test-password'});cookie=r.headers.get('set-cookie').split(';')[0];assert.equal((await call('/api/entries/'+id,'DELETE')).status,200);assert.equal((await(await call('/api/album')).json()).entries.length,0);assert.equal((await call('/api/logout','POST')).status,200);assert.equal((await call('/api/entries','POST',payload)).status,401);assert.equal((await call('/')).status,200);assert.equal((await call('/admin')).status,200);
}finally{if(running?.server.listening)await stop();rmSync(dir,{recursive:true,force:true});}
});


