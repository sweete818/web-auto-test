# SRM Supplier Login Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, executable Playwright test that signs a supplier account into SRM and verifies the supplier home page.

**Architecture:** A small E2E layer owns browser configuration, credential validation, the SRM login test, and D-drive runtime evidence. The application itself remains unchanged: Playwright runs independently, reads credentials only from its current process environment, and writes all reports and artifacts below the configured D-drive runtime root.

**Tech Stack:** Node.js, TypeScript, pnpm, Vitest, `@playwright/test`, PowerShell.

**Spec:** `docs/superpowers/specs/2026-10-12-srm-supplier-login-design.md`

## Global Constraints

- Add `@playwright/test` as a locked pnpm development dependency; install only Chromium for this suite.
- Use `https://shijiedev.thundersoft.com/srm/login` and assert navigation to `/srm/supplier/home`.
- Read only `SRM_SUPPLIER_USERNAME` and `SRM_SUPPLIER_PASSWORD`; never print, commit, screenshot-label, or report their values.
- Write reports, videos, traces and screenshots only below `D:\路径卷不可删\test-management-platform` (or `TEST_MANAGEMENT_DATA_DIR` when explicitly supplied).
- Do not delete the D-drive runtime root; cleanup may delete only Playwright artifact children older than seven days.
- The first release covers supplier password login only; do not automate SMS, email, SSO, registration, password reset, or CAPTCHA flows.

## Review Focus

- Missing one or both credential environment variables must fail before any browser opens, with a credential-name-only message.
- A password must not appear in process output, test names, thrown errors, screenshots names, trace labels, or committed files.
- A login redirect to any non-supplier page must fail even if the page loads successfully.
- Selector changes in SRM must leave a D-drive screenshot/video/trace rather than silently treating the test as passed.
- Evidence cleanup must refuse targets outside the Playwright artifact directories and must retain files newer than seven days.

---

## File Structure

- `package.json` — exposes the non-interactive E2E command and adds Playwright.
- `.gitignore` — prevents local environment files and accidental Playwright output from entering Git.
- `playwright.config.ts` — configures Chromium, timeouts, report output and failure evidence under the runtime root.
- `e2e/support/runtime.ts` — resolves the runtime data directory and validates/redacts credential metadata.
- `e2e/support/runtime.spec.ts` — unit-tests runtime directory and credential validation behavior with Vitest.
- `e2e/srm-supplier-login.spec.ts` — browser scenario for the supplier password-login happy path.
- `scripts/run-srm-supplier-login.ps1` — asks for a Windows credential interactively and invokes the E2E command without persisting it.
- `scripts/cleanup-playwright-evidence.mjs` — deletes only expired files from approved D-drive Playwright artifact directories.
- `scripts/cleanup-playwright-evidence.spec.ts` — tests the cleanup path guard and seven-day threshold.
- `e2e/README.md` — documents Chromium installation, interactive invocation, non-interactive CI invocation, report location and troubleshooting.

### Task 1: Add secure E2E runtime configuration

**Files:**
- Modify: `package.json`
- Create: `.gitignore`
- Create: `e2e/support/runtime.ts`
- Create: `e2e/support/runtime.spec.ts`
- Create: `playwright.config.ts`

**Interfaces:**
- Produces `runtimeDataRoot(env?: NodeJS.ProcessEnv): string`.
- Produces `supplierCredentials(env?: NodeJS.ProcessEnv): { username: string; password: string }`.
- Produces `playwrightArtifactPath(name: 'results' | 'report'): string`.
- Consumes `TEST_MANAGEMENT_DATA_DIR`, `SRM_SUPPLIER_USERNAME`, and `SRM_SUPPLIER_PASSWORD` only from the active process environment.

- [ ] **Step 1: Write failing unit tests for root selection and credentials**

```ts
import { expect, it } from 'vitest';
import { runtimeDataRoot, supplierCredentials } from './runtime.js';

it('defaults Playwright runtime data to the approved D drive root', () => {
  expect(runtimeDataRoot({})).toBe('D:\\路径卷不可删\\test-management-platform');
});

it('rejects missing credentials without exposing any supplied secret', () => {
  expect(() => supplierCredentials({ SRM_SUPPLIER_USERNAME: 'supplier-a' }))
    .toThrow('SRM_SUPPLIER_PASSWORD is required');
});

it('returns credentials only when both environment values are present', () => {
  expect(supplierCredentials({ SRM_SUPPLIER_USERNAME: 'supplier-a', SRM_SUPPLIER_PASSWORD: 'secret' }))
    .toEqual({ username: 'supplier-a', password: 'secret' });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node node_modules/vitest/vitest.mjs run e2e/support/runtime.spec.ts`

Expected: FAIL because `e2e/support/runtime.ts` does not exist.

- [ ] **Step 3: Implement the narrow runtime helper**

