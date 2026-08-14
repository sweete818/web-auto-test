# 测试管理平台（本地模式）

本地控制台默认使用 `D:\路径卷不可删\test-management-platform` 保存 SQLite 数据和证据文件。启动网页控制台后访问：

`http://127.0.0.1:3000/projects/DEMO`

运行 `pnpm dev`（如配置了对应脚本）或直接运行 `apps/web/src/server.ts` 的 Node 启动入口。开发验证使用 `node node_modules/vitest/vitest.mjs run` 和 `node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit`；CI 应以非交互方式执行相同的测试和类型检查。

导入功能用例支持 CSV 或 JSON：先调用预览接口，修复必填列/重复编号问题，再确认导入。确认导入仅创建 DRAFT 用例，不能生成不可变版本；需要人工确认后才会进入正式版本库。
