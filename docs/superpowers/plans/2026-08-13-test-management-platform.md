# 多项目 AI 测试管理台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Playwright 工程旁建设多项目测试管理台，完成需求到 AI 草稿、人工确认、自动化审核、选择执行和运行记录的第一期闭环。

**Architecture:** pnpm workspace 包含 Next.js Web、NestJS API、独立 Runner 和共享契约。API 将版本、快照和审计记录写入 PostgreSQL；Redis/BullMQ 执行 AI 与测试任务；Runner 用固定批次快照和 Secret 调用项目指定 Playwright 仓库，结果和七天证据回写 API。

**Tech Stack:** Node.js 22 LTS、pnpm、Next.js、NestJS、TypeScript、PostgreSQL、Prisma、Redis、BullMQ、MinIO/S3、Playwright、Docker Compose、Vitest。

## Global Constraints

- 所有项目业务表含 `project_id`；服务查询和 API 路由先验证项目边界，禁止跨项目执行。
- Secret 仅按“项目 + 环境”注入 Runner；不得进入数据库明文、日志、前端或 Git。
- 功能用例只在确认时创建不可变新版本；历史版本、批次、结果不得覆盖或物理删除。
- 确认新功能用例版本且前置、步骤、预期、优先级、类型或自动化建议变化时，创建影响记录，并把关联自动化标记为 `NEEDS_UPDATE`。
- 仅 `EXECUTABLE` 且无开放影响记录的自动化用例可以执行；全量执行也须显示排除原因。
- 执行前检查登录页和关键 API；失败时批次是 `ENVIRONMENT_BLOCKED`，不逐条运行。
- 每个失败用例最多重试一次；列表展示最终结果，详情保存两次尝试。
- 运行证据保留七天，执行摘要长期保存。

---

## 工作区结构

```text
test-management-platform/
├─ apps/web/                 # Next.js 页面
├─ apps/api/                 # NestJS API、队列生产者、清理任务
├─ apps/runner/              # BullMQ 消费者、健康检查、Playwright 执行
├─ packages/contracts/       # DTO、枚举、Zod schema
├─ packages/database/        # Prisma schema、迁移、种子
├─ packages/ui/              # 状态徽标、表格、筛选组件
├─ infra/docker-compose.yml  # PostgreSQL、Redis、MinIO
└─ docs/runbooks/            # Secret、Runner、保留策略
```

## 数据库模型

在 `packages/database/prisma/schema.prisma` 定义 UUID 主键、创建/更新时间和 actor 审计字段。关键表如下。

| 表 | 字段与约束 |
|---|---|
| Project | code、name、status；code 唯一，仅可归档。 |
| ProjectRepository | projectId、repositoryUrl、branch、scriptRoot、runCommand、runnerConfigVersion。 |
| Environment | projectId、name、baseUrl、healthCheckConfig、secretRef；项目内名称唯一。 |
| RequirementSnapshot / AiGeneration | 项目、文件名、对象存储键、人工版本、摘要、AI 原始 JSON、模型、提示词版本、状态。 |
| TestPoint / FunctionalCase / FunctionalCaseVersion | 用例编号项目内唯一；版本号在用例内唯一；确认版本不可变。 |
| CaseChangeLog | 对象、字段、前值、后值、来源（AI/人工新增/人工编辑）、actor、时间。 |
| AutomationCase / AutomationCaseVersion | 来源功能用例、层级、标签、审核/执行状态、脚本路径、固定 Git SHA、设计 JSON。 |
| AutomationImpact | 功能版本、自动化用例、影响类型、处理状态；按项目和处理状态索引。 |
| TestSuite / TestSuiteMember | 固定成员或筛选规则；项目内名称唯一。 |
| RunBatch / RunCaseResult / RunAttempt | 环境、版本、选择快照、执行快照、最终结果；尝试次数最多 2。 |
| EnvironmentHealth / FailureTriage / EvidenceFile | 健康结论、AI 初判/人工分类、对象键、脱敏标记、七天过期时间。 |
| ManualExecution / ReleaseWaiver | 手工结果和 P0 风险发布豁免审计。 |

