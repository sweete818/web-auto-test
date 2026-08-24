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

function page(project: Row, title: string, content: string, section: string) {
  const navigation = [
    ['工作台', [['⌂', '总览', '']]],
    ['用例管理', [['▤', '功能用例', '/cases'], ['⌘', '自动化', '/automation'], ['◌', '影响透视', '/impacts']]],
    ['执行管理', [['▶', '执行中心', '/runs/new'], ['▥', '运行记录', '/runs']]]
  ].map(([group, items]) => `<div class="nav-group"><div class="nav-group-title">${group}</div>${(items as string[][]).map(([icon, label, path]) => {
    const active = path.slice(1) === section ? ' active' : '';
    return `<a class="nav-item${active}" href="${projectUrl(project, path)}" aria-label="${label}"${active ? ' aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-text">${label}</span></a>`;
  }).join('')}</div>`).join('');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} - 测试管理台</title>
<style>
:root{--ink:#17233a;--muted:#72809a;--line:#e6ebf3;--surface:#fff;--canvas:#f6f8fc;--brand:#536dfe;--brand-dark:#24304b;--green:#137a55;--green-bg:#e8f7f0;--amber:#ae6700;--amber-bg:#fff4df;--violet:#6846d9;--violet-bg:#f1edff}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 Inter,system-ui,"Microsoft YaHei",sans-serif;background:var(--canvas);color:var(--ink)}.app-shell{min-height:100vh;display:flex}.sidebar{width:248px;flex:none;background:linear-gradient(180deg,#1c2944 0%,#101a2e 100%);color:#d9e3f6;padding:24px 14px;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:10px;margin:0 8px 34px;color:#fff;font-size:17px;font-weight:750}.brand-mark{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#798cff,#ae9aff);box-shadow:0 7px 20px #0004}.project-chip{margin:0 7px 20px;padding:12px;border:1px solid #43536f;background:#253653;border-radius:10px}.project-chip small{display:block;color:#9fb0cb;margin-bottom:2px}.project-chip strong{color:#fff}.nav-label{margin:12px 10px 8px;font-size:11px;letter-spacing:.09em;color:#8292ad}.nav-item{display:flex;align-items:center;gap:11px;margin:3px 0;padding:10px 12px;color:#bdcbe3;text-decoration:none;border-radius:8px;font-weight:600}.nav-item:hover{background:#263958;color:#fff}.nav-item.active{background:linear-gradient(90deg,#536dfe,#6277ec);color:#fff;box-shadow:0 8px 18px #0a10233d}.nav-icon{display:inline-block;width:16px;text-align:center;color:inherit}.sidebar-footer{margin:auto 8px 0;padding-top:18px;border-top:1px solid #34445f;font-size:12px;color:#8d9db8}.workspace{min-width:0;flex:1}.workspace-header{height:78px;display:flex;align-items:center;justify-content:space-between;padding:0 42px;background:#fff;border-bottom:1px solid var(--line)}.breadcrumb{color:var(--muted);font-size:13px}.breadcrumb b{color:var(--ink)}.header-actions{display:flex;align-items:center;gap:12px}.environment{padding:7px 10px;border-radius:999px;background:#eef2ff;color:#4056c5;font-weight:650;font-size:12px}.avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#202e49;color:#fff;font-size:12px;font-weight:800}.content{max-width:1240px;margin:0 auto;padding:34px 42px 52px}.page-title{margin:0;font-size:27px;letter-spacing:-.03em}.page-subtitle{margin:5px 0 28px;color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.card{padding:20px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:0 7px 25px #20335b0a}.card-label{font-size:13px;color:var(--muted)}.card b{display:block;margin-top:7px;font-size:29px;letter-spacing:-.04em}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:30px 0 10px}.section-heading h2{margin:0;font-size:16px}.panel{padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:0 7px 25px #20335b0a}table{width:100%;border-collapse:separate;border-spacing:0;margin-top:14px;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--surface)}th{padding:12px 14px;background:#f8faff;color:#6a7891;font-size:12px;font-weight:750;letter-spacing:.02em;text-align:left;border-bottom:1px solid var(--line)}td{padding:14px;border-bottom:1px solid var(--line);vertical-align:middle}tr:last-child td{border-bottom:0}tbody tr:hover td{background:#fbfcff}.badge{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;font-size:12px;font-weight:750}.badge::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}.badge-executable,.badge-confirmed,.badge-approved,.badge-completed{color:var(--green);background:var(--green-bg)}.badge-needs-update,.badge-pending,.badge-open{color:var(--amber);background:var(--amber-bg)}.badge-draft,.badge-review{color:var(--violet);background:var(--violet-bg)}.muted{color:var(--muted)}.empty{padding:34px;text-align:center;color:var(--muted)}button{border:0;border-radius:9px;padding:10px 16px;background:linear-gradient(135deg,#536dfe,#6277ec);color:#fff;font:inherit;font-weight:750;cursor:pointer;box-shadow:0 8px 16px #536dfe30}button:hover{filter:brightness(1.04)}input{padding:9px 10px;border:1px solid #d7deeb;border-radius:8px;background:#fff;font:inherit}input:focus{outline:3px solid #dfe4ff;border-color:#7184f7}input[type=checkbox]{width:16px;height:16px;accent-color:var(--brand)}label{color:#46546c;font-weight:600}.toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.toolbar .spacer{flex:1}.run-notice{margin-bottom:16px;padding:13px 15px;border-left:3px solid #7e8cff;background:#f4f5ff;border-radius:0 9px 9px 0;color:#4854a0}.ok{color:var(--green)}.warn{color:var(--amber)}@media(max-width:800px){.sidebar{width:68px;padding:16px 8px}.brand>span:last-child,.project-chip,.nav-label,.nav-text{display:none}.brand{margin:0 10px 24px}.nav-item{justify-content:center;padding:10px}.nav-icon{font-size:16px}.workspace-header{padding:0 20px}.content{padding:26px 20px}.cards{grid-template-columns:1fr}.sidebar-footer{display:none}}
</style><style>
.nav-group{margin:0 0 16px}.nav-group-title{margin:0 10px 7px;color:#8495b2;font-size:10px;font-weight:800;letter-spacing:.1em}.dashboard-grid{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:18px}.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.metric-card{padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.metric-card .metric-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#eef0ff;color:#5268e8;font-size:16px}.metric-card b{display:block;margin-top:10px;font-size:28px;letter-spacing:-.04em}.metric-card span:last-child{display:block;margin-top:3px;color:var(--muted);font-size:12px}.quick-actions,.attention-card{padding:19px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:0 7px 25px #20335b0a}.quick-actions h2,.attention-card h2{margin:0 0 12px;font-size:15px}.quick-action{display:flex;align-items:center;gap:11px;padding:12px 0;color:var(--ink);text-decoration:none;border-bottom:1px solid var(--line);font-weight:700}.quick-action:last-child{border-bottom:0}.quick-action-symbol{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#eef0ff;color:#5268e8}.list-toolbar{display:flex;align-items:center;gap:12px;margin:0 0 15px;padding:14px 16px;border:1px solid var(--line);border-radius:13px;background:var(--surface)}.list-toolbar strong{font-size:15px}.list-toolbar .toolbar-meta{color:var(--muted);font-size:12px}.list-toolbar .toolbar-spacer{flex:1}.secondary-button{display:inline-flex;align-items:center;padding:9px 12px;border:1px solid #d5dced;border-radius:8px;color:#41516d;background:#fff;font-weight:700;text-decoration:none}.run-layout{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:18px;align-items:start}.run-selection{padding:20px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:0 7px 25px #20335b0a}.execution-summary{position:sticky;top:20px;padding:20px;border:1px solid #dce2ff;border-radius:14px;background:linear-gradient(180deg,#fafbff,#f2f4ff)}.execution-summary h2{margin:0 0 16px;font-size:16px}.summary-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #dfe4fb;color:#50607e}.summary-row:last-of-type{border-bottom:0}.summary-row b{color:var(--ink)}.summary-total{margin:15px 0;padding:12px;border-radius:10px;background:#fff;color:#536dfe;text-align:center}.execution-summary button{width:100%;margin-top:8px}.run-selection .section-heading{margin:18px 0 0}@media(max-width:1000px){.dashboard-grid,.run-layout{grid-template-columns:1fr}.execution-summary{position:static}.metric-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:800px){.nav-group-title{display:none}.nav-group{margin-bottom:14px}}@media(max-width:640px){.metric-grid{grid-template-columns:1fr}.list-toolbar{align-items:flex-start;flex-wrap:wrap}.list-toolbar .toolbar-spacer{display:none}.content{padding:22px 16px}.workspace-header{padding:0 16px}}
</style></head><body><div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">✓</span><span>测试管理台</span></div><div class="project-chip"><small>当前项目</small><strong>${escapeHtml(project.code)}</strong></div>${navigation}<div class="sidebar-footer">本地模式<br>数据安全存储于 D 盘</div></aside><section class="workspace"><header class="workspace-header"><div class="breadcrumb">项目 / <b>${escapeHtml(title)}</b></div><div class="header-actions"><span class="environment">测试环境</span><span class="avatar">QA</span></div></header><main class="content"><h1 class="page-title">${escapeHtml(title)}</h1><p class="page-subtitle">${escapeHtml(project.name)} · 用例、自动化与执行记录实时追踪</p>${content}</main></section></div></body></html>`;
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
  const needsUpdateCount = db.get<Row>("SELECT count(*) AS count FROM automation_cases WHERE project_id=? AND execution_status='NEEDS_UPDATE'", project.id)?.count ?? 0;
  const recent = db.all<Row>('SELECT release_version,status,created_at FROM run_batches WHERE project_id=? ORDER BY created_at DESC LIMIT 5', project.id);
  const metric = (icon: string, value: number, label: string) => `<div class="metric-card"><span class="metric-icon" aria-hidden="true">${icon}</span><b>${value}</b><span>${label}</span></div>`;
  const actions = `<aside><section class="quick-actions"><h2>快捷操作</h2><a class="quick-action" href="${projectUrl(project, '/runs/new')}"><span class="quick-action-symbol" aria-hidden="true">▶</span>创建运行批次</a><a class="quick-action" href="${projectUrl(project, '/cases')}"><span class="quick-action-symbol" aria-hidden="true">＋</span>维护功能用例</a><a class="quick-action" href="${projectUrl(project, '/impacts')}"><span class="quick-action-symbol" aria-hidden="true">◌</span>查看变更影响</a></section><section class="attention-card" style="margin-top:16px"><h2>需要关注</h2><p class="muted">待更新自动化用例</p><b style="font-size:26px;color:#ae6700">${needsUpdateCount}</b></section></aside>`;
  const main = `<section><div class="metric-grid">${metric('▤', functionalCount, '功能用例')}${metric('⌘', automationCount, '自动化用例')}${metric('✓', executableCount, '可执行用例')}</div><div class="section-heading"><h2>最近运行</h2><a class="secondary-button" href="${projectUrl(project, '/runs')}">查看全部</a></div>${table(['版本', '状态', '创建时间'], recent.map((batch) => [escapeHtml(batch.release_version || '—'), statusBadge(batch.status), escapeHtml(batch.created_at)]), '暂无运行记录')}</section>`;
  return `<div class="dashboard-grid">${main}${actions}</div>`;
}