```ts
import { join } from 'node:path';

const defaultRoot = 'D:\\路径卷不可删\\test-management-platform';

export function runtimeDataRoot(env: NodeJS.ProcessEnv = process.env) {
  return env.TEST_MANAGEMENT_DATA_DIR?.trim() || defaultRoot;
}

export function playwrightArtifactPath(name: 'results' | 'report', env: NodeJS.ProcessEnv = process.env) {
  return join(runtimeDataRoot(env), `playwright-${name}`);
}

export function supplierCredentials(env: NodeJS.ProcessEnv = process.env) {
  const username = env.SRM_SUPPLIER_USERNAME?.trim();
  const password = env.SRM_SUPPLIER_PASSWORD;
  if (!username) throw new Error('SRM_SUPPLIER_USERNAME is required');
  if (!password) throw new Error('SRM_SUPPLIER_PASSWORD is required');
  return { username, password };
}
```

Add `playwright.config.ts` using `defineConfig`, Chromium only, `trace: 'retain-on-failure'`, `video: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `outputDir: playwrightArtifactPath('results')`, and an HTML reporter whose `outputFolder` is `playwrightArtifactPath('report')` and `open: 'never'`.

Add `.gitignore` entries for `.env`, `.env.*`, `test-results/`, and `playwright-report/`. Add the `e2e:srm-supplier-login` script as `playwright test e2e/srm-supplier-login.spec.ts`.

- [ ] **Step 4: Run focused tests and type-check GREEN**

Run: `node node_modules/vitest/vitest.mjs run e2e/support/runtime.spec.ts && pnpm typecheck`

Expected: PASS; reported paths are D-drive paths and error messages contain only missing variable names.

- [ ] **Step 5: Commit Task 1**

```bash
git add package.json pnpm-lock.yaml .gitignore playwright.config.ts e2e/support/runtime.ts e2e/support/runtime.spec.ts
git commit -m "feat: configure secure Playwright runtime"
```

### Task 2: Build the executable supplier login scenario

**Files:**
- Create: `e2e/srm-supplier-login.spec.ts`
- Modify: `e2e/support/runtime.spec.ts`

**Interfaces:**
- Consumes `supplierCredentials()` from `e2e/support/runtime.ts`.
- Produces a Playwright test named `supplier can sign in to SRM`.
- Uses only the SRM login URL and the user-visible login UI as selectors.

- [ ] **Step 1: Write the failing E2E test**

```ts
import { expect, test } from '@playwright/test';
import { supplierCredentials } from './support/runtime.js';

