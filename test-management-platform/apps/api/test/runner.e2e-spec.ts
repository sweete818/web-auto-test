import { describe, expect, it } from 'vitest';
import { classifyFailure, checkEnvironment, redactReport, storeEvidence, cleanupEvidence } from '../src/runner.js';
import { LocalDatabase } from '../../../packages/database/src/local-database.js';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
describe('runner helpers',()=>{it('blocks unreachable login and classifies failures',async()=>{expect(await checkEnvironment('http://127.0.0.1:1')).toMatchObject({conclusion:'BLOCKED'});expect(classifyFailure('locator not found')).toBe('SCRIPT');expect(classifyFailure('HTTP 500')).toBe('ENVIRONMENT');expect(redactReport('token=secret password=hidden')).not.toContain('secret');});});
