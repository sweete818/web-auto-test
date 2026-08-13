# 多项目 AI 测试管理台设计

## 1. 目标与范围

建设一个面向测试工程师的 Web 测试管理台，形成“需求/原型 → AI 生成测试点、场景和功能用例草稿 → 人工编辑确认 → 自动化设计与脚本审核 → 可选用例执行 → 执行记录与质量分析”的闭环。

第一期支持单人操作和单项目页面视图，但从数据、接口和执行配置层面支持多个项目。项目之间的需求、用例、脚本、环境、测试集、凭据和执行记录完全隔离。

第一期不实现多人角色权限、并发调度、缺陷平台联动、自动创建脚本 PR、企业登录或 Figma 直接解析。视觉回归和 AI 脚本修复作为第二期能力，在第一期保留脚本版本、截图、Trace、失败分类和审核数据基础。

## 2. 核心原则

1. AI 输出永远是草稿。测试工程师可编辑、删除或补充，只有人工确认后才能进入正式功能用例库。
2. 需求文件仅是来源依据；每次确认后的功能用例版本才是可执行测试的正式基线。
3. 已确认功能用例不等于可执行自动化用例。自动化必须经过价值与可测性审核、脚本关联和验证。
4. 每次功能用例确认生成不可修改的新版本，例如 `TC-LG-001 v3`，并保留旧版本。
5. 功能用例新版本确认后，系统计算关联影响，将受影响自动化用例标记为“待更新”；草稿修改或未确认修改不影响脚本。
6. 每个执行批次保存用例版本、脚本提交号、环境、执行配置和实际入选用例快照；后续修改不改写历史。
7. 凭据只保存于 Secret 存储；报告、截图、视频、Trace 和日志按项目及环境隔离，并在七天后自动清理。

## 本地开发存储适配器

第一期本地开发不依赖 Docker。数据通过 Node 22 内置 `node:sqlite` 保存，JSON 使用 TEXT 字段，状态字段使用显式字符串 `CHECK` 约束；SQL 迁移和种子在本机执行。任务调度和对象存储分别使用进程内队列与本地文件适配器。API 和 Runner 只能依赖仓储、队列、对象存储接口，生产环境可分别替换为 PostgreSQL、Redis/BullMQ、MinIO/S3，且不改变业务状态机。

运行数据根目录由 `TEST_MANAGEMENT_DATA_DIR` 指定，默认值为 `D:\路径卷不可删\test-management-platform`。数据库位于其 `data/test-management.sqlite` 子目录，证据位于 `evidence/` 子目录。应用只可创建这些子目录；不得删除或重建该根目录。七天保留任务未来只能删除 `evidence/` 内已过期的应用证据文件。

## 3. 业务闭环

```text
上传需求文件或原型
  → AI 生成测试点、场景、功能用例草稿
  → 人工编辑、确认，生成正式功能用例版本
  → 新功能部署测试环境后，人工点击“转自动化”
  → AI 生成自动化设计与 Playwright 脚本初稿
  → 人工审核价值、可测性和脚本
  → 标记为可执行并关联脚本提交号
  → 选择全量、测试集或部分勾选用例执行
  → 环境健康检查
  → Playwright Runner 执行并回写结果
  → 展示执行记录、失败分类、证据与版本质量结论
```

## 4. 状态模型

### 功能用例

```text
AI 草稿 → 编辑中 → 已确认 → 已废弃
                    ↓
             新版本（再次确认）
```

- 草稿编辑不创建正式版本。
- 用户点击确认时创建 `functional_case_version`；确认后的版本不可编辑。
- 已确认用例编辑后产生新的编辑草稿；再次确认生成下一个版本。
- 已废弃用例不物理删除，编号永不复用。

### 自动化用例

```text
自动化草稿 → 待审核 → 待实现 → 可执行 → 已停用
                            ↑
                  功能用例新版本影响
                         待更新
```

自动化审核检查：回归价值、业务稳定性、可断言性、测试数据可控性、定位器/接口契约可用性、维护成本和推荐自动化层级（UI、API 或 API+UI）。

### 执行

```text
待执行 → 环境检查 → 执行中 → 已完成
                    └→ 环境阻塞

单条结果：未执行 / 通过 / 失败 / 跳过 / 阻塞
```

- 失败最多自动重试一次。
- 列表展示最终结果；详情保留首次与重试尝试记录。
- P0 用例未执行、失败或环境阻塞时，版本为“不可发布”；如需带风险发布，创建不可修改的豁免记录。

## 5. 数据模型

所有业务表均有全局 UUID 主键、创建时间、更新时间与操作人字段。除不可修改的快照表和审计表外，业务表增加逻辑删除/归档字段。所有项目业务查询必须按 `project_id` 限定。

