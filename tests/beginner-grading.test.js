'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Shell=require('../src/shell.js'),Data=require('../src/data.js'),Engine=require('../src/engine.js');
const byId=id=>Data.lessons.find(lesson=>lesson.id===id);
function attempt(id,commands){const lesson=byId(id),cp=Engine.fresh(lesson);for(const command of commands)cp.evidence=Engine.observe(lesson,Shell.run(cp.session,command),cp.evidence);cp.answer=lesson.question?.answer||'';return {lesson,cp,result:Engine.grade(lesson,cp.session,cp.answer,cp.evidence)};}

test('L02 accepts same-drive cd without /d but still requires the initial location and destination',()=>{
  for(const command of ['cd C:\\Lab','cd /d C:\\Lab','chdir c:/Lab','cd C:¥Lab'])assert.equal(attempt('current-directory',['cd',command]).result.ok,true,command);
  for(const commands of [['cd C:\\Lab'],['cd','cd C:\\Lab\\Logs'],['cd','D:','cd C:\\Lab']])assert.equal(attempt('current-directory',commands).result.ok,false,commands.join('; '));
});

test('L16 accepts any tasklist view showing the target row before termination',()=>{
  for(const view of ['tasklist','tasklist /fi "PID eq 4320"','tasklist /fi "IMAGENAME eq NotesApp.exe"'])assert.equal(attempt('stop-one-app',[view,'taskkill /PID 4320']).result.ok,true,view);
  for(const commands of [['taskkill /PID 4320'],['tasklist /fi "PID eq 4240"','taskkill /PID 4320'],['taskkill /PID 4320','tasklist']])assert.equal(attempt('stop-one-app',commands).result.ok,false,commands.join('; '));
  const lesson=byId('stop-one-app'),cp=Engine.fresh(lesson),entry=Shell.run(cp.session,'tasklist');
  entry.trace[0].output='NotesApp.exe 43200 Console\nOtherApp.exe 4320 Console';cp.session.history=[entry];
  assert.equal(Engine.grade(lesson,cp.session,lesson.question.answer).commands[0],false,'name and exact PID must share a row');
});

test('service display names and other supported aliases retain their grading meaning',()=>{
  for(const id of ['start-print-service','capstone-printing']){
    const commands=byId(id).solution.map(command=>command.replace('net start Spooler','net start "Print Spooler"'));
    assert.equal(attempt(id,commands).result.ok,true,id);
  }
  assert.equal(attempt('environment-and-command-path',['set TEMP','where curl']).result.ok,true);
  assert.equal(attempt('wifi-connection',['netsh wlan show interface','ipconfig /all']).result.ok,true);
  assert.equal(attempt('routing-table',['ipconfig /all','route print -4']).result.ok,true);
  assert.equal(attempt('renew-dhcp-lease',['ipconfig /all','ipconfig /renew Wi-Fi','ipconfig /all']).result.ok,true);
});

test('every lesson check has a bilingual label and checklist truth follows grade truth throughout practice',()=>{
  for(const lesson of Data.lessons){
    const verify=lesson.verify,labels=verify.labels;assert.ok(labels,lesson.id);
    for(const key of ['commands','pipelines','orderedCommands','files'])assert.equal(labels[key]?.length||0,verify[key]?.length||0,lesson.id+' '+key);
    if(verify.cwd)assert.ok(labels.cwd);
    for(const key of Object.keys(verify.state||{}))assert.ok(labels.state[key]);
    const cp=Engine.fresh(lesson);
    const inspect=()=>{const grade=Engine.grade(lesson,cp.session,cp.answer,cp.evidence);assert.equal(grade.checklist.every(item=>item.ok),grade.ok,lesson.id);assert.equal(new Set(grade.checklist.map(item=>item.key)).size,grade.checklist.length);for(const item of grade.checklist){assert.ok(item.label.ja&&item.label.en,lesson.id+' '+item.key);assert.notEqual(item.label.en,'Meet the task requirement');}return grade;};
    inspect();for(const command of lesson.solution){cp.evidence=Engine.observe(lesson,Shell.run(cp.session,command),cp.evidence);inspect();}
    if(lesson.question){cp.answer=lesson.question.choices.find(choice=>choice.id!==lesson.question.answer).id;assert.equal(inspect().checklist.at(-1).ok,false);cp.answer=lesson.question.answer;}
    assert.equal(inspect().ok,true,lesson.id);
  }
});

