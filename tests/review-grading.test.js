'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Shell = require('../src/shell.js');
const Engine = require('../src/engine.js');
const Data = require('../src/data.js');
const byId = id => Data.lessons.find(lesson => lesson.id === id);
function attempt(id, commands) {
  const lesson = byId(id), cp = Engine.fresh(lesson);
  for (const command of commands) cp.evidence = Engine.observe(lesson, Shell.run(cp.session, command), cp.evidence);
  cp.answer = lesson.question?.answer || '';
  return {lesson, cp, result:Engine.grade(lesson, cp.session, cp.answer, cp.evidence)};
}
function progressFor(lesson, cp) {
  const state = Engine.empty();
  state.activeId = lesson.id; state.checkpoints[lesson.id] = cp;
  state.completed[lesson.id] = {at:'2026-10-28',hints:0,solutionUsed:false};
  return state;
}

test('L03 requires reading inside Support and going to its parent with cd ..', () => {
  for (const commands of [
    ['cd /d D:\\', 'type D:\\Support\\ticket.txt'],
    ['cd /d D:\\Support','type ticket.txt','cd /d D:\\'],
    ['type D:\\Support\\ticket.txt','cd /d D:\\Support','cd ..'],
    ['cd /d D:\\Support','cd ..','type D:\\Support\\ticket.txt']
  ]) assert.equal(attempt('drives-and-parent',commands).result.ok,false,commands.join('; '));
  for (const commands of [
    ['cd /d D:\\Support','type ticket.txt','cd ..'],
    ['cd /d D:\\Support','type ticket.txt','cd /d ..'],
    ['cd D:\\Support','D:','type .\\ticket.txt','chdir ..'],
    ['D:','cd Support','type D:\\Support\\ticket.txt','cd ..']
  ]) assert.equal(attempt('drives-and-parent',commands).result.ok,true,commands.join('; '));
});

test('L12 requires systeminfo itself to save the report rather than echo or a different destination', () => {
  for (const commands of [
    ['ver','systeminfo','echo PC-014 > C:\\Lab\\Reports\\system.txt'],
    ['ver','systeminfo > C:\\Lab\\Reports\\elsewhere.txt','echo Host Name: PC-014 OS Name: Microsoft Windows 11 Pro > C:\\Lab\\Reports\\system.txt'],
    ['ver','systeminfo | echo Host Name: PC-014 OS Name: Microsoft Windows 11 Pro > C:\\Lab\\Reports\\system.txt']
  ]) assert.equal(attempt('system-details',commands).result.ok,false,commands.join('; '));
  assert.equal(attempt('system-details',['cd /d C:\\Lab','ver','systeminfo > Reports\\system.txt']).result.ok,true);
});

test('L19 requires the requested event query to save the events report', () => {
  const command = 'wevtutil qe System /c:3 /rd:true /f:text';
  for (const commands of [
    [command,'echo PC-014 > C:\\Lab\\Reports\\events.txt'],
    [command + ' > C:\\Lab\\Reports\\elsewhere.txt','echo Event[0] Log Name: System Computer: PC-014 > C:\\Lab\\Reports\\events.txt']
  ]) assert.equal(attempt('recent-system-events',commands).result.ok,false,commands.join('; '));
  assert.equal(attempt('recent-system-events',['cd /d C:\\Lab\\Reports',command+' > events.txt']).result.ok,true);
});

test('successful output provenance is separate from inspected paths and records append mode', () => {
  const session = Shell.createSession({cwd:'C:\\Lab'});
  const redirected = Shell.run(session,'systeminfo > Reports\\system.txt').trace[0];
  assert.equal(redirected.outputPath,'C:\\Lab\\Reports\\system.txt');
  assert.equal(redirected.outputAppend,false); assert.deepEqual(redirected.resolvedPaths,[]);
  const appended = Shell.run(session,'ver >> Reports\\system.txt').trace[0];
  assert.equal(appended.outputAppend,true);
  for (const command of ['systeminfo > C:\\Missing\\report.txt','type nope.txt > Reports\\failure.txt']) {
    const entry = Shell.run(session,command);assert.notEqual(entry.code,0);assert.equal(Object.hasOwn(entry.trace[0],'outputPath'),false);
  }
  assert.deepEqual(Shell.restoreSession(JSON.parse(JSON.stringify(session))).history,session.history);
});

test('older successful redirection traces regain provenance without rerunning or changing user work', () => {
  for (const id of ['system-details','recent-system-events']) {
    for (const relative of [false,true]) {
      const lesson = byId(id), commands = relative
        ? ['cd /d C:\\Lab\\Reports',...lesson.solution.map(command=>command.replace(/C:\\Lab\\Reports\\/g,''))]
        : lesson.solution;
      const {cp} = attempt(id,commands);
      const state = progressFor(lesson,cp), raw=JSON.parse(JSON.stringify(state));
      raw.checkpoints[id].evidence.signature='legacy-output-check';
      for (const entry of raw.checkpoints[id].session.history) for (const trace of entry.trace) {delete trace.outputPath;delete trace.outputAppend;}
      const beforeFiles=JSON.stringify(raw.checkpoints[id].session.files),beforeCompleted=JSON.stringify(raw.completed);
      const restored=Engine.parse(JSON.stringify(raw)), recovered=restored.checkpoints[id];
      assert.equal(Engine.grade(lesson,recovered.session,recovered.answer,recovered.evidence).ok,true,id+' '+relative);
      assert.equal(JSON.stringify(recovered.session.files),beforeFiles);assert.equal(JSON.stringify(restored.completed),beforeCompleted);
    }
  }
});

