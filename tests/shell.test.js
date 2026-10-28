'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Shell = require('../src/shell.js');

const fresh = (scenario = 'base') => Shell.createSession({scenario, cwd: 'C:\\Lab'});
const run = (s, line) => Shell.run(s, line);
const success = (s, line) => { const result = run(s, line); assert.equal(result.code, 0, line + '\n' + result.stderr); return result; };
const roundtrip = s => Shell.restoreSession(JSON.parse(JSON.stringify(s)));

test('the virtual filesystem seeds required text and works independently per session', () => {
  const a = fresh(), b = fresh();
  assert.match(success(a, 'type readme.txt').stdout, /PC-014 support notes/);
  success(a, 'echo edited > readme.txt');
  assert.equal(success(a, 'type readme.txt').stdout, 'edited\n');
  assert.match(success(b, 'type readme.txt').stdout, /PC-014 support notes/);
  assert.equal(Object.getPrototypeOf(a.files), null);
  assert.equal(Shell.createSession({scenario: 'unknown'}).scenario, 'base');
});

test('quoted paths, Windows backslashes, case insensitivity, and environment variables', () => {
  const s = fresh();
  assert.match(success(s, 'TyPe "c:\\LAB\\Shared Files\\guide.txt"').stdout, /Team support guide/);
  assert.match(success(s, 'type C:\\Lab\\"Shared Files"\\guide.txt').stdout, /Team support guide/);
  success(s, 'cd /d "%USERPROFILE%\\Documents"');
  assert.equal(s.cwd, 'C:\\Users\\student\\Documents');
  assert.match(success(s, 'echo %USERNAME%').stdout, /^student\n$/);
  assert.notEqual(run(s, "type 'C:\\Lab\\readme.txt'").code, 0, 'single quotes must remain literal');
});

test('CMD current drive and drive working directories follow cd /d semantics', () => {
  const s = fresh();
  success(s, 'cd D:\\Support');
  assert.equal(s.cwd, 'C:\\Lab');
  success(s, 'D:');
  assert.equal(s.cwd, 'D:\\Support');
  success(s, 'cd ..'); assert.equal(s.cwd, 'D:\\');
  success(s, 'C:'); assert.equal(s.cwd, 'C:\\Lab');
  success(s, 'cd /d D:\\Support'); assert.equal(s.cwd, 'D:\\Support');
  success(s, 'cd \\'); assert.equal(s.cwd, 'D:\\');
  success(s, 'cd ..\\..'); assert.equal(s.cwd, 'D:\\');
  assert.notEqual(run(s, 'cd /d Z:\\').code, 0);
});

test('aliases and .exe names have canonical command-specific traces', () => {
  const s = fresh();
  assert.equal(success(s, 'md Work').trace[0].name, 'mkdir');
  assert.equal(success(s, 'chdir Work').trace[0].name, 'cd');
  const output = success(s, 'SC.EXE query Spooler');
  assert.equal(output.trace[0].name, 'sc');
  assert.deepEqual(output.trace[0].args, ['query', 'Spooler']);
  assert.match(output.trace[0].output, /RUNNING/);
  assert.equal(success(s, 'echo RUNNING').trace[0].name, 'echo');
});

test('pipeline passes exact text and redirects filtered output into a virtual file', () => {
  const s = fresh();
  const result = success(s, 'type Logs\\app.log | findstr "ERROR" > Reports\\errors.txt');
  assert.equal(result.stdout, '');
  assert.equal(result.trace.length, 2);
  assert.equal(result.trace[0].name, 'type');
  assert.equal(result.trace[1].name, 'findstr');
  assert.equal(result.trace[1].input, result.trace[0].output);
  assert.match(result.trace[1].output, /Printer service unavailable/);
  const content = success(s, 'type Reports\\errors.txt').stdout;
  assert.match(content, /Print job failed/); assert.doesNotMatch(content, /INFO/);
  success(s, 'echo Follow-up >> Reports\\errors.txt');
  assert.equal(success(s, 'type Reports\\errors.txt').stdout, content + 'Follow-up\n');
  success(s, 'echo Done > Reports\\errors.txt');
  assert.equal(success(s, 'type Reports\\errors.txt').stdout, 'Done\n');
});

