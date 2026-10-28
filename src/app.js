(function () {
  'use strict';
  const { WCRShell: Shell, WCRData: Data, WCREngine: Engine } = globalThis;
  const $ = id => document.getElementById(id);
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dict = {
    home: ['学習マップ', 'Learning map'], sandbox: ['自由練習', 'Playground'], reference: ['コマンド帳', 'Commands'],
    saveMenu: ['進捗を保存', 'Save progress'], fillExample: ['見本を入力欄に入れる', 'Put example in the input'], jumpTerminal: ['ターミナルで試す ↓', 'Try in the terminal ↓'],
    intro: ['小さな手がかりから、原因へ。', 'Small clues. Clearer answers.'],
    hero: ['Windowsの「困った」を、<br><em>コマンドで読み解く。</em>', 'Read the clues.<br><em>Troubleshoot Windows.</em>'],
    lead: ['ファイルの探し方から、ネットワークや職場のPCの調査まで。説明を読んで、コマンドを打って、結果から考える。ひとつずつ身につけるWindows CLI入門。', 'From finding files to investigating networks and workplace PCs. Read a short explanation, run a command, and make sense of the result. Learn Windows CLI one small task at a time.'],
    start: ['最初からはじめる →', 'Start learning →'], continue: ['続きから学ぶ →', 'Continue learning →'],
    offline: ['インストール不要 · オフライン対応 · 登録不要', 'No installation · Works offline · No account'],
    clueTitle: ['応答がある。でも、正常とは限らない。', 'A response is a clue, not the whole answer.'],
    clueText: ['503は「HTTPの応答が返った」という手がかり。次に、サービス側の状態を調べます。', 'A 503 means an HTTP response came back. The next clue is on the service side.'],
    overviewTitle: ['暗記より、「次に何を確かめるか」。', 'Learn what to check next.'],
    overviewText: ['一般的なITトラブル対応を題材にした、Windows 11想定の教材です。', 'Everyday IT troubleshooting, using a simulated Windows 11 PC.'],
    progress: ['学習の進み具合', 'Your progress'], complete: ['完了', 'complete'], courseTitle: ['5つの入口から、順番に。', 'Five tracks. One step at a time.'],
    courseSub: ['どのレッスンからでも始められます。', 'Every lesson is independent. Start anywhere.'], lessons: ['レッスン', 'lessons'],
    playgroundTitle: ['気になるコマンドを、自由に。', 'Follow your curiosity.'],
    playgroundText: ['仮想PCで試す練習室。環境を切り替えて、結果の違いも確かめられます。', 'Explore the virtual PC. Switch scenarios and compare what the commands tell you.'],
    step1: ['01  読んで理解する', '01  Read the context'], step1text: ['短い説明と例で、コマンドの役割を知る。', 'Understand the purpose of a command with a short explanation and example.'],
    step2: ['02  打って確かめる', '02  Try a command'], step2text: ['手を動かして、仮想PCの結果を観察する。', 'Run it yourself and inspect the virtual PC’s output.'],
    step3: ['03  結果から考える', '03  Interpret the result'], step3text: ['調査で分かったことと、まだ分からないことを区別する。', 'Separate what the evidence shows from what still needs checking.'],
    footer: ['学習用シミュレーター · 実際のWindowsやネットワークにはアクセスしません', 'Learning simulator · No access to your operating system or network'],
    saved: ['このブラウザに自動保存', 'Autosaved in this browser'], storageError: ['このブラウザでは自動保存できません。設定メニューの「進捗を書き出す」で保存してください。', 'Autosave is unavailable. Save your work with “Export progress” in Settings.'],
    search: ['レッスンを探す', 'Find a lesson'], noResults: ['一致するレッスンがありません。', 'No matching lessons.'],
    example: ['コマンドの例', 'EXAMPLE'], task: ['やってみよう', 'YOUR TASK'], hint: ['ヒント', 'Hint'], hintsDone: ['ヒントをすべて表示中', 'All hints shown'],
    solution: ['解答例を見る', 'Show solution'], solutionLabel: ['解答例 · 自分で入力して確かめましょう', 'SOLUTION · Type it yourself and inspect the result'],
    interpretation: ['結果を読み取る', 'INTERPRET THE RESULT'], check: ['結果を確認する', 'Check my work'],
    previous: ['← 前へ', '← Previous'], next: ['次へ →', 'Next →'], finish: ['コース一覧へ →', 'Back to courses →'],
    lessonList: ['レッスン一覧', 'Lesson list'], terminal: ['コマンドを試す', 'TRY A COMMAND'], simulated: ['仮想PC', 'SIMULATED'],
    resetLesson: ['この問題をリセット', 'Reset this lesson'], clear: ['表示を消す', 'Clear'], reset: ['この環境をやり直す', 'Reset this environment'],
    welcome: ['英語版 Windows 11 / CMD を想定した学習用環境です。\nhelp で対応コマンドを確認できます。', 'Learning environment: English-language Windows 11 / CMD.\nType help to see supported commands.'],
    terminalDisplay: ['端末のバックスラッシュは円記号で表示しています。入力・保存データは書き換えません。', 'Terminal messages follow English-language Windows. Display language does not rewrite your input or saved data.'],
    input: ['コマンドを入力', 'Enter a command'], run: ['実行', 'Run'], history: ['履歴', 'history'], completion: ['補完', 'complete'],
    keyboardNext: ['完了後・入力欄が空なら次へ', 'next when complete and input is empty'],
    evidencePending: ['コマンドで手がかりを集めよう', 'Gather evidence with commands'], evidenceReady: ['必要な実行結果がそろいました', 'The required evidence is ready'],
    evidenceHint: ['「やってみよう」の条件を確認してください。', 'Follow the task to collect the evidence.'], evidenceQuestion: ['結果を読んで、左の問題に答えましょう。', 'Read the output and answer the lesson question.'],
    recheckTitle: ['変更後の再確認が必要です', 'Recheck after the latest change'],
    recheckText: ['最新の復旧操作の後に再確認が必要です。課題にある確認コマンドをもう一度実行してください。保存する課題では、再確認の結果も指定ファイルへ記録します。', 'Verification is required after the latest recovery action. Run the task’s verification commands again. If the task requires a report, record the new results in that file too.'],
    completedTitle: ['このレッスンは完了です', 'Lesson completed'], completedText: ['次のレッスンへ進むか、この環境で練習を続けられます。', 'Continue to the next lesson or keep practicing here.'],
    recordTitle: ['完了記録あり · 復習中', 'Previously completed · Practicing again'], recordText: ['完了記録は保存されています。現在の環境で課題を再確認する場合は、条件を満たしてから「結果を確認する」を押してください。', 'Your completion record is saved. To verify this environment again, meet the task requirements and check your work.'],
    checklistTitle: ['完了までのチェック', 'Completion checklist'], conditionMet: ['達成', 'Done'], conditionMissing: ['未達', 'Not yet'],
    notYet: ['もうひとつ確かめましょう', 'One more thing to check'], needCommands: ['必要な実行結果がまだそろっていません。課題のコマンドや保存先を確認してください。', 'Some evidence is still missing. Check the task, command arguments, and output file paths.'],
    needAnswer: ['コマンドの条件は満たしています。結果が何を示すか、選択肢を確認してください。', 'The command requirements are met. Revisit what the output actually tells you and choose an answer.'],
    wrongAttempts: ['この環境での誤答回数', 'Incorrect answers in this environment'], choiceFeedback: ['選んだ答えについて', 'About your answer'],
    unreadableProgress: ['保存済みの進捗を読み込めなかったため、自動保存を停止しています。「進捗を保存」から元のデータを書き出せます。有効な進捗を読み込むか、学習データを消すと自動保存を再開します。', 'Saved progress could not be read, so autosave is paused to preserve it. Download the original data from Save progress. Import valid progress or erase learning data to resume autosave.'],
    rescueProgress: ['読み込めなかった元のデータを書き出す', 'Download the unreadable original data'],
    files: ['仮想ファイルを見る', 'Virtual files'], read: ['読む', 'Read'], insert: ['入力', 'Insert'],
    simNote: ['この教材はCMDの一部を再現しています。未対応のコマンドやオプションには説明が表示されます。ドメイン・IP・ログはすべて架空です。', 'This simulator implements a documented subset of CMD. Unsupported commands and options show an explanation. All domains, IP addresses, and logs are fictional.'],
    trace: ['処理の流れ', 'Trace'], traceInput: ['受け取ったテキスト', 'INPUT'], traceOutput: ['出力したテキスト', 'OUTPUT'], traceError: ['エラー', 'ERROR'], noInput: ['（入力なし）', '(no input)'],
    settings: ['設定と学習データ', 'Settings & progress'], export: ['進捗を書き出す', 'Export progress'], import: ['進捗を読み込む', 'Import progress'],
    dataInfo: ['レッスンの完了状態、実行履歴、仮想ファイルをJSONで保存します。別のブラウザに移すときにも使えます。', 'Save completed lessons, command history, and virtual files as JSON. You can use the file to move to another browser.'],
    erase: ['学習データをすべて消す', 'Erase all learning data'], eraseConfirm: ['すべての進捗と仮想ファイルを消します。必要なら先に書き出してください。消しますか？', 'Erase all progress and virtual files? Export your data first if you need a backup.'],
    resetConfirm: ['この問題のファイル・操作履歴・回答・ヒントを最初の状態に戻します。ほかの問題の進捗と、これまでの完了記録は残ります。リセットしますか？', 'Reset this lesson’s files, command history, answers and hints? Other lessons and your past completion records will be kept.'],
    imported: ['進捗を読み込みました。', 'Progress imported.'], importFail: ['読み込めませんでした。有効なwindowsCLIroomの進捗JSONか確認してください。現在の進捗は変更していません。', 'Could not import this file. Use a valid windowsCLIroom progress JSON. Your current progress has not changed.'],
    importConfirm: ['現在の学習データを、ファイルの内容で置き換えますか？', 'Replace your current learning data with this file?'],
    exported: ['進捗ファイルを書き出しました。', 'Progress file exported.'], erased: ['学習データを初期化しました。', 'Learning data reset.'],
    refSearch: ['コマンド名・用途で検索', 'Search by command or purpose'], refScope: ['Windows本体ではなく、この教材が対応している書式です。すべてのコマンドやオプションを再現するものではありません。', 'These are the forms supported by this simulator, not a complete Windows command reference.'],
    sandboxGoal: ['課題や採点なしで、コマンドを自由に試せます。', 'Explore commands without a task or grading.'],
    sandboxBody: ['まずは help で一覧を見てみましょう。仮想ファイルや設定はこの練習室にだけ保存され、各レッスンの環境には影響しません。', 'Start with help. Files and settings are saved only in this playground and do not affect the lesson environments.'],
    scenario: ['環境を選ぶ', 'Choose a scenario'], scenarioNote: ['切り替えると、練習室の履歴と仮想ファイルを初期化します。', 'Switching resets the playground’s history and virtual files.'],
    ready: ['準備できています', 'Ready to explore'], savedDetail: ['オフラインで利用できます。進捗はこのブラウザだけに保存されます。配布HTMLは変更しません。', 'Works offline. Progress stays in this browser; the distributed HTML file is not modified.'],
    noCandidates: ['補完候補がありません。', 'No completion candidates.'],
    about: ['教材について', 'About this room'], aboutText: ['windowsCLIroom v0.1.7 · 日本語 / English\nWindows 11のCMDを題材にした、一般的なITトラブル対応の入門教材です。PowerShellのオブジェクト処理・スクリプトは別教材を想定しています。', 'windowsCLIroom v0.1.7 · 日本語 / English\nAn introduction to everyday IT troubleshooting through Windows 11 CMD. PowerShell objects and scripting belong in a separate course.']
  };
  let state = Engine.empty(), view = 'home', currentId = '', composing = false, historyCursor = -1, historyDraft = '';
  let saveTimer, toastTimer, feedback = null, courseSearch = '', courseOpen = false, unreadableProgress = null;
  const visibleFrom = {};
  const t = key => (dict[key] || [key, key])[state.language === 'en' ? 1 : 0];
  const shortTitle = value => loc(value).replace(/^\d+\s*·\s*/, '');
  // Localize authored lesson text and examples; never mutate command input or saved data.
  const loc = value => {
    const text = typeof value === 'string' ? value : value?.[state.language] || value?.ja || '';
    return state.language === 'ja' ? text.replace(/\\/g, '¥') : text;
  };
  // Apply the same glyph convention only while rendering read-only terminal text.
  const terminalText = value => state.language === 'ja' ? String(value ?? '').replace(/\\/g, '¥') : String(value ?? '');
  const lessonById = id => Data.lessons.find(l => l.id === id);
  const trackById = id => Data.tracks.find(tr => tr.id === id);
  const lesson = () => lessonById(currentId);
  const cp = () => state.checkpoints[currentId];
  const progressCount = () => Object.keys(state.completed).length;
  const scenarios = [
    ['base', '通常のPC', 'Healthy PC'], ['wifi-off', 'Wi-Fiが切れている', 'Wi-Fi disconnected'],
    ['dns-wrong', 'DNS設定の問題', 'Incorrect DNS configuration'], ['dns-cache', '古いDNSキャッシュ', 'Stale DNS cache'],
    ['proxy-mismatch', 'WinHTTPプロキシの相違', 'WinHTTP proxy mismatch'], ['web-503', 'Webサービスの503', 'Web service returns 503'],
    ['vpn-route', 'VPNの経路不足', 'Missing VPN route'], ['ad-policy', '職場のポリシー未更新', 'Workplace policy out of date'],
    ['service-stopped', '印刷サービス停止', 'Print service stopped'], ['permission', '共有ファイルの権限', 'Shared file permissions'],
    ['system-corrupt', 'システムファイルの異常', 'System file corruption']
  ];
  function warning() { $('storage-warning').textContent = t(unreadableProgress !== null ? 'unreadableProgress' : 'storageError'); $('storage-warning').hidden = false; }
  try {
    const stored = localStorage.getItem(Engine.KEY);
    if (stored) { try { state = Engine.parse(stored); } catch { unreadableProgress = stored; warning(); } }
  } catch { warning(); }
  function stashInput() { if (cp() && $('command-input')) cp().input = $('command-input').value; }
  function save() {
    clearTimeout(saveTimer); stashInput();
    if (unreadableProgress !== null) { warning(); return; }
    try { localStorage.setItem(Engine.KEY, JSON.stringify(state)); $('storage-warning').hidden = true; } catch { warning(); }
  }
  function deferSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800); }
  function setHeader() {
    document.documentElement.lang = state.language;
    $('home-button').textContent = t('home'); $('sandbox-button').textContent = t('sandbox'); $('reference-button').textContent = t('reference');
    $('menu-button').textContent = t('saveMenu');
    $('home-button').classList.toggle('active', view === 'home'); $('sandbox-button').classList.toggle('active', currentId === 'sandbox' && view === 'workspace');
    $('language-button').textContent = state.language === 'ja' ? 'EN' : '日本語';
    $('language-button').lang = state.language === 'ja' ? 'en' : 'ja';
    $('language-button').setAttribute('aria-label', state.language === 'ja' ? 'Switch to English' : '日本語に切り替える');
    $('footer').textContent = `windowsCLIroom ${Data.version}  ·  ${t('footer')}`;
  }
  function progressBar(count = progressCount(), total = Data.lessons.length) {
    return `<div class="progress-track" role="progressbar" aria-label="${escape(t('progress'))}" aria-valuenow="${count}" aria-valuemin="0" aria-valuemax="${total}"><div class="progress-fill" style="width:${total ? 100 * count / total : 0}%"></div></div>`;
  }
  function showHome() { stashInput(); save(); view = 'home'; currentId = ''; feedback = null; render(); window.scrollTo(0, 0); }
  function openLesson(id, focus = false) {
    if (id !== 'sandbox' && !lessonById(id)) return;
    stashInput(); save(); currentId = id; view = 'workspace'; state.activeId = id;
    if (!cp()) state.checkpoints[id] = Engine.fresh(lesson());
    historyCursor = -1; feedback = null; courseOpen = false; courseSearch = '';
    render(); save(); window.scrollTo(0, 0);
    if (focus) $('command-input').focus({ preventScroll: true });
  }
  function homeHTML() {
    const resume = state.activeId && state.activeId !== 'sandbox' ? state.activeId : Data.lessons.find(l => !state.completed[l.id])?.id || Data.lessons[0].id;
    const cards = Data.tracks.map((tr, i) => {
      const group = Data.lessons.filter(l => l.track === tr.id), done = group.filter(l => state.completed[l.id]).length;
      const target = group.find(l => !state.completed[l.id]) || group[0];
      return `<button class="course-card" data-open="${escape(target.id)}"><span class="course-number">0${i + 1}</span><h3>${escape(loc(tr.title))}</h3><p>${escape(loc(tr.description || tr.subtitle))}</p><span class="course-meta"><span>${group.length} ${t('lessons')} · ${done}/${group.length} ${t('complete')}</span><span class="arrow">↗</span></span></button>`;
    }).join('');
    return `<div class="home"><section class="hero"><div><p class="eyebrow">WINDOWS COMMAND LINE · LEARN BY DOING</p><h1>${t('hero')}</h1><p class="lead">${t('lead')}</p><div class="hero-actions"><button class="primary" data-open="${escape(resume)}">${progressCount() || state.activeId ? t('continue') : t('start')}</button><button data-action="sandbox">${t('sandbox')}</button></div><p class="micro">${t('offline')}</p></div><div class="sample-terminal" aria-label="HTTP diagnosis example"><div class="terminal-top"><span><span class="terminal-dots"><i></i><i></i><i></i></span> Command Prompt</span><span>PC-014 · SIMULATED</span></div><div class="sample-body"><div class="cmd"><span class="prompt-prefix">${escape(loc('C:\\Users\\student'))}&gt;</span> curl.exe -I https://intranet.corp.example</div><div class="http">HTTP/1.1 503 Service Unavailable</div><div>Content-Type: text/html; charset=utf-8</div><div>Retry-After: 120</div></div><div class="sample-note"><strong>${t('clueTitle')}</strong>${t('clueText')}</div></div></section><section class="overview"><div><strong>${t('overviewTitle')}</strong><p>${t('overviewText')}</p></div><div class="progress-inline"><div class="progress-caption"><span>${t('progress')}</span><span>${progressCount()} / ${Data.lessons.length}</span></div>${progressBar()}</div></section><section><div class="section-heading"><div><h2>${t('courseTitle')}</h2><p>${t('courseSub')}</p></div><span class="pill">${Data.lessons.length} ${t('lessons')}</span></div><div class="course-grid">${cards}<button class="course-card practice-card" data-action="sandbox"><span class="course-number">&gt;_</span><h3>${t('playgroundTitle')}</h3><p>${t('playgroundText')}</p><span class="course-meta"><span>${t('sandbox')}</span><span class="arrow">↗</span></span></button></div></section><section class="how-it-works">${[1, 2, 3].map(n => `<div><h3>${t('step' + n)}</h3><p>${t('step' + n + 'text')}</p></div>`).join('')}</section></div>`;
  }
  function navHTML() {
    const q = courseSearch.toLowerCase();
    return `<div class="nav-top"><h2>${t('lessonList')} <span class="subtle">${progressCount()}/${Data.lessons.length}</span></h2>${progressBar()}<div style="height:12px"></div><input id="lesson-search" class="nav-search" type="search" placeholder="${t('search')}" aria-label="${t('search')}" value="${escape(courseSearch)}"></div><div id="lesson-groups">${navGroups(q)}</div>`;
  }
  function navGroups(q) {
    q = q.replace(/[¥￥]/g, '\\');
    let count = 0;
    const html = Data.tracks.map((tr, i) => {
      const group = Data.lessons.filter(l => l.track === tr.id && `${loc(l.title)} ${l.solution.join(' ')}`.toLowerCase().includes(q));
      count += group.length;
      if (!group.length) return '';
      return `<section class="nav-group"><div class="nav-group-title"><span>0${i + 1} · ${escape(loc(tr.title))}</span></div>${group.map(l => `<button class="lesson-item ${currentId === l.id ? 'active' : ''} ${state.completed[l.id] ? 'done' : ''}" data-open="${escape(l.id)}" ${currentId === l.id ? 'aria-current="step"' : ''}><span class="status">${state.completed[l.id] ? '✓' : String(Data.lessons.indexOf(l) + 1).padStart(2, '0')}</span><span>${escape(shortTitle(l.title))}</span></button>`).join('')}</section>`;
    }).join('');
    return count ? html : `<p class="empty-search">${t('noResults')}</p>`;
  }
  function instructionHTML() {
    const l = lesson();
    if (!l) return `<div class="breadcrumb"><span>PLAYGROUND</span><button class="small mobile-course-toggle" data-action="courses">${t('lessonList')}</button></div><h1>${t('sandbox')}</h1><p class="lesson-goal">${t('sandboxGoal')}</p><div class="lesson-explanation"><p>${t('sandboxBody')}</p></div><label class="label" for="scenario-select">${t('scenario')}</label><select id="scenario-select" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px">${scenarios.map(s => `<option value="${s[0]}" ${cp().session.scenario === s[0] ? 'selected' : ''}>${escape(s[state.language === 'ja' ? 1 : 2])}</option>`).join('')}</select><p class="micro">${t('scenarioNote')}</p><section class="sandbox-instructions"><p class="label">${t('example')}</p><div class="sandbox-commands">${['help','dir C:\\Lab','whoami /all','ipconfig /all','ping intranet.corp.example','curl.exe -I https://intranet.corp.example','sc.exe query Spooler','netsh winhttp show proxy'].map(c => `<button data-insert="${escape(loc(c))}">${escape(loc(c))}</button>`).join('')}</div></section><p class="sim-note">${t('simNote')}</p>`;
    const index = Data.lessons.indexOf(l), tr = trackById(l.track);
    return `<div class="breadcrumb"><span>${escape(loc(tr.title))} · ${String(index + 1).padStart(2, '0')} / ${Data.lessons.length}</span><button class="small mobile-course-toggle" data-action="courses">${t('lessonList')}</button></div><h1>${escape(loc(l.title))}</h1><p class="lesson-goal">${escape(loc(l.goal))}</p><div class="lesson-explanation">${l.explanation.map(p => `<p>${escape(loc(p))}</p>`).join('')}</div><div class="example"><p class="label">${t('example')}</p><pre>${escape(loc(l.example.command))}</pre><p class="example-note">${escape(loc(l.example.note))}</p><button class="small" style="margin-top:9px" data-insert="${escape(loc(l.example.command))}">${t('fillExample')}</button></div><div class="task"><p class="label">${t('task')}</p><p>${escape(loc(l.task))}</p></div><div id="hints"></div>${l.question ? `<section class="question"><p class="label">${t('interpretation')}</p><fieldset><legend>${escape(loc(l.question.prompt))}</legend>${l.question.choices.map(ch => `<label class="choice"><input type="radio" name="answer" value="${escape(ch.id)}" ${cp().answer === ch.id ? 'checked' : ''}><span>${escape(loc(ch.text))}</span></label>`).join('')}</fieldset></section>` : ''}<div class="check-actions"><button id="check-button" class="primary" data-action="check">${t('check')}</button><button id="lesson-reset" data-action="reset">↺ ${t('resetLesson')}</button></div><div id="feedback" aria-live="polite"></div><div class="lesson-controls"><button class="small" data-action="previous" ${index === 0 ? 'disabled' : ''}>${t('previous')}</button><button id="next-button" class="secondary" data-action="next">${index === Data.lessons.length - 1 ? t('finish') : t('next')}</button></div>`;
  }
  function consoleHTML() {
    return `<div class="console-title"><h2>${t('terminal')}</h2><span class="pill"><span class="dot"></span>${t('simulated')}</span></div><div class="console"><div class="terminal-top"><span>Command Prompt · PC-014</span><div class="terminal-actions"><button data-action="clear">${t('clear')}</button><button data-action="reset">↺ ${t('reset')}</button></div></div><div id="console-output" class="console-output" role="log" aria-label="${escape(t('terminal'))}" aria-live="polite" aria-relevant="additions"></div><form id="command-form" class="command-form" autocomplete="off"><div id="prompt-path" class="prompt-path"></div><div class="input-row"><span aria-hidden="true">&gt;</span><input id="command-input" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" maxlength="4096" aria-label="${t('input')}" aria-describedby="input-warning" placeholder="${t('input')}"><button class="run-button" type="submit">${t('run')} ↵</button></div><p id="input-warning" class="input-warning" role="status" aria-live="polite" hidden></p></form></div><p class="micro terminal-display-note">${t('terminalDisplay')}</p><div class="console-tip"><span><kbd>↑ ↓</kbd> ${t('history')}</span><span><kbd>Tab</kbd> ${t('completion')}</span><span><kbd>→</kbd> ${t('keyboardNext')}</span></div><div id="evidence" class="clue-status"></div><details class="file-panel"><summary>${t('files')}</summary><div id="file-list" class="file-list"></div></details><p class="sim-note">${t('simNote')}</p>`;
  }
  function render() {
    setHeader();
    $('main').innerHTML = view === 'home' ? homeHTML() : `<div class="workspace ${courseOpen ? 'course-open' : ''}"><aside class="lesson-nav" aria-label="${t('lessonList')}">${navHTML()}</aside><section class="instruction">${instructionHTML()}</section><section class="console-panel">${consoleHTML()}</section></div>`;
    if (view !== 'home') {
      $('command-input').value = cp().input; const nav = document.querySelector('.lesson-nav'), active = nav.querySelector('.active'); if (active) nav.scrollTop = Math.max(0, active.offsetTop - nav.offsetTop - 140); bindInput(); renderConsole(); renderHints(); renderStatus(); renderFiles();
      $('lesson-search').addEventListener('input', e => { courseSearch = e.target.value; $('lesson-groups').innerHTML = navGroups(courseSearch.toLowerCase()); });
      $('scenario-select')?.addEventListener('change', e => { state.checkpoints.sandbox = Engine.fresh({ session: { scenario: e.target.value } }); visibleFrom.sandbox = 0; render(); save(); });
    }
  }
  function renderHints() {
    if (!lesson() || !$('hints')) return;
    const l = lesson(), current = cp();
    $('hints').innerHTML = `<div class="hint-actions"><button class="small" data-action="hint" ${current.hintLevel >= l.hints.length ? 'disabled' : ''}>${current.hintLevel >= l.hints.length ? t('hintsDone') : `${t('hint')} ${current.hintLevel + 1} / ${l.hints.length}`}</button><button class="small" data-action="solution" ${current.solutionShown ? 'disabled' : ''}>${t('solution')}</button></div>${l.hints.slice(0, current.hintLevel).map((h, i) => `<div class="hint"><strong>${t('hint')} ${i + 1}</strong><br>${escape(loc(h))}</div>`).join('')}${current.solutionShown ? `<div class="solution"><p class="label">${t('solutionLabel')}</p><pre>${escape(loc(l.solution.join('\n')))}</pre></div>` : ''}`;
  }
  function renderConsole() {
    const box = $('console-output'); if (!box) return;
    const history = cp().session.history || [], start = Math.max(visibleFrom[currentId] || 0, history.length - 30);
    box.innerHTML = `<div class="terminal-welcome">${escape(t('welcome')).replace(/\n/g, '<br>')}</div>` + history.slice(start).map((h, i) => `<div class="history-entry"><div class="history-command"><span class="prompt-prefix">&gt;</span> ${escape(terminalText(h.line))}</div>${h.stdout ? `<pre>${escape(terminalText(h.stdout))}</pre>` : ''}${h.stderr ? `<pre class="history-error">${escape(terminalText(h.stderr))}</pre>` : ''}${h.trace?.length ? `<button class="trace-open" data-trace="${start + i}">${t('trace')} · ${h.trace.length}</button>` : ''}</div>`).join('');
    $('prompt-path').textContent = terminalText(cp().session.cwd); box.scrollTop = box.scrollHeight;
  }
  function renderFiles() {
    if (!$('file-list')) return;
    $('file-list').innerHTML = Shell.listFiles(cp().session).filter(f => !f.dir).sort((a, b) => a.path.localeCompare(b.path)).map(f => `<div class="file-row"><span class="file-name">${escape(terminalText(f.path))}</span><button data-read="${escape(f.path)}">${t('read')}</button><button data-path="${escape(f.path)}">${t('insert')}</button></div>`).join('');
  }
  function renderStatus() {
    if (!$('evidence')) return;
    const l = lesson(), result = l ? Engine.grade(l, cp().session, cp().answer, cp().evidence) : null;
    const done = l && !!state.completed[l.id];
    const statusTitle = !l ? t('ready') : result.needsRecheck ? t('recheckTitle') : done && result.ok ? '✓ ' + t('completedTitle') : done ? t('recordTitle') : result.commandOk ? t('evidenceReady') : t('evidencePending');
    const statusText = !l ? t('saved') : result.needsRecheck ? t('recheckText') : done && result.ok ? t('completedText') : done ? t('recordText') : result.commandOk && l.question ? t('evidenceQuestion') : t('evidenceHint');
    $('evidence').innerHTML = `<div><strong class="${result?.commandOk && !result.needsRecheck ? 'ready' : ''}">${statusTitle}</strong><span class="subtle">${statusText}</span></div>`;
    if (!l) return;
    const f = $('feedback');
    if (result.needsRecheck) f.innerHTML = `<div class="feedback recheck"><strong>${t('recheckTitle')}</strong><p>${t('recheckText')}</p></div>`;
    else if (done && result.ok) f.innerHTML = `<div class="feedback success"><strong>✓ ${t('completedTitle')}</strong><p>${escape(loc(l.success))}</p>${l.question ? `<p style="margin-top:8px">${escape(loc(l.question.explanation))}</p>` : ''}</div>`;
    else if (done && !feedback) f.innerHTML = `<div class="feedback record"><strong>✓ ${t('recordTitle')}</strong><p>${t('recordText')}</p></div>`;
    else if (feedback) {
      const choice = feedback.commandOk && l.question?.choices.find(ch=>ch.id===cp().answer);
      f.innerHTML = `<div class="feedback"><strong>${t('notYet')}</strong>${choice?.feedback ? `<p class="label">${t('choiceFeedback')}</p><p class="choice-feedback">${escape(loc(choice.feedback))}</p>` : `<p>${feedback.commandOk ? t('needAnswer') : t('needCommands')}</p>`}</div>`;
    }
    else f.innerHTML = '';
    if (!result.ok && (feedback || cp().session.history.length || done)) {
      const items = result.checklist || [];
      if (items.length) f.insertAdjacentHTML('beforeend', `<section class="completion-checklist" aria-label="${t('checklistTitle')}"><h3>${t('checklistTitle')}</h3><ul class="condition-list">${items.map(item => `<li data-check-key="${escape(item.key)}" data-check-kind="${escape(item.kind)}" data-ok="${item.ok}"><span class="condition-status ${item.ok ? 'met' : 'missing'}"><span aria-hidden="true">${item.ok ? '✓' : '✗'}</span> ${item.ok ? t('conditionMet') : t('conditionMissing')}</span><span>${escape(loc(item.label))}</span></li>`).join('')}</ul></section>`);
    }
    if (l.question && cp().attempts.incorrect) f.insertAdjacentHTML('beforeend',`<p class="micro answer-attempts">${t('wrongAttempts')}: ${cp().attempts.incorrect}</p>`);
    const item = document.querySelector(`.lesson-item[data-open="${CSS.escape(l.id)}"]`);
    if (item && done) { item.classList.add('done'); item.querySelector('.status').textContent = '✓'; }
  }
  function check(automatic = false) {
    const l = lesson(); if (!l) return;
    const result = Engine.grade(l, cp().session, cp().answer, cp().evidence);
    if (!automatic && result.commandOk && !result.answerOk && l.question?.choices.some(ch=>ch.id===cp().answer)) {
      cp().attempts.incorrect = Math.min(1000000,cp().attempts.incorrect+1);
      cp().attempts.byChoice[cp().answer] = Math.min(1000000,(cp().attempts.byChoice[cp().answer] || 0)+1);
      save();
    }
    if (result.ok && !state.completed[l.id]) {
      state.completed[l.id] = { at: new Date().toISOString(), hints: cp().hintLevel, solutionUsed: cp().solutionShown };
      feedback = null; save();
      $('lesson-groups').innerHTML = navGroups(courseSearch.toLowerCase());
      const top = document.querySelector('.nav-top');
      if (top) { top.querySelector('h2 .subtle').textContent = `${progressCount()}/${Data.lessons.length}`; const bar = top.querySelector('[role="progressbar"]'); bar.setAttribute('aria-valuenow', progressCount()); bar.firstElementChild.style.width = `${100 * progressCount() / Data.lessons.length}%`; }
    } else if (!automatic) feedback = result;
    renderStatus();
  }
  function runCommand() {
    if (composing) return;
    const input = $('command-input'), line = input.value.replace(/^[ \t]+|[ \t]+$/g, '');
    if (!line) return;
    const historyLength = cp().session.history.length;
    try { const result = Shell.run(cp().session, line, {language:state.language}); if (lesson()) cp().evidence = Engine.observe(lesson(),result,cp().evidence); }
    catch (error) { toast(state.language === 'ja' ? 'この入力は処理できませんでした。入力を確認してください。' : 'Could not process this input. Please check the command.'); console.error(error); return; }
    const dropped = Math.max(0, historyLength + 1 - cp().session.history.length);
    visibleFrom[currentId] = Math.max(0, (visibleFrom[currentId] || 0) - dropped);
    if (/^cls[ \t]*$/i.test(line)) visibleFrom[currentId] = cp().session.history.length;
    input.value = ''; cp().input = ''; historyCursor = -1; historyDraft = ''; feedback = null;
    renderInputWarning(); renderConsole(); renderFiles(); check(true); renderStatus(); save(); input.focus({ preventScroll: true });
  }
  function renderInputWarning() {
    const box = $('input-warning'), input = $('command-input');
    if (!box || !input) return;
    const warning = Shell.inputWarning(input.value, state.language);
    box.textContent = warning; box.hidden = !warning;
  }
  function bindInput() {
    const input = $('command-input');
    renderInputWarning();
    $('command-form').addEventListener('submit', e => { e.preventDefault(); if (!composing) runCommand(); });
    input.addEventListener('input', () => { cp().input = input.value; historyCursor = -1; renderInputWarning(); deferSave(); });
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
    input.addEventListener('keydown', e => {
      if (e.isComposing || composing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); runCommand(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); visibleFrom[currentId] = cp().session.history.length; renderConsole(); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'c' && input.selectionStart === input.selectionEnd) { e.preventDefault(); input.value = ''; cp().input = ''; renderInputWarning(); save(); return; }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); const commands = cp().session.history.map(h => h.line);
        if (!commands.length) return;
        if (historyCursor < 0) { historyCursor = commands.length; historyDraft = input.value; }
        historyCursor = Math.max(0, Math.min(commands.length, historyCursor + (e.key === 'ArrowUp' ? -1 : 1)));
        input.value = historyCursor === commands.length ? historyDraft : commands[historyCursor];
        input.setSelectionRange(input.value.length, input.value.length); cp().input = input.value; renderInputWarning(); deferSave();
      } else if (e.key === 'Tab' && !e.shiftKey && input.value) {
        const candidates = Shell.complete ? Shell.complete(cp().session, input.value) : [];
        if (candidates.length) { e.preventDefault(); input.value = candidates[0]; cp().input = input.value; renderInputWarning(); deferSave(); if (candidates.length > 1) toast(candidates.slice(0, 4).join(' · ')); }
      } else if (e.key === 'ArrowRight' && !e.repeat && !e.shiftKey && !input.value && lesson() && state.completed[currentId] && !window.getSelection()?.toString()) { e.preventDefault(); nextLesson(); }
    });
  }
  function nextLesson() { const i = Data.lessons.indexOf(lesson()); if (i < Data.lessons.length - 1 && i >= 0) openLesson(Data.lessons[i + 1].id, true); else showHome(); }
  function insert(text, append = false) { const input = $('command-input'); input.value = append ? `${input.value}${input.value && !input.value.endsWith(' ') ? ' ' : ''}${text}` : text; cp().input = input.value; renderInputWarning(); input.focus(); input.setSelectionRange(input.value.length, input.value.length); save(); }
  function openDialog(title, html) { $('dialog-title').textContent = title; $('dialog-body').innerHTML = html; if (!$('dialog').open) $('dialog').showModal(); }
  function showSettings() {
    openDialog(t('settings'), `<section class="settings-section"><h3>${t('progress')}</h3><p>${t('dataInfo')}</p><div class="settings-actions"><button data-action="export">${t('export')}</button><button data-action="import">${t('import')}</button>${unreadableProgress !== null ? `<button data-action="rescue">${t('rescueProgress')}</button>` : ''}</div><p>${t('savedDetail')}</p></section><section class="settings-section"><h3>${t('about')}</h3><p>${escape(t('aboutText')).replace(/\n/g, '<br>')}</p><p>${t('simNote')}</p></section><button class="small danger" data-action="erase">${t('erase')}</button>`);
  }
  function showMap() {
    openDialog(t('home'), `<p class="subtle">${t('courseSub')}</p>${Data.tracks.map((tr,i)=>`<section class="map-group"><h3>0${i+1} · ${escape(loc(tr.title))}</h3>${Data.lessons.filter(l=>l.track===tr.id).map(l=>`<button class="map-lesson ${state.completed[l.id]?'done':''}" data-open="${escape(l.id)}"><span>${state.completed[l.id]?'✓':String(Data.lessons.indexOf(l)+1).padStart(2,'0')}</span>${escape(shortTitle(l.title))}</button>`).join('')}</section>`).join('')}`);
  }
  function showReference() {
    const all = new Map();
    for (const ref of [...(Shell.reference || []), ...(globalThis.WCRNetwork.reference || [])]) if (!all.has(ref.name)) all.set(ref.name, ref);
    const refs = [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
    openDialog(t('reference'), `<p class="subtle">${t('refScope')}</p><input class="reference-search" id="reference-search" type="search" placeholder="${t('refSearch')}" aria-label="${t('refSearch')}"><div id="reference-results"></div>`);
    const draw = q => { $('reference-results').innerHTML = refs.filter(r => `${r.name} ${r.summaryJa} ${r.summaryEn} ${r.syntax}`.toLowerCase().includes(q.toLowerCase())).map(r => `<article class="reference-item"><h3>${escape(r.name)}</h3><p>${escape(state.language === 'en' ? r.summaryEn : r.summaryJa)}</p><pre>${escape(loc(r.syntax))}</pre></article>`).join('') || `<p>${t('noResults')}</p>`; };
    draw(''); $('reference-search').addEventListener('input', e => draw(e.target.value));
  }
  function showTrace(index) {
    const entry = cp().session.history[index]; if (!entry) return;
    openDialog(t('trace'), `<pre>${escape(terminalText(entry.line))}</pre>${entry.trace.map((tr, i) => `<section class="trace-stage"><h3>${i + 1}. ${escape(terminalText(tr.command || tr.name))} · exit ${tr.code}</h3><p class="label">${t('traceInput')}</p><pre>${escape(terminalText(tr.input || t('noInput')))}</pre><p class="label">${t('traceOutput')}</p><pre>${escape(terminalText(tr.output || '—'))}</pre>${tr.error ? `<p class="label">${t('traceError')}</p><pre>${escape(terminalText(tr.error))}</pre>` : ''}</section>`).join('')}`);
  }
  function exportData(rescue = false) {
    save(); const blob = new Blob([rescue ? unreadableProgress : JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `windowsCLIroom-${rescue ? 'unreadable-original' : 'progress'}-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast(t('exported'));
  }
  async function importData(file) {
    if (!file) return;
    try {
      if (file.size > Engine.MAX_IMPORT) throw new Error('Too large');
      const candidate = Engine.parse(await file.text());
      if (!confirm(t('importConfirm'))) return;
      clearTimeout(saveTimer); state = candidate; unreadableProgress = null; currentId = ''; view = 'home'; feedback = null;
      for (const key of Object.keys(visibleFrom)) delete visibleFrom[key];
      $('dialog').close(); save(); render(); toast(t('imported'));
    } catch { toast(t('importFail')); }
    finally { $('import-file').value = ''; }
  }
  function action(name) {
    if (name === 'sandbox') openLesson('sandbox');
    else if (name === 'courses') { courseOpen = !courseOpen; document.querySelector('.workspace').classList.toggle('course-open', courseOpen); }
    else if (name === 'hint') { cp().hintLevel = Math.min(lesson().hints.length, cp().hintLevel + 1); renderHints(); save(); }
    else if (name === 'solution') { cp().solutionShown = true; renderHints(); save(); }
    else if (name === 'check') check();
    else if (name === 'previous') { const i = Data.lessons.indexOf(lesson()); if (i > 0) openLesson(Data.lessons[i - 1].id); }
    else if (name === 'next') nextLesson();
    else if (name === 'clear') { visibleFrom[currentId] = cp().session.history.length; renderConsole(); }
    else if (name === 'reset' && confirm(t('resetConfirm'))) { state.checkpoints[currentId] = Engine.fresh(lesson() || { session: { scenario: cp().session.scenario } }); visibleFrom[currentId] = 0; historyCursor = -1; historyDraft = ''; feedback = null; render(); save(); }
    else if (name === 'export') exportData();
    else if (name === 'rescue' && unreadableProgress !== null) exportData(true);
    else if (name === 'import') $('import-file').click();
    else if (name === 'erase' && confirm(t('eraseConfirm'))) { clearTimeout(saveTimer); unreadableProgress = null; const language = state.language; state = Engine.empty(); state.language = language; currentId = ''; view = 'home'; feedback = null; for (const key of Object.keys(visibleFrom)) delete visibleFrom[key]; $('dialog').close(); save(); render(); toast(t('erased')); }
  }
  document.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.open) { if ($('dialog').open) $('dialog').close(); openLesson(button.dataset.open); }
    else if (button.dataset.action) action(button.dataset.action);
    else if (button.dataset.insert !== undefined) insert(button.dataset.insert);
    else if (button.dataset.path) insert(`"${button.dataset.path}"`, true);
    else if (button.dataset.read) { const f = Shell.listFiles(cp().session).find(f => f.path === button.dataset.read); if (f) openDialog(terminalText(f.path), `<pre>${escape(terminalText(f.content))}</pre>`); }
    else if (button.dataset.trace !== undefined) showTrace(Number(button.dataset.trace));
  });
  document.addEventListener('change', e => { if (e.target.matches('input[name="answer"]')) { cp().answer = e.target.value; feedback = null; renderStatus(); save(); } });
  $('brand').addEventListener('click', showHome); $('home-button').addEventListener('click', showMap);
  $('sandbox-button').addEventListener('click', () => openLesson('sandbox')); $('reference-button').addEventListener('click', showReference);
  $('menu-button').addEventListener('click', showSettings); $('dialog-close').addEventListener('click', () => $('dialog').close());
  $('dialog').addEventListener('click', e => { if (e.target === $('dialog')) { const r = $('dialog').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('dialog').close(); } });
  $('language-button').addEventListener('click', () => { stashInput(); state.language = state.language === 'ja' ? 'en' : 'ja'; render(); save(); });
  $('import-file').addEventListener('change', e => importData(e.target.files[0]));
  window.addEventListener('beforeunload', save);
  render();
})();
