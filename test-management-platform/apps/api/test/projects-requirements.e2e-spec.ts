import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestApi } from '../src/server.js';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => { await stop?.(); });
describe('projects and requirements API', () => {
  it('rejects duplicate project code and stores an isolated requirement snapshot', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'api-')); const app = await createTestApi(join(dir, 'db.sqlite'), join(dir, 'evidence')); stop = app.stop;
    const post = (path: string, body: unknown) => fetch(app.url + path, { method:'POST', headers:{'content-type':'application/json','x-actor-id':'tester'}, body:JSON.stringify(body) });
    const one = await post('/projects', {code:'DEMO',name:'Demo'}); expect(one.status).toBe(201); const project = await one.json() as {id:string};
    expect((await post('/projects',{code:'DEMO',name:'Other'})).status).toBe(409);
    expect((await post(`/projects/${project.id}/environments`,{name:'test',baseUrl:'http://example.test',healthCheckConfig:{}})).status).toBe(201);
    const snapshot = await post(`/projects/${project.id}/requirements`,{fileName:'story.md',content:'hello'}); expect(snapshot.status).toBe(201);
    expect((await snapshot.json() as {objectKey:string}).objectKey).toContain(project.id);
  });
});
