import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LocalDatabase, openLocalDatabase } from '../../../packages/database/src/local-database.js';
import { evidenceDirectory } from '../../../packages/database/src/data-directory.js';

const allowed = new Set(['pdf','docx','md','txt','png','jpg','jpeg']);
const MAX_BYTES=20*1024*1024;
const readJson = async (request: import('node:http').IncomingMessage) => { const body=await new Promise<string>((resolve,reject)=>{let bytes=0;const chunks:Buffer[]=[];request.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>MAX_BYTES){request.destroy();return reject(new Error('payload too large'));}chunks.push(chunk);});request.on('end',()=>resolve(Buffer.concat(chunks).toString()));request.on('error',reject);}); return body ? JSON.parse(body) : {}; };
export async function startApi() {
  return startApiWithDatabase(openLocalDatabase(), evidenceDirectory());
}

/** Test-only factory. Production code must call startApi() with the approved runtime root. */
export async function createTestApi(databaseFile: string, storageRoot: string) {
  return startApiWithDatabase(new LocalDatabase(databaseFile), storageRoot);
}

async function startApiWithDatabase(database: LocalDatabase, storageRoot: string) {
  database.migrate();
  database.run('CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, object_id TEXT NOT NULL, created_at TEXT NOT NULL)');
  const server = createServer(async (request,response) => { try {
    const actor = String(request.headers['x-actor-id'] ?? ''); const path = request.url ?? '';
    const send=(status:number,value:unknown)=>{response.writeHead(status,{'content-type':'application/json'});response.end(JSON.stringify(value));};
    if(!actor.trim()) return send(400,{error:'x-actor-id required'});
    const scopedVersions=path.match(/^\/projects\/([^/]+)\/functional-cases\/([^/]+)\/versions$/); if(request.method==='GET' && scopedVersions){if(!database.get('SELECT id FROM functional_cases WHERE id=? AND project_id=?',scopedVersions[2],scopedVersions[1]))return send(404,{error:'not found'});return send(200,database.caseVersions(scopedVersions[2]));}
    const body = await readJson(request);
    const newCase=path.match(/^\/projects\/([^/]+)\/functional-cases$/);
    if(request.method==='POST' && newCase){ const project=database.get<{id:string;status:string}>('SELECT id,status FROM projects WHERE id=?',newCase[1]);if(!project)return send(404,{error:'project not found'});if(project.status==='ARCHIVED')return send(409,{error:'archived'});try{const item=database.createFunctionalCase(project.id,body,actor);database.run('INSERT INTO audit_logs VALUES (?,?,?,?,?)',randomUUID(),actor,'CREATE_FUNCTIONAL_CASE',item.id,new Date().toISOString());return send(201,item);}catch{return send(409,{error:'duplicate case'});}}
    const generation=path.match(/^\/requirements\/([^/]+)\/generations$/);
    if(request.method==='POST' && generation){const snapshot=database.get<{project_id:string}>('SELECT project_id FROM requirement_snapshots WHERE id=?',generation[1]);if(!snapshot)return send(404,{error:'snapshot not found'});const candidate=body.candidate;if(!candidate||!candidate.caseCode||!candidate.module||!candidate.scenario||!Array.isArray(candidate.steps))return send(400,{error:'invalid AI candidate'});const item=database.createFunctionalCase(snapshot.project_id,candidate,actor,'AI');database.run('INSERT INTO audit_logs VALUES (?,?,?,?,?)',randomUUID(),actor,'IMPORT_AI_DRAFT',item.id,new Date().toISOString());return send(201,{...item,status:'DRAFT'});}
    const caseAction=path.match(/^\/projects\/([^/]+)\/functional-cases\/([^/]+)\/(draft|confirm|retire)$/);
    if(caseAction){const [,projectId,caseId,action]=caseAction;if(!database.get('SELECT id FROM functional_cases WHERE id=? AND project_id=?',caseId,projectId))return send(404,{error:'not found'}); if(action==='draft'&&request.method==='PATCH'){const item=database.updateCaseDraft(caseId,body,actor);database.run('INSERT INTO audit_logs VALUES (?,?,?,?,?)',randomUUID(),actor,'EDIT_FUNCTIONAL_CASE',caseId,new Date().toISOString());return send(200,item);} if(action==='confirm'&&request.method==='POST'){try{const item=database.confirmCase(caseId,body.changeReason,actor);database.run('INSERT INTO audit_logs VALUES (?,?,?,?,?)',randomUUID(),actor,'CONFIRM_FUNCTIONAL_CASE',caseId,new Date().toISOString());return send(201,item);}catch{return send(409,{error:'cannot confirm'});}}if(action==='retire'&&request.method==='POST'){database.retireCase(caseId);database.run('INSERT INTO audit_logs VALUES (?,?,?,?,?)',randomUUID(),actor,'RETIRE_FUNCTIONAL_CASE',caseId,new Date().toISOString());return send(200,{id:caseId});}}
    if(request.method==='POST' && path==='/projects') { if(!/^[A-Z0-9-]+$/.test(body.code)) return send(400,{error:'invalid code'}); try {const p=database.createProject(body.code,body.name); database.run('INSERT INTO audit_logs VALUES (?,?,?,?,?)',randomUUID(),actor,'CREATE_PROJECT',p.id,new Date().toISOString());return send(201,p);}catch{return send(409,{error:'duplicate project'});} }
    const match=path.match(/^\/projects\/([^/]+)\/(environments|requirements)$/); if(!match) return send(404,{error:'not found'}); const [,,kind]=match;
    const row=database.get<{id:string;status:string}>('SELECT id,status FROM projects WHERE id=?',match[1]); if(!row)return send(404,{error:'project not found'}); if(row.status==='ARCHIVED')return send(409,{error:'archived'});
    if(kind==='environments'){const id=randomUUID();database.run('INSERT INTO environments (id,project_id,name,base_url,health_check_config,secret_ref,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',id,row.id,body.name,body.baseUrl,JSON.stringify(body.healthCheckConfig??{}),'local/ref',new Date().toISOString(),new Date().toISOString());database.run('INSERT INTO audit_logs VALUES (?,?,?,?,?)',randomUUID(),actor,'CREATE_ENVIRONMENT',id,new Date().toISOString());return send(201,{id});}
    const ext=String(body.fileName).split('.').pop()?.toLowerCase(); if(!ext || !allowed.has(ext))return send(400,{error:'invalid file'}); const id=randomUUID();const key=join(row.id,id,body.fileName.replace(/[^a-zA-Z0-9._-]/g,'_'));const target=join(storageRoot ?? evidenceDirectory(), 'requirements',key);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,body.content);database.run('INSERT INTO requirement_snapshots (id,project_id,file_name,object_key,manual_version,summary,uploaded_by,uploaded_at) VALUES (?,?,?,?,?,?,?,?)',id,row.id,body.fileName,key,null,null,actor,new Date().toISOString());database.run('INSERT INTO audit_logs VALUES (?,?,?,?,?)',randomUUID(),actor,'UPLOAD_REQUIREMENT',id,new Date().toISOString());return send(201,{id,objectKey:key});
  } catch (error) { response.writeHead((error as Error).message==='payload too large'?413:500).end(); }});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve)); const address=server.address() as import('node:net').AddressInfo;
  return {url:`http://127.0.0.1:${address.port}`,stop:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));database.close();}};
}