test('supplier can sign in to SRM', async ({ page }) => {
  const { username, password } = supplierCredentials();
  await page.goto('https://shijiedev.thundersoft.com/srm/login', { waitUntil: 'domcontentloaded' });
  const supplierEntry = page.getByText('供应商', { exact: true });
  if (await supplierEntry.count()) await supplierEntry.first().click();
  await page.getByPlaceholder('请输入用户名').fill(username);
  await page.getByPlaceholder('请输入密码').fill(password);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page).toHaveURL(/\/srm\/supplier\/home(?:[/?#]|$)/, { timeout: 30_000 });
  await expect(page.getByPlaceholder('请输入密码')).toBeHidden();
});
```

- [ ] **Step 2: Run the E2E command without credentials and verify RED**

Run: `pnpm e2e:srm-supplier-login`

Expected: FAIL before opening Chromium with `SRM_SUPPLIER_USERNAME is required` or `SRM_SUPPLIER_PASSWORD is required`; no secret value is printed.

- [ ] **Step 3: Install the browser and implement only required locator resilience**

Run: `pnpm exec playwright install chromium`

If a visible supplier-role control is absent, leave the default role unchanged. If the role control exists, select it using its visible `供应商` text. Do not add CSS-class or hashed-asset locators. Keep the final URL assertion unchanged.

- [ ] **Step 4: Execute the test with the interactive credential runner**

Run: `powershell -ExecutionPolicy Bypass -File scripts/run-srm-supplier-login.ps1`

Expected: a Windows credential prompt appears; after valid supplier credentials are entered, Playwright exits 0 and the report appears under the D-drive runtime root. On any failure, Playwright exits nonzero and preserves failure evidence there.

- [ ] **Step 5: Commit Task 2**

```bash
git add e2e/srm-supplier-login.spec.ts e2e/support/runtime.spec.ts
git commit -m "test: add SRM supplier login scenario"
```

### Task 3: Add interactive execution and bounded evidence cleanup

**Files:**
- Create: `scripts/run-srm-supplier-login.ps1`
- Create: `scripts/cleanup-playwright-evidence.mjs`
- Create: `scripts/cleanup-playwright-evidence.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `Remove-ExpiredPlaywrightEvidence` behavior through `cleanup-playwright-evidence.mjs`.
- Consumes the D-drive runtime root and accepts no arbitrary delete path.
- The interactive runner invokes cleanup first, sets credentials for the child Playwright process, then clears both environment variables in `finally`.

- [ ] **Step 1: Write the failing cleanup tests**

```ts
import { expect, it } from 'vitest';
import { cleanupPlaywrightEvidence } from './cleanup-playwright-evidence.mjs';

it('removes an expired file only from an approved Playwright directory', () => {
  // Create an 8-day-old file under <temp-root>/playwright-results and assert it is removed.
});

it('does not delete files outside approved Playwright directories', () => {
  // Create an 8-day-old file directly under <temp-root> and assert it remains.
});

it('retains a file newer than seven days', () => {
  // Create a one-day-old file under <temp-root>/playwright-report and assert it remains.
});
```

- [ ] **Step 2: Run the focused cleanup test and verify RED**

Run: `node node_modules/vitest/vitest.mjs run scripts/cleanup-playwright-evidence.spec.ts`

Expected: FAIL because the cleanup module does not exist.

- [ ] **Step 3: Implement path-bounded cleanup and interactive runner**

Implement `cleanupPlaywrightEvidence(root, now = Date.now())` so it enumerates only `playwright-results` and `playwright-report` below `root`, skips missing directories, deletes only files whose modification time is older than seven days, and never removes either directory itself or `root`.

Implement the PowerShell runner with this shape:

```powershell
$credential = Get-Credential -Message '输入 SRM 供应商测试账号'
if ([string]::IsNullOrWhiteSpace($credential.UserName)) { throw '用户名不能为空' }
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
try {
  $env:SRM_SUPPLIER_USERNAME = $credential.UserName
  $env:SRM_SUPPLIER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  pnpm e2e:srm-supplier-login
  exit $LASTEXITCODE
} finally {
  Remove-Item Env:SRM_SUPPLIER_USERNAME -ErrorAction SilentlyContinue
  Remove-Item Env:SRM_SUPPLIER_PASSWORD -ErrorAction SilentlyContinue
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
```

Call cleanup before setting credentials. Add a package script `e2e:cleanup` that runs the cleanup module.

- [ ] **Step 4: Run cleanup tests, full regression, and secret scan**

Run:

```bash
node node_modules/vitest/vitest.mjs run scripts/cleanup-playwright-evidence.spec.ts
CI=true pnpm test
pnpm typecheck
git grep -n -i "SRM_SUPPLIER_PASSWORD\|c1111111" -- ':!docs/superpowers/**'
```

Expected: all tests and type-check pass; the grep result contains no secret value and only the permitted variable-name references.

- [ ] **Step 5: Commit Task 3**

```bash
git add scripts/run-srm-supplier-login.ps1 scripts/cleanup-playwright-evidence.mjs scripts/cleanup-playwright-evidence.spec.ts package.json
git commit -m "feat: add secure SRM E2E launcher and cleanup"
```

### Task 4: Document and validate operator workflow

**Files:**
- Create: `e2e/README.md`
- Modify: `README.md`

**Interfaces:**
- Documents `powershell -ExecutionPolicy Bypass -File scripts/run-srm-supplier-login.ps1` for interactive execution.
- Documents `pnpm e2e:srm-supplier-login` for CI after environment variables are injected by a secret store.
- Links D-drive report paths without placing secrets in command examples.

- [ ] **Step 1: Write a documentation acceptance check**

```ts
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('documents an interactive command and the D drive report location', () => {
  const guide = readFileSync('e2e/README.md', 'utf8');
  expect(guide).toContain('run-srm-supplier-login.ps1');
  expect(guide).toContain('D:\\路径卷不可删\\test-management-platform');
  expect(guide).not.toContain('SRM_SUPPLIER_PASSWORD=');
});
```

- [ ] **Step 2: Run the documentation test and verify RED**

Run: `node node_modules/vitest/vitest.mjs run e2e/readme.spec.ts`

Expected: FAIL because the operator guide does not exist.

- [ ] **Step 3: Write the operator guide**

Document Chromium installation, interactive execution, expected success URL, report opening, evidence location, missing-credential behavior, and the rule never to place passwords in `.env`, source files, commits, or reports. Add one README link to the E2E guide.

- [ ] **Step 4: Verify documentation and perform final real run**

Run:

```bash
node node_modules/vitest/vitest.mjs run e2e/readme.spec.ts
CI=true pnpm test
pnpm typecheck
powershell -ExecutionPolicy Bypass -File scripts/run-srm-supplier-login.ps1
```

Expected: unit tests and type-check pass; a valid supplier credential reaches `/srm/supplier/home`; the D-drive HTML report is present; no secrets appear in terminal output.

- [ ] **Step 5: Commit Task 4**

```bash
git add e2e/README.md e2e/readme.spec.ts README.md
git commit -m "docs: add SRM E2E operator guide"
```

## Plan Self-Review

- Spec coverage: Tasks 1-2 implement the executable Chromium supplier password-login scenario and URL/home assertions. Tasks 1 and 3 implement D-drive evidence, seven-day cleanup, and non-persistent credentials. Task 4 documents actual operator use and runs a real credential-protected check.
- Placeholder scan: no unresolved task content or deferred implementation markers remain.
- Type consistency: all browser code consumes `supplierCredentials()`; runtime outputs are used by `playwright.config.ts`; cleanup operates solely from `runtimeDataRoot()`.
- Review focus coverage: missing credentials (Task 1/2), secret leakage (Task 1/3/4), wrong landing page (Task 2), locator changes/evidence (Task 1/2), and bounded cleanup (Task 3) all have explicit tests or final verification.
