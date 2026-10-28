(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./network.js'));
  else root.WCRShell = factory(root.WCRNetwork);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Network) {
  'use strict';

  const MAX_LINE = 4096, MAX_OUTPUT = 32768, MAX_FILE = 65536, MAX_FILES = 256, MAX_HISTORY = 2097152;
  const SCENARIOS = ['base', 'wifi-off', 'dns-wrong', 'dns-cache', 'proxy-mismatch', 'web-503', 'vpn-route', 'ad-policy', 'service-stopped', 'permission', 'system-corrupt'];
  const ALIASES = { chdir: 'cd', md: 'mkdir', rename: 'ren' };
  const DEFAULT_ENV = {
    USERNAME: 'student', USERDOMAIN: 'CORP', COMPUTERNAME: 'PC-014',
    USERPROFILE: 'C:\\Users\\student', HOMEDRIVE: 'C:', HOMEPATH: '\\Users\\student',
    SYSTEMROOT: 'C:\\Windows', WINDIR: 'C:\\Windows', TEMP: 'C:\\Users\\student\\AppData\\Local\\Temp',
    TMP: 'C:\\Users\\student\\AppData\\Local\\Temp', PATH: 'C:\\Windows\\System32;C:\\Windows',
    COMSPEC: 'C:\\Windows\\System32\\cmd.exe', PATHEXT: '.COM;.EXE;.BAT;.CMD'
  };
  const reference = [
    ['help', 'help [command]', '対応コマンドと使い方を表示', 'List supported commands or their syntax'],
    ['cls', 'cls', '端末の表示を消去', 'Clear the terminal display'],
    ['exit', 'exit', '教材の終了方法を案内', 'Explain how to leave the simulator'],
    ['echo', 'echo text', '文字列を表示（> と >> でファイルに記録）', 'Print text; use > or >> to save it'],
    ['cd', 'cd [/d] [path] | D:', '現在のフォルダーを表示・移動', 'Show or change the working directory'],
    ['dir', 'dir [path] [/a] [/b] [/s]', 'フォルダーの内容を表示', 'List files and directories'],
    ['type', 'type file [file ...]', 'テキストファイルの内容を表示', 'Display text file contents'],
    ['more', 'more [file] | command | more', 'テキストを表示（この演習ではページ分割なし）', 'Display text (without interactive pagination in this simulator)'],
    ['findstr', 'findstr [/i] [/n] [/l] [/c:"literal text"] pattern [file ...]', '文字列を含む行を抽出（リテラル検索のみ）', 'Filter matching lines; this simulator supports literal search only'],
    ['find', 'find [/i] [/n] [/c] "text" [file ...]', '文字列を含む行を表示・集計', 'Find text and optionally count matching lines'],
    ['mkdir', 'mkdir path [path ...]', 'フォルダーを作成', 'Create directories'],
    ['copy', 'copy [/y] source destination', 'ファイルをコピー', 'Copy one file; /y permits overwrite'],
    ['move', 'move [/y] source destination', 'ファイルを移動', 'Move one file; /y permits overwrite'],
    ['ren', 'ren file new-name', 'ファイル名を変更', 'Rename one file in the same directory'],
    ['set', 'set [variable-prefix]', '既知の環境変数を表示（代入は未対応）', 'Display known environment variables (assignment is unsupported)'],
    ['where', 'where command[.exe]', '演習に登録された実行ファイルの場所を表示', 'Locate simulated Windows executables'],
    ['ver', 'ver', 'Windows のバージョンを表示', 'Show the simulated Windows version'],
    ['systeminfo', 'systeminfo', 'OS、メモリ、ドメインなどの情報を表示', 'Show OS, memory, domain, and computer information'],
    ['hostname', 'hostname', 'コンピューター名を表示', 'Show the computer name'],
    ['whoami', 'whoami [/user | /groups | /all]', '現在のユーザーと所属グループを確認', 'Show the current identity and group membership'],
    ['tasklist', 'tasklist [/fi "PID eq number" | /fi "IMAGENAME eq name"]', 'プロセスと PID を表示', 'List processes and filter by PID or image name'],
    ['taskkill', 'taskkill /pid number | /im NotesApp.exe [/f]', '演習用アプリを終了', 'End the simulated exercise application'],
    ['sc', 'sc.exe query [Spooler] | sc.exe qc Spooler', 'サービスの状態・構成を表示', 'Inspect service status or configuration'],
    ['net', 'net start [Spooler] | net stop Spooler | net use', 'サービスとネットワーク接続を確認', 'Inspect services and network connections'],
    ['wevtutil', 'wevtutil qe System [/c:1..20] [/rd:true|false] [/f:text]', 'System イベントログを表示', 'Read simulated System events'],
    ['icacls', 'icacls path', 'アクセス許可を表示（変更は未対応）', 'Display access permissions (no modification)'],
    ['attrib', 'attrib [path]', 'ファイルの属性を表示（変更は未対応）', 'Display file attributes (no modification)'],
    ['fsutil', 'fsutil volume diskfree C:', 'ディスクの空き容量を表示', 'Show simulated disk space'],
    ['sfc', 'sfc /verifyonly | sfc /scannow', 'システムファイルを検証・修復（模擬演習）', 'Simulate system file verification or repair'],
    ['dism', 'DISM /Online /Cleanup-Image /CheckHealth | /ScanHealth | /RestoreHealth', 'Windows イメージを確認・修復（模擬演習）', 'Simulate Windows image checks or repair']
  ].map(([name, syntax, summaryJa, summaryEn]) => ({ name, syntax, summaryJa, summaryEn }));

  function bounded(value, limit = MAX_OUTPUT) { return value.length > limit ? value.slice(0, limit) + '\n[Simulator: output truncated]\n' : value; }
  function ok(stdout = '', effects = []) { return { stdout, stderr: '', code: 0, unsupported: false, effects }; }
  function fail(message, unsupported = false, code = 1) { return { stdout: '', stderr: message + (message.endsWith('\n') ? '' : '\n'), code, unsupported, effects: [] }; }
  function unsupported(name, detail = '') { return fail(`[Simulator] Unsupported ${name} syntax${detail ? ': ' + detail : ''}. Use help ${name} for the supported subset.`, true); }
  function canonical(name) { const n = name.toLowerCase().replace(/\.exe$/, ''); return ALIASES[n] || n; }
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function plain(value) { return value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
  function cleanString(value, limit, label) {
    if (typeof value !== 'string' || value.length > limit || /[\u0000]/.test(value)) throw new Error('Invalid ' + label);
    return value;
  }

  // Accept Japanese keyboard yen signs only at user-entered path boundaries.
  // Keep command text, search patterns, URLs and stored canonical paths intact.
  function inputPath(value) { return value.replace(/[\/\u00a5\uffe5]/g, '\\'); }

  // Advisory only: these characters may be intentional text or valid filename
  // characters. Never normalize them into executable syntax or change user data.
  function inputWarning(line, language = 'en') {
    if (typeof line !== 'string') return '';
    const chars = [...new Set(line.match(/[\uff01-\uff5e\u3000\u201c\u201d\u2018\u2019]/g) || [])];
    if (!chars.length) return '';
    const examples = chars.slice(0, 8).map(ch => ch === '\u3000' ? (language === 'ja' ? '全角スペース' : 'full-width space') : ch).join(' ');
    return language === 'ja'
      ? '[入力のヒント] 全角文字・スマート引用符（' + examples + '）が含まれています。コマンド名・区切り・引用符に使う文字は半角に直してください。本文やファイル名は自動変換しません。'
      : '[Input hint] Full-width characters or smart quotes (' + examples + ') are present. Use ASCII characters for command names, separators and quotes. Text and file names are not converted automatically.';
  }
  function singleQuoteHint(language) {
    return language === 'ja'
      ? '[入力のヒント] CMD では \' はパスを囲む引用符として使えません。空白を含むパス全体を半角の " で囲んでください。'
      : '[Input hint] Single quotes (\') do not group paths in CMD. Enclose the whole path containing spaces in ASCII double quotes (").';
  }

  function resolve(session, input) {
    cleanString(input, 512, 'path');
    if (!input) return session.cwd;
    if (/^\\\\/.test(input)) throw new Error('[Simulator] UNC filesystem paths are not implemented. Use net use to inspect the simulated share connection.');
    if (/[<>|?*\u0000-\u001f]/.test(input)) throw new Error('[Simulator] Wildcards or invalid characters are not supported in this path.');
    input = input.replace(/\//g, '\\');
    let absolute;
    if (/^[a-z]:/i.test(input)) {
      const drive = input[0].toUpperCase();
      if (!['C', 'D'].includes(drive)) throw new Error('The system cannot find the drive specified.');
      absolute = input[2] === '\\' ? drive + input.slice(1) : (session.pc.driveCwds[drive] || drive + ':\\') + '\\' + input.slice(2);
    } else absolute = input[0] === '\\' ? session.cwd.slice(0, 2) + input : session.cwd + '\\' + input;
    const parts = [];
    for (const part of absolute.slice(3).split('\\')) {
      if (!part || part === '.') continue;
      if (part === '..') { parts.pop(); continue; }
      if (part.includes(':') || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) throw new Error('[Simulator] Invalid or reserved Windows path component.');
      parts.push(part);
    }
    return absolute.slice(0, 3).toUpperCase() + parts.join('\\');
  }
  function parentPath(path) { return path.length <= 3 ? path : path.slice(0, path.lastIndexOf('\\')) || path.slice(0, 3); }
  function parent(path) { const p = parentPath(path); return /^[a-z]:$/i.test(p) ? p + '\\' : p; }
  function basename(path) { return path.slice(path.lastIndexOf('\\') + 1); }
  function get(session, path) { return session.files[path.toLowerCase()]; }
  function ensureParents(session, path) {
    if (path.length <= 3) return;
    const p = parent(path), existing = get(session, p);
    if (existing && !existing.dir) throw new Error('A file exists where a directory is required.');
    if (!existing) {
      ensureParents(session, p);
      if (Object.keys(session.files).length >= MAX_FILES - 1) throw new Error('[Simulator] The virtual filesystem is full.');
      session.files[p.toLowerCase()] = { path: p, dir: true, content: '' };
    }
  }
  function permitted(session, path) {
    if (session.scenario === 'permission' && (path.toLowerCase() === 'c:\\lab\\shared files' || path.toLowerCase().startsWith('c:\\lab\\shared files\\'))) throw new Error('Access is denied. The Shared Files folder is read-only in this scenario.');
  }
  function write(session, path, content, append = false) {
    permitted(session, path);
    const p = get(session, parent(path)), existing = get(session, path);
    if (!p || !p.dir) throw new Error('The system cannot find the path specified.');
    if (existing && existing.dir) throw new Error('Access is denied. The destination is a directory.');
    content = (append && existing ? existing.content : '') + content;
    if (content.length > MAX_FILE) throw new Error('[Simulator] The virtual file exceeds the 64 KiB text limit.');
    if (!existing && Object.keys(session.files).length >= MAX_FILES) throw new Error('[Simulator] The virtual filesystem is full.');
    if (Object.values(session.files).reduce((sum, f) => sum + f.content.length, 0) - (existing?.content.length || 0) + content.length > 1048576) throw new Error('[Simulator] The virtual filesystem text limit has been reached.');
    session.files[path.toLowerCase()] = { path: existing ? existing.path : path, dir: false, content };
  }
  function read(session, path) {
    const file = get(session, path);
    if (!file) throw new Error('The system cannot find the file specified.');
    if (file.dir) throw new Error('Access is denied. A file path is required: ' + path);
    return file.content;
  }

  function createSession(config = {}) {
    const scenario = SCENARIOS.includes(config.scenario) ? config.scenario : 'base';
    const session = {
      version: 1, cwd: 'C:\\Users\\student', scenario, files: Object.create(null), env: Object.assign(Object.create(null), DEFAULT_ENV),
      machine: { hostname: 'PC-014', domain: 'CORP', username: 'student' },
      pc: { driveCwds: { C: 'C:\\Users\\student', D: 'D:\\' }, spoolerRunning: scenario !== 'service-stopped', appRunning: true, systemCorrupt: scenario === 'system-corrupt', imageCorrupt: scenario === 'system-corrupt' },
      net: Network.seed(scenario), history: []
    };
    const dirs = ['C:\\', 'D:\\', 'C:\\Users\\student', 'C:\\Users\\student\\Documents', 'C:\\Users\\student\\Desktop', DEFAULT_ENV.TEMP, 'C:\\Lab', 'C:\\Lab\\Logs', 'C:\\Lab\\Reports', 'C:\\Lab\\Shared Files', 'D:\\Support'];
    for (const path of dirs) { ensureParents(session, path); session.files[path.toLowerCase()] = { path, dir: true, content: '' }; }
    const files = [
      { path: 'C:\\Lab\\readme.txt', content: 'PC-014 support notes\nContact: helpdesk\n' },
      { path: 'C:\\Lab\\Logs\\app.log', content: '09:00 INFO Application started\n09:03 ERROR Printer service unavailable\n09:05 INFO Retry scheduled\n09:08 ERROR Print job failed\n' },
      { path: 'C:\\Lab\\Shared Files\\guide.txt', content: 'Team support guide\nCheck the configuration before changing it.\n' },
      { path: 'C:\\Lab\\devices.csv', content: 'Name,Department,FreeGB\nPC-014,Sales,8\nPC-021,Support,42\nPC-032,Sales,5\n' },
      { path: 'D:\\Support\\ticket.txt', content: 'Ticket 1042\nShared folder cannot be opened.\n' }
    ];
    if (config.files !== undefined && (!Array.isArray(config.files) || config.files.length > 100)) throw new Error('Invalid seed files');
    for (const file of files.concat(config.files || [])) {
      if (!plain(file)) throw new Error('Invalid seed file');
      if (file.dir !== undefined && typeof file.dir !== 'boolean') throw new Error('Invalid seed file type');
      const path = resolve(session, file.path);
      const content = file.dir ? '' : cleanString(file.content === undefined ? '' : file.content, MAX_FILE, 'seed content');
      if (get(session, path) && get(session, path).dir !== Boolean(file.dir)) throw new Error('Seed file conflicts with an existing directory or file');
      ensureParents(session, path);
      session.files[path.toLowerCase()] = { path, dir: Boolean(file.dir), content };
    }
    if (Object.keys(session.files).length > MAX_FILES || Object.values(session.files).reduce((sum, f) => sum + f.content.length, 0) > 1048576) throw new Error('Seed files exceed the simulator limits');
    if (config.cwd) {
      const cwd = resolve(session, config.cwd);
      if (!get(session, cwd) || !get(session, cwd).dir) throw new Error('Invalid initial working directory');
      session.cwd = get(session, cwd).path;
      session.pc.driveCwds[session.cwd[0]] = session.cwd;
    }
    return session;
  }

  function parse(line, env) {
    const segments = []; let tokens = [], word = '', hasWord = false, quoted = false, redir = null;
    function flush() { if (hasWord) { tokens.push(word); word = ''; hasWord = false; } }
    function finish() {
      flush();
      if (!tokens.length) throw new Error('[Simulator] A command is required on each side of a pipe.');
      if (redir && !redir.path) throw new Error('[Simulator] Redirection needs one destination file.');
      segments.push({ tokens, redir }); tokens = []; redir = null;
    }
    for (let i = 0; i < line.length; i++) {
      let c = line[i];
      if (c === '"') { quoted = !quoted; hasWord = true; continue; }
      if (!quoted && /[&<^()]/.test(c)) throw new Error('[Simulator] Chaining (&, &&), input/stderr redirection, escaping (^), and command groups are not supported. Run one command or a pipe at a time.');
      if (!quoted && (c === '|' || c === '>')) {
        flush();
        if (c === '|') {
          if (line[i + 1] === '|') throw new Error('[Simulator] Conditional chaining (||) is not supported.');
          if (redir) throw new Error('[Simulator] Put output redirection at the end of the pipeline.');
          finish(); continue;
        }
        if (redir) throw new Error('[Simulator] Only one output redirection per command is supported.');
        if (tokens.length && /^\d$/.test(tokens[tokens.length - 1]) && i > 0 && /\d/.test(line[i - 1])) throw new Error('[Simulator] Numbered stream redirection is not supported.');
        redir = { append: line[i + 1] === '>', path: null, tokenIndex: tokens.length };
        if (redir.append) i++;
        continue;
      }
      if (!quoted && /[ \t]/.test(c)) { flush(); continue; }
      word += c; hasWord = true;
    }
    if (quoted) throw new Error('[Simulator] A closing double quote is missing.');
    flush();
    if (redir) {
      if (tokens.length !== redir.tokenIndex + 1) throw new Error('[Simulator] Use a single file path after > or >>, at the end of the command.');
      redir.path = tokens.pop(); delete redir.tokenIndex;
    }
    if (tokens.length || segments.length || redir) finish();
    for (const segment of segments) {
      if (segments.length > 16 || segment.tokens.length > 256) throw new Error('[Simulator] A command line may have at most 16 pipeline stages and 256 arguments.');
      segment.tokens = segment.tokens.map(token => token.replace(/%([^%]+)%/g, (whole, key) => own(env, key.toUpperCase()) ? env[key.toUpperCase()] : whole));
      if (segment.redir) segment.redir.path = segment.redir.path.replace(/%([^%]+)%/g, (whole, key) => own(env, key.toUpperCase()) ? env[key.toUpperCase()] : whole);
      // A small explicit set of CMD's compact command spellings. Keep unknown
      // executable names intact, and record normalized arguments for grading.
      const compact = /^(cd|chdir)(\.\.|[\\\u00a5\uffe5].*)$/i.exec(segment.tokens[0]) || /^(dir|ipconfig)(\/.*)$/i.exec(segment.tokens[0]);
      if (compact) segment.tokens.splice(0, 1, compact[1], compact[2]);
    }
    return segments;
  }

  function noArgs(name, args, output) { return args.length ? unsupported(name) : ok(output); }
  function filesFromArgs(session, args, stdin, pathOf = input => resolve(session, input)) {
    if (!args.length) return [{ path: '', content: stdin }];
    return args.map(arg => { const path = pathOf(arg); return { path, content: read(session, path) }; });
  }
  function searchLines(session, name, args, stdin, pathOf) {
    let ignoreCase = false, numbers = false, count = false, pattern = null, files = [], literal = false;
    for (const arg of args) {
      const lower = arg.toLowerCase();
      if (lower === '/i') ignoreCase = true;
      else if (lower === '/n') numbers = true;
      else if (name === 'find' && lower === '/c') count = true;
      else if (name === 'findstr' && lower === '/l') literal = true;
      else if (name === 'findstr' && lower.startsWith('/c:')) { if (pattern !== null) return unsupported(name, 'multiple patterns'); pattern = arg.slice(3); literal = true; }
      else if (arg.startsWith('/')) return unsupported(name, arg);
      else if (pattern === null) pattern = arg;
      else files.push(arg);
    }
    if (pattern === null || pattern === '') return unsupported(name, 'a nonempty search string is required');
    if (name === 'findstr' && !literal && /[.*^$\[\]\\]/.test(pattern)) return unsupported(name, 'regular expressions are not implemented; use /l or /c: for literal text');
    const patterns = name === 'findstr' && !literal ? pattern.split(/ +/).filter(Boolean) : [pattern];
    const normalized = patterns.map(p => ignoreCase ? p.toLowerCase() : p);
    let output = '', total = 0;
    for (const file of filesFromArgs(session, files, stdin, pathOf)) {
      const lines = file.content.split(/\r?\n/); if (lines[lines.length - 1] === '') lines.pop();
      const matches = [];
      lines.forEach((line, i) => {
        const haystack = ignoreCase ? line.toLowerCase() : line;
        if (normalized.some(p => haystack.includes(p))) matches.push((numbers && !count ? (name === 'find' ? '[' + (i + 1) + ']' : (i + 1) + ':') : '') + line);
      });
      total += matches.length;
      if (name === 'find' && file.path) output += '\n---------- ' + file.path.toUpperCase() + (count ? ': ' + matches.length + '\n' : '\n');
      if (count) { if (!file.path) output += matches.length + '\n'; }
      else output += matches.map(line => name === 'findstr' && files.length > 1 ? file.path + ':' + line : line).join('\n') + (matches.length ? '\n' : '');
    }
    return { ...ok(output), code: total ? 0 : 1 };
  }
  function taskRows(session) {
    return [['System', 4, 'Services', 0, '128 K'], ['svchost.exe', 1080, 'Services', 0, '24,832 K'], ...(session.pc.spoolerRunning ? [['spoolsv.exe', 1880, 'Services', 0, '12,448 K']] : []), ['msedge.exe', 4240, 'Console', 1, '182,400 K'], ...(session.pc.appRunning ? [['NotesApp.exe', 4320, 'Console', 1, '48,256 K']] : [])];
  }
  function serviceQuery(session) {
    return 'SERVICE_NAME: Spooler\n        TYPE               : 110  WIN32_OWN_PROCESS (interactive)\n        STATE              : ' + (session.pc.spoolerRunning ? '4  RUNNING\n                                (STOPPABLE, NOT_PAUSABLE, ACCEPTS_SHUTDOWN)' : '1  STOPPED') + '\n        WIN32_EXIT_CODE    : 0  (0x0)\n        SERVICE_EXIT_CODE  : 0  (0x0)\n        CHECKPOINT         : 0x0\n        WAIT_HINT          : 0x0\n';
  }

  function execute(session, name, args, stdin, context) {
    const language = context.language;
    // Record operands where the implementation actually uses them. Text, search
    // patterns, options, and shell redirection targets must not become evidence
    // that a command inspected a particular file.
    const pathOf = (input, fromInput = true) => {
      let resolved;
      try { resolved = resolve(session, fromInput ? inputPath(input) : input); }
      catch (error) { if (fromInput && (/^'/.test(input) || /'$/.test(input))) throw new Error(singleQuoteHint(language)); throw error; }
      const path = get(session, resolved)?.path || resolved;
      context.resolvedPaths.push(path);
      return path;
    };
    const lower = args.map(a => a.toLowerCase());
    if (args.some(a => /^\/\?$/.test(a))) {
      if (args.length !== 1) return unsupported(name);
      return commandHelp(name, language);
    }
    switch (name) {
      case 'help': return args.length > 1 ? unsupported(name) : args.length ? commandHelp(canonical(args[0]), language) : ok((language === 'ja' ? 'windowsCLIroom — 対応する Windows CMD コマンド\n\n' : 'windowsCLIroom — supported Windows CMD subset\n\n') + allReferences().map(r => r.name.padEnd(12) + (language === 'ja' ? r.summaryJa : r.summaryEn)).join('\n') + (language === 'ja' ? '\n\nhelp コマンド名 で対応書式を表示します。空白を含むパスは二重引用符で囲みます。\n| はテキストを次へ渡し、> は上書き、>> は追記します。\n一覧にある機能だけのシミュレーターです。実際の PC には影響しません。\n' : '\n\nUse help command for syntax. Double quotes group paths; | pipes text; > overwrites and >> appends.\nOnly the listed subset is simulated; no command affects your real computer.\n'));
      case 'cls': return args.length ? unsupported(name) : ok('', ['clear']);
      case 'exit': return args.length ? unsupported(name, 'use exit without arguments for the simulator guidance') : ok(language === 'ja'
        ? 'この教材では exit は不要です。終了するときはページを閉じてください。進捗は自動保存され、メニューから書き出すこともできます。\n'
        : 'You do not need exit in this simulator. Close the page when finished. Progress is autosaved, and you can export it from the menu.\n');
      case 'echo': return !args.length ? ok('ECHO is on.\n') : ['on', 'off'].includes(lower[0]) && args.length === 1 ? unsupported(name, 'echo on/off shell settings') : ok(args.join(' ') + '\n');
      case 'echo.': return args.length ? unsupported(name) : ok('\n');
      case 'cd': {
        let changeDrive = false;
        if (lower[0] === '/d') { changeDrive = true; args = args.slice(1); }
        if (!args.length) return changeDrive ? unsupported(name) : ok(pathOf(session.cwd, false) + '\n');
        if (args.length !== 1 || args[0].startsWith('/')) return unsupported(name);
        const path = pathOf(args[0]), target = get(session, path);
        if (!target || !target.dir) return fail('The system cannot find the path specified.');
        session.pc.driveCwds[path[0]] = target.path;
        if (path[0] === session.cwd[0] || changeDrive) session.cwd = target.path;
        return ok('', ['cwd:' + session.cwd]);
      }
      case 'dir': {
        const options = new Set(), paths = [];
        for (const arg of args) { if (arg.startsWith('/')) options.add(arg.toLowerCase()); else paths.push(arg); }
        if (paths.length > 1 || [...options].some(o => !['/a', '/b', '/s'].includes(o))) return unsupported(name);
        const path = pathOf(paths[0] || session.cwd, paths.length > 0), target = get(session, path);
        if (!target) return fail('File Not Found');
        let files = target.dir ? Object.values(session.files).filter(f => f.path.toLowerCase() !== path.toLowerCase() && (options.has('/s') ? f.path.toLowerCase().startsWith(path.toLowerCase().replace(/\\$/, '') + '\\') : parent(f.path).toLowerCase() === path.toLowerCase())) : [target];
        files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
        if (options.has('/b')) return ok(files.map(f => options.has('/s') ? f.path : basename(f.path)).join('\n') + (files.length ? '\n' : ''));
        return ok(' Volume in drive ' + path[0] + ' is ' + (path[0] === 'C' ? 'Windows' : 'Support') + '\n Directory of ' + path + '\n\n' + files.map(f => '10/28/2026  09:00 AM    ' + (f.dir ? '<DIR>         ' : String(f.content.length).padStart(14) + ' ') + (options.has('/s') ? f.path : basename(f.path))).join('\n') + '\n' + files.filter(f => !f.dir).length + ' File(s)\n' + files.filter(f => f.dir).length + ' Dir(s)\n');
      }
      case 'type':
        if (!args.length || args.some(a => a.startsWith('/'))) return unsupported(name);
        try { return ok(filesFromArgs(session, args, stdin, pathOf).map(f => f.content).join('')); }
        catch (error) { return fail(args.some(arg => /^'|'$/.test(arg)) ? singleQuoteHint(language) : error.message); }
      case 'more':
        if (args.length > 1 || args.some(a => a.startsWith('/'))) return unsupported(name);
        return ok(filesFromArgs(session, args, stdin, pathOf).map(f => f.content).join(''));
      case 'find': case 'findstr': return searchLines(session, name, args, stdin, pathOf);
      case 'mkdir': {
        if (!args.length || args.some(a => a.startsWith('/'))) return unsupported(name);
        const paths = args.map(a => pathOf(a));
        for (const path of paths) {
          permitted(session, path);
          if (get(session, path)) return fail('A subdirectory or file ' + path + ' already exists.');
          if (Object.keys(session.files).length >= MAX_FILES - 10) return fail('[Simulator] The virtual filesystem is full.');
          ensureParents(session, path); session.files[path.toLowerCase()] = { path, dir: true, content: '' };
        }
        return ok('', paths.map(p => 'mkdir:' + p));
      }
      case 'copy': case 'move': case 'ren': {
        let overwrite = false;
        if (lower[0] === '/y' && name !== 'ren') { overwrite = true; args = args.slice(1); }
        if (args.length !== 2 || args.some(a => a.startsWith('/'))) return unsupported(name);
        const source = pathOf(args[0]), file = get(session, source);
        if (!file) return fail('The system cannot find the file specified.');
        if (file.dir) return unsupported(name, 'directory operations');
        if (name === 'ren' && /[\\/:]/.test(inputPath(args[1]))) return unsupported(name, 'the new name must not contain a path');
        let destination = resolve(session, name === 'ren' ? parent(source) + '\\' + args[1] : inputPath(args[1]));
        const target = get(session, destination);
        if (name === 'ren' && target?.dir) return fail(language === 'ja'
          ? '同じ名前のフォルダーが既に存在します。ren はフォルダーへ移動できません。移動には move を使ってください。'
          : 'A directory with this name already exists. ren cannot move files into a directory; use move.');
        if (target && target.dir) destination = resolve(session, destination + '\\' + basename(source));
        destination = pathOf(destination, false);
        if (source.toLowerCase() === destination.toLowerCase()) return fail('The source and destination are the same file.');
        if (get(session, destination) && !overwrite) return fail('[Simulator] Destination already exists. Use /y to overwrite with copy or move.');
        if (name !== 'copy') permitted(session, source);
        write(session, destination, file.content);
        if (name !== 'copy') delete session.files[source.toLowerCase()];
        return ok(name === 'ren' ? '' : '        1 file(s) ' + (name === 'copy' ? 'copied.' : 'moved.') + '\n', [name + ':' + source + '=>' + destination]);
      }
      case 'set': {
        if (args.length > 1 || args.some(a => a.startsWith('/') || a.includes('='))) return unsupported(name, 'display only');
        const prefix = (args[0] || '').toUpperCase(), keys = Object.keys(session.env).filter(k => k.startsWith(prefix)).sort();
        return keys.length ? ok(keys.map(k => k + '=' + session.env[k]).join('\n') + '\n') : fail('Environment variable ' + (args[0] || '') + ' not defined');
      }
      case 'where': {
        if (args.length !== 1 || /[\\/:*?]/.test(args[0])) return unsupported(name);
        const executable = canonical(args[0]);
        const internal = ['help', 'cls', 'exit', 'echo', 'cd', 'dir', 'type', 'mkdir', 'copy', 'move', 'ren', 'set', 'ver'];
        if (internal.includes(executable) || !allReferences().some(r => r.name === executable)) return fail('INFO: Could not find files for the given pattern(s).');
        return ok('C:\\Windows\\System32\\' + executable + '.exe\n');
      }
      case 'ver': return noArgs(name, args, 'Microsoft Windows [Version 10.0.26100.0]\n');
      case 'hostname': return noArgs(name, args, session.machine.hostname + '\n');
      case 'systeminfo': return noArgs(name, args, 'Host Name:                 PC-014\nOS Name:                   Microsoft Windows 11 Pro\nOS Version:                10.0.26100 Build 26100\nSystem Manufacturer:       Room Virtual PC\nSystem Type:               x64-based PC\nSystem Boot Time:          10/28/2026, 8:30:00 AM\nTotal Physical Memory:     16,384 MB\nAvailable Physical Memory: 7,420 MB\nDomain:                    corp.example\nLogon Server:              \\\\DC01\nNetwork Card(s):            ' + (session.net.vpn.connected ? '2' : '1') + ' NIC(s) Installed.\n                           [01]: Virtual Wi-Fi Adapter\n' + (session.net.vpn.connected ? '                           [02]: CORP-VPN\n' : ''));
      case 'whoami': {
        const user = 'USER INFORMATION\n----------------\nUser Name     SID\n============= =============================================\ncorp\\student  S-1-5-21-1100000000-2200000000-3300000000-1104\n';
        const groups = 'GROUP INFORMATION\n-----------------\nGroup Name               Type            SID\n======================== =============== ================================\nEveryone                 Well-known group S-1-1-0\nBUILTIN\\Users            Alias           S-1-5-32-545\nCORP\\Domain Users        Group           S-1-5-21-1100000000-2200000000-3300000000-513\n';
        if (!args.length) return ok('corp\\student\n');
        if (args.length !== 1) return unsupported(name);
        return lower[0] === '/user' ? ok(user) : lower[0] === '/groups' ? ok(groups) : lower[0] === '/all' ? ok(user + '\n' + groups + '\nPRIVILEGES INFORMATION\nSeChangeNotifyPrivilege    Bypass traverse checking    Enabled\n') : unsupported(name);
      }
      case 'tasklist': {
        let rows = taskRows(session);
        if (args.length) {
          if (args.length !== 2 || lower[0] !== '/fi') return unsupported(name);
          const match = /^(pid|imagename) eq (.+)$/i.exec(args[1]);
          if (!match || (match[1].toLowerCase() === 'pid' && !/^\d+$/.test(match[2]))) return unsupported(name, 'supported filters: PID eq number, IMAGENAME eq name');
          rows = rows.filter(r => match[1].toLowerCase() === 'pid' ? r[1] === Number(match[2]) : r[0].toLowerCase() === match[2].toLowerCase());
        }
        if (!rows.length) return ok('INFO: No tasks are running which match the specified criteria.\n');
        return ok('Image Name                     PID Session Name        Session#    Mem Usage\n========================= ======== ================ =========== ============\n' + rows.map(r => r[0].padEnd(25) + String(r[1]).padStart(9) + ' ' + r[2].padEnd(16) + String(r[3]).padStart(11) + ' ' + r[4].padStart(12)).join('\n') + '\n');
      }
      case 'taskkill': {
        // /f is the documented force flag; the exercise application otherwise
        // responds cooperatively to the termination request. Real apps may not.
        // https://learn.microsoft.com/windows-server/administration/windows-commands/taskkill
        const opts = args.filter(a => a.toLowerCase() !== '/f');
        if (opts.length !== 2 || !['/pid', '/im'].includes(opts[0].toLowerCase()) || args.length > 3 || (opts[0].toLowerCase() === '/pid' && !/^\d+$/.test(opts[1]))) return unsupported(name);
        const row = taskRows(session).find(r => opts[0].toLowerCase() === '/pid' ? r[1] === Number(opts[1]) : r[0].toLowerCase() === opts[1].toLowerCase());
        if (!row) return fail('ERROR: The process was not found.', false, 128);
        if (row[1] !== 4320) return fail('[Simulator] Only the exercise application NotesApp.exe (PID 4320) can be terminated. Other processes are protected in this room.', true);
        session.pc.appRunning = false;
        const forced = lower.includes('/f');
        return ok(forced ? 'SUCCESS: The process with PID 4320 has been terminated.\n' : 'SUCCESS: Sent termination signal to the process with PID 4320.\n', ['taskkill:4320']);
      }
      case 'sc': {
        if (!['query', 'qc'].includes(lower[0]) || args.length > 2 || (lower[0] === 'qc' && args.length !== 2)) return unsupported(name);
        if (args[1] && lower[1] !== 'spooler') return fail('[SC] OpenService FAILED 1060:\nThe specified service does not exist as an installed service in this simulator.');
        return lower[0] === 'query' ? ok(serviceQuery(session)) : ok('[SC] QueryServiceConfig SUCCESS\n\nSERVICE_NAME: Spooler\n        TYPE               : 110  WIN32_OWN_PROCESS (interactive)\n        START_TYPE         : 2   AUTO_START\n        ERROR_CONTROL      : 1   NORMAL\n        BINARY_PATH_NAME   : C:\\Windows\\System32\\spoolsv.exe\n        LOAD_ORDER_GROUP   : SpoolerGroup\n        DISPLAY_NAME       : Print Spooler\n        DEPENDENCIES       : RPCSS\n        SERVICE_START_NAME : LocalSystem\n');
      }
      case 'net': {
        if (!['start', 'stop'].includes(lower[0])) break;
        if (lower[0] === 'start' && args.length === 1) return ok('These Windows services are started:\n\n   Remote Procedure Call (RPC)\n' + (session.pc.spoolerRunning ? '   Print Spooler\n' : '') + '\nThe command completed successfully.\n');
        if (args.length !== 2) return unsupported(name);
        if (!['spooler', 'print spooler'].includes(lower[1])) return fail('The service name is invalid in this simulator.');
        const start = lower[0] === 'start';
        if (session.pc.spoolerRunning === start) return fail(start ? 'The requested service has already been started.' : 'The Print Spooler service is not started.', false, 2);
        session.pc.spoolerRunning = start;
        // Two-stage NET output illustrated by Microsoft troubleshooting guidance:
        // https://learn.microsoft.com/troubleshoot/developer/webapps/iis/www-administration-management/using-iisreset-restart-iis-result-error
        return ok('The Print Spooler service is ' + (start ? 'starting' : 'stopping') + '.\nThe Print Spooler service was ' + (start ? 'started' : 'stopped') + ' successfully.\n', ['spooler:' + (start ? 'running' : 'stopped')]);
      }
      case 'wevtutil': {
        if (args.length < 2 || lower[0] !== 'qe' || lower[1] !== 'system') return unsupported(name);
        let count = 3, reverse = false; const seen = new Set();
        for (const arg of lower.slice(2)) {
          const key = arg.split(':')[0]; if (seen.has(key)) return unsupported(name, 'duplicate option'); seen.add(key);
          if (/^\/c:(?:[1-9]|1\d|20)$/.test(arg)) count = Number(arg.slice(3));
          else if (/^\/rd:(true|false)$/.test(arg)) reverse = arg.endsWith('true');
          else if (arg !== '/f:text') return unsupported(name, arg);
        }
        const events = [
          { id: 6005, level: 'Information', time: '08:30:00', text: 'The Event log service was started.' },
          { id: 7036, level: 'Information', time: '09:00:00', text: 'The Print Spooler service entered the running state.' },
          { id: 7036, level: 'Information', time: '09:03:00', text: session.pc.spoolerRunning ? 'The Print Spooler service entered the running state.' : 'The Print Spooler service entered the stopped state.' }
        ];
        if (reverse) events.reverse();
        return ok(events.slice(0, count).map((e, i) => 'Event[' + i + ']:\n  Log Name: System\n  Source: ' + (e.id === 6005 ? 'EventLog' : 'Service Control Manager') + '\n  Date: 2026-10-28T' + e.time + '.000\n  Event ID: ' + e.id + '\n  Level: ' + e.level + '\n  Computer: PC-014.corp.example\n  Description:\n' + e.text).join('\n\n') + '\n');
      }
      case 'icacls': {
        if (!args.length || args.some(arg => arg.startsWith('/'))) return unsupported(name, 'display only');
        if (args.length > 1) {
          const path = pathOf(args[0]);
          const hint = language === 'ja' ? '[入力のヒント] 空白を含むパス全体を半角の " で囲んでください。' : '[Input hint] Enclose the whole path containing spaces in ASCII double quotes (").';
          return fail((get(session, path) ? '[Simulator] icacls accepts one path in this room.' : path + ': The system cannot find the file specified.') + '\n' + hint);
        }
        const path = pathOf(args[0]), file = get(session, path); if (!file) return fail('The system cannot find the file specified.');
        // (I): inherited ACE; (OI)/(CI): inherit to files/subfolders. The restricted
        // folder has an explicit student entry and inherited administrative entries.
        // https://learn.microsoft.com/windows-server/administration/windows-commands/icacls
        const restrictedRoot = session.scenario === 'permission' && path.toLowerCase() === 'c:\\lab\\shared files';
        const restricted = restrictedRoot || (session.scenario === 'permission' && path.toLowerCase().startsWith('c:\\lab\\shared files\\'));
        const flags = (restrictedRoot ? '' : '(I)') + (file.dir ? '(OI)(CI)' : '');
        const inheritedFlags = '(I)' + (file.dir ? '(OI)(CI)' : '');
        return ok(path + ' NT AUTHORITY\\SYSTEM:' + inheritedFlags + '(F)\n' + ' '.repeat(Math.min(path.length + 1, 50)) + 'BUILTIN\\Administrators:' + inheritedFlags + '(F)\n' + ' '.repeat(Math.min(path.length + 1, 50)) + 'CORP\\student:' + flags + '(' + (restricted ? 'RX' : 'M') + ')\nSuccessfully processed 1 files; Failed processing 0 files\n');
      }
      case 'attrib': {
        if (args.length > 1 || args.some(a => /^[/+-]/.test(a))) return unsupported(name, 'display only');
        const path = pathOf(args[0] || session.cwd, args.length > 0), file = get(session, path); if (!file) return fail('File not found - ' + path);
        const files = file.dir ? Object.values(session.files).filter(f => !f.dir && parent(f.path).toLowerCase() === path.toLowerCase()) : [file];
        return ok(files.map(f => 'A                    ' + f.path).join('\n') + (files.length ? '\n' : ''));
      }
      case 'fsutil': {
        if (!(args.length === 3 && lower[0] === 'volume' && lower[1] === 'diskfree' && /^[cd]:\\?$/i.test(inputPath(args[2])))) return unsupported(name);
        pathOf(args[2].slice(0, 2) + '\\');
        // Windows versions/filesystems can expose additional fields. Keep the
        // teaching excerpt explicit; these are fictional volume/quota values.
        // https://learn.microsoft.com/windows-server/administration/windows-commands/fsutil-volume
        const free = args[2][0].toLowerCase() === 'c' ? '8,589,934,592 (8.0 GB)' : '45,097,156,608 (42.0 GB)';
        return ok('[Simulator] Illustrative Windows 11 output (excerpt).\nTotal free bytes        : ' + free + '\nTotal bytes             : 274,877,906,944 (256.0 GB)\nTotal quota free bytes  : ' + free + '\n');
      }
      case 'sfc': {
        if (args.length !== 1 || !['/verifyonly', '/scannow'].includes(lower[0])) return unsupported(name);
        let result = 'Windows Resource Protection did not find any integrity violations.';
        const effects = [];
        if (session.pc.systemCorrupt) {
          if (lower[0] === '/verifyonly') result = 'Windows Resource Protection found integrity violations. Details are included in the CBS.Log.';
          else { result = 'Windows Resource Protection found corrupt files and successfully repaired them.'; session.pc.systemCorrupt = false; effects.push('system:repaired'); }
        }
        return ok('[Simulator] System file ' + (lower[0] === '/verifyonly' ? 'verification' : 'repair') + ' only; no real system files are accessed.\nVerification 100% complete.\n\n' + result + '\n', effects);
      }
      case 'dism': {
        if (args.length !== 3 || !lower.includes('/online') || !lower.includes('/cleanup-image') || lower.filter(a => ['/checkhealth', '/scanhealth', '/restorehealth'].includes(a)).length !== 1) return unsupported(name);
        const mode = lower.find(a => ['/checkhealth', '/scanhealth', '/restorehealth'].includes(a)), effects = [];
        let health = session.pc.imageCorrupt ? 'The component store is repairable.' : 'No component store corruption detected.';
        if (mode === '/restorehealth') { session.pc.imageCorrupt = false; health = 'The restore operation completed successfully.'; effects.push('image:repaired'); }
        return ok('[Simulator] Windows image ' + (mode === '/restorehealth' ? 'repair' : 'check') + ' only; no real image is accessed.\nDeployment Image Servicing and Management tool\nVersion: 10.0.26100.0\n\n' + health + '\nThe operation completed successfully.\n', effects);
      }
      default: if (/^[cd]:$/.test(name)) {
        if (args.length) return unsupported(name);
        session.cwd = pathOf(session.pc.driveCwds[name[0].toUpperCase()] || name[0].toUpperCase() + ':\\', false);
        return ok('', ['cwd:' + session.cwd]);
      }
    }
    const delegated = Network.run(session, name, args, stdin);
    if (delegated) return delegated;
    return fail("'" + name + "' is not recognized as a supported command in windowsCLIroom. Type help to see the supported commands.", true, 9009);
  }

  function allReferences() {
    const refs = reference.concat(Network.reference || []), seen = new Set();
    return refs.filter(ref => { if (seen.has(ref.name)) return false; seen.add(ref.name); return true; });
  }
  function commandHelp(name, language = 'en') {
    const ref = allReferences().find(r => r.name === name);
    return ref ? ok(ref.syntax + '\n\n' + (language === 'ja' ? ref.summaryJa + '\n\n[シミュレーター] 記載した書式の範囲に対応しています。\n' : ref.summaryEn + '\n\n[Simulator] Only this documented subset is implemented.\n')) : fail(language === 'ja' ? '[シミュレーター] ' + name + ' のヘルプはありません。' : '[Simulator] No help is available for ' + name + '.', true);
  }

  function run(session, line, options = {}) {
    const language = options?.language === 'ja' ? 'ja' : 'en';
    let result = { stdout: '', stderr: '', code: 0, unsupported: false, trace: [], effects: [] };
    if (typeof line !== 'string' || line.length > MAX_LINE || /[\r\n\u0000]/.test(line)) {
      return { ...result, ...fail('[Simulator] Enter one command line of at most 4096 characters.') };
    }
    if (!/[^ \t]/.test(line)) return result;
    const warning = inputWarning(line, language);
    let segments;
    try { segments = parse(line, session.env); } catch (error) { result = { ...result, ...fail(error.message, true) }; }
    if (segments) {
      let stdin = '';
      for (const segment of segments) {
        const command = segment.tokens[0], name = canonical(command), args = segment.tokens.slice(1);
        const cwd = session.cwd, context = { language, resolvedPaths: [] };
        let answer, outputMetadata = {};
        try {
          let outputPath;
          if (segment.redir) {
            outputPath = resolve(session, inputPath(segment.redir.path));
            // Validate the destination before executing a command that may change state.
            permitted(session, outputPath);
            if (!get(session, parent(outputPath)) || !get(session, parent(outputPath)).dir || (get(session, outputPath) && get(session, outputPath).dir)) throw new Error('The output destination is not a writable file path.');
          }
          answer = execute(session, name, args, stdin, context);
          answer = { ...ok(), ...answer };
          if (answer.writeFile && answer.code === 0) {
            const path = resolve(session, inputPath(answer.writeFile.path));
            write(session, path, cleanString(answer.writeFile.content, MAX_FILE, 'command output'));
            answer.effects = (answer.effects || []).concat('write:' + path);
          }
          if (segment.redir) {
            write(session, outputPath, answer.stdout || '', segment.redir.append);
            answer.effects = (answer.effects || []).concat((segment.redir.append ? 'append:' : 'write:') + outputPath);
            if (answer.code === 0) outputMetadata = { outputPath, outputAppend: segment.redir.append };
          }
        } catch (error) { answer = fail(error.message || '[Simulator] Unable to run this command.'); }
        answer.stdout = bounded(String(answer.stdout || '')); answer.stderr = bounded(String(answer.stderr || ''));
        const entry = { name, args, cwd, resolvedPaths: context.resolvedPaths, ...outputMetadata, command: segment.tokens.join(' '), input: bounded(stdin), output: answer.stdout, error: answer.stderr, code: Number.isInteger(answer.code) ? answer.code : 1 };
        result.trace.push(entry);
        result.stderr = bounded(result.stderr + answer.stderr);
        result.effects.push(...(Array.isArray(answer.effects) ? answer.effects : []));
        result.unsupported = result.unsupported || Boolean(answer.unsupported);
        if (entry.code !== 0 && result.code === 0) result.code = entry.code;
        stdin = segment.redir ? '' : answer.stdout;
      }
      result.stdout = stdin;
    }
    if (warning) result.stderr = bounded(warning + '\n' + result.stderr);
    session.history.push({ line, stdout: result.stdout, stderr: result.stderr, code: result.code, trace: result.trace, effects: result.effects });
    if (session.history.length > 80) session.history.splice(0, session.history.length - 80);
    while (session.history.length > 1 && JSON.stringify(session.history).length > MAX_HISTORY) session.history.shift();
    return result;
  }

  function listFiles(session) { return Object.values(session.files).map(f => ({ ...f })).sort((a, b) => a.path.localeCompare(b.path, 'en')); }

  function complete(session, input) {
    if (typeof input !== 'string' || input.length > MAX_LINE || /[|>&<\r\n]/.test(input)) return [];
    if (!/[ \t]/.test(input)) return allReferences().map(r => r.name).filter(n => n.startsWith(input.toLowerCase())).sort();
    const match = /^(.*?)("[^" ]*[^" ]*|"[^"]*|[^ \t"]*)$/.exec(input);
    if (!match) return [];
    const prefix = match[1], fragment = inputPath(match[2].replace(/^"/, ''));
    if (!prefix.trim() || fragment.endsWith('"')) return [];
    let base;
    try { base = resolve(session, fragment || '.'); } catch (_) { return []; }
    const candidates = Object.values(session.files).filter(f => f.path.toLowerCase().startsWith(base.toLowerCase()) && (fragment ? true : parent(f.path).toLowerCase() === session.cwd.toLowerCase())).slice(0, 30);
    return candidates.map(f => {
      let value = f.path;
      if (!/^[a-z]:|^\\/i.test(fragment) && f.path.toLowerCase().startsWith(session.cwd.toLowerCase().replace(/\\$/, '') + '\\')) value = f.path.slice(session.cwd.replace(/\\$/, '').length + 1);
      return prefix + (/[\s]/.test(value) || match[2].startsWith('"') ? '"' + value + '"' : value);
    });
  }

  // Imported sessions are data, never executable instructions. Reconstruct every
  // accepted field and reject unexpected shapes instead of assigning prototypes.
  function cloneShape(raw, model, label, depth = 0) {
    if (depth > 8) throw new Error('Invalid ' + label);
    if (Array.isArray(model)) {
      if (!Array.isArray(raw) || raw.length > 100) throw new Error('Invalid ' + label);
      if (!model.length) { if (raw.length) throw new Error('Invalid ' + label); return []; }
      return raw.map(item => cloneShape(item, model[0], label, depth + 1));
    }
    if (plain(model)) {
      if (!plain(raw) || Object.keys(raw).some(k => !own(model, k))) throw new Error('Invalid ' + label);
      const out = Object.create(null);
      for (const key of Object.keys(model)) {
        if (!own(raw, key)) throw new Error('Missing ' + label + '.' + key);
        out[key] = cloneShape(raw[key], model[key], label + '.' + key, depth + 1);
      }
      return out;
    }
    if (typeof model === 'string') return cleanString(raw, 4096, label);
    if (typeof model === 'boolean') { if (typeof raw !== 'boolean') throw new Error('Invalid ' + label); return raw; }
    if (typeof model === 'number') { if (typeof raw !== 'number' || !Number.isFinite(raw) || Math.abs(raw) > 1e12) throw new Error('Invalid ' + label); return raw; }
    if (raw !== null || model !== null) throw new Error('Invalid ' + label);
    return null;
  }

  function restoreSession(raw) {
    if (!plain(raw) || raw.version !== 1 || !SCENARIOS.includes(raw.scenario)) throw new Error('Invalid session version or scenario');
    if (Object.keys(raw).some(k => !['version', 'cwd', 'scenario', 'files', 'env', 'machine', 'pc', 'net', 'history'].includes(k))) throw new Error('Unexpected session field');
    const session = createSession({ scenario: raw.scenario });
    session.pc = cloneShape(raw.pc, session.pc, 'pc');
    session.env = cloneShape(raw.env, session.env, 'env');
    for (const key of Object.keys(DEFAULT_ENV)) if (session.env[key] !== DEFAULT_ENV[key]) throw new Error('Invalid environment value');
    session.machine = cloneShape(raw.machine, session.machine, 'machine');
    if (JSON.stringify(session.machine) !== JSON.stringify({ hostname: 'PC-014', domain: 'CORP', username: 'student' })) throw new Error('Invalid machine');
    session.net = typeof Network.restore === 'function' ? Network.restore(raw.net, raw.scenario) : cloneShape(raw.net, session.net, 'net');
    if (!plain(raw.files) || Object.keys(raw.files).length > MAX_FILES) throw new Error('Invalid filesystem');
    session.files = Object.create(null); let total = 0;
    for (const [key, file] of Object.entries(raw.files)) {
      if (!plain(file) || Object.keys(file).some(k => !['path', 'dir', 'content'].includes(k)) || typeof file.dir !== 'boolean') throw new Error('Invalid file');
      const path = resolve(session, cleanString(file.path, 512, 'file path'));
      if (!/^[CD]:\\/.test(file.path) || key !== path.toLowerCase() || path !== file.path) throw new Error('Noncanonical file path');
      const content = cleanString(file.content, MAX_FILE, 'file content'); total += content.length;
      if (file.dir && content !== '') throw new Error('Invalid directory content');
      session.files[key] = { path, dir: file.dir, content };
    }
    if (total > 1048576 || !get(session, 'C:\\')?.dir || !get(session, 'D:\\')?.dir) throw new Error('Invalid filesystem size or roots');
    for (const file of Object.values(session.files)) if (file.path.length > 3 && !get(session, parent(file.path))?.dir) throw new Error('Missing parent directory');
    for (const drive of ['C', 'D']) {
      const path = session.pc.driveCwds[drive];
      if (path[0] !== drive || resolve(session, path) !== path || !get(session, path)?.dir) throw new Error('Invalid drive working directory');
    }
    session.cwd = cleanString(raw.cwd, 512, 'working directory');
    if (resolve(session, session.cwd) !== session.cwd || !get(session, session.cwd)?.dir) throw new Error('Invalid working directory');
    if (!Array.isArray(raw.history) || raw.history.length > 80 || JSON.stringify(raw.history).length > MAX_HISTORY) throw new Error('Invalid history');
    session.history = raw.history.map(entry => {
      if (!plain(entry) || !Array.isArray(entry.trace) || entry.trace.length > 32 || !Array.isArray(entry.effects) || entry.effects.length > 100 || !Number.isInteger(entry.code)) throw new Error('Invalid history entry');
      const trace = entry.trace.map(t => {
        if (!plain(t) || !Array.isArray(t.args) || t.args.length > 256 || !Number.isInteger(t.code)) throw new Error('Invalid trace');
        const metadata = {};
        const checkedPath = value => {
          const path = cleanString(value, 512, 'trace path');
          if (!/^[CD]:\\/.test(path) || resolve(session, path) !== path) throw new Error('Invalid trace path');
          return path;
        };
        if (own(t, 'cwd')) metadata.cwd = checkedPath(t.cwd);
        if (own(t, 'resolvedPaths')) {
          if (!Array.isArray(t.resolvedPaths) || t.resolvedPaths.length > 256) throw new Error('Invalid trace paths');
          metadata.resolvedPaths = t.resolvedPaths.map(checkedPath);
        }
        if (own(t, 'outputPath') || own(t, 'outputAppend')) {
          if (t.code !== 0 || typeof t.outputAppend !== 'boolean') throw new Error('Invalid output provenance');
          metadata.outputPath = checkedPath(t.outputPath);
          metadata.outputAppend = t.outputAppend;
        }
        // Old progress files lack these fields. Preserve that absence so the
        // grading layer can migrate or conservatively handle missing evidence.
        return { name: cleanString(t.name, 64, 'command name'), args: t.args.map(a => cleanString(a, MAX_LINE, 'argument')), ...metadata, command: cleanString(t.command, MAX_LINE, 'command'), input: cleanString(t.input, MAX_OUTPUT + 100, 'input'), output: cleanString(t.output, MAX_OUTPUT + 100, 'output'), error: cleanString(t.error, MAX_OUTPUT + 100, 'error'), code: t.code };
      });
      const restored = { line: cleanString(entry.line, MAX_LINE, 'history line'), stdout: cleanString(entry.stdout, MAX_OUTPUT + 100, 'stdout'), stderr: cleanString(entry.stderr, MAX_OUTPUT + 100, 'stderr'), code: entry.code, trace, effects: entry.effects.map(e => cleanString(e, 1024, 'effect')) };
      // Older saves predate outputPath. Recover it without executing anything,
      // only when parsed syntax, trace identity and a successful write agree.
      // Relative destinations also require the original trace's working folder.
      try {
        const segments = parse(restored.line, session.env);
        if (restored.code === 0 && segments.length === trace.length) segments.forEach((segment,index) => {
          const item = trace[index];
          if (own(item,'outputPath') || !segment.redir || item.code !== 0 || canonical(segment.tokens[0]) !== item.name ||
            JSON.stringify(segment.tokens.slice(1)) !== JSON.stringify(item.args)) return;
          const input = inputPath(segment.redir.path);
          if (!item.cwd && !/^[CD]:\\/i.test(input)) return;
          const original = { ...session, cwd: item.cwd || session.cwd };
          const destination = resolve(original,input);
          const effect = (segment.redir.append ? 'append:' : 'write:') + destination;
          if (!restored.effects.some(value => value.toLowerCase() === effect.toLowerCase())) return;
          item.outputPath = destination; item.outputAppend = segment.redir.append;
        });
      } catch (_) { /* Unsupported or ambiguous older syntax supplies no new evidence. */ }
      return restored;
    });
    return session;
  }

  return { createSession, run, restoreSession, listFiles, complete, reference, inputWarning };
});
