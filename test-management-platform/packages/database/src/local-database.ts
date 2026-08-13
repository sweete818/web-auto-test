import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { databasePath } from './data-directory.js';

const migrationPath = join(import.meta.dirname, '..', 'migrations', '001_init.sql');
const now = () => new Date().toISOString();

export class LocalDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  migrate() {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const applied = this.db.prepare('SELECT id FROM schema_migrations WHERE id=?').get('001_init');
    if (applied) return;
    this.db.exec('BEGIN IMMEDIATE');
    try { this.db.exec(readFileSync(migrationPath, 'utf8')); this.db.prepare('INSERT INTO schema_migrations (id,applied_at) VALUES (?,?)').run('001_init', now()); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
  createProject(code: string, name: string) {
    const id = randomUUID(); const timestamp = now();
    this.db.prepare('INSERT INTO projects (id,code,name,created_at,updated_at) VALUES (?,?,?,?,?)').run(id, code, name, timestamp, timestamp);
    return { id, code, name };
  }
  createFunctionalCase(projectId:string, input:any, actor:string, source='HUMAN_CREATE') { const id=randomUUID(), timestamp=now(); this.run('INSERT INTO functional_cases (id,project_id,case_code,module,scenario,precondition,steps,expected_result,priority,test_type,automation_recommendation,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,projectId,input.caseCode,input.module,input.scenario,input.precondition??null,JSON.stringify(input.steps??[]),input.expectedResult??'',input.priority,input.testType,input.automationRecommendation?1:0,'DRAFT',actor,timestamp,timestamp); this.run('INSERT INTO case_change_logs (id,project_id,functional_case_id,field,new_value,source,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?)',randomUUID(),projectId,id,'create',JSON.stringify(input),source,actor,timestamp); return {id}; }
  updateCaseDraft(id:string,input:any,actor:string) { const current=this.get<any>('SELECT * FROM functional_cases WHERE id=?',id);if(!current)throw new Error('not found'); if(current.status==='RETIRED')throw new Error('retired'); const permitted=['module','scenario','priority','testType','automationRecommendation','precondition','steps','expectedResult'];for(const key of permitted){if(input[key]===undefined)continue;const column=key==='testType'?'test_type':key==='automationRecommendation'?'automation_recommendation':key==='expectedResult'?'expected_result':key;const value=key==='automationRecommendation'?(input[key]?1:0):key==='steps'?JSON.stringify(input[key]):input[key];this.run(`UPDATE functional_cases SET ${column}=?,status='DRAFT',updated_at=? WHERE id=?`,value,now(),id);this.run('INSERT INTO case_change_logs (id,project_id,functional_case_id,field,old_value,new_value,source,actor_id,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',randomUUID(),current.project_id,id,key,JSON.stringify(current[column]),JSON.stringify(value),'HUMAN_EDIT',actor,input.changeReason??null,now());} return {id}; }
  confirmCase(id:string,reason:string,actor:string) { const item=this.get<any>('SELECT * FROM functional_cases WHERE id=?',id);if(!item||item.status==='RETIRED')throw new Error('cannot confirm');const version=(item.current_version_no??0)+1;const timestamp=now();this.run('INSERT INTO functional_case_versions (id,project_id,functional_case_id,version_no,module,scenario,precondition,steps,expected_result,priority,test_type,automation_recommendation,change_reason,confirmed_by,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),item.project_id,id,version,item.module,item.scenario,item.precondition,item.steps,item.expected_result,item.priority,item.test_type,item.automation_recommendation,reason,actor,timestamp);this.run('UPDATE functional_cases SET current_version_no=?,status=?,updated_at=? WHERE id=?',version,'CONFIRMED',timestamp,id);return {id,versionNo:version}; }
  caseVersions(id:string) { return (this.db.prepare('SELECT version_no as versionNo,module,scenario,precondition,steps,expected_result as expectedResult,priority,test_type as testType,automation_recommendation as automationRecommendation FROM functional_case_versions WHERE functional_case_id=? ORDER BY version_no').all(id) as any[]); }
  retireCase(id:string) { this.run('UPDATE functional_cases SET status=?,updated_at=? WHERE id=?','RETIRED',now(),id); }
  seedDemo() {
    const project = this.projectByCode('DEMO') ?? this.createProject('DEMO', 'Demo project');
    const timestamp = now();
    this.db.prepare("INSERT OR IGNORE INTO environments (id,project_id,name,base_url,health_check_config,secret_ref,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), project.id, 'test', 'http://127.0.0.1', '{"paths":[]}', 'local/demo/test', timestamp, timestamp);
    this.db.prepare("INSERT OR IGNORE INTO test_suites (id,project_id,name,selection_rule,created_at) VALUES (?,?,?,?,?)").run(randomUUID(), project.id, 'smoke', '{"tags":["smoke"]}', timestamp);
  }
  projectByCode(code: string): { id: string; code: string; name: string } | undefined { return this.db.prepare('SELECT id,code,name FROM projects WHERE code=?').get(code) as { id: string; code: string; name: string } | undefined; }
  environment(code: string, name: string) { return this.db.prepare('SELECT e.* FROM environments e JOIN projects p ON p.id=e.project_id WHERE p.code=? AND e.name=?').get(code, name); }
  testSuite(code: string, name: string) { return this.db.prepare('SELECT s.* FROM test_suites s JOIN projects p ON p.id=s.project_id WHERE p.code=? AND s.name=?').get(code, name); }
  tableColumns(table: string): string[] { return (this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name); }
  run(sql: string, ...values: any[]) { return this.db.prepare(sql).run(...values); }
  get<T>(sql: string, ...values: any[]): T | undefined { return this.db.prepare(sql).get(...values) as T | undefined; }
  appliedMigrations(): string[] { return (this.db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as { id: string }[]).map((row) => row.id); }
  insertCrossProjectVersion() {
    const demo = this.projectByCode('DEMO')!; const other = this.projectByCode('OTHER')!; const timestamp = now();
    this.db.prepare('INSERT INTO functional_cases (id,project_id,case_code,module,scenario,priority,test_type,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run('case-a', demo.id, 'TC-A', 'M', 'S', 'P0', 'FUNCTION', 'test', timestamp, timestamp);
    this.db.prepare('INSERT INTO functional_case_versions (id,project_id,functional_case_id,version_no,module,scenario,steps,expected_result,priority,test_type,automation_recommendation,change_reason,confirmed_by,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('bad', other.id, 'case-a', 1, 'M', 'S', '[]', 'ok', 'P0', 'FUNCTION', 0, 'test', 'test', timestamp);
  }
  createCaseVersions(projectCode: string, caseCode: string, module: string, firstScenario: string, secondScenario: string): string[] {
    const project = this.projectByCode(projectCode)!; const id = randomUUID(); const timestamp = now();
    this.db.prepare('INSERT INTO functional_cases (id,project_id,case_code,module,scenario,priority,test_type,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,project.id,caseCode,module,firstScenario,'P0','FUNCTION','test',timestamp,timestamp);
    const insert = this.db.prepare('INSERT INTO functional_case_versions (id,project_id,functional_case_id,version_no,module,scenario,steps,expected_result,priority,test_type,automation_recommendation,change_reason,confirmed_by,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    insert.run(randomUUID(),project.id,id,1,module,firstScenario,'[]','ok','P0','FUNCTION',0,'v1','test',timestamp);
    this.db.prepare('UPDATE functional_cases SET scenario=? WHERE id=?').run(secondScenario,id);
    insert.run(randomUUID(),project.id,id,2,module,secondScenario,'[]','ok','P0','FUNCTION',0,'v2','test',timestamp);
    return (this.db.prepare('SELECT scenario FROM functional_case_versions WHERE functional_case_id=? ORDER BY version_no').all(id) as { scenario:string }[]).map(row=>row.scenario);
  }
}

/** Production entry point: opens only the validated configured database path. */
export function openLocalDatabase(environment = process.env): LocalDatabase { return new LocalDatabase(databasePath(environment)); }
