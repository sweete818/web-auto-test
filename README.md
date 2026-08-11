# Web 自动化测试工程

## 环境要求

- Node.js 18 或更高版本
- 测试环境地址和专用测试账号

## 首次使用

1. 复制 `.env.example` 为 `.env`。
2. 在 `.env` 中填写测试环境地址与专用测试账号。
3. 执行 `npm.cmd install` 安装依赖。
4. 执行 `npx.cmd playwright install chromium` 安装浏览器。

## 常用命令

```powershell
npm.cmd run test:smoke
npm.cmd run test:regression
npm.cmd run test:api
npm.cmd run report
```

请勿将 `.env`、测试报告或 `node_modules` 提交到仓库。