test('findstr supports explicit literal phrases, OR tokens, line numbers and case options', () => {
  const s = fresh();
  const match = success(s, 'findstr /i /n /c:"printer service" Logs\\app.log');
  assert.equal(match.stdout, '2:09:03 ERROR Printer service unavailable\n');
  assert.equal(success(s, 'echo a.b | findstr /l a.b').stdout, 'a.b\n');
  assert.equal(run(s, 'echo axb | findstr /l a.b').code, 1);
  assert.equal(run(s, 'echo axb | findstr a.b').unsupported, true, 'regex is explicitly unsupported');
  assert.match(success(s, 'findstr "ERROR scheduled" Logs\\app.log').stdout, /Retry scheduled/);
  assert.equal(success(s, 'type Logs\\app.log | find /c "ERROR"').stdout, '2\n');
  assert.equal(run(s, 'findstr /v ERROR Logs\\app.log').unsupported, true);
});

test('copy, rename, move and directory creation mutate only the intended files', () => {
  const s = fresh();
  success(s, 'mkdir Reports\\Daily');
  success(s, 'copy readme.txt Reports\\Daily\\note.txt');
  success(s, 'ren Reports\\Daily\\note.txt ticket.txt');
  assert.notEqual(run(s, 'type Reports\\Daily\\note.txt').code, 0);
  success(s, 'move Reports\\Daily\\ticket.txt Reports');
  assert.match(success(s, 'type Reports\\ticket.txt').stdout, /support notes/);
  assert.notEqual(run(s, 'copy readme.txt Reports\\ticket.txt').code, 0, 'overwrite requires explicit /y');
  success(s, 'copy /y readme.txt Reports\\ticket.txt');
  assert.notEqual(run(s, 'copy readme.txt missing\\file.txt').code, 0);
  assert.notEqual(run(s, 'copy readme.txt readme.txt').code, 0);
  assert.equal(run(s, 'move Logs Reports').unsupported, true);
  assert.equal(run(s, 'ren readme.txt Reports\\other.txt').unsupported, true);
});

test('syntax errors and unsupported operators are rejected before any mutation', () => {
  const s = fresh();
  for (const line of ['echo first > Reports\\x.txt & hostname', 'echo first && hostname', 'echo first || hostname', 'type < readme.txt', 'echo first 2> Reports\\x.txt', 'echo x > Reports\\x.txt | findstr x', 'echo "unterminated', 'echo first > Reports\\x.txt > Reports\\y.txt', 'echo x |', '| hostname', 'echo x >']) {
    const before = JSON.stringify(s.files), r = run(s, line);
    assert.notEqual(r.code, 0, line); assert.equal(r.unsupported, true, line);
    assert.equal(JSON.stringify(s.files), before, line);
  }
  assert.equal(success(s, 'echo "a&b|c>d"').stdout, 'a&b|c>d\n');
});

test('no silent unsupported options and errors stay distinct from successful output', () => {
  const s = fresh();
  for (const line of ['dir /xyz', 'hostname /all', 'whoami /priv', 'tasklist /foo', 'taskkill /pid 4320 /t', 'icacls readme.txt /grant Everyone:F', 'set NAME=value', 'sfc /invalid', 'dism /online /cleanup-image /checkhealth /bogus']) {
    const r = run(s, line); assert.notEqual(r.code, 0, line); assert.equal(r.unsupported, true, line); assert.ok(r.stderr, line);
  }
  const missing = run(s, 'type missing.txt | more');
  assert.notEqual(missing.code, 0); assert.ok(missing.stderr);
  assert.notEqual(missing.trace[0].code, 0); assert.equal(missing.trace[1].code, 0);
  assert.equal(run(s, 'a-command-that-does-not-exist').code, 9009);
});

test('read-only permissions deny all modeled write forms but allow inspection', () => {
  const s = fresh('permission');
  assert.match(success(s, 'icacls "C:\\Lab\\Shared Files"').stdout, /CORP\\student:\(OI\)\(CI\)\(RX\)/);
  assert.match(success(s, 'type "Shared Files\\guide.txt"').stdout, /support guide/);
  for (const line of ['echo x > "Shared Files\\guide.txt"', 'copy readme.txt "Shared Files\\new.txt"', 'move "Shared Files\\guide.txt" Reports', 'mkdir "Shared Files\\new"']) {
    assert.match(run(s, line).stderr, /Access is denied/);
  }
});

