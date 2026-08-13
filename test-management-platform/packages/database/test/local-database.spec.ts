import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalDatabase, openLocalDatabase } from '../src/local-database.js';
import { DEFAULT_DATA_DIRECTORY, databasePath, evidencePath } from '../src/data-directory.js';

describe('local SQLite database', () => {
  it('keeps runtime files below the configured data directory', () => {
    expect(databasePath({ TEST_MANAGEMENT_DATA_DIR: 'D:\\custom-data' })).toBe('D:\\custom-data\\data\\test-management.sqlite');
    expect(DEFAULT_DATA_DIRECTORY).toBe('D:\\路径卷不可删\\test-management-platform');
  });

  it('rejects a configured root that traverses outside the local storage path', () => {
    expect(() => openLocalDatabase({ TEST_MANAGEMENT_DATA_DIR: 'D:\\safe\\..\\outside' })).toThrow(/must not contain traversal/);
    expect(() => evidencePath('proof.png', { TEST_MANAGEMENT_DATA_DIR: 'D:\\safe\\..\\outside' })).toThrow(/must not contain traversal/);
  });

  it('rejects a drive-qualified evidence file name', () => {
    expect(() => evidencePath('C:escape.txt', { TEST_MANAGEMENT_DATA_DIR: 'D:\\custom-data' })).toThrow(/must be local/);
  });

  it('migrates and seeds an isolated DEMO project', () => {
    const directory = mkdtempSync(join(tmpdir(), 'test-management-'));
    const database = new LocalDatabase(join(directory, 'platform.sqlite'));

    try {
      database.migrate();
      database.seedDemo();

      expect(database.projectByCode('DEMO')).toMatchObject({ code: 'DEMO' });
      expect(database.environment('DEMO', 'test')).toMatchObject({ name: 'test' });
      expect(database.testSuite('DEMO', 'smoke')).toMatchObject({ name: 'smoke' });
      expect(database.tableColumns('functional_cases')).toContain('project_id');
      expect(() => database.createProject('DEMO', 'Duplicate')).toThrow(/UNIQUE/);
      database.createProject('OTHER', 'Other');
      expect(() => database.insertCrossProjectVersion()).toThrow(/FOREIGN KEY/);
      const versions = database.createCaseVersions('DEMO', 'TC-SNAP-001', 'Login', 'v1 scenario', 'v2 scenario');
      expect(versions).toEqual(['v1 scenario', 'v2 scenario']);
      database.migrate();
      expect(database.appliedMigrations()).toEqual(['001_init']);
    } finally {
      database.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
