import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { createTestApi } from '../src/server.js';
let stop: (()=>Promise<void>)|undefined; afterEach(async()=>{await stop?.();});
describe('automation review and impact',()=>{it('only converts confirmed cases and marks linked automation for update on v2',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'auto-'));const app=await createTestApi(join(dir,'db.sqlite'),join(dir,'evidence'));stop=app.stop;const req=(p:string,m:string,b?:unknown)=>fetch(app.url+p,{method:m,headers:{'content-type':'application/json','x-actor-id':'tester'},body:b?JSON.stringify(b):undefined});
 const p=await (await req('/projects','POST',{code:'AUTO',name:'Auto'})).json() as {id:string};const c=await (await req(`/projects/${p.id}/functional-cases`,'POST',{caseCode:'TC-1',module:'M',scenario:'S',steps:[],expectedResult:'ok',priority:'P0',testType:'FUNCTION'})).json() as {id:string};
 expect((await req(`/projects/${p.id}/functional-cases/${c.id}/automation-drafts`,'POST',{design:{level:'UI'}})).status).toBe(409);
 await req(`/projects/${p.id}/functional-cases/${c.id}/confirm`,'POST',{changeReason:'ok'});const design={level:'UI',steps:['open'],assertions:['home'],data:{user:'test'}};const a=await (await req(`/projects/${p.id}/functional-cases/${c.id}/automation-drafts`,'POST',{design})).json() as {id:string};
 expect((await req(`/projects/${p.id}/automation-cases/${a.id}/review`,'POST',{approved:true})).status).toBe(409);
 expect((await req(`/projects/${p.id}/automation-cases/${a.id}/submit`,'POST')).status).toBe(200);
 await req(`/projects/${p.id}/automation-cases/${a.id}/review`,'POST',{approved:true});
 expect((await req(`/projects/${p.id}/automation-cases/${a.id}/script-version`,'POST',{path:'unrelated/file.ts',sha:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'})).status).toBe(409);
 expect((await req(`/projects/${p.id}/automation-cases/${a.id}/script-version`,'POST',{path:'C:\\evil.ts',sha:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'})).status).toBe(409);
 expect((await req(`/projects/${p.id}/automation-cases/${a.id}/script-version`,'POST',{path:'tests/login.spec.ts',sha:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaX'})).status).toBe(409);
 expect((await req(`/projects/${p.id}/automation-cases/${a.id}/script-version`,'POST',{path:'tests/login.spec.ts',sha:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'})).status).toBe(201);
 await req(`/projects/${p.id}/functional-cases/${c.id}/draft`,'PATCH',{scenario:'S2'});await req(`/projects/${p.id}/functional-cases/${c.id}/confirm`,'POST',{changeReason:'v2'});expect(await (await req(`/projects/${p.id}/functional-cases/${c.id}/impacts`,'GET')).json()).toMatchObject([{status:'OPEN'}]);
});});