共享状态枚举由 `packages/contracts` 导出：`AutomationExecutionStatus`、`RunBatchStatus`、`RunCaseStatus`、`FailureCategory`。

### Task 1: 基础设施、工作区和数据模型

**Files:**
- Create: `test-management-platform/package.json`
- Create: `test-management-platform/pnpm-workspace.yaml`
- Create: `test-management-platform/infra/docker-compose.yml`
- Create: `test-management-platform/packages/contracts/src/index.ts`
- Create: `test-management-platform/packages/contracts/test/lifecycle.spec.ts`
- Create: `test-management-platform/packages/database/prisma/schema.prisma`

**Interfaces:** PostgreSQL、Redis、MinIO 本地服务；共享状态枚举；Prisma Client；DEMO 项目、test 环境与 smoke 测试集种子。

- [ ] **Step 1: 写失败的生命周期契约测试**

```ts
it('exposes executable lifecycle states', () => {
  expect(Object.values(AutomationExecutionStatus)).toContain('EXECUTABLE');
  expect(Object.values(RunBatchStatus)).toContain('ENVIRONMENT_BLOCKED');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @platform/contracts test`  
Expected: FAIL，找不到共享状态导出。

- [ ] **Step 3: 创建 workspace、Compose 和 Prisma 迁移**

Compose 启动 PostgreSQL 16、Redis 7、MinIO，端口仅绑定本机。实现上表模型、外键和索引；`project_id + case_code`、`functional_case_id + version_no` 必须唯一。创建迁移和 Demo 种子。

- [ ] **Step 4: 验证并提交**

Run: `docker compose -f infra/docker-compose.yml up -d && pnpm --filter @platform/database prisma migrate dev --name init && pnpm --filter @platform/contracts test`  
Expected: 迁移成功，契约测试通过。

```bash
git add test-management-platform
git commit -m "feat: scaffold test management platform"
```

### Task 2: 项目、环境与需求快照 API

**Files:**
- Create: `apps/api/src/projects/projects.controller.ts`
- Create: `apps/api/src/projects/projects.service.ts`
- Create: `apps/api/src/requirements/requirements.controller.ts`
- Create: `apps/api/src/storage/object-storage.service.ts`
- Test: `apps/api/test/projects-requirements.e2e-spec.ts`

**Interfaces:** `POST /projects`、`POST /projects/{projectId}/environments`、`POST /projects/{projectId}/requirements`；第一期从 `x-actor-id` 获取操作人。

- [ ] **Step 1: 写失败 API 测试**

```ts
it('rejects duplicate project code', async () => {
  await api.post('/projects').send({ code: 'DEMO', name: 'Demo' }).expect(201);
  await api.post('/projects').send({ code: 'DEMO', name: 'Other' }).expect(409);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @platform/api test:e2e -- projects-requirements`  
Expected: FAIL，项目和上传路由不存在。

- [ ] **Step 3: 实现路由、隔离上传和审计**

项目 code 只允许大写字母、数字和中划线。需求上传只接收 PDF、DOCX、MD、TXT、PNG、JPG，单文件上限 20MB。对象键以项目 ID、快照 ID 和安全文件名分层。归档项目新增对象返回 409。每次操作记录 actor、对象、时间和动作，不记录文件正文或 Secret。

- [ ] **Step 4: 验证并提交**

Run: `pnpm --filter @platform/api test:e2e -- projects-requirements`  
Expected: 重复项目返回 409；上传对象属于当前项目；归档项目不能上传。

```bash
git add test-management-platform/apps/api test-management-platform/packages/database
git commit -m "feat: add projects environments and requirement snapshots"
```

### Task 3: AI 测试点、功能用例草稿与确认版本

**Files:**
- Create: `apps/api/src/ai/ai-generation.service.ts`
- Create: `apps/api/src/ai/ai-generation.processor.ts`
- Create: `apps/api/src/cases/functional-cases.controller.ts`
- Create: `apps/api/src/cases/functional-cases.service.ts`
- Create: `packages/contracts/src/case-schema.ts`
- Test: `apps/api/test/functional-cases.e2e-spec.ts`