| 表 | 关键字段 | 说明 |
|---|---|---|
| `project` | code、name、status | 项目主数据；项目仅可归档，不物理删除。 |
| `project_repository` | project_id、repository_url、branch、script_root、run_command、runner_config_version | 项目可关联一个或多个 Playwright 仓库。 |
| `environment` | project_id、name、base_url、health_check_config、status | 项目的测试/预发环境；凭据引用 Secret，不存明文。 |
| `requirement_snapshot` | project_id、file_name、storage_key、manual_version、summary、uploaded_at | 原始需求与人工版本标识。 |
| `ai_generation` | requirement_snapshot_id、model、prompt_version、raw_output、status | AI 解析异步任务及原始输出。 |
| `test_point` | project_id、requirement_snapshot_id、name、source、status | 测试点；来源可为 AI、人工新增或人工修改。 |
| `functional_case` | project_id、case_code、module、current_version_no、status | 功能用例主记录；`project_id + case_code` 唯一。 |
| `functional_case_version` | functional_case_id、version_no、scenario、precondition、steps、expected_result、priority、test_type、automation_recommendation、change_reason | 已确认的不可变正式用例版本。 |
| `case_change_log` | project_id、object_type、object_id、field_name、before_value、after_value、source | 记录 AI 后的人工作业及修改原因。 |
| `automation_case` | project_id、automation_code、functional_case_id、level、tags、review_status、execution_status | 自动化用例主记录；支持一个功能用例对应多条自动化用例。 |
| `automation_case_version` | automation_case_id、functional_case_version_id、design、script_path、git_commit_sha、review_result | 自动化设计、脚本与审核快照。 |
| `automation_impact` | project_id、functional_case_version_id、automation_case_id、impact_type、resolution_status | 功能用例确认后生成的受影响脚本任务。 |
| `test_suite` | project_id、name、suite_type、selection_rule、status | 已保存测试集；可保存固定用例或筛选规则。 |
| `test_suite_member` | test_suite_id、automation_case_id | 固定测试集成员。 |
| `run_batch` | project_id、environment_id、release_version、trigger_type、triggered_by、status、snapshot | 一次执行批次。 |
| `run_case_result` | run_batch_id、automation_case_version_id、functional_case_version_id、script_commit_sha、final_status、error_summary | 单条自动化用例最终结果。 |
| `run_attempt` | run_case_result_id、attempt_no、status、started_at、ended_at、raw_error | 每次尝试记录；最多两条。 |
| `manual_execution` | project_id、functional_case_version_id、release_version、status、executed_by、note | 手工用例执行结果。 |
| `environment_health` | run_batch_id、login_page_status、key_api_status、checked_at、conclusion | 执行前环境健康基线。 |
| `failure_triage` | run_case_result_id、ai_category、confidence、ai_summary、confirmed_category | AI 初判与人工确认的失败分类。 |
| `evidence_file` | run_case_result_id、file_type、storage_key、redacted、expires_at | 截图、录像、Trace、日志和报告，七天后删除。 |
| `release_waiver` | project_id、release_version、run_batch_id、reason、waived_by、expires_at | 发布豁免审计记录。 |

## 6. 关联与影响透视

功能用例、自动化用例、脚本和执行结果支持双向追踪：

```text
功能用例版本
  → 1..N 自动化用例版本
  → 1..N 脚本路径与 Git 提交
  → N 执行批次中的结果与证据
```

“影响透视”页面按一次功能用例版本变更展示：变更字段、受影响自动化用例数、脚本路径、待更新状态、最近结果和处理人。用户可从功能用例进入脚本和运行记录，也可从脚本/运行结果回溯来源功能用例。

## 7. 页面结构

| 页面 | 核心能力 |
|---|---|
| 项目总览 | 当前项目指标、质量门禁、待确认、待审核、待更新、近期失败。 |
| 需求与 AI 生成 | 上传需求/原型，创建解析任务，审阅测试点、场景、功能用例草稿及来源片段。 |
| 功能用例库 | 表格维护、导入导出、筛选、批量操作、确认、废弃与版本历史。 |
| 功能用例详情 | 展示测试点、步骤、预期、人工变更对比、关联自动化、手工/自动执行结果。 |
| 自动化候选与审核 | 人工触发转化、AI 设计与脚本初稿、可测性清单、审核与脚本关联。 |
| 影响透视 | 功能用例变更到自动化用例、脚本和最近执行记录的一对多关系。 |
| 执行中心 | 选择环境和版本；全量、测试集或勾选部分可执行用例；查看预计数量和健康检查结果。 |
| 测试集管理 | 管理每日回归、发布前冒烟、模块回归等可复用测试集。 |
| 执行记录 | 以日期、版本、环境、批次、模块和结果筛选，展示最终结果。 |
| 执行详情 | 两次尝试、错误摘要、AI 失败初判、人工分类和未过期证据链接。 |

