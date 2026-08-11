import 'dotenv/config';

function required(name: 'BASE_URL' | 'E2E_USERNAME' | 'E2E_PASSWORD'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  baseUrl: required('BASE_URL'),
  username: required('E2E_USERNAME'),
  password: required('E2E_PASSWORD'),
};
