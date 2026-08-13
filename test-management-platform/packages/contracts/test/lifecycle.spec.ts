import { describe, expect, it } from 'vitest';
import { AutomationExecutionStatus, RunBatchStatus } from '../src/index.js';

describe('automation execution lifecycle', () => {
  it('exposes executable lifecycle states', () => {
    expect(Object.values(AutomationExecutionStatus)).toContain('EXECUTABLE');
    expect(Object.values(RunBatchStatus)).toContain('ENVIRONMENT_BLOCKED');
  });
});
