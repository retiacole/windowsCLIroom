'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Shell = require('../src/shell.js');
const session = () => Shell.createSession({cwd:'C:\\Lab'});

test('compact cd spellings operate and trace like their spaced equivalents', () => {
  for (const spelling of ['cd..','CD..','chdir..']) {
    const s = Shell.createSession({cwd:'D:\\Support'}), result = Shell.run(s,spelling);
    assert.equal(result.code,0,spelling); assert.equal(s.cwd,'D:\\');
    assert.equal(result.trace[0].name,'cd'); assert.deepEqual(result.trace[0].args,['..']);
    assert.equal(result.trace[0].cwd,'D:\\Support'); assert.deepEqual(result.trace[0].resolvedPaths,['D:\\']);
    assert.equal(s.history[0].line,spelling);
  }
  for (const separator of ['\\','¥','￥']) {
    const s=session(); assert.equal(Shell.run(s,'cd'+separator).code,0); assert.equal(s.cwd,'C:\\');
    assert.equal(Shell.run(s,'cd'+separator+'Lab').code,0); assert.equal(s.cwd,'C:\\Lab');
  }
  assert.notEqual(Shell.run(session(),'cd..unknown').code,0,'unknown command names are not guessed');
});

test('compact switches normalize only dir and ipconfig without rewriting history', () => {
  for (const [compact,spaced] of [['dir/a','dir /a'],['DIR/A C:\\Lab','dir /a C:\\Lab'],['ipconfig/all','ipconfig /all']]) {
    const s=session(), actual=Shell.run(s,compact), expected=Shell.run(session(),spaced);
    assert.equal(actual.code,0,compact); assert.equal(actual.stdout,expected.stdout);
    assert.deepEqual(actual.trace[0].args.map(arg=>arg.toLowerCase()),expected.trace[0].args.map(arg=>arg.toLowerCase())); assert.equal(s.history[0].line,compact);
  }
  assert.notEqual(Shell.run(session(),'dir/invalid').code,0);
  assert.notEqual(Shell.run(session(),'madeup/all').code,0);
});

test('input diagnostics identify full-width syntax and smart quotes without silently converting it', () => {
  for (const line of ['type “C:¥Lab¥Shared Files¥guide.txt”','echo PC-014 ＞ C:\\Lab\\Reports\\note.txt','type a.log ｜ findstr ERROR','cd C：¥Lab']) {
    const s=session(), before=JSON.stringify(s.files), result=Shell.run(s,line,{language:'ja'});
    assert.match(result.stderr,/全角文字・スマート引用符/); assert.match(result.stderr,/半角/);
    assert.equal(s.history[0].line,line); assert.equal(JSON.stringify(s.files),before);
    assert.equal(s.history[0].stderr,result.stderr);
  }
  const s=session(), result=Shell.run(s,'echo PC-014 ＞ C:\\Lab\\Reports\\note.txt');
  assert.equal(result.code,0,'a warning does not turn literal echo text into a failure');
  assert.match(result.stdout,/＞/); assert.match(result.stderr,/Full-width/);
  assert.equal(s.files['c:\\lab\\reports\\note.txt'],undefined);
});

test('full-width spaces are diagnosed and are not argument delimiters or silently trimmed', () => {
  for (const line of ['dir\u3000C:\\Lab','\u3000dir','dir\u3000','\u3000']) {
    const s=session(), result=Shell.run(s,line,{language:'ja'});
    assert.notEqual(result.code,0,line); assert.match(result.stderr,/全角スペース/);
    assert.equal(s.history[0].line,line);
  }
  assert.equal(Shell.run(session(),'dir\tC:\\Lab').code,0,'ASCII tab remains a separator');
  assert.deepEqual(Shell.complete(session(),'dir\u3000C:\\L'),[]);
});

test('Japanese text, full-width literal content and Unicode filenames are preserved', () => {
  const s=session(), content='日本語 あ\u3000い ＡＢＣ ＞ ｜ “引用” 予算¥1000 ￥2000';
  const result=Shell.run(s,'echo '+content+' > "C:\\Lab\\Reports\\全角Ａ\u3000メモ.txt"',{language:'ja'});
  assert.equal(result.code,0); assert.match(result.stderr,/全角/);
  const file=s.files['c:\\lab\\reports\\全角ａ\u3000メモ.txt'];
  assert.equal(file.content,content+'\n');
  assert.equal(Shell.run(s,'type "C:\\Lab\\Reports\\全角Ａ\u3000メモ.txt"').stdout,content+'\n');
  assert.equal(JSON.stringify(Shell.restoreSession(JSON.parse(JSON.stringify(s)))),JSON.stringify(s));
  for (const line of ['echo 日本語 予算¥1000 ￥2000','type C:¥Lab¥readme.txt','type C:￥Lab￥readme.txt']) {
    assert.equal(Shell.inputWarning(line,'ja'),''); assert.equal(Shell.run(s,line).code,0);
  }
});

test('single quotes explain the CMD quoting rule while legitimate apostrophe filenames work', () => {
  for (const language of ['ja','en']) for (const path of ["'C:\\Lab\\Shared Files\\guide.txt'","'Shared Files\\guide.txt'"]) {
    const result=Shell.run(session(),'type '+path,{language});
    assert.notEqual(result.code,0); assert.match(result.stderr,language==='ja'?/半角の "/:/ASCII double quotes/);
    assert.doesNotMatch(result.stderr,/reserved Windows path/);
  }
  const s=session(); Shell.run(s,'echo keep > "C:\\Lab\\\'memo\'.txt"');
  assert.equal(Shell.run(s,'type "C:\\Lab\\\'memo\'.txt"').stdout,'keep\n');
});

test('unquoted icacls paths identify the missing first path and explain quoting', () => {
  const s=session(), result=Shell.run(s,'icacls C:\\Lab\\Shared Files',{language:'ja'});
  assert.notEqual(result.code,0);
  assert.match(result.stderr,/C:\\Lab\\Shared: The system cannot find the file specified\./);
  assert.match(result.stderr,/空白を含むパス全体/); assert.doesNotMatch(result.stderr,/display only/);
  assert.equal(Shell.run(s,'icacls "C:\\Lab\\Shared Files"').code,0);
  assert.equal(Shell.run(s,'icacls C:\\Lab /grant Everyone:F').unsupported,true,'modification remains unsupported');
});

test('exit explains how to leave without terminating or resetting the simulator', () => {
  const s=session(); const before=JSON.stringify({files:s.files,pc:s.pc,cwd:s.cwd});
  assert.match(Shell.run(s,'exit',{language:'ja'}).stdout,/exit は不要/);
  assert.match(Shell.run(s,'exit').stdout,/Close the page/);
  assert.equal(JSON.stringify({files:s.files,pc:s.pc,cwd:s.cwd}),before);
  assert.equal(Shell.run(s,'dir').code,0); assert.notEqual(Shell.run(s,'where exit').code,0);
});

test('where curl already resolves the same executable as where curl.exe', () => {
  const plain=Shell.run(session(),'where curl'), explicit=Shell.run(session(),'where curl.exe');
  assert.equal(plain.code,0); assert.equal(plain.stdout,explicit.stdout);
  assert.equal(plain.stdout,'C:\\Windows\\System32\\curl.exe\n');
});