test('service status, process list, and application termination are stateful and consistent', () => {
  const s = fresh('service-stopped');
  assert.match(success(s, 'sc.exe query Spooler').stdout, /STOPPED/);
  assert.doesNotMatch(success(s, 'tasklist').stdout, /spoolsv/);
  success(s, 'net start Spooler');
  assert.match(success(s, 'sc query Spooler').stdout, /RUNNING/);
  assert.match(success(s, 'tasklist').stdout, /spoolsv/);
  success(s, 'net stop Spooler');
  assert.match(success(s, 'sc query Spooler').stdout, /STOPPED/);
  assert.match(success(s, 'tasklist /fi "PID eq 4320"').stdout, /NotesApp.exe/);
  success(s, 'taskkill /PID 4320');
  assert.match(success(s, 'tasklist /fi "PID eq 4320"').stdout, /No tasks/);
  assert.notEqual(run(s, 'taskkill /PID 4320').code, 0);
  assert.equal(run(s, 'taskkill /PID 4 /F').unsupported, true);
});

test('health check commands separate detection and modeled repair', () => {
  const s = fresh('system-corrupt');
  assert.match(success(s, 'sfc /verifyonly').stdout, /found integrity violations/);
  assert.equal(s.pc.systemCorrupt, true);
  assert.match(success(s, 'DISM /Online /Cleanup-Image /CheckHealth').stdout, /repairable/);
  assert.equal(s.pc.imageCorrupt, true);
  success(s, 'DISM /Online /Cleanup-Image /RestoreHealth');
  assert.equal(s.pc.imageCorrupt, false); assert.equal(s.pc.systemCorrupt, true);
  success(s, 'sfc /scannow'); assert.equal(s.pc.systemCorrupt, false);
  assert.match(success(s, 'sfc /verifyonly').stdout, /did not find/);
});

test('PC diagnostics return interpretable consistent identifiers and service events', () => {
  const s = fresh('service-stopped');
  assert.match(success(s, 'ver').stdout, /10\.0\.26100/);
  assert.match(success(s, 'systeminfo').stdout, /PC-014/);
  assert.equal(success(s, 'hostname').stdout, 'PC-014\n');
  assert.match(success(s, 'whoami /groups').stdout, /Domain Users/);
  assert.match(success(s, 'wevtutil qe System /c:3 /rd:true /f:text').stdout, /stopped state/);
  assert.match(success(s, 'sc.exe qc Spooler').stdout, /AUTO_START/);
  assert.match(success(s, 'fsutil volume diskfree C:').stdout, /8,589,934,592/);
  assert.match(success(s, 'set TEMP').stdout, /TEMP=C:\\Users\\student/);
  assert.equal(success(s, 'where curl.exe').stdout, 'C:\\Windows\\System32\\curl.exe\n');
  assert.notEqual(run(s, 'where cd').code, 0, 'built-in commands are not executables on PATH');
});

test('network delegates preserve return codes, state and canonical traces', () => {
  const s = fresh('dns-cache');
  assert.notEqual(run(s, 'ping intranet.corp.example').code, 0);
  success(s, 'ipconfig /flushdns');
  assert.match(success(s, 'curl.exe -I https://intranet.corp.example').stdout, /200/);
  assert.equal(s.history.at(-1).trace[0].name, 'curl');
  assert.match(success(s, 'net use').stdout, /files/);
  assert.match(success(s, 'help curl').stdout, /curl/);
  assert.match(success(s, 'help').stdout, /netsh/);
});

test('session export and restore retain supported state and rebuild safe objects', () => {
  const s = fresh('service-stopped');
  success(s, 'net start Spooler'); success(s, 'taskkill /PID 4320');
  success(s, 'echo ticket > Reports\\ticket.txt'); success(s, 'cd /d D:\\Support');
  const restored = roundtrip(s);
  assert.equal(restored.cwd, s.cwd); assert.equal(restored.pc.spoolerRunning, true); assert.equal(restored.pc.appRunning, false);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(s)));
  assert.equal(Object.getPrototypeOf(restored.files), null);
  assert.equal(success(restored, 'type C:\\Lab\\Reports\\ticket.txt').stdout, 'ticket\n');
});

