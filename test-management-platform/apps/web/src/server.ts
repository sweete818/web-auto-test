import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { LocalDatabase, openLocalDatabase } from '../../../packages/database/src/local-database.ts';

type Row = Record<string, any>;

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]!));

function projectUrl(project: Row, page = '') {
  return `/projects/${encodeURIComponent(project.id)}${page}`;
}

function table(headers: string[], rows: string[][], empty = '暂无数据') {
  const heading = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}">${escapeHtml(empty)}</td></tr>`;
  return `<table>${heading}${body}</table>`;
}

function page(project: Row, title: string, content: string) {
  const nav = [
    ['总览', ''], ['功能用例', '/cases'], ['自动化', '/automation'], ['影响', '/impacts'],
    ['执行中心', '/runs/new'], ['运行记录', '/runs']
  ].map(([label, path]) => `<a href="${projectUrl(project, path)}">${label}</a>`).join('');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)} - 测试管理台</title>
<style>
body{margin:0;font:14px system-ui,"Microsoft YaHei",sans-serif;background:#f5f7fb;color:#17233a}nav{background:#182b49;color:#fff;padding:16px calc((100% - 1100px)/2);min-height:24px;font-weight:600}nav a{color:#dce7ff;margin-left:18px;text-decoration:none}main{max-width:1100px;margin:28px auto}.cards{display:flex;gap:14px}.card,table,.panel{background:#fff;border-radius:8px;padding:18px;box-shadow:0 1px 3px #d9deea}.card{flex:1}table{box-sizing:border-box;width:100%;border-collapse:collapse;margin-top:16px;padding:0}td,th{padding:12px;border-bottom:1px solid #e5e9f2;text-align:left}.ok{color:#12845a}.warn{color:#b75b00}.muted{color:#64748b}button{background:#2463eb;color:#fff;border:0;border-radius:5px;padding:9px 16px;cursor:pointer}input{padding:8px;border:1px solid #cbd5e1;border-radius:4px;margin-right:8px}
</style></head><body><nav>测试管理台 ${nav}</nav><main><h1>${escapeHtml(title)}</h1>${content}</main></body></html>`;
}

async function formBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.length;
    if (size > 64 * 1024) throw new Error('请求过大');
    chunks.push(data);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function seedPreview(db: LocalDatabase) {
  const project = db.projectByCode('DEMO');
  if (!project || db.get<Row>('SELECT id FROM automation_cases WHERE project_id=? LIMIT 1', project.id)) return;
  const createdAt = new Date().toISOString();
  const functionalId = randomUUID();
  const functionalVersionId = randomUUID();
  const repositoryId = randomUUID();
  const executableId = randomUUID();
  db.run('INSERT INTO functional_cases (id,project_id,case_code,module,scenario,priority,test_type,status,created_by,created_at,updated_at,current_version_no) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', functionalId, project.id, 'TC-LG-001', '登录', '账号登录', 'P1', 'FUNCTION', 'CONFIRMED', 'demo', createdAt, createdAt, 1);
  db.run('INSERT INTO functional_case_versions (id,project_id,functional_case_id,version_no,module,scenario,precondition,steps,expected_result,priority,test_type,automation_recommendation,change_reason,confirmed_by,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', functionalVersionId, project.id, functionalId, 1, '登录', '账号登录', '', '[]', '登录成功', 'P1', 'FUNCTION', 1, '演示数据', 'demo', createdAt);
  db.run('INSERT INTO project_repositories VALUES (?,?,?,?,?,?,?,?)', repositoryId, project.id, 'local://demo', 'main', 'tests', 'demo', createdAt, createdAt);
  db.run('INSERT INTO automation_cases (id,project_id,case_code,functional_case_id,level,tags,review_status,execution_status,created_at,updated_at,current_version_no) VALUES (?,?,?,?,?,?,?,?,?,?,?)', executableId, project.id, 'AT-LG-001', functionalId, 'UI', '[]', 'APPROVED', 'EXECUTABLE', createdAt, createdAt, 1);
  db.run('INSERT INTO automation_case_versions (id,project_id,automation_case_id,version_no,functional_case_version_id,project_repository_id,design,script_path,git_sha,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', randomUUID(), project.id, executableId, 1, functionalVersionId, repositoryId, '{}', 'tests/login.spec.ts', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', createdAt);
  db.run('INSERT INTO automation_cases (id,project_id,case_code,functional_case_id,level,tags,review_status,execution_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', randomUUID(), project.id, 'AT-LG-002', functionalId, 'UI', '[]', 'APPROVED', 'NEEDS_UPDATE', createdAt, createdAt);
  const environment = db.get<Row>('SELECT id FROM environments WHERE project_id=? LIMIT 1', project.id);
  if (environment) db.run('INSERT INTO run_batches (id,project_id,environment_id,release_version,trigger_type,triggered_by,status,selection_snapshot,execution_snapshot,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', randomUUID(), project.id, environment.id, 'demo-v1', 'SELECTED', 'demo', 'COMPLETED', '{}', '{}', createdAt);
}

function dashboard(db: LocalDatabase, project: Row) {
  const functionalCount = db.get<Row>('SELECT count(*) AS count FROM functional_cases WHERE project_id=?', project.id)?.count ?? 0;
  const automationCount = db.get<Row>('SELECT count(*) AS count FROM automation_cases WHERE project_id=?', project.id)?.count ?? 0;
  const executableCount = db.get<Row>("SELECT count(*) AS count FROM automation_cases WHERE project_id=? AND execution_status='EXECUTABLE'", project.id)?.count ?? 0;
  const recent = db.all<Row>('SELECT release_version,status,created_at FROM run_batches WHERE project_id=? ORDER BY created_at DESC LIMIT 5', project.id);
  return `<div class="cards"><div class="card">功能用例<br><b>${functionalCount}</b></div><div class="card">自动化用例<br><b>${automationCount}</b></div><div class="card">可执行<br><b>${executableCount}</b></div></div><h2>最近运行</h2>${table(['版本', '状态', '创建时间'], recent.map((batch) => [escapeHtml(batch.release_version || '—'), escapeHtml(batch.status), escapeHtml(batch.created_at)]), '暂无运行记录')}`;
}

function renderSection(db: LocalDatabase, project: Row, section: string, url: URL) {
  if (section === 'cases') {
    const cases = db.all<Row>('SELECT case_code,module,scenario,status,current_version_no FROM functional_cases WHERE project_id=? ORDER BY case_code', project.id);
    return ['功能用例', table(['编号', '模块', '场景', '状态', '版本'], cases.map((item) => [escapeHtml(item.case_code), escapeHtml(item.module), escapeHtml(item.scenario), escapeHtml(item.status), escapeHtml(item.current_version_no ?? '—')]))] as const;
  }
  if (section === 'automation') {
    const items = db.all<Row>('SELECT case_code,level,review_status,execution_status,current_version_no FROM automation_cases WHERE project_id=? ORDER BY case_code', project.id);
    return ['自动化用例', table(['编号', '级别', '审核状态', '执行状态', '版本'], items.map((item) => [escapeHtml(item.case_code), escapeHtml(item.level), escapeHtml(item.review_status), escapeHtml(item.execution_status), escapeHtml(item.current_version_no ?? '—')]))] as const;
  }
  if (section === 'impacts') {
    const impacts = db.all<Row>('SELECT i.impact_type,i.status,a.case_code,f.case_code AS functional_code,i.created_at FROM automation_impacts i JOIN automation_cases a ON a.id=i.automation_case_id AND a.project_id=i.project_id JOIN functional_case_versions v ON v.id=i.functional_case_version_id AND v.project_id=i.project_id JOIN functional_cases f ON f.id=v.functional_case_id AND f.project_id=i.project_id WHERE i.project_id=? ORDER BY i.created_at DESC', project.id);
    return ['影响透视', table(['影响类型', '自动化用例', '功能用例', '状态', '创建时间'], impacts.map((item) => [escapeHtml(item.impact_type), escapeHtml(item.case_code), escapeHtml(item.functional_code), escapeHtml(item.status), escapeHtml(item.created_at)]), '暂无影响')] as const;
  }
  if (section === 'runs') {
    const version = url.searchParams.get('version') ?? '';
    const date = url.searchParams.get('date') ?? '';
    const batches = db.all<Row>('SELECT id,release_version,status,trigger_type,triggered_by,created_at FROM run_batches WHERE project_id=? ORDER BY created_at DESC', project.id)
      .filter((item) => (!version || item.release_version === version) && (!date || String(item.created_at).startsWith(date)));
    const filter = `<form method="get" class="panel"><label>版本 <input name="version" value="${escapeHtml(version)}" placeholder="例如 v1.2.0"></label><label>日期 <input name="date" value="${escapeHtml(date)}" placeholder="YYYY-MM-DD"></label><button>筛选</button></form>`;
    return ['运行记录', `${filter}${table(['版本', '状态', '触发方式', '触发人', '创建时间'], batches.map((item) => [escapeHtml(item.release_version || '—'), escapeHtml(item.status), escapeHtml(item.trigger_type), escapeHtml(item.triggered_by), escapeHtml(item.created_at)]), '暂无记录')}`] as const;
  }
  if (section === 'runs/new') {
    const items = db.all<Row>('SELECT id,case_code,execution_status FROM automation_cases WHERE project_id=? ORDER BY case_code', project.id);
    const rows = items.map((item) => item.execution_status === 'EXECUTABLE'
      ? [`<input type="checkbox" name="case" value="${escapeHtml(item.id)}">`, escapeHtml(item.case_code), '<span class="ok">可执行</span>']
      : ['—', escapeHtml(item.case_code), `<span class="warn">${item.execution_status === 'NEEDS_UPDATE' ? '待更新' : escapeHtml(item.execution_status)}，不会执行</span>`]);
    const content = items.length ? `<p class="muted">仅可执行用例会加入本次运行；待更新用例会保留为排除项。</p><form method="post">${table(['选择', '编号', '状态'], rows)}<p>已选择 <b id="selected-case-count">0</b> 条</p><button type="submit">创建运行批次</button></form><script>document.addEventListener('change',function(){var count=document.querySelectorAll('input[name=case]:checked').length;document.getElementById('selected-case-count').textContent=String(count);});</script>` : '<div class="panel">暂无自动化用例，请先完成自动化用例审核与脚本关联。</div>';
    return ['执行中心', content] as const;
  }
  return ['项目总览', dashboard(db, project)] as const;
}

function sendHtml(response: ServerResponse, html: string, status = 200) {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'", 'x-content-type-options': 'nosniff' }).end(html);
}

export async function startWeb(port = 0, database?: LocalDatabase) {
  const db = database ?? openLocalDatabase();
  db.migrate();
  if (!database) { db.seedDemo(); seedPreview(db); }
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const match = url.pathname.match(/^\/projects\/([^/]+)(?:\/(.*))?$/);
      const projectKey = match && decodeURIComponent(match[1]);
      const project = projectKey && db.get<Row>('SELECT * FROM projects WHERE id=? OR code=?', projectKey, projectKey);
      if (!project) { response.writeHead(404).end('项目不存在'); return; }
      const section = match?.[2] ?? '';
      if (request.method === 'POST' && section === 'runs/new') {
        const selectedIds = formBody(request).then((form) => form.getAll('case'));
        const environment = db.get<Row>('SELECT id FROM environments WHERE project_id=? ORDER BY name LIMIT 1', project.id);
        if (!environment) { response.writeHead(400).end('项目没有可用环境'); return; }
        db.createRunBatch(project.id, environment.id, 'SELECTED', await selectedIds, 'web-console');
        response.writeHead(302, { location: projectUrl(project, '/runs') }).end();
        return;
      }
      if (request.method !== 'GET') { response.writeHead(405).end('方法不支持'); return; }
      const [title, content] = renderSection(db, project, section, url);
      sendHtml(response, page(project, title, content));
    } catch (error) {
      response.writeHead(400).end(error instanceof Error ? error.message : '请求错误');
    }
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}`,
    stop: async () => new Promise<void>((resolve) => server.close(() => { if (!database) db.close(); resolve(); }))
  };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/apps/web/src/server.ts')) {
  startWeb(3000).then((app) => console.log(`${app.url}/projects/DEMO`));
}