test('checklists distinguish missing files, current state and ordered recovery after a repeat',()=>{
  const missing=attempt('save-and-append',['echo PC-014','echo Printer issue','type C:\\Lab\\readme.txt']).result;
  assert.equal(missing.checklist.find(item=>item.kind==='file').ok,false);
  const {lesson,cp}=attempt('capstone-stale-portal',byId('capstone-stale-portal').solution);
  cp.evidence=Engine.observe(lesson,Shell.run(cp.session,'ipconfig /flushdns'),cp.evidence);
  let grade=Engine.grade(lesson,cp.session,cp.answer,cp.evidence);
  assert.equal(grade.checklist.find(item=>item.key==='ordered-3').ok,false);
  assert.equal(grade.checklist.find(item=>item.key==='ordered-2').ok,true);
  assert.equal(grade.checklist.some(item=>item.key==='command-3'),false,'ordered requirement replaces duplicate historical success');
  for(let i=0;i<85;i++)cp.evidence=Engine.observe(lesson,Shell.run(cp.session,'echo practice'),cp.evidence);
  grade=Engine.grade(lesson,cp.session,cp.answer,cp.evidence);assert.equal(grade.checklist.find(item=>item.key==='ordered-3').ok,false);
  const stopped=attempt('start-print-service',byId('start-print-service').solution);Shell.run(stopped.cp.session,'net stop Spooler');
  assert.equal(Engine.grade(stopped.lesson,stopped.cp.session,stopped.cp.answer,stopped.cp.evidence).checklist.find(item=>item.kind==='state').ok,false);
});

test('adding or changing display labels preserves old evidence signatures and pruned history',()=>{
  const lesson=byId('refresh-dns-cache'),plain=structuredClone(lesson);delete plain.verify.labels;
  const {cp}=attempt(lesson.id,lesson.solution);
  assert.equal(Engine.fresh(plain).evidence.signature,Engine.fresh(lesson).evidence.signature);
  const alternate=structuredClone(lesson);alternate.verify.labels.commands[0]={ja:'別の表示文',en:'Different display text'};
  assert.equal(Engine.fresh(alternate).evidence.signature,cp.evidence.signature);
  for(let i=0;i<90;i++)cp.evidence=Engine.observe(lesson,Shell.run(cp.session,'echo practice'),cp.evidence);
  assert.equal(Engine.grade(alternate,cp.session,cp.answer,cp.evidence).ok,true);
});

test('L54 needs three saved System events and L56 needs saved IP configuration',()=>{
  for(const [id,prefix]of [['capstone-printing','wevtutil'],['capstone-vpn-route','ipconfig']]){
    const lesson=byId(id);
    const commands=lesson.solution.map(command=>command.startsWith(prefix)?command.split(/\s+>>?\s+/)[0]:command);
    const missing=attempt(id,commands).result;
    assert.equal(missing.commands.every(Boolean),true,id+' required commands did run');
    assert.equal(missing.ordered,true,id+' required order is satisfied');
    assert.equal(missing.files[0],false,id+' omitted output is detected');
    assert.equal(missing.checklist.find(item=>item.kind==='file').ok,false);
    assert.equal(missing.ok,false,id);
    assert.equal(attempt(id,lesson.solution).result.ok,true,id+' complete report');
  }
  const lesson=byId('capstone-printing');
  const commands=lesson.solution.map(command=>command.startsWith('wevtutil')?command.split(/\s+>>\s+/)[0]:command);
  commands.push('wevtutil qe System /c:1 /rd:true /f:text >> C:\\Lab\\Reports\\printing.txt');
  assert.equal(attempt(lesson.id,commands).result.ok,false,'one saved event cannot satisfy the required three');
});