test('restore preserves all legitimate network mutation states alongside shell history', () => {
  for (const scenario of ['base', 'dns-cache', 'ad-policy']) {
    const s = fresh(scenario);
    success(s, 'ipconfig /flushdns');
    success(s, 'ping intranet.corp.example');
    success(s, 'ipconfig /renew');
    success(s, 'gpupdate /force');
    const restored = roundtrip(s);
    assert.deepEqual(restored.net, s.net);
    assert.equal(success(restored, 'ping intranet.corp.example').code, 0);
  }
});

test('restore rejects malformed objects, path pollution, orphan files and oversized content', () => {
  const mutate = fn => { const raw = JSON.parse(JSON.stringify(fresh())); fn(raw); assert.throws(() => Shell.restoreSession(raw)); };
  mutate(s => { s.version = 2; });
  mutate(s => { s.pc.appRunning = 'yes'; });
  mutate(s => { s.cwd = 'C:\\missing'; });
  mutate(s => { s.files['c:\\lab\\readme.txt'].content = 'x'.repeat(65537); });
  mutate(s => { delete s.files['c:\\lab']; });
  mutate(s => { s.files['c:\\lab\\readme.txt'].path = 'C:\\Lab\\..\\escape.txt'; });
  mutate(s => { s.files['__proto__'] = {path:'__proto__',dir:false,content:'x'}; });
  mutate(s => { s.env.PATH = 'changed'; });
  mutate(s => { s.machine.username = 'other'; });
  mutate(s => { s.history = Array(81).fill({}); });
  assert.throws(() => Shell.restoreSession(Object.create({version:1,scenario:'base'})));
  assert.equal({}.polluted, undefined);
  assert.throws(() => Shell.createSession({files:[{path:'C:\\Lab',content:'not a directory'}]}));
  assert.throws(() => Shell.createSession({files:[{path:'C:\\',content:'not a root'}]}));
  assert.throws(() => Shell.createSession({files:[{path:'C:\\Lab\\a',dir:'true'}]}));
});

test('input, pipeline, history and file browser outputs are bounded', () => {
  const s = fresh();
  assert.notEqual(run(s, 'echo ' + 'x'.repeat(4096)).code, 0);
  assert.notEqual(run(s, 'echo x\nhostname').code, 0);
  assert.equal(run(s, Array(17).fill('more').join(' | ')).unsupported, true);
  for (let i = 0; i < 90; i++) success(s, 'echo ' + i);
  assert.equal(s.history.length, 80); assert.equal(s.history[0].line, 'echo 10');
  const files = Shell.listFiles(s); files[0].path = 'changed';
  assert.notEqual(Shell.listFiles(s)[0].path, 'changed');
  assert.doesNotThrow(() => roundtrip(s));
});

test('Tab completion returns full command input strings including quoted paths', () => {
  const s = fresh();
  assert.ok(Shell.complete(s, 'hos').includes('hostname'));
  assert.ok(Shell.complete(s, 'type rea').includes('type readme.txt'));
  assert.ok(Shell.complete(s, 'type "Shared').includes('type "Shared Files\\guide.txt"'));
  assert.deepEqual(Shell.complete(s, 'echo x | ty'), []);
});

test('trace paths identify actual filesystem operands independently of how paths are written', () => {
  const s = fresh();
  const variants = ['readme.txt', '.\\readme.txt', 'C:\\Lab\\readme.txt', 'c:\\lab\\README.TXT'];
  for (const arg of variants) {
    const trace = success(s, 'type ' + arg).trace[0];
    assert.equal(trace.cwd, 'C:\\Lab');
    assert.deepEqual(trace.resolvedPaths, ['C:\\Lab\\readme.txt']);
  }
  const folders = ['dir', 'dir .', 'dir C:\\Lab', 'dir /a /b'];
  for (const line of folders) assert.deepEqual(success(s, line).trace[0].resolvedPaths, ['C:\\Lab']);
  assert.deepEqual(success(s, 'icacls "Shared Files"').trace[0].resolvedPaths, ['C:\\Lab\\Shared Files']);
  assert.deepEqual(success(s, 'fsutil volume diskfree C:').trace[0].resolvedPaths, ['C:\\']);
});