**Interfaces:** `POST /requirements/{snapshotId}/generations`、`PATCH /functional-cases/{id}/draft`、`POST /functional-cases/{id}/confirm`、`GET /functional-cases/{id}/versions`。

- [ ] **Step 1: 写失败版本测试**

```ts
it('creates a version only at confirmation', async () => {
  const draft = await createCaseDraft();
  expect(await versionsOf(draft.id)).toHaveLength(0);
  await api.post('/functional-cases/' + draft.id + '/confirm').send({ changeReason: 'reviewed' }).expect(201);
  expect(await versionsOf(draft.id)).toMatchObject([{ versionNo: 1 }]);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @platform/api test:e2e -- functional-cases`  
Expected: FAIL，确认路由不存在。

- [ ] **Step 3: 实现 AI JSON schema、任务与草稿**

Zod schema 的每个用例包含 module、scenario、precondition、steps、expectedResult、priority、testType、automationRecommendation、sourceExcerpt。AI 输出验证后仅创建测试点和功能用例草稿；校验失败保存安全错误摘要。

- [ ] **Step 4: 实现编辑、确认、历史与变更审计**

确认事务锁定用例、递增版本号、插入不可变版本、更新当前版本并写 ChangeLog。草稿修改逐字段记录前后值、AI/人工来源、actor 和理由。废弃用例不能创建新版本。

- [ ] **Step 5: 验证 v2 并提交**

Run: `pnpm --filter @platform/api test:e2e -- functional-cases`  
Expected: 再次确认创建 v2，v1 不变，废弃用例被拒绝。

```bash
git add test-management-platform/apps/api test-management-platform/packages/contracts
git commit -m "feat: add AI drafts and versioned functional cases"
```

### Task 4: 自动化审核、脚本关联与影响透视 API

**Files:**
- Create: `apps/api/src/automation/automation.controller.ts`
- Create: `apps/api/src/automation/automation.service.ts`
- Create: `apps/api/src/automation/impact.service.ts`
- Test: `apps/api/test/automation-impact.e2e-spec.ts`

**Interfaces:** `POST /functional-cases/{id}/automation-drafts`、`POST /automation-cases/{id}/review`、`POST /automation-cases/{id}/script-version`、`GET /functional-cases/{id}/impacts`。

- [ ] **Step 1: 写失败转换测试**

```ts
it('converts only confirmed functional cases', async () => {
  await api.post('/functional-cases/' + draftId + '/automation-drafts').expect(409);
  await confirm(draftId);
  expect((await api.post('/functional-cases/' + draftId + '/automation-drafts').expect(201)).body.executionStatus).toBe('DRAFT');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @platform/api test:e2e -- automation-impact`  
Expected: FAIL，自动化 API 不存在。

- [ ] **Step 3: 实现设计、审核和脚本关联**

AI 设计含层级、数据准备、步骤、断言、标签、建议路径和待补充项。审核记录回归价值、稳定性、可断言性、数据可控性、契约就绪、维护成本、层级与意见；批准后为 PENDING_IMPLEMENTATION。仅审核通过可关联脚本，且校验项目仓库、相对路径、不含 `..`、40 位 Git SHA；关联后转 EXECUTABLE。

- [ ] **Step 4: 实现影响与反向追踪**