页面顶部始终显示当前项目。所有用例、环境和执行数据只展示当前项目；跨项目汇总后续只比较统一指标。

## 8. 执行策略

### 用例选择

- 全量执行：选择当前项目全部“可执行且未待更新”的自动化用例。
- 部分执行：按模块、标签、优先级、最近失败、版本或脚本状态筛选并手动勾选。
- 保存测试集：可保存固定成员或选择规则，供手动和每日定时执行复用。
- 执行前排除待审核、待实现、待更新、已停用或未关联脚本提交号的用例，并显示排除原因。

### 环境与 Runner

测试管理 Web 服务不直接运行 Playwright。独立 Runner 从任务队列拉取批次，使用当前项目、仓库、环境和 Secret 启动 Playwright，上传证据后回写结果。执行前访问登录页和配置的关键健康接口；健康检查失败则批次结束为“环境阻塞”，不逐条执行。

## 9. 安全、审计与保留策略

- 账号、密码、Token 只从 Secret 存储按“项目 + 环境”注入 Runner，不进入数据库明文、日志、Git 仓库或前端。
- 运行报告与证据在访问前脱敏；附件存储路径按项目、环境和批次隔离。
- 需求原文件、需求快照、用例版本、审核记录、执行轻量摘要和失败分类长期保留。
- 执行报告、截图、视频、Trace、控制台日志保留七天；清理后保留错误摘要、结果、环境、脚本提交号、用例版本、执行人和时间。
- 即使暂不实现角色权限，也必须记录操作人、操作时间和操作类型。

## 10. 多项目约束

- 项目内用例编号唯一，跨项目允许同名编号；内部关联一律使用 UUID。
- 执行批次只能绑定一个项目和一个环境，禁止跨项目混跑。
- 共享脚本仓库通过 `project_repository` 配置脚本目录、默认分支、运行命令和 Runner 配置；禁止按默认目录猜测项目。
- 项目归档后禁止新增用例、审核和执行，但可查看和导出历史。
- 文件、环境、Secret、测试集、统计查询均以项目边界隔离。

## 11. 质量指标

- AI 用例采纳率、人工修改率、人工删除率。
- 自动化采纳率、审核驳回率、待更新自动化用例数。
- 按项目/版本/模块的通过率、失败率、阻塞率与执行时长。
- 失败分类趋势：产品缺陷、脚本问题、环境问题、测试数据问题、网络/第三方问题、未知。
- P0 覆盖率、P0 通过率和发布豁免次数。

## 12. 第一阶段验收标准

1. 可创建多个项目，但操作页面默认只查看当前项目。
2. 测试工程师可上传需求并用 AI 获得可编辑的测试点、场景与功能用例草稿。
3. 功能用例确认时创建不可变版本；页面可查看需求来源、变更记录和版本对比。
4. 已确认功能用例可由人工触发转换为自动化设计；审核后关联 Playwright 脚本与 Git 提交号。
5. 功能用例新版本确认后，系统准确列出受影响自动化用例并标记待更新。
6. 执行中心可运行全量、保存测试集或手动勾选的部分用例。
7. 执行批次可保存环境健康检查、用例/脚本快照、最终结果、最多两次尝试和七天有效证据。
8. 可按日期或版本查看运行记录，并追溯到功能用例版本和脚本提交号。

## 13. 第二期：视觉回归与 AI 脚本修复

### 视觉回归

- 对登录页、仪表盘、核心表单和关键详情页等稳定页面维护经过人工确认的截图基线。
- 执行时固定 Chromium 版本、视口尺寸、语言、时区和测试数据，并关闭动画；时间、随机数、用户名称等动态区域通过遮罩排除。
- 当前截图与基线产生像素差异时，创建视觉差异记录，附上基线图、当前图、差异图和差异比例。
- 视觉差异默认标记为“待人工确认”，不允许 AI 或执行器自动更新基线。人工确认业务/UI 变更合理后，才创建新的基线版本。

### AI 脚本修复

- 当自动化失败时，AI 可读取错误日志、截图、Trace、当前 DOM 摘要、相关功能用例版本和脚本版本，给出失败分类、原因摘要与置信度。
- 对定位器失效、页面加载等待不足或已确认的页面结构变化，AI 可生成修复建议和 Git 补丁草稿。
- 补丁必须经人工审核、提交到脚本仓库、重新执行验证后才可关联为新的可执行脚本版本；不允许 AI 自动合并或直接修改生产测试基线。
- 安全门禁：补丁不得删除核心业务断言、将断言替换为无条件通过、降低测试优先级、扩大定位器到不相关元素，或修改用例来源关联。
- 页面展示修复前后差异、受影响功能用例、审核意见、验证批次和最终处理结果。