test('each pipeline trace captures cwd before its own command executes', () => {
  const s = fresh();
  const traces = success(s, 'cd Logs | type app.log | findstr ERROR').trace;
  assert.equal(traces[0].cwd, 'C:\\Lab');
  assert.deepEqual(traces[0].resolvedPaths, ['C:\\Lab\\Logs']);
  assert.equal(traces[1].cwd, 'C:\\Lab\\Logs');
  assert.deepEqual(traces[1].resolvedPaths, ['C:\\Lab\\Logs\\app.log']);
  assert.equal(traces[2].cwd, 'C:\\Lab\\Logs');
  assert.deepEqual(traces[2].resolvedPaths, []);
  const driveTrace = success(s, 'D:').trace[0];
  assert.equal(driveTrace.cwd, 'C:\\Lab\\Logs');
  assert.deepEqual(driveTrace.resolvedPaths, ['D:\\']);
});

test('text, search patterns, options and output redirection cannot impersonate input paths', () => {
  const s = fresh();
  assert.deepEqual(success(s, 'echo C:\\Lab\\readme.txt').trace[0].resolvedPaths, []);
  assert.deepEqual(success(s, 'type readme.txt > Reports\\other.txt').trace[0].resolvedPaths, ['C:\\Lab\\readme.txt']);
  assert.deepEqual(success(s, 'echo C:\\Lab | findstr /l /c:"C:\\Lab"').trace[1].resolvedPaths, []);
  assert.deepEqual(success(s, 'findstr /i /n /c:"support notes" readme.txt').trace[0].resolvedPaths, ['C:\\Lab\\readme.txt']);
  assert.deepEqual(success(s, 'more').trace[0].resolvedPaths, []);
  assert.deepEqual(success(s, 'help dir').trace[0].resolvedPaths, []);
  assert.deepEqual(run(s, 'dir /bogus').trace[0].resolvedPaths, []);
});

test('ren rejects an existing directory instead of moving the file into it', () => {
  for (const command of ['ren', 'rename']) {
    for (const separator of ['\\', '/', '\u00a5', '\uffe5']) {
      for (const destination of ['Reports', 'reports', '"Shared Files"', '.', '..']) {
        const s = fresh(), before = JSON.stringify(s.files);
        const source = 'C:\\Lab\\readme.txt'.replaceAll('\\', separator);
        const result = Shell.run(s, `${command} ${source} ${destination}`, { language: 'ja' });
        assert.notEqual(result.code, 0, `${command} ${source} ${destination}`);
        assert.match(result.stderr, /ren.*move/);
        assert.deepEqual(result.effects, []);
        assert.equal(JSON.stringify(s.files), before, 'rejected rename preserves source and directories');
      }
    }
  }
  const s = fresh();
  assert.match(run(s, 'ren readme.txt Reports').stderr, /cannot move.*use move/);
  success(s, 'move readme.txt Reports');
  success(s, 'ren Reports\\readme.txt ticket.txt');
  assert.match(success(s, 'type Reports\\ticket.txt').stdout, /PC-014 support notes/);
});

test('ren rejects explicit new paths with every supported separator', () => {
  for (const separator of ['\\', '/', '\u00a5', '\uffe5']) {
    for (const newName of ['Reports\\new.txt', '..\\new.txt', 'C:\\Lab\\Reports', '\\Reports']) {
      const s = fresh(), before = JSON.stringify(s.files);
      assert.notEqual(run(s, 'ren readme.txt ' + newName.replaceAll('\\', separator)).code, 0);
      assert.equal(JSON.stringify(s.files), before);
    }
  }
});

