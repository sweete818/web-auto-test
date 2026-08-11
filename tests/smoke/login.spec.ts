import { expect, test } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { config } from '../../utils/config';

test('账号密码登录后进入仪表盘 @smoke', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.login(config.username, config.password);

  await expect(page).toHaveURL(/#\/dashboard/);
});