确认 v2 时比较前置、步骤、预期、优先级、类型和自动化建议。变化则为每条活跃关联自动化创建 OPEN 影响并标记 NEEDS_UPDATE。透视接口须返回变更字段、脚本路径、最近运行结果和处理人。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @platform/api test:e2e -- automation-impact`  
Expected: 一个功能用例更新可影响两条自动化；未确认草稿不产生影响。

```bash
git add test-management-platform/apps/api
git commit -m "feat: add automation reviews script links and impact tracking"
```

### Task 5: 测试集、全量或部分选择与批次快照

**Files:**
- Create: `apps/api/src/suites/suites.service.ts`
- Create: `apps/api/src/runs/runs.controller.ts`
- Create: `apps/api/src/runs/runs.service.ts`
- Test: `apps/api/test/run-selection.e2e-spec.ts`

**Interfaces:** `POST /projects/{projectId}/test-suites`、`GET /projects/{projectId}/executable-cases`、`POST /projects/{projectId}/run-batches`。

- [ ] **Step 1: 写失败选择测试**

```ts
it('excludes needs-update case from all selection', async () => {
  const batch = await createAllRunBatch();
  expect(batch.selectionSnapshot.excluded).toContainEqual(expect.objectContaining({ reason: 'NEEDS_UPDATE' }));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @platform/api test:e2e -- run-selection`  
Expected: FAIL，批次 API 不存在。

- [ ] **Step 3: 实现测试集、选择器与队列**

固定集使用成员表，规则集支持 module、tags、priority、recentStatus。ALL 选择无开放影响的可执行用例；SUITE 和 SELECTED 验证同一项目。保存自动化版本、来源功能版本、路径、SHA、环境 URL、执行命令和排除原因的不可变快照，不保存 Secret。事务提交后向 Redis 只发送 batch ID。

- [ ] **Step 4: 验证并提交**

Run: `pnpm --filter @platform/api test:e2e -- run-selection`  
Expected: ALL、SUITE、SELECTED 均只选项目内用例，待更新用例被排除。

```bash
git add test-management-platform/apps/api
git commit -m "feat: add suites run selection and batch snapshots"
```

### Task 6: Runner、健康检查、结果回写和七天清理

**Files:**
- Create: `apps/runner/src/worker.ts`
- Create: `apps/runner/src/health-check.ts`
- Create: `apps/runner/src/playwright-executor.ts`
- Create: `apps/runner/src/result-uploader.ts`
- Create: `apps/api/src/retention/retention.service.ts`
- Test: `apps/runner/test/health-check.spec.ts`
- Test: `apps/api/test/evidence-retention.e2e-spec.ts`

**Interfaces:** Runner 通过内部 batch ID 获取执行上下文，回写健康检查和结果；内部接口只接受 Runner 凭据。

- [ ] **Step 1: 写失败健康检查测试**

```ts
it('blocks an unavailable login page', async () => {
  await expect(checkEnvironment({ baseUrl: 'http://127.0.0.1:1', healthChecks: [] }))
    .resolves.toMatchObject({ loginPageStatus: 'FAILED', conclusion: 'BLOCKED' });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @platform/runner test -- health-check`  
Expected: FAIL，checkEnvironment 不存在。

- [ ] **Step 3: 实现执行、重试、证据和分类**

十秒内检查登录页和关键 API，任一失败即写 ENVIRONMENT_BLOCKED。通过后隔离工作目录检出固定 SHA，按项目命令运行，Secret 仅作为子进程环境变量。失败重试一次，写两条尝试记录。仅失败上传截图、视频、Trace、日志；证据按项目、环境、批次和结果隔离，七天后自动清理。规则初判定位器错误为 SCRIPT、HTTP 5xx 为 ENVIRONMENT、其他为 UNKNOWN，AI/人工后续确认。

- [ ] **Step 4: 验证并提交**

Run: `pnpm --filter @platform/runner test && pnpm --filter @platform/api test:e2e -- evidence-retention`  
Expected: 环境失败不调用执行器；过期文件被删但结果摘要保留。

```bash
git add test-management-platform/apps/runner test-management-platform/apps/api
git commit -m "feat: add Playwright runner health checks and evidence retention"
```

### Task 7: Next.js 管理台

**Files:**
- Create: `apps/web/app/projects/[projectId]/page.tsx`
- Create: `apps/web/app/projects/[projectId]/requirements/page.tsx`
- Create: `apps/web/app/projects/[projectId]/cases/page.tsx`
- Create: `apps/web/app/projects/[projectId]/automation/page.tsx`
- Create: `apps/web/app/projects/[projectId]/impacts/page.tsx`
- Create: `apps/web/app/projects/[projectId]/runs/new/page.tsx`
- Create: `apps/web/app/projects/[projectId]/runs/page.tsx`
- Create: `apps/web/components/run-selector.tsx`
- Test: `apps/web/e2e/run-selection.spec.ts`

**Interfaces:** Web 用 contracts 类型化 API 客户端；所有路由和请求携带当前项目 ID。

- [ ] **Step 1: 写失败浏览器测试**

```ts
test('shows selected and excluded cases before run', async ({ page }) => {
  await page.goto('/projects/' + projectId + '/runs/new');
  await page.getByLabel('AT-LG-001').check();
  await expect(page.getByTestId('selected-case-count')).toHaveText('1');
  await expect(page.getByText('待更新：AT-LG-003，不会执行')).toBeVisible();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @platform/web test:e2e -- run-selection`  
Expected: FAIL，执行中心页面不存在。

- [ ] **Step 3: 实现所有第一期页面**

顶部固定项目选择器。总览显示待确认、待审核、待更新、今日通过率、P0 门禁。需求页上传与 AI 轮询；功能用例页支持编辑、确认、版本对比、来源和审计；自动化页审核、SHA 关联；影响页呈现“用例变更到脚本到最近结果”；执行中心支持全量、测试集、筛选勾选与排除说明；记录详情显示两次尝试、分类和未过期证据。

- [ ] **Step 4: 验证并提交**

Run: `pnpm --filter @platform/web test:e2e && pnpm --filter @platform/web build`  
Expected: 可部分勾选，待更新不可选，构建通过。

```bash
git add test-management-platform/apps/web test-management-platform/packages/ui
git commit -m "feat: add test management web console"
```

### Task 8: 导入导出、指标与运行手册

**Files:**
- Create: `apps/api/src/import-export/cases-import.service.ts`
- Create: `apps/api/src/metrics/metrics.service.ts`
- Create: `apps/api/test/cases-import.e2e-spec.ts`
- Create: `docs/runbooks/secrets-and-runner.md`
- Create: `docs/runbooks/evidence-retention.md`
- Modify: `README.md`

**Interfaces:** 功能用例预览导入、确认导入、导出和项目指标 API。

- [ ] **Step 1: 写失败导入测试**

```ts
it('previews duplicate codes without confirming versions', async () => {
  const preview = await uploadSheet('duplicate-cases.xlsx');
  expect(preview.duplicates).toContain('TC-LG-001');
  expect(await confirmedVersionCount(projectId)).toBe(0);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @platform/api test:e2e -- cases-import`  
Expected: FAIL，导入预览 API 不存在。

- [ ] **Step 3: 实现导入、导出、指标和运维文档**

预览校验列和项目内重复，确认导入只能创建草稿。指标返回分子/分母：AI 采纳率、人工修改/删除率、自动化采纳率、驳回率、待更新数、通过/阻塞率、失败趋势、P0 覆盖率和豁免次数。手册说明 Secret、Runner 最小权限、固定 SHA、证据清理和告警。

- [ ] **Step 4: 全量验证并提交**

Run: `pnpm lint && pnpm test && pnpm build`  
Expected: 所有工作区的类型检查、测试和构建通过。

```bash
git add test-management-platform docs README.md
git commit -m "feat: add case import metrics and operations docs"
```

## 里程碑

1. Task 1–2：项目、环境、仓库和需求快照可用。
2. Task 3：AI 草稿经人工确认成为可追溯功能用例版本。
3. Task 4：功能用例与自动化脚本双向追踪、影响透视可用。
4. Task 5–6：全量/部分执行、健康检查、重试、结果与七天证据闭环可用。
5. Task 7–8：管理台、导入导出、指标和运行手册可用。

## 计划自检

- 规格覆盖：多项目、需求快照、AI 草稿、人工确认、版本历史、脚本追踪、影响透视、全量/部分执行、健康检查、重试、证据、失败分类、指标和导入导出均有任务。
- 安全覆盖：项目隔离、路径校验、固定 SHA、Secret 注入和七天清理均有明确约束。
- 类型一致性：Web、API、Runner 共用 contracts；Runner 按 batch ID 拉取快照，不从队列传递 Secret。