test('mutation trace paths retain the source and final destination across moves and renames', () => {
  const s = fresh();
  assert.deepEqual(success(s, 'mkdir Work').trace[0].resolvedPaths, ['C:\\Lab\\Work']);
  assert.deepEqual(success(s, 'copy readme.txt Work').trace[0].resolvedPaths, ['C:\\Lab\\readme.txt', 'C:\\Lab\\Work\\readme.txt']);
  assert.deepEqual(success(s, 'move Work\\readme.txt Reports').trace[0].resolvedPaths, ['C:\\Lab\\Work\\readme.txt', 'C:\\Lab\\Reports\\readme.txt']);
  assert.deepEqual(success(s, 'ren Reports\\readme.txt ticket.txt').trace[0].resolvedPaths, ['C:\\Lab\\Reports\\readme.txt', 'C:\\Lab\\Reports\\ticket.txt']);
  const restored = roundtrip(s);
  assert.deepEqual(restored.history, s.history, 'past paths remain valid trace metadata even when the file moved');
});

test('restore accepts legacy traces and rejects malformed optional path evidence', () => {
  const s = fresh(); success(s, 'type readme.txt');
  const legacy = JSON.parse(JSON.stringify(s));
  delete legacy.history[0].trace[0].cwd; delete legacy.history[0].trace[0].resolvedPaths;
  const restored = Shell.restoreSession(legacy);
  assert.equal(Object.hasOwn(restored.history[0].trace[0], 'cwd'), false);
  assert.equal(Object.hasOwn(restored.history[0].trace[0], 'resolvedPaths'), false);
  for (const patch of [
    {cwd:'relative'}, {cwd:'C:\\Lab\\..\\Lab'}, {cwd:'Z:\\'},
    {resolvedPaths:'C:\\Lab'}, {resolvedPaths:['readme.txt']}, {resolvedPaths:['C:\\Lab\\..\\readme.txt']},
    {resolvedPaths:['C:\\Lab\\CON']}, {resolvedPaths:Array(257).fill('C:\\Lab')}
  ]) {
    const raw = JSON.parse(JSON.stringify(s)); Object.assign(raw.history[0].trace[0], patch);
    assert.throws(() => Shell.restoreSession(raw), JSON.stringify(patch).slice(0, 80));
  }
});

test('help follows the invocation language without persisting a language in the session', () => {
  const s = fresh();
  const ja = Shell.run(s, 'help', {language:'ja'}).stdout;
  assert.match(ja, /対応する Windows CMD コマンド/);
  assert.match(ja, /フォルダーの内容を表示/);
  assert.doesNotMatch(ja, /List files and directories/);
  const en = Shell.run(s, 'help', {language:'en'}).stdout;
  assert.match(en, /List files and directories/); assert.doesNotMatch(en, /フォルダーの内容を表示/);
  assert.match(Shell.run(s, 'help dir', {language:'ja'}).stdout, /フォルダーの内容を表示/);
  assert.doesNotMatch(Shell.run(s, 'dir /?', {language:'ja'}).stdout, /List files/);
  assert.match(Shell.run(s, 'help curl', {language:'ja'}).stdout, /HTTP 応答を確認/);
  assert.match(Shell.run(s, 'help unknown', {language:'ja'}).stderr, /ヘルプはありません/);
  assert.match(Shell.run(s, 'help dir').stdout, /List files and directories/);
  assert.equal(Object.hasOwn(s, 'language'), false);
});

test('taskkill distinguishes a cooperative request from forced termination and subsequent observation', () => {
  const normal = fresh(), forced = fresh();
  const request = success(normal, 'taskkill /PID 4320').stdout;
  assert.match(request, /Sent termination signal/); assert.doesNotMatch(request, /has been terminated/);
  assert.match(success(normal, 'tasklist /fi "PID eq 4320"').stdout, /No tasks/);
  const terminated = success(forced, 'taskkill /PID 4320 /F').stdout;
  assert.match(terminated, /has been terminated/); assert.doesNotMatch(terminated, /Sent termination signal/);
  assert.match(success(forced, 'tasklist /fi "PID eq 4320"').stdout, /No tasks/);
});

test('folder ACLs display propagation separately from inherited file permissions', () => {
  const s = fresh('permission');
  const folder = success(s, 'icacls "Shared Files"').stdout;
  assert.match(folder, /CORP\\student:\(OI\)\(CI\)\(RX\)/);
  const file = success(s, 'icacls "Shared Files\\guide.txt"').stdout;
  assert.match(file, /CORP\\student:\(I\)\(RX\)/);
  assert.doesNotMatch(file, /\(OI\)|\(CI\)/);
  assert.match(success(s, 'icacls Reports').stdout, /CORP\\student:\(I\)\(OI\)\(CI\)\(M\)/);
});

