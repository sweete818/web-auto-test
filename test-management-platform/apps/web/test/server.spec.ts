import { afterEach, expect, it } from 'vitest';
import { startWeb } from '../src/server.js';
import { LocalDatabase } from '../../../packages/database/src/local-database.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let stop: (() => Promise<void>) | undefined;

function fixture() {
  const db = new LocalDatabase(join(mkdtempSync(join(tmpdir(), 'web-')), 'console.db'));
  db.migrate();
  const project = db.createProject('WEB-A', '网页项目 A');
  const other = db.createProject('WEB-B', '网页项目 B');
  const now = '2026-08-13T09:00:00.000Z';
  const environmentId = 'env-a';
  db.run('INSERT INTO environments VALUES (?,?,?,?,?,?,?,?)', environmentId, project.id, '测试环境', 'http://test.local', '{}', 'secret://test', now, now);
  db.run('INSERT INTO functional_cases (id,project_id,case_code,module,scenario,priority,test_type,status,created_by,created_at,updated_at,current_version_no) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', 'fc-a', project.id, 'TC-WEB-001', '登录', '成功登录', 'P1', 'FUNCTION', 'CONFIRMED', 'tester', now, now, 1);
  db.run('INSERT INTO functional_cases (id,project_id,case_code,module,scenario,priority,test_type,status,created_by,created_at,updated_at,current_version_no) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', 'fc-b', other.id, 'TC-OTHER-001', '其它', '隔离', 'P1', 'FUNCTION', 'CONFIRMED', 'tester', now, now, 1);
  db.run('INSERT INTO project_repositories VALUES (?,?,?,?,?,?,?,?)', 'repo-a', project.id, 'repo://a', 'main', 'tests', 'tester', now, now);
  db.run('INSERT INTO functional_case_versions (id,project_id,functional_case_id,version_no,module,scenario,precondition,steps,expected_result,priority,test_type,automation_recommendation,change_reason,confirmed_by,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', 'fcv-a', project.id, 'fc-a', 1, '登录', '成功登录', '', '[]', '成功', 'P1', 'FUNCTION', 1, 'confirmed', 'tester', now);
  db.run('INSERT INTO automation_cases (id,project_id,case_code,functional_case_id,level,tags,review_status,execution_status,created_at,updated_at,current_version_no) VALUES (?,?,?,?,?,?,?,?,?,?,?)', 'ac-exec', project.id, 'AT-WEB-001', 'fc-a', 'UI', '[]', 'APPROVED', 'EXECUTABLE', now, now, 1);
  db.run('INSERT INTO automation_cases (id,project_id,case_code,functional_case_id,level,tags,review_status,execution_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', 'ac-stale', project.id, 'AT-WEB-002', 'fc-a', 'UI', '[]', 'APPROVED', 'NEEDS_UPDATE', now, now);
  db.run('INSERT INTO automation_case_versions (id,project_id,automation_case_id,version_no,functional_case_version_id,project_repository_id,design,script_path,git_sha,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', 'acv-a', project.id, 'ac-exec', 1, 'fcv-a', 'repo-a', '{}', 'tests/login.spec.ts', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now);
  db.run('INSERT INTO automation_impacts (id,project_id,functional_case_version_id,automation_case_id,impact_type,status,created_at) VALUES (?,?,?,?,?,?,?)', 'impact-a', project.id, 'fcv-a', 'ac-stale', 'FUNCTION_CHANGED', 'OPEN', now);
  db.run('INSERT INTO run_batches (id,project_id,environment_id,release_version,trigger_type,triggered_by,status,selection_snapshot,execution_snapshot,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', 'batch-a', project.id, environmentId, 'v1.2.0', 'SELECTED', 'tester', 'COMPLETED', '{}', '{}', now);
  return { db, project, other, environmentId };
}

afterEach(async () => stop?.());

it('renders project-scoped tables and excludes stale automation from the selector', async () => {
  const { db, project, other } = fixture();
  const app = await startWeb(0, db); stop = app.stop;
  const selector = await (await fetch(`${app.url}/projects/${project.id}/runs/new`)).text();
  expect(selector).toContain('AT-WEB-001');
  expect(selector).toContain('AT-WEB-002');
  expect(selector).toContain('待更新，不会执行');
  expect(selector).toContain('selected-case-count');
  expect(selector).toContain(`/projects/${project.id}/cases`);
  const cases = await (await fetch(`${app.url}/projects/${project.id}/cases`)).text();
  expect(cases).toContain('TC-WEB-001');
  expect(cases).toContain('CONFIRMED');
  const automation = await (await fetch(`${app.url}/projects/${project.id}/automation`)).text();
  expect(automation).toContain('EXECUTABLE');
  const impacts = await (await fetch(`${app.url}/projects/${project.id}/impacts`)).text();
  expect(impacts).toContain('OPEN');
  const otherPage = await (await fetch(`${app.url}/projects/${other.id}/cases`)).text();
  expect(otherPage).toContain('TC-OTHER-001');
  expect(otherPage).not.toContain('TC-WEB-001');
});

it('creates a selected run and filters the project run records', async () => {
  const { db, project } = fixture();
  const app = await startWeb(0, db); stop = app.stop;
  const created = await fetch(`${app.url}/projects/${project.id}/runs/new`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'case=ac-exec' });
  expect(created.status).toBe(302);
  expect(created.headers.get('location')).toBe(`/projects/${project.id}/runs`);
  expect(db.get<any>('SELECT count(*) AS c FROM run_batches WHERE project_id=?', project.id)?.c).toBe(2);
  const matching = await (await fetch(`${app.url}/projects/${project.id}/runs?version=v1.2.0&date=2026-08-13`)).text();
  expect(matching).toContain('v1.2.0');
  const empty = await (await fetch(`${app.url}/projects/${project.id}/runs?version=missing`)).text();
  expect(empty).toContain('暂无记录');
});