test('ambiguous or inconsistent legacy write evidence cannot create output provenance', () => {
  for (const mutate of [
    entry => { entry.effects=[]; },
    entry => { entry.trace[0].args=['unexpected']; },
    entry => { entry.line='echo fake > Reports\\system.txt'; },
    entry => { delete entry.trace[0].cwd; },
    entry => { entry.code=1; }
  ]) {
    const session=Shell.createSession({cwd:'C:\\Lab'});Shell.run(session,'systeminfo > Reports\\system.txt');
    const raw=JSON.parse(JSON.stringify(session)),entry=raw.history[0];
    delete entry.trace[0].outputPath;delete entry.trace[0].outputAppend;mutate(entry);
    const restored=Shell.restoreSession(raw);assert.equal(Object.hasOwn(restored.history[0].trace[0],'outputPath'),false);
  }
  const session=Shell.createSession();Shell.run(session,'systeminfo > C:\\Lab\\Reports\\system.txt');
  const raw=JSON.parse(JSON.stringify(session));delete raw.history[0].trace[0].cwd;delete raw.history[0].trace[0].outputPath;delete raw.history[0].trace[0].outputAppend;
  assert.equal(Shell.restoreSession(raw).history[0].trace[0].outputPath,'C:\\Lab\\Reports\\system.txt','absolute legacy destination does not need cwd');
});

test('restoration rejects invalid output provenance metadata', () => {
  const session=Shell.createSession();Shell.run(session,'systeminfo > C:\\Lab\\Reports\\system.txt');
  for(const patch of [{outputPath:'relative'},{outputPath:'Z:\\file.txt'},{outputPath:'C:\\Lab\\..\\file.txt'},{outputAppend:'false'},{code:1}]) {
    const raw=JSON.parse(JSON.stringify(session));Object.assign(raw.history[0].trace[0],patch);assert.throws(()=>Shell.restoreSession(raw));
  }
});

test('L23 accepts the supported netsh context aliases in grading', () => {
  for(const command of ['netsh int ipv4 show config','netsh interface ip show config','NETSH INT IP SHOW CONFIG']) {
    const lesson=byId('interface-configuration'), commands=lesson.solution.map(line=>line.toLowerCase().includes('netsh interface ipv4 show config')?command:line);
    assert.equal(attempt(lesson.id,commands).result.ok,true,command);
  }
});

test('L53 exposes a pending recheck after repeating recovery, including pruned history and imports', () => {
  const {lesson,cp}=attempt('capstone-stale-portal',byId('capstone-stale-portal').solution);
  const grade=()=>Engine.grade(lesson,cp.session,cp.answer,cp.evidence);
  assert.equal(grade().ok,true);assert.equal(grade().needsRecheck,false);
  cp.evidence=Engine.observe(lesson,Shell.run(cp.session,'ipconfig /flushdns'),cp.evidence);
  assert.equal(grade().ok,false);assert.equal(grade().needsRecheck,true);
  for(let i=0;i<85;i++)cp.evidence=Engine.observe(lesson,Shell.run(cp.session,'echo practice'),cp.evidence);
  assert.equal(grade().needsRecheck,true);
  const restored=Engine.parse(JSON.stringify(progressFor(lesson,cp))).checkpoints[lesson.id];
  assert.equal(Engine.grade(lesson,restored.session,restored.answer,restored.evidence).needsRecheck,true);
  cp.evidence=Engine.observe(lesson,Shell.run(cp.session,'curl.exe -I https://intranet.corp.example >> C:\\Lab\\Reports\\portal.txt'),cp.evidence);
  assert.equal(grade().ok,true);assert.equal(grade().needsRecheck,false);
  const fresh=Engine.fresh(lesson);assert.equal(Engine.grade(lesson,fresh.session,cp.answer,fresh.evidence).needsRecheck,false);
});

test('Windows file-not-found text omits the path and ACL output illustrates inherited and explicit entries', () => {
  const session=Shell.createSession({scenario:'permission'});
  assert.equal(Shell.run(session,'type C:\\Lab\\nope.txt').stderr,'The system cannot find the file specified.\n');
  const output=Shell.run(session,'icacls "C:\\Lab\\Shared Files"').stdout;
  assert.match(output,/NT AUTHORITY\\SYSTEM:\(I\)\(OI\)\(CI\)\(F\)/);
  assert.match(output,/CORP\\student:\(OI\)\(CI\)\(RX\)/);
});
