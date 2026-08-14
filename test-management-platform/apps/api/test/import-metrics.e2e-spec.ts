import { afterEach, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestApi } from '../src/server.js';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => stop?.());

it('previews imports without versions, confirms drafts, exports confirmed cases and reports project metrics', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'import-metrics-'));
  const app = await createTestApi(join(dir, 'db.sqlite'), join(dir, 'evidence')); stop = app.stop;
  const request = (path: string, method = 'GET', body?: unknown) => fetch(app.url + path, { method, headers: { 'content-type': 'application/json', 'x-actor-id': 'tester' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const project = await (await request('/projects', 'POST', { code: 'IMPORTS', name: 'Imports' })).json() as { id: string };
  const base = `/projects/${project.id}`;
  const preview = await (await request(`${base}/functional-case-imports/preview`, 'POST', { format: 'csv', content: 'caseCode,module,scenario,priority,testType\nTC-I-001,Login,Valid login,P1,FUNCTION\nTC-I-001,Login,Duplicate,P1,FUNCTION' })).json() as any;
  expect(preview.valid).toBe(false);
  expect(preview.errors[0].message).toContain('duplicate');
  expect(await (await request(`${base}/functional-cases/export`)).json()).toEqual([]);
  const accepted = await (await request(`${base}/functional-case-imports/confirm`, 'POST', { rows: [{ caseCode: 'TC-I-001', module: 'Login', scenario: 'Valid login', priority: 'P1', testType: 'FUNCTION', steps: ['open'] }] })).json() as any;
  expect(accepted.created).toBe(1);
  expect(accepted.status).toBe('DRAFT');
  const duplicatePreview = await (await request(`${base}/functional-case-imports/preview`, 'POST', { format: 'json', content: [{ caseCode: 'TC-I-001', module: 'Login', scenario: 'Existing', priority: 'P1', testType: 'FUNCTION' }] })).json() as any;
  expect(duplicatePreview.valid).toBe(false);
  expect(duplicatePreview.errors).toContainEqual({ row: 1, message: 'caseCode already exists in project' });
  expect((await request(`${base}/functional-case-imports/confirm`, 'POST', { rows: [{ caseCode: 'TC-I-001', module: 'Login', scenario: 'Existing', priority: 'P1', testType: 'FUNCTION' }] })).status).toBe(400);
  expect((await (await request(`${base}/metrics`)).json() as any).functional.total).toBe(1);
  expect(await (await request(`${base}/functional-cases/export`)).json()).toEqual([]);
  const metrics = await (await request(`${base}/metrics`)).json() as any;
  expect(metrics.functional.total).toBe(1);
  expect(metrics.aiAdoption).toMatchObject({ numerator: 0, denominator: 1 });
  expect(metrics.failureTrend).toEqual([]);
});
