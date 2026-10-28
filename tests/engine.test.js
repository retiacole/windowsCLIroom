'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Shell = require('../src/shell.js');
const Data = require('../src/data.js');
const Engine = require('../src/engine.js');

test('curriculum is bilingual, uniquely identified, and every lesson has three progressive hints', () => {
  const ids = new Set();
  function localized(value) { assert.equal(typeof value.ja, 'string'); assert.equal(typeof value.en, 'string'); assert.ok(value.ja.length && value.en.length); }
  assert.equal(Data.tracks.length, 5);
  for (const lesson of Data.lessons) {
    assert.ok(!ids.has(lesson.id), lesson.id); ids.add(lesson.id);
    assert.ok(Data.tracks.some(t => t.id === lesson.track));
    for (const key of ['title', 'goal', 'task', 'success']) localized(lesson[key]);
    lesson.explanation.forEach(localized); lesson.hints.forEach(localized);
    assert.equal(lesson.hints.length, 3); assert.ok(lesson.solution.length);
    localized(lesson.example.note);
    if (lesson.question) {
      localized(lesson.question.prompt); localized(lesson.question.explanation);
      assert.equal(lesson.question.choices.filter(c => c.id === lesson.question.answer).length, 1);
      lesson.question.choices.forEach(c => { localized(c.text); localized(c.feedback); });
    }
  }
});
for (const lesson of Data.lessons) {
  test(`lesson solution and session round trip: ${lesson.id}`, () => {
    const session = Shell.createSession(lesson.session);
    assert.equal(Engine.grade(lesson, session, lesson.question?.answer).ok, false, 'fresh session cannot pass');
    for (const command of lesson.solution) Shell.run(session, command);
    const result = Engine.grade(lesson, session, lesson.question?.answer);
    assert.equal(result.ok, true, JSON.stringify({result, history:session.history}, null, 2));
    const restored = Shell.restoreSession(JSON.parse(JSON.stringify(session)));
    assert.equal(Engine.grade(lesson, restored, lesson.question?.answer).ok, true);
    if (lesson.question) for (const choice of lesson.question.choices.filter(c=>c.id!==lesson.question.answer)) assert.equal(Engine.grade(lesson, session, choice.id).ok, false, 'wrong interpretation cannot pass');
  });
}
test('output from echo cannot impersonate a diagnostic command', () => {
  const session = Shell.createSession();
  Shell.run(session, 'echo HTTP/1.1 200 OK');
  assert.equal(Engine.grade({verify:{commands:[{name:'curl',outputIncludes:['200 OK']}]}}, session).ok, false);
});
const byId = id=>Data.lessons.find(l=>l.id===id);
function attempt(id,commands) {
  const lesson=byId(id), cp=Engine.fresh(lesson);
  for (const command of commands) cp.evidence=Engine.observe(lesson,Shell.run(cp.session,command),cp.evidence);
  cp.answer=lesson.question?.answer || '';
  return {lesson,cp,result:Engine.grade(lesson,cp.session,cp.answer,cp.evidence)};
}
test('L26 accepts only the gateway, not other successful IPs sharing its prefix',()=>{
  for (const ip of ['10.20.0.10','10.20.0.14']) assert.equal(attempt('ping-gateway',['ipconfig','ping '+ip]).result.ok,false,ip);
  assert.equal(attempt('ping-gateway',['ipconfig','PING -n 2 10.20.0.1']).result.ok,true);
});
test('L04/L05/L07/L20 accept relative operands and omitted dir path resolved at execution time',()=>{
  const examples=[
    ['list-files',['cd /d C:\\Lab','dir /a','dir Logs']],
    ['quoted-path',['cd /d C:\\Lab','type "Shared Files\\guide.txt"']],
    ['make-a-working-copy',['cd /d C:\\Lab','mkdir Work','copy readme.txt Work\\readme.txt']],
    ['read-file-permissions',['cd /d C:\\Lab','icacls "Shared Files"']]
  ];
  for(const [id,commands] of examples) assert.equal(attempt(id,commands).result.ok,true,id);
  assert.equal(attempt('list-files',['dir /a','dir C:\\Lab\\Logs']).result.ok,false,'wrong default cwd must not satisfy C:\\Lab');
  assert.equal(attempt('quoted-path',['type C:\\Lab\\readme.txt > C:\\Lab\\Reports\\guide.txt']).result.ok,false,'redirect is not an input path');
});
test('L01/L02 require no-argument observation before the requested help or move',()=>{
  assert.equal(attempt('help-first',['help dir']).result.ok,false);
  assert.equal(attempt('help-first',['help dir','help']).result.ok,false);
  assert.equal(attempt('help-first',['help','help dir']).result.ok,true);
  assert.equal(attempt('current-directory',['cd /d C:\\Lab']).result.ok,false);
  assert.equal(attempt('current-directory',['cd','cd /d C:\\Lab']).result.ok,true);
});
test('L08 rejects ren used as a move and remains solvable with move followed by ren', () => {
  const {lesson,cp,result} = attempt('move-and-rename', ['ren C:\\Lab\\draft.txt Reports']);
  assert.notEqual(cp.session.history[0].code, 0);
  assert.equal(result.ok, false);
  assert.ok(cp.session.files['c:\\lab\\draft.txt']);
  assert.equal(cp.session.files['c:\\lab\\reports\\draft.txt'], undefined);
  for (const command of ['move C:¥Lab¥draft.txt C:¥Lab¥Reports', 'ren C:¥Lab¥Reports¥draft.txt ticket-1042.txt']) {
    cp.evidence = Engine.observe(lesson, Shell.run(cp.session, command), cp.evidence);
  }
  assert.equal(Engine.grade(lesson, cp.session, cp.answer, cp.evidence).ok, true);
  const progress = Engine.empty(); progress.checkpoints[lesson.id] = cp;
  const restored = Engine.parse(JSON.stringify(progress)).checkpoints[lesson.id];
  assert.equal(Engine.grade(lesson, restored.session, restored.answer, restored.evidence).ok, true);
});
test('L08 accepts move as a same-folder rename, including a saved previously rejected attempt', () => {
  const commands = ['cd ../../', 'cd Lab', 'move draft.txt Reports', 'cd Reports', 'move draft.txt ticket-1042.txt'];
  const {lesson,cp,result} = attempt('move-and-rename', commands);
  assert.equal(result.ok, true);
  assert.ok(cp.session.history.every(entry => entry.code === 0));
  assert.equal(cp.session.files['c:\\lab\\reports\\draft.txt'], undefined);
  assert.match(cp.session.files['c:\\lab\\reports\\ticket-1042.txt'].content, /Ticket 1042/);
  const state = Engine.empty();
  state.checkpoints[lesson.id] = cp;
  // Signature and false rename evidence from v0.1.4 are refreshed from the saved execution history.
  cp.evidence = {signature:'e1-83ab72e0',commands:[true,false],pipelines:[],ordered:0};
  state.completed[lesson.id] = {at:'2026-10-28',hints:0,solutionUsed:false};
  const restored = Engine.parse(JSON.stringify(state));
  const saved = restored.checkpoints[lesson.id];
  assert.deepEqual(saved.evidence.commands, [true,true]);
  assert.notEqual(saved.evidence.signature, cp.evidence.signature);
  assert.equal(Engine.grade(lesson, saved.session, saved.answer, saved.evidence).ok, true);
  assert.deepEqual(saved.session.files, cp.session.files);
  assert.deepEqual(restored.completed[lesson.id], state.completed[lesson.id]);
});
test('L08 move-based renaming requires the requested source and destination', () => {
  const moveFirst = 'move C:\\Lab\\draft.txt C:\\Lab\\Reports';
  for (const rename of [
    'move C:\\Lab\\Reports\\draft.txt C:\\Lab\\Reports\\wrong.txt',
    'move C:\\Lab\\Reports\\draft.txt C:\\Lab\\ticket-1042.txt',
    'move C:\\Lab\\readme.txt C:\\Lab\\Reports\\ticket-1042.txt'
  ]) {
    const result = attempt('move-and-rename', [moveFirst, rename]).result;
    assert.equal(result.ok, false, rename);
    assert.equal(result.commands[1], false, 'a different transfer is not rename evidence');
  }
  for (const separator of ['\\', '/', '¥', '￥']) {
    const commands = [moveFirst, 'move C:\\Lab\\Reports\\draft.txt C:\\Lab\\Reports\\ticket-1042.txt'].map(command => command.replaceAll('\\', separator));
    assert.equal(attempt('move-and-rename', commands).result.ok, true, separator);
  }
});
test('equivalent curl long and combined flags pass while HEAD and GET stay distinct',()=>{
  for(const id of ['curl-headers','capstone-stale-portal','capstone-http-503']) {
    for(const flag of ['--head','-Iv']) {
      const commands=byId(id).solution.map(c=>c.replace(' -I ',' '+flag+' ').replace('--version','-V'));
      assert.equal(attempt(id,commands).result.ok,true,id+' '+flag);
    }
  }
  for(const flag of ['--verbose','-iv']) assert.equal(attempt('curl-detailed-request',byId('curl-detailed-request').solution.map(c=>c.replace(' -v ',' '+flag+' '))).result.ok,true);
  assert.equal(attempt('curl-detailed-request',byId('curl-detailed-request').solution.map(c=>c.replace(' -v ',' -Iv '))).result.ok,false,'HEAD has no response body');
});
test('L10 explicitly requires an actual type-to-findstr pipeline',()=>{
  assert.equal(attempt('filter-and-save',['findstr "ERROR" C:\\Lab\\Logs\\app.log > C:\\Lab\\Reports\\errors.txt']).result.ok,false);
  assert.equal(attempt('filter-and-save',['type C:\\Lab\\Logs\\app.log','findstr "ERROR" C:\\Lab\\Logs\\app.log > C:\\Lab\\Reports\\errors.txt']).result.ok,false);
  assert.equal(attempt('filter-and-save',byId('filter-and-save').solution).result.ok,true);
  assert.equal(attempt('filter-and-save',['type C:\\Lab\\Logs\\app.log | findstr /c:"ERROR" > C:\\Lab\\Reports\\errors.txt']).result.ok,true);
});
test('equivalent absolute DNS names and URL fragments keep their command meaning',()=>{
  assert.equal(attempt('dns-lookup',['nslookup intranet.corp.example.']).result.ok,true);
  assert.equal(attempt('curl-headers',['curl.exe --version','curl.exe --head https://example.com/#section']).result.ok,true);
});
test('L28 requires the expected failing DNS query, not just the final successful one',()=>{
  assert.equal(attempt('compare-dns-servers',['ipconfig /all','nslookup intranet.corp.example 10.20.0.10']).result.ok,false);
  assert.equal(attempt('compare-dns-servers',byId('compare-dns-servers').solution).result.ok,true);
  assert.equal(attempt('compare-dns-servers',['ipconfig /all','nslookup made-up-host','nslookup intranet.corp.example 10.20.0.10']).result.ok,false);
});
test('L50 policy checks tolerate indentation changes and reject a missing applied policy',()=>{
  const {lesson,cp}=attempt('refresh-group-policy',byId('refresh-group-policy').solution);
  for(const h of cp.session.history) for(const t of h.trace) t.output=t.output.replace(/\n +/g,'\n ');
  assert.equal(Engine.grade(lesson,cp.session,cp.answer).ok,true);
  for(const h of cp.session.history) for(const t of h.trace) t.output=t.output.replace(/CORP-Drive-Map/g,'Unrelated-Policy');
  assert.equal(Engine.grade(lesson,cp.session,cp.answer).ok,false);
});
test('collected command evidence survives history pruning, export and import',()=>{
  const lesson=byId('renew-dhcp-lease'),cp=Engine.fresh(lesson);
  const run=command=>{cp.evidence=Engine.observe(lesson,Shell.run(cp.session,command),cp.evidence);};
  run('ipconfig /all'); run('ipconfig /renew');
  for(let i=0;i<100;i++)run('echo practice '+i);
  assert.equal(cp.session.history.length,80);
  assert.equal(Engine.grade(lesson,cp.session,lesson.question.answer,cp.evidence).ok,false,'post-change inspection is still required');
  run('ipconfig /all');
  const progress=Engine.empty();progress.checkpoints[lesson.id]=cp;
  const restored=Engine.parse(JSON.stringify(progress)).checkpoints[lesson.id];
  assert.equal(Engine.grade(lesson,restored.session,lesson.question.answer,restored.evidence).ok,true);
  assert.ok(JSON.stringify(restored.evidence).length<1000,'evidence has a fixed small footprint');
});
test('stored evidence never overrides the required current state',()=>{
  const {lesson,cp}=attempt('start-print-service',byId('start-print-service').solution);
  Shell.run(cp.session,'net stop Spooler');
  for(let i=0;i<100;i++)Shell.run(cp.session,'echo practicing');
  assert.equal(Engine.grade(lesson,cp.session,lesson.question?.answer,cp.evidence).ok,false);
});
test('repeating a recovery change requires observations after the latest change',()=>{
  for(const [id,changes,recheck] of [
    ['start-print-service',['net stop Spooler','net start Spooler'],['sc.exe query Spooler']],
    ['renew-dhcp-lease',['ipconfig /renew'],['ipconfig /all']],
    ['refresh-group-policy',['gpupdate /force'],['gpresult /r','net use']]
  ]){
    const {lesson,cp}=attempt(id,byId(id).solution);
    changes.forEach(c=>Shell.run(cp.session,c));
    assert.equal(Engine.grade(lesson,cp.session,cp.answer,cp.evidence).ok,false,id+' with stale evidence');
    recheck.forEach(c=>Shell.run(cp.session,c));
    assert.equal(Engine.grade(lesson,cp.session,cp.answer,cp.evidence).ok,true,id+' rechecked');
    for(const c of changes)cp.evidence=Engine.observe(lesson,Shell.run(cp.session,c),cp.evidence);
    for(let i=0;i<90;i++)cp.evidence=Engine.observe(lesson,Shell.run(cp.session,'echo practice'),cp.evidence);
    assert.equal(Engine.grade(lesson,cp.session,cp.answer,cp.evidence).ok,false,id+' pending recheck survives pruning');
  }
});
test('v0.1.0 saved progress migrates without losing completion records or files',()=>{
  const raw=require('./fixtures/progress-v0.1.0.json');
  const progress=Engine.parse(JSON.stringify(raw));
  assert.equal(Object.keys(progress.completed).length,4);
  assert.deepEqual(progress.checkpoints['capstone-stale-portal'].session.files,Shell.restoreSession(raw.checkpoints['capstone-stale-portal'].session).files);
  const vpn=progress.checkpoints['routing-table'].session.net;
  assert.equal(vpn.adapter.dns,'192.168.50.1');assert.equal(vpn.vpn.dns,'10.20.0.10');
  assert.equal(progress.checkpoints['refresh-group-policy'].session.net.domain.policyCurrent,true);
  assert.equal(progress.checkpoints['help-first'].attempts.incorrect,0);
  assert.ok(progress.checkpoints['help-first'].evidence);
});
test('curl short options are case sensitive: -i must not satisfy a HEAD task requiring -I', () => {
  const session = Shell.createSession();
  Shell.run(session, 'curl.exe -i https://example.com');
  const task = {verify:{commands:[{name:'curl',contains:['-I'],outputIncludes:['200 OK']}]}};
  assert.equal(Engine.grade(task, session).ok, false);
  Shell.run(session, 'curl.exe -I https://example.com');
  assert.equal(Engine.grade(task, session).ok, true);
});
test('failed pipelines cannot pass using an earlier successful segment', () => {
  const session = Shell.createSession();
  Shell.run(session, 'hostname | findstr "not-present"');
  assert.notEqual(session.history[0].code, 0);
  assert.equal(Engine.grade({verify:{commands:[{name:'hostname'}]}}, session).ok, false);
});
test('progress exports and imports all session states atomically without prototype pollution', () => {
  const progress = Engine.empty();
  for (const lesson of Data.lessons) {
    const cp = Engine.fresh(lesson);
    for (const command of lesson.solution) Shell.run(cp.session, command);
    cp.answer = lesson.question?.answer || ''; cp.hintLevel = 2; cp.solutionShown = true;
    progress.checkpoints[lesson.id] = cp;
    progress.completed[lesson.id] = { at:'2026-10-28T00:00:00.000Z', hints:2, solutionUsed:true };
  }
  progress.activeId = Data.lessons[0].id;
  const restored = Engine.parse(JSON.stringify(progress));
  assert.equal(Object.keys(restored.completed).length, Data.lessons.length);
  for (const lesson of Data.lessons) assert.equal(Engine.grade(lesson, restored.checkpoints[lesson.id].session, restored.checkpoints[lesson.id].answer).ok, true);
  assert.throws(() => Engine.parse('{"schema":"windowsCLIroom.progress","version":1,"completed":{"__proto__":{}},"checkpoints":{}}'));
  assert.throws(() => Engine.parse(JSON.stringify({...progress, version:99})));
  assert.throws(() => Engine.parse('x'.repeat(Engine.MAX_IMPORT + 1)));
  assert.equal({}.polluted, undefined);
});
test('invalid progress does not mutate an existing progress object', () => {
  const before = Engine.empty(); const copy = JSON.stringify(before);
  const invalid = Engine.empty(); invalid.checkpoints.unknown = {};
  assert.throws(() => Engine.restore(invalid));
  assert.equal(JSON.stringify(before), copy);
});
test('recovery requires the final observation after the change, not just a command seen earlier', () => {
  for (const [id, partial] of [
    ['renew-dhcp-lease', ['ipconfig /all','ipconfig /renew']],
    ['refresh-group-policy', ['gpresult /r','gpupdate /force','net use']]
  ]) {
    const lesson = Data.lessons.find(l=>l.id===id), session=Shell.createSession(lesson.session);
    partial.forEach(c=>Shell.run(session,c));
    assert.equal(Engine.grade(lesson,session,lesson.question.answer).ok,false,id);
    Shell.run(session,id==='renew-dhcp-lease'?'ipconfig /all':'gpresult /r');
    if (id==='refresh-group-policy') Shell.run(session,'net use');
    assert.equal(Engine.grade(lesson,session,lesson.question.answer).ok,true,id);
  }
});
test('a stopped service cannot satisfy a task that claims it is currently running', () => {
  for (const id of ['start-print-service','capstone-printing']) {
    const lesson=Data.lessons.find(l=>l.id===id),session=Shell.createSession(lesson.session);
    lesson.solution.forEach(c=>Shell.run(session,c));
    Shell.run(session,'net stop Spooler');
    assert.equal(Engine.grade(lesson,session,lesson.question?.answer).ok,false,id);
  }
});

