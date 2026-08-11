import { expect, test } from '@playwright/test';

test('读取必填的测试环境配置', async () => {
  process.env.BASE_URL = 'https://test.example.com';
  process.env.E2E_USERNAME = 'auto_tester';
  process.env.E2E_PASSWORD = 'safe-password';

  const { config } = require('../utils/config');

  expect(config).toEqual({
    baseUrl: 'https://test.example.com',
    username: 'auto_tester',
    password: 'safe-password',
  });
});
