import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestApi } from '../src/server.js';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => { await stop?.(); });
describe('functional case lifecycle', () => {
  it('creates immutable versions only when a draft is confirmed', async () => {
    const dir=mkdtempSync(join(tmpdir(),'case-api-')); const app=await createTestApi(join(dir,'db.sqlite'),join(dir,'evidence'));stop=app.stop;
    const request=(path:string, method:string, body?:unknown)=>fetch(app.url+path,{method,headers:{'content-type':'application/json','x-actor-id':'tester'},body:body?JSON.stringify(body):undefined});
    const project=await (await request('/projects','POST',{code:'CASES',name:'Cases'})).json() as {id:string};
    const draft=await (await request(`/projects/${project.id}/functional-cases`,'POST',{caseCode:'TC-001',module:'Login',scenario:'valid login',precondition:'account',steps:['login'],expectedResult:'home',priority:'P0',testType:'FUNCTION',automationRecommendation:true})).json() as {id:string};
    const base=`/projects/${project.id}/functional-cases/${draft.id}`;
    expect(await (await request(`${base}/versions`,'GET')).json()).toEqual([]);
    await request(`${base}/draft`,'PATCH',{scenario:'updated login',changeReason:'review'});
    expect((await request(`${base}/confirm`,'POST',{changeReason:'approved'})).status).toBe(201);
    await request(`${base}/draft`,'PATCH',{scenario:'v2 login',changeReason:'scope'});
    await request(`${base}/confirm`,'POST',{changeReason:'approved v2'});
    expect(await (await request(`${base}/versions`,'GET')).json()).toMatchObject([{versionNo:1,scenario:'updated login',precondition:'account',steps:'["login"]',expectedResult:'home'},{versionNo:2,scenario:'v2 login'}]);
    const other=await (await request('/projects','POST',{code:'OTHER',name:'Other'})).json() as {id:string};
    expect((await request(`/projects/${other.id}/functional-cases/${draft.id}/versions`,'GET')).status).toBe(404);
    await request(`${base}/retire`,'POST');
    expect((await request(`${base}/confirm`,'POST',{changeReason:'no'})).status).toBe(409);
  });
});