for (const [label, separator] of [['backslash U+005C','\u005c'], ['slash U+002F','/'], ['yen U+00A5','\u00a5'], ['fullwidth yen U+FFE5','\uffe5']]) {
  test(`path-based lesson solutions and restored evidence accept ${label}`, () => {
    const lessons = Data.lessons.filter(l => l.solution.some(command => command.includes('\\')));
    assert.ok(lessons.length > 0);
    for (const lesson of lessons) {
      const commands = lesson.solution.map(command => command.replaceAll('\\', separator));
      const {cp,result} = attempt(lesson.id, commands);
      assert.equal(result.ok, true, lesson.id + ': ' + JSON.stringify(result));
      const progress = Engine.empty(); progress.checkpoints[lesson.id] = cp;
      const restored = Engine.parse(JSON.stringify(progress)).checkpoints[lesson.id];
      assert.equal(Engine.grade(lesson, restored.session, restored.answer, restored.evidence).ok, true, lesson.id + ' restored');
    }
  });
}

test('yen path support does not make a different folder satisfy the lesson', () => {
  for (const yen of ['\u00a5', '\uffe5']) {
    const prefix = 'C:' + yen + 'Lab';
    const {lesson,cp,result} = attempt('list-files', ['dir /a ' + prefix, 'dir ' + prefix + yen + 'Reports']);
    assert.ok(cp.session.history.every(entry => entry.code === 0), 'both commands run, but inspect the wrong second folder');
    assert.equal(result.ok, false);
    cp.evidence = Engine.observe(lesson, Shell.run(cp.session, 'dir ' + prefix + yen + 'Logs'), cp.evidence);
    assert.equal(Engine.grade(lesson, cp.session, cp.answer, cp.evidence).ok, true);
    assert.equal(attempt('quoted-path', ['type ' + prefix + yen + 'readme.txt']).result.ok, false);
  }
});