test('disk and service outputs distinguish illustrative values and transition messages', () => {
  const s = fresh('service-stopped');
  const disk = success(s, 'fsutil volume diskfree C:').stdout;
  assert.match(disk, /Illustrative Windows 11 output \(excerpt\)/);
  assert.match(disk, /Total free bytes\s+: 8,589,934,592 \(8.0 GB\)/);
  assert.match(disk, /Total quota free bytes\s+: 8,589,934,592 \(8.0 GB\)/);
  assert.match(disk, /Total bytes\s+: 274,877,906,944 \(256.0 GB\)/);
  const start = success(s, 'net start Spooler').stdout;
  assert.match(start, /service is starting\.\nThe Print Spooler service was started successfully/);
  assert.match(success(s, 'sc query Spooler').stdout, /RUNNING/);
  assert.match(success(s, 'net stop Spooler').stdout, /service is stopping\.\nThe Print Spooler service was stopped successfully/);
});

const inputPathSeparators = [
  ['backslash U+005C', '\u005c'], ['slash U+002F', '/'],
  ['yen U+00A5', '\u00a5'], ['fullwidth yen U+FFE5', '\uffe5']
];

test('path input variants support absolute, relative, quoted and environment-variable paths', () => {
  for (const [label, separator] of inputPathSeparators) {
    const s = Shell.createSession(), path = value => value.replaceAll('\\', separator);
    success(s, 'cd /d ' + path('c:\\Lab'));
    assert.equal(s.cwd, 'C:\\Lab', label);
    assert.match(success(s, 'dir ' + path('C:\\Lab\\Logs')).stdout, /app\.log/, label);
    assert.match(success(s, 'type ' + path('Logs\\app.log')).stdout, /Printer service unavailable/, label);
    assert.match(success(s, 'type "' + path('C:\\Lab\\Shared Files\\guide.txt') + '"').stdout, /Team support guide/, label);
    assert.match(success(s, 'type "' + path('Shared Files\\guide.txt') + '"').stdout, /Team support guide/, label);
    assert.match(success(s, 'icacls "' + path('C:\\Lab\\Shared Files') + '"').stdout, /CORP\\student/, label);
    success(s, 'cd /d "' + path('%USERPROFILE%\\Documents') + '"');
    assert.equal(s.cwd, 'C:\\Users\\student\\Documents', label);
    success(s, 'cd ' + path('..\\Desktop'));
    assert.equal(s.cwd, 'C:\\Users\\student\\Desktop', label);
    assert.match(success(s, 'fsutil volume diskfree ' + path('C:\\')).stdout, /Total free bytes/, label);
    assert.deepEqual(roundtrip(s).history, s.history, label + ' canonical trace paths survive import');
  }
});

test('path input variants create, copy, move and rename the intended files', () => {
  for (const [label, separator] of inputPathSeparators) {
    const s = fresh(), path = value => value.replaceAll('\\', separator);
    success(s, 'mkdir ' + path('Work\\Daily'));
    success(s, 'copy readme.txt ' + path('Work\\Daily'));
    success(s, 'move ' + path('Work\\Daily\\readme.txt') + ' ' + path('C:\\Lab\\Reports'));
    success(s, 'ren ' + path('Reports\\readme.txt') + ' final.txt');
    assert.equal(s.files['c:\\lab\\reports\\final.txt'].content, 'PC-014 support notes\nContact: helpdesk\n', label);
    assert.equal(s.files['c:\\lab\\work\\daily\\readme.txt'], undefined, label);
    const before = JSON.stringify(s.files);
    const invalid = run(s, 'ren ' + path('Reports\\final.txt') + ' ' + path('..\\moved.txt'));
    assert.equal(invalid.unsupported, true, label + ' rename cannot accept a new path');
    assert.equal(JSON.stringify(s.files), before, label + ' rejected rename preserves files');
  }
});