function statusBadge(status: unknown) {
  const value = String(status ?? '—');
  const className = value === 'EXECUTABLE' || value === 'CONFIRMED' || value === 'APPROVED' || value === 'COMPLETED'
    ? 'executable'
    : value === 'NEEDS_UPDATE' || value === 'PENDING' || value === 'OPEN' ? 'needs-update'
      : value === 'DRAFT' ? 'draft' : 'review';
  const label = ({ EXECUTABLE: '可执行', NEEDS_UPDATE: '待更新', CONFIRMED: '已确认', APPROVED: '已批准', COMPLETED: '已完成', PENDING: '待处理', OPEN: '待处理', DRAFT: '草稿' } as Record<string, string>)[value] ?? value;
  return `<span class="badge badge-${className}">${escapeHtml(label)}</span>`;
}

function renderSection(db: LocalDatabase, project: Row, section: string, url: URL) {
  if (section === 'cases') {
    const cases = db.all<Row>('SELECT case_code,module,scenario,status,current_version_no FROM functional_cases WHERE project_id=? ORDER BY case_code', project.id);
    const toolbar = `<div class="list-toolbar"><div><strong>功能用例库</strong><div class="toolbar-meta">共 ${cases.length} 条，可确认、版本化并追踪自动化影响</div></div><span class="toolbar-spacer"></span><a class="secondary-button" href="${projectUrl(project, '/automation')}">查看自动化</a></div>`;
    return ['功能用例', `${toolbar}${table(['编号', '模块', '场景', '状态', '版本'], cases.map((item) => [escapeHtml(item.case_code), escapeHtml(item.module), escapeHtml(item.scenario), statusBadge(item.status), `v${escapeHtml(item.current_version_no ?? '—')}`]))}`] as const;
  }
  if (section === 'automation') {
    const items = db.all<Row>('SELECT case_code,level,review_status,execution_status,current_version_no FROM automation_cases WHERE project_id=? ORDER BY case_code', project.id);
    const ready = items.filter((item) => item.execution_status === 'EXECUTABLE').length;
    const toolbar = `<div class="list-toolbar"><div><strong>自动化资产</strong><div class="toolbar-meta">${ready} 条可执行 · ${items.length - ready} 条需要处理</div></div><span class="toolbar-spacer"></span><a class="secondary-button" href="${projectUrl(project, '/runs/new')}">进入执行中心</a></div>`;
    return ['自动化用例', `${toolbar}${table(['编号', '级别', '审核状态', '执行状态', '版本'], items.map((item) => [escapeHtml(item.case_code), escapeHtml(item.level), statusBadge(item.review_status), statusBadge(item.execution_status), `v${escapeHtml(item.current_version_no ?? '—')}`]))}`] as const;
  }
  if (section === 'impacts') {
    const impacts = db.all<Row>('SELECT i.impact_type,i.status,a.case_code,f.case_code AS functional_code,i.created_at FROM automation_impacts i JOIN automation_cases a ON a.id=i.automation_case_id AND a.project_id=i.project_id JOIN functional_case_versions v ON v.id=i.functional_case_version_id AND v.project_id=i.project_id JOIN functional_cases f ON f.id=v.functional_case_id AND f.project_id=i.project_id WHERE i.project_id=? ORDER BY i.created_at DESC', project.id);
    return ['影响透视', `<div class="list-toolbar"><div><strong>变更影响队列</strong><div class="toolbar-meta">功能用例确认新版本后，关联自动化会自动进入待更新</div></div><span class="toolbar-spacer"></span>${statusBadge('OPEN')}</div>${table(['影响类型', '自动化用例', '功能用例', '状态', '创建时间'], impacts.map((item) => [escapeHtml(item.impact_type), escapeHtml(item.case_code), escapeHtml(item.functional_code), statusBadge(item.status), escapeHtml(item.created_at)]), '暂无影响')}`] as const;
  }
  if (section === 'runs') {
    const version = url.searchParams.get('version') ?? '';
    const date = url.searchParams.get('date') ?? '';
    const batches = db.all<Row>('SELECT id,release_version,status,trigger_type,triggered_by,created_at FROM run_batches WHERE project_id=? ORDER BY created_at DESC', project.id)
      .filter((item) => (!version || item.release_version === version) && (!date || String(item.created_at).startsWith(date)));
    const filter = `<form method="get" class="panel toolbar"><label>版本 <input name="version" value="${escapeHtml(version)}" placeholder="例如 v1.2.0"></label><label>日期 <input name="date" value="${escapeHtml(date)}" placeholder="YYYY-MM-DD"></label><span class="spacer"></span><button>筛选记录</button></form>`;
    return ['运行记录', `${filter}${table(['版本', '状态', '触发方式', '触发人', '创建时间'], batches.map((item) => [escapeHtml(item.release_version || '—'), statusBadge(item.status), escapeHtml(item.trigger_type), escapeHtml(item.triggered_by), escapeHtml(item.created_at)]), '暂无记录')}`] as const;
  }
  if (section === 'runs/new') {
    const items = db.all<Row>('SELECT id,case_code,execution_status FROM automation_cases WHERE project_id=? ORDER BY case_code', project.id);
    const environment = db.get<Row>('SELECT id,name FROM environments WHERE project_id=? ORDER BY name LIMIT 1', project.id);
    const executableCount = items.filter((item) => item.execution_status === 'EXECUTABLE').length;
    const excludedCount = items.length - executableCount;
    const rows = items.map((item) => item.execution_status === 'EXECUTABLE'
      ? [`<input type="checkbox" name="case" value="${escapeHtml(item.id)}">`, escapeHtml(item.case_code), statusBadge(item.execution_status)]
      : ['—', escapeHtml(item.case_code), `${statusBadge(item.execution_status)} <span class="muted">不会执行</span>`]);
    const summary = `<aside class="execution-summary"><h2>本次运行摘要</h2><div class="summary-row"><span>运行环境</span><b>${escapeHtml(environment?.name ?? '未配置')}</b></div><div class="summary-row"><span>可执行用例</span><b>${executableCount}</b></div><div class="summary-row"><span>自动排除</span><b>${excludedCount}</b></div><div class="summary-row"><span>失败重试</span><b>最多 1 次</b></div><div class="summary-total">已选择 <b id="selected-case-count">0</b> 条</div><button type="submit">创建运行批次</button></aside>`;
    const content = items.length ? `<form method="post"><div class="run-layout"><section class="run-selection"><div class="run-notice">仅可执行用例会加入本次运行；待更新用例会保留为排除项，不会执行。</div>${table(['选择', '编号', '状态'], rows)}</section>${summary}</div></form><script>document.addEventListener('change',function(){var count=document.querySelectorAll('input[name=case]:checked').length;document.getElementById('selected-case-count').textContent=String(count);});</script>` : '<div class="panel empty">暂无自动化用例，请先完成自动化用例审核与脚本关联。</div>';
    return ['执行中心', content] as const;
  }
  return ['项目总览', dashboard(db, project)] as const;
}

function sendHtml(response: ServerResponse, html: string, status = 200) {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'", 'x-content-type-options': 'nosniff' }).end(html);
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
      sendHtml(response, page(project, title, content, section));
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
