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
  db.run('INSERT INTO environments VALUES (?,?,?,?,?,?,?,?)', environmentId, project.id, '预发环境', 'http://test.local', '{}', 'secret://test', now, now);
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
  const selectorResponse = await fetch(`${app.url}/projects/${project.id}/runs/new`);
  expect(selectorResponse.headers.get('content-security-policy')).toContain("style-src 'self' 'unsafe-inline'");
  const selector = await selectorResponse.text();
  expect(selector).toContain('AT-WEB-001');
  expect(selector).toContain('AT-WEB-002');
  expect(selector).toContain('badge-needs-update');
  expect(selector).toContain('不会执行');
  expect(selector).toContain('selected-case-count');
  expect(selector).toContain('class="app-shell"');
  expect(selector).toContain('class="sidebar"');
  expect(selector).toContain('class="workspace-header"');
  expect(selector).toContain('badge badge-executable');
  expect(selector).toContain('class="nav-text"');
  expect(selector).toContain('aria-label="执行中心"');
  expect(selector).toContain('class="run-layout"');
  expect(selector).toContain('class="execution-summary"');
  expect(selector).toContain('预发环境');
  expect(selector).toContain('class="nav-icon" aria-hidden="true"');
  expect(selector).toContain(`/projects/${project.id}/cases`);
  const cases = await (await fetch(`${app.url}/projects/${project.id}/cases`)).text();
  expect(cases).toContain('TC-WEB-001');
  expect(cases).toContain('已确认');
  expect(cases).toContain('class="list-toolbar"');
  expect(cases).toContain('新建用例');
  expect(cases).toContain(`/projects/${project.id}/cases/fc-a`);
  const detail = await (await fetch(`${app.url}/projects/${project.id}/cases/fc-a`)).text();
  expect(detail).toContain('前置条件');
  expect(detail).toContain('测试步骤');
  expect(detail).toContain('预期结果');
  expect(detail).toContain('成功');
  expect(detail).toContain('2026-08-13T09:00:00.000Z');
  const automation = await (await fetch(`${app.url}/projects/${project.id}/automation`)).text();
  expect(automation).toContain('可执行');
  const impacts = await (await fetch(`${app.url}/projects/${project.id}/impacts`)).text();
  expect(impacts).toContain('待处理');
  const otherPage = await (await fetch(`${app.url}/projects/${other.id}/cases`)).text();
  expect(otherPage).toContain('TC-OTHER-001');
  expect(otherPage).not.toContain('TC-WEB-001');

  const dashboard = await (await fetch(`${app.url}/projects/${project.id}`)).text();
  expect(dashboard).toContain('class="dashboard-grid"');
  expect(dashboard).toContain('class="quick-actions"');
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

it('creates, edits and confirms functional cases from the web console', async () => {
  const { db, project } = fixture();
  const app = await startWeb(0, db); stop = app.stop;
  const created = await fetch(`${app.url}/projects/${project.id}/cases/new`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'caseCode=TC-WEB-NEW&module=%E8%AE%A2%E5%8D%95&scenario=%E5%88%9B%E5%BB%BA%E8%AE%A2%E5%8D%95&precondition=%E5%B7%B2%E7%99%BB%E5%BD%95&steps=%E8%BF%9B%E5%85%A5%E4%B8%8B%E5%8D%95%E9%A1%B5%0A%E6%8F%90%E4%BA%A4%E8%AE%A2%E5%8D%95&expectedResult=%E8%AE%A2%E5%8D%95%E5%88%9B%E5%BB%BA%E6%88%90%E5%8A%9F&priority=P1&testType=FUNCTION&automationRecommendation=on'
  });
  expect(created.status).toBe(302);
  const inserted = db.get<any>('SELECT * FROM functional_cases WHERE project_id=? AND case_code=?', project.id, 'TC-WEB-NEW');
  expect(inserted).toMatchObject({ status: 'DRAFT', precondition: '已登录', expected_result: '订单创建成功' });
  expect(JSON.parse(inserted.steps)).toEqual(['进入下单页', '提交订单']);

  const edited = await fetch(`${app.url}/projects/${project.id}/cases/fc-a`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'module=%E7%99%BB%E5%BD%95&scenario=%E6%96%B0%E7%99%BB%E5%BD%95&precondition=%E8%B4%A6%E5%8F%B7%E5%AD%98%E5%9C%A8&steps=%E8%BE%93%E5%85%A5%E8%B4%A6%E5%8F%B7&expectedResult=%E8%BF%9B%E5%85%A5%E9%A6%96%E9%A1%B5&priority=P0&testType=FUNCTION&automationRecommendation=on&changeReason=%E8%A1%A5%E5%85%85%E6%AD%A5%E9%AA%A4'
  });
  expect(edited.status).toBe(302);
  expect(db.get<any>('SELECT status,scenario FROM functional_cases WHERE id=?', 'fc-a')).toMatchObject({ status: 'DRAFT', scenario: '新登录' });
  const confirmed = await fetch(`${app.url}/projects/${project.id}/cases/fc-a/confirm`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'changeReason=%E7%A1%AE%E8%AE%A4%E6%9B%B4%E6%96%B0'
  });
  expect(confirmed.status).toBe(302);
  expect(db.get<any>('SELECT status,current_version_no FROM functional_cases WHERE id=?', 'fc-a')).toMatchObject({ status: 'CONFIRMED', current_version_no: 2 });
  const duplicateConfirm = await fetch(`${app.url}/projects/${project.id}/cases/fc-a/confirm`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'changeReason=%E9%87%8D%E5%A4%8D%E7%A1%AE%E8%AE%A4'
  });
  expect(duplicateConfirm.status).toBe(409);
  expect(db.get<any>('SELECT current_version_no FROM functional_cases WHERE id=?', 'fc-a')?.current_version_no).toBe(2);
});