test('redirection normalizes only its destination and keeps literal yen text unchanged', () => {
  const literal = 'Price \u00a51000 / \uffe52000; C:\u00a5Lab';
  for (const [label, separator] of inputPathSeparators) {
    const s = Shell.createSession(), path = value => value.replaceAll('\\', separator);
    success(s, 'echo ' + literal + ' > ' + path('C:\\Lab\\Reports\\price.txt'));
    success(s, 'echo \u00a53000 >> ' + path('C:\\Lab\\Reports\\price.txt'));
    assert.equal(success(s, 'type ' + path('C:\\Lab\\Reports\\price.txt')).stdout, literal + '\n\u00a53000\n', label);
    assert.equal(s.files['c:\\lab\\reports\\price.txt'].content, literal + '\n\u00a53000\n', label);
    assert.equal(Object.values(s.files).filter(f => /[\u00a5\uffe5]/.test(f.path)).length, 0, label + ' no stray literal-yen path');
  }
});

test('yen currency text, literal search patterns and HTTP URLs are not rewritten as paths', () => {
  for (const separator of ['\u00a5', '\uffe5']) {
    const s = fresh(), literal = separator + '1000';
    assert.equal(success(s, 'echo ' + literal + ' | findstr /l "' + literal + '"').stdout, literal + '\n');
    const url = 'https://example.com/price' + literal;
    const response = success(s, 'curl.exe -v ' + url);
    assert.deepEqual(response.trace[0].args, ['-v', url]);
    assert.ok(response.stderr.includes('> GET /price' + literal + ' HTTP/1.1'));
    assert.match(response.stdout, /requested resource was not found/);
  }
});

test('completion accepts yen input and returns usable canonical paths', () => {
  for (const [label, separator] of inputPathSeparators) {
    const s = fresh(), path = value => value.replaceAll('\\', separator);
    assert.ok(Shell.complete(s, 'cd ' + path('C:\\La')).includes('cd C:\\Lab'), label);
    assert.ok(Shell.complete(s, 'type ' + path('Logs\\a')).includes('type Logs\\app.log'), label);
    assert.ok(Shell.complete(s, 'type "' + path('C:\\Lab\\Shared')).includes('type "C:\\Lab\\Shared Files\\guide.txt"'), label);
    if (separator !== '/') {
      // A leading slash is an option prefix in this simulator's CMD subset.
      const candidate = 'dir C:\\Lab\\Logs';
      assert.ok(Shell.complete(s, 'dir ' + path('\\Lab\\L')).includes(candidate), label + ' rooted path stays absolute');
      assert.equal(run(s, candidate).code, 0, label);
    }
  }
});

test('UNC input using yen separators is rejected without filesystem changes', () => {
  for (const [label, separator] of inputPathSeparators) {
    const unc = [separator, separator, 'server', separator, 'share'].join('');
    for (const command of ['dir ' + unc, 'mkdir ' + unc, 'copy readme.txt ' + unc, 'echo changed > ' + unc + separator + 'file.txt']) {
      const s = fresh(), before = JSON.stringify(s.files);
      assert.notEqual(run(s, command).code, 0, label + ': ' + command);
      assert.equal(JSON.stringify(s.files), before, label + ' must not create a local imitation of UNC');
      assert.equal(s.cwd, 'C:\\Lab', label);
    }
  }
});

test('legacy literal-yen file names and trace paths remain importable without reinterpretation', () => {
  for (const yen of ['\u00a5', '\uffe5']) {
    const raw = JSON.parse(JSON.stringify(fresh()));
    // Version 0.1.1 treated Unicode yen as a literal filename character.
    const legacyPath = 'C:\\Users\\student\\' + yen + 'Lab' + yen + 'Reports' + yen + 'price.txt';
    raw.files[legacyPath.toLowerCase()] = {path:legacyPath, dir:false, content:yen + '1000\n'};
    raw.history.push({line:'type ' + legacyPath, stdout:yen + '1000\n', stderr:'', code:0, effects:[], trace:[{
      name:'type', args:[legacyPath], cwd:raw.cwd, resolvedPaths:[legacyPath],
      command:'type ' + legacyPath, input:'', output:yen + '1000\n', error:'', code:0
    }]});
    const restored = Shell.restoreSession(raw);
    assert.deepEqual(JSON.parse(JSON.stringify(restored.files)), raw.files);
    assert.deepEqual(restored.history, raw.history);
    assert.equal(restored.files['c:\\lab\\reports\\price.txt'], undefined);
  }
});
