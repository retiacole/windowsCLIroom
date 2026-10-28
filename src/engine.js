(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./shell.js') : root.WCRShell,
    typeof module === 'object' && module.exports ? require('./data.js') : root.WCRData);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCREngine = api;
})(globalThis, function (Shell, Data) {
  'use strict';
  const VERSION = 1;
  const KEY = 'windowsCLIroom.progress.v1';
  const MAX_IMPORT = 12 * 1024 * 1024;
  const ids = new Set(Data.lessons.map(l => l.id));
  const norm = s => String(s || '').replace(/\//g, '\\').replace(/\\+$/g, '').toLowerCase();
  const arr = v => v === undefined ? [] : Array.isArray(v) ? v : [v];
  function canonicalArgs(name, args) {
    const curlFlags = {'--head':'-I','--include':'-i','--verbose':'-v','--fail':'-f','-V':'--version'};
    if (name === 'netsh') {
      const words = args.map(arg => arg.toLowerCase());
      if (words[0] === 'int') words[0] = 'interface';
      if (words[0] === 'interface' && words[1] === 'ip') words[1] = 'ipv4';
      if (words.join(' ') === 'wlan show interface') words[2] = 'interfaces';
      return words;
    }
    return args.flatMap(arg => {
      if (name === 'net' && arg.toLowerCase() === 'print spooler') return ['spooler'];
      if (name === 'where') return [arg.toLowerCase().replace(/\.exe$/, '')];
      if (name === 'curl') {
        if (Object.prototype.hasOwnProperty.call(curlFlags,arg)) return [curlFlags[arg]];
        if (/^-[Iivf]+$/.test(arg)) return [...arg.slice(1)].map(c=>'-'+c);
        if (arg.startsWith('-')) return [arg];
        try { const url=new URL(arg); url.hash=''; return [url.href.replace(/\/$/,'')]; } catch { return [arg]; }
      }
      if (name === 'netstat' && /^-[ano]+$/i.test(arg)) return [...arg.slice(1).toLowerCase()].map(c=>'-'+c);
      if (name === 'findstr' && /^\/c:/i.test(arg)) return [arg.slice(3).toLowerCase()];
      if (['ping','nslookup','tracert','pathping'].includes(name) && /^[\w.-]+\.$/.test(arg)) return [arg.slice(0,-1).toLowerCase()];
      return [arg.toLowerCase()];
    });
  }
  function matches(c, trace, lineCode) {
    const names = arr(c.anyNames === undefined ? c.name : c.anyNames).map(name => name.toLowerCase().replace(/\.exe$/, ''));
    const name = trace.name;
    const expectedCode = c.expectCode === undefined ? 0 : c.expectCode;
    if (!names.includes(name) || trace.code !== expectedCode || lineCode !== expectedCode) return false;
    const args = canonicalArgs(name, trace.args || []);
    const contains = arr(c.contains).every(value => {
      const expected = canonicalArgs(name, [String(value)]);
      if (expected.every(v=>args.includes(v))) return true;
      // A phrase can be one quoted argument or a complete sequence of arguments.
      // Neither IPs, host names, flags, nor file names use substring matching.
      if (!/\s/.test(value)) return false;
      const words = canonicalArgs(name, String(value).split(/\s+/));
      return args.some((_,i)=>words.every((v,j)=>args[i+j]===v));
    });
    if (!contains) return false;
    if (c.argsEqual !== undefined) {
      const expected = canonicalArgs(name, c.argsEqual);
      if (expected.length !== args.length || !expected.every((v,i)=>args[i]===v)) return false;
    }
    const paths = trace.resolvedPaths || (trace.args || []).filter(arg=>/^[CD]:[\\/]/i.test(arg));
    if (!arr(c.paths).every(path=>paths.some(actual=>norm(actual)===norm(path)))) return false;
    if (c.cwd !== undefined && norm(trace.cwd) !== norm(c.cwd)) return false;
    if (c.outputPath !== undefined && norm(trace.outputPath) !== norm(c.outputPath)) return false;
    if (c.outputAppend !== undefined && trace.outputAppend !== c.outputAppend) return false;
    const output = String(trace.output || '').toLowerCase(), error = String(trace.error || '').toLowerCase();
    return (!c.outputRowTokens || output.split(/\r?\n/).some(line => {
      const tokens = line.trim().split(/\s+/);
      return c.outputRowTokens.every(value => tokens.includes(String(value).toLowerCase()));
    })) && arr(c.outputIncludes).every(v=>output.includes(String(v).toLowerCase())) &&
      arr(c.outputExcludes).every(v=>!output.includes(String(v).toLowerCase())) &&
      arr(c.errorIncludes).every(v=>error.includes(String(v).toLowerCase()));
  }
  function signature(lesson) {
    let hash = 2166136261;
    // Labels only describe checks: editing their wording must not discard saved evidence.
    const { labels, ...conditions } = lesson.verify || {};
    for (const ch of JSON.stringify(conditions)) hash = Math.imul(hash ^ ch.charCodeAt(0),16777619) >>> 0;
    return 'e1-' + hash.toString(16);
  }
  function emptyEvidence(lesson) {
    return { signature: signature(lesson), commands:(lesson.verify?.commands || []).map(()=>false),
      pipelines:(lesson.verify?.pipelines || []).map(()=>false), ordered:0 };
  }
  function validEvidence(lesson, value) {
    return value && value.signature === signature(lesson) &&
      Array.isArray(value.commands) && value.commands.length === (lesson.verify?.commands || []).length && value.commands.every(v=>typeof v==='boolean') &&
      Array.isArray(value.pipelines) && value.pipelines.length === (lesson.verify?.pipelines || []).length && value.pipelines.every(v=>typeof v==='boolean') &&
      Number.isInteger(value.ordered) && value.ordered >= 0 && value.ordered <= (lesson.verify?.orderedCommands || []).length;
  }
  function observe(lesson, entry, prior) {
    const evidence = validEvidence(lesson,prior) ? {signature:prior.signature,commands:[...prior.commands],pipelines:[...prior.pipelines],ordered:prior.ordered} : emptyEvidence(lesson);
    const checks = lesson.verify || {}, traces = entry.trace || [];
    evidence.commands = (checks.commands || []).map((c,i)=>evidence.commands[i] || traces.some(t=>matches(c,t,entry.code)));
    evidence.pipelines = (checks.pipelines || []).map((pipeline,i)=>evidence.pipelines[i] || traces.some((_,start)=>pipeline.every((c,j)=>traces[start+j] && matches(c,traces[start+j],entry.code))));
    const sequence = checks.orderedCommands || [];
    for (const trace of traces) {
      const restart = sequence.findIndex((c,i)=>c.restartOnRepeat && evidence.ordered>i && matches(c,trace,entry.code));
      if (restart>=0) evidence.ordered=restart+1;
      else if (evidence.ordered < sequence.length && matches(sequence[evidence.ordered],trace,entry.code)) evidence.ordered++;
    }
    return evidence;
  }
  function historyEvidence(lesson, history) { return history.reduce((result,entry)=>observe(lesson,entry,result),emptyEvidence(lesson)); }
  function grade(lesson, session, answer, savedEvidence) {
    const checks = lesson.verify || {};
    const collected = historyEvidence(lesson,session.history || []);
    if (validEvidence(lesson,savedEvidence)) {
      collected.commands = collected.commands.map((value,i)=>value || savedEvidence.commands[i]);
      collected.pipelines = collected.pipelines.map((value,i)=>value || savedEvidence.pipelines[i]);
      collected.ordered = Math.max(collected.ordered,savedEvidence.ordered);
    }
    // A later successful change invalidates earlier post-change observations,
    // even when a caller supplies evidence captured before that latest change.
    const sequence=checks.orderedCommands || [];
    const traces=(session.history || []).flatMap(entry=>(entry.trace || []).map(trace=>({trace,code:entry.code})));
    sequence.forEach((c,index)=>{
      if (!c.restartOnRepeat) return;
      let last=-1;
      traces.forEach((entry,i)=>{if(matches(c,entry.trace,entry.code))last=i;});
      if(last<0)return;
      let allowed=index+1;
      for(const entry of traces.slice(last+1)) if(allowed<sequence.length && matches(sequence[allowed],entry.trace,entry.code))allowed++;
      collected.ordered=Math.min(collected.ordered,allowed);
    });
    const commands = collected.commands, pipelines = collected.pipelines;
    const ordered = collected.ordered === (checks.orderedCommands || []).length;
    const needsRecheck = !ordered && sequence.some((check,index) => check.restartOnRepeat && collected.ordered > index);
    const stateEntries = Object.entries(checks.state || {}).map(([path, expected]) => {
      let value = session;
      for (const key of path.split('.')) {
        if (!value || !Object.prototype.hasOwnProperty.call(value, key)) return {path, ok:false};
        value = value[key];
      }
      return {path, ok:value === expected};
    });
    const stateOk = stateEntries.every(entry => entry.ok);
    const cwd = !checks.cwd || norm(session.cwd) === norm(checks.cwd);
    const files = (checks.files || []).map(f => {
      const found = Object.values(session.files || {}).find(v => norm(v.path) === norm(f.path) && !v.dir);
      return !!found && arr(f.includes).every(v => String(found.content || '').includes(v));
    });
    const commandOk = commands.every(Boolean) && pipelines.every(Boolean) && cwd && files.every(Boolean) && ordered && stateOk;
    const answerOk = !lesson.question || answer === lesson.question.answer;
    const labels = checks.labels || {}, checklist = [];
    const add = (key, kind, label, ok) => checklist.push({key,kind,label:label || {ja:'課題の条件を満たす',en:'Meet the task requirement'},ok});
    const orderedRows = sequence.map((condition,index) => ({condition,index,ok:collected.ordered > index}));
    const conditionKey = condition => JSON.stringify(Object.fromEntries(Object.entries(condition).filter(([key])=>key!=='restartOnRepeat').sort(([a],[b])=>a.localeCompare(b))));
    (checks.commands || []).forEach((condition,index) => {
      const equivalent = orderedRows.filter(row=>conditionKey(row.condition)===conditionKey(condition) ||
        (labels.commands?.[index] && JSON.stringify(labels.commands[index])===JSON.stringify(labels.orderedCommands?.[row.index])));
      // Matching rules or identical authored labels describe the same observation. Keep a separate
      // command failure if older or inconsistent evidence does not establish it.
      if (equivalent.length && (commands[index] || equivalent.some(row=>!row.ok))) return;
      add('command-'+index,'command',labels.commands?.[index],commands[index]);
    });
    pipelines.forEach((ok,index)=>add('pipeline-'+index,'pipeline',labels.pipelines?.[index],ok));
    orderedRows.forEach(({index,ok})=>{
      const label = labels.orderedCommands?.[index];
      add('ordered-'+index,'ordered',label ? {ja:(index+1)+'. '+label.ja,en:(index+1)+'. '+label.en} : null,ok);
    });
    if (checks.cwd) add('cwd','cwd',labels.cwd,cwd);
    stateEntries.forEach(({path,ok})=>add('state-'+path,'state',labels.state?.[path],ok));
    files.forEach((ok,index)=>add('file-'+index,'file',labels.files?.[index],ok));
    if (lesson.question) add('answer','answer',{ja:'結果を読んで解釈の選択肢に正しく回答',en:'Read the results and choose the correct interpretation'},answerOk);
    return { ok: commandOk && answerOk, commandOk, answerOk, commands, pipelines, cwd, files, ordered, stateOk, needsRecheck, checklist };
  }
  function empty() {
    return { schema: 'windowsCLIroom.progress', version: VERSION, language: 'ja', activeId: '', completed: {}, checkpoints: {} };
  }
  function plain(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function checkpoint(raw, lesson) {
    if (!plain(raw) || !plain(raw.session)) throw new Error('Invalid checkpoint');
    const session = Shell.restoreSession(raw.session);
    if (typeof raw.input !== 'string' || raw.input.length > 4096) throw new Error('Invalid command input');
    const attempts = {incorrect:0, byChoice:{}};
    if (raw.attempts !== undefined) {
      if (!plain(raw.attempts) || !Number.isSafeInteger(raw.attempts.incorrect) || raw.attempts.incorrect < 0 || raw.attempts.incorrect > 1000000 || !plain(raw.attempts.byChoice)) throw new Error('Invalid answer attempts');
      attempts.incorrect = raw.attempts.incorrect;
      for (const [id,count] of Object.entries(raw.attempts.byChoice)) {
        if (!lesson?.question?.choices.some(ch=>ch.id===id) || !Number.isSafeInteger(count) || count < 0 || count > 1000000) throw new Error('Invalid choice attempts');
        attempts.byChoice[id]=count;
      }
    }
    const evidence = lesson ? (validEvidence(lesson,raw.evidence)
      ? {signature:raw.evidence.signature,commands:[...raw.evidence.commands],pipelines:[...raw.evidence.pipelines],ordered:raw.evidence.ordered}
      : historyEvidence(lesson,session.history)) : null;
    return { session, evidence, attempts, input: raw.input, answer: typeof raw.answer === 'string' ? raw.answer.slice(0, 100) : '',
      hintLevel: Number.isInteger(raw.hintLevel) ? Math.min(3, Math.max(0, raw.hintLevel)) : 0,
      solutionShown: raw.solutionShown === true };
  }
  function restore(raw) {
    if (!plain(raw) || raw.schema !== 'windowsCLIroom.progress' || raw.version !== VERSION ||
      !plain(raw.completed) || !plain(raw.checkpoints)) throw new Error('Unsupported progress file');
    const result = empty();
    result.language = raw.language === 'en' ? 'en' : 'ja';
    result.activeId = ids.has(raw.activeId) || raw.activeId === 'sandbox' ? raw.activeId : '';
    if (Object.keys(raw.completed).length > ids.size || Object.keys(raw.checkpoints).length > ids.size + 1) throw new Error('Too many lessons');
    for (const [id, value] of Object.entries(raw.completed)) {
      if (!ids.has(id) || !plain(value)) throw new Error('Unknown lesson');
      result.completed[id] = { at: typeof value.at === 'string' ? value.at.slice(0, 40) : '',
        hints: Number.isInteger(value.hints) ? Math.min(3, Math.max(0, value.hints)) : 0,
        solutionUsed: value.solutionUsed === true };
    }
    for (const [id, value] of Object.entries(raw.checkpoints)) {
      if (!ids.has(id) && id !== 'sandbox') throw new Error('Unknown lesson');
      result.checkpoints[id] = checkpoint(value,Data.lessons.find(l=>l.id===id));
    }
    return result;
  }
  function parse(text) {
    if (typeof text !== 'string' || text.length > MAX_IMPORT) throw new Error('Progress file too large');
    return restore(JSON.parse(text));
  }
  function fresh(lesson) {
    return { session: Shell.createSession(lesson ? lesson.session || {} : {}), evidence:lesson?.verify ? emptyEvidence(lesson) : null,
      attempts:{incorrect:0,byChoice:{}}, input: '', answer: '', hintLevel: 0, solutionShown: false };
  }
  return { VERSION, KEY, MAX_IMPORT, grade, observe, empty, restore, parse, fresh };
});
