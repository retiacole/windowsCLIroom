(function (root, factory) {
  'use strict';
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.WCRData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const t = (ja, en) => ({ ja, en });
  const c = String.raw;
  const check = (name, contains = [], outputIncludes = []) => {
    const paths = contains.filter(value => /^[A-Za-z]:\\/.test(value));
    return { name, contains: contains.filter(value => !paths.includes(value)), outputIncludes, ...(paths.length ? { paths } : {}) };
  };
  const recheck = (name, contains = [], outputIncludes = []) => ({ ...check(name, contains, outputIncludes), restartOnRepeat: true });
  const ask = (prompt, explanation) => ({ prompt, explanation });
  const opt = (ja, en, feedbackJa, feedbackEn) => ({ text: t(ja, en), feedback: t(feedbackJa, feedbackEn) });
  // Choices describe plausible misreadings of the observed evidence, not unrelated actions.
  const interpretationChoices = {
    'read-a-log': [
      opt("09:05 に印刷が完了したものとして、対応を終了する。", "Close the ticket on the basis that printing completed at 09:05.", 'Retry scheduled は予定です。09:08 にはジョブの失敗が記録されています。', 'Retry scheduled is a plan. The 09:08 entry records a failed job.'),
      opt("印刷の失敗が記録されており、サービスの現在状態は別の照会が必要。", "Printing failures are recorded, so query the service’s current state separately.", '印刷サービスとジョブのエラーがあります。現在の状態は追加照会が必要です。', 'The log records service and job errors. Current state needs a separate query.'),
      opt("09:00 の起動後は正常稼働として扱い、アプリ以外を調べる。", "Assume normal operation after the 09:00 startup and investigate outside the app.", '起動の記録は、その後の正常動作を保証しません。後続の ERROR も読みます。', 'Startup does not establish later health. Read the subsequent ERROR entries too.')
    ],
    'list-processes': [
      opt('アプリのインストール時に決まる識別番号。', 'An identifier assigned when an app is installed.', 'PID は実行中のプロセスの番号です。再起動時には変わり得ます。', 'A PID identifies a running process and may change after it restarts.'),
      opt('現在実行中のプロセスを識別する番号。', 'An identifier for a currently running process.', 'NotesApp.exe の今回の実行は PID 4320 で識別できます。', 'PID 4320 identifies this running instance of NotesApp.exe.'),
      opt('そのユーザーのログオンセッションの番号。', 'The number of the user’s logon session.', 'tasklist の Session# は別の列です。PID と区別します。', 'Session# is a separate tasklist column; it is not the PID.')
    ],
    'stop-one-app': [
      opt('前回使った PID と今回のアプリ名を照合する。', 'Match the current app name against the PID used last time.', 'PID は変わり得ます。今回の tasklist で対象を確かめます。', 'PIDs can change. Identify the current target in tasklist.'),
      opt('今回の PID・未保存データ・他の処理への影響を確認する。', 'Check the current PID, unsaved work, and effects on other tasks.', '終了前の対象確認と影響確認が必要です。今回は保存済みと確認されています。', 'Identify the target and assess impact before stopping it. This task confirms the work is saved.'),
      opt('終了メッセージを見てから、対象が正しかったか確認する。', 'Check whether the target was correct after reading the termination result.', '終了後では未保存データを戻せない場合があります。対象確認は操作の前です。', 'Unsaved work may be lost by then. Identify the target before acting.')
    ],
    'service-state': [
      opt("ジョブ待ちと判断し、プリンター側の待機設定を調べる。", "Interpret it as waiting for a job and inspect the printer’s idle settings.", 'STOPPED はサービス停止です。ジョブ待ちの RUNNING とは異なります。', 'STOPPED means the service is stopped, not running while waiting for work.'),
      opt("停止状態と読み、停止理由と開始可否を調べる。", "Read it as stopped and investigate why and whether it can be started.", '停止は確認済みです。開始の可否と背景を確認して対応します。', 'The stopped state is established. Check the context and whether starting it is appropriate.'),
      opt("サービスの未登録を疑い、追加導入の手順を確認する。", "Suspect a missing service and review the installation procedure.", 'query は Spooler を見つけて STATE を返しています。未登録ではありません。', 'The query found Spooler and returned its STATE; the service is installed.')
    ],
    'service-configuration': [
      opt('自動起動に設定されているため、現在も動作中。', 'It is running now because its startup mode is automatic.', 'AUTO_START は設定です。現在の STATE は STOPPED です。', 'AUTO_START is configuration. The current STATE is STOPPED.'),
      opt('起動方法は自動だが、現在のサービスは停止中。', 'Startup is automatic, but the service is currently stopped.', 'qc の START_TYPE と query の STATE を別々に読んだ結論です。', 'This correctly distinguishes START_TYPE from qc and STATE from query.'),
      opt('現在停止しているため、起動方法は無効に設定済み。', 'Its startup mode is disabled because it is currently stopped.', '停止中でも起動方法は自動に設定できます。qc は AUTO_START を示しています。', 'A stopped service can be configured as automatic; qc shows AUTO_START.')
    ],
    'read-file-permissions': [
      opt("(RX) の書き込み許可を前提に、共有以外の保存先を調べる。", "Assume (RX) permits writing and investigate storage outside the share.", '(RX) は読み取りと実行です。変更を表す (M) とは違います。', '(RX) means Read and execute. Modify is (M).'),
      opt("(RX) だけで断定せず、グループと共有権限も照合する。", "Compare groups and share permissions too, because (RX) alone does not describe effective access.", 'この RX の行だけでは実効アクセスの全体は分かりません。', 'This RX entry alone does not describe all effective access.'),
      opt("(OI)(CI) をこのフォルダーだけの許可として扱い、子への継承を除外する。", "Treat (OI)(CI) as permissions only for this folder and disregard child inheritance.", '(OI) は子ファイル、(CI) は子フォルダーへの継承に関するフラグです。', '(OI) concerns inheritance by child files; (CI) concerns child folders.')
    ],
    'disk-free-space': [
      opt('Total bytes の値を、更新で利用できる容量として比較する。', 'Compare Total bytes with the update’s space requirement.', 'Total bytes は総容量です。現在利用できる空き容量とは違います。', 'Total bytes is the volume’s capacity, not currently available space.'),
      opt('利用者が使える空き容量と必要量を比べ、整理方法を選ぶ。', 'Compare caller-available free space with the requirement, then plan cleanup.', '必要量との比較には Total quota free bytes など利用可能量の欄を使います。', 'Compare the requirement with available space, such as Total quota free bytes.'),
      opt("容量の照会成功を健全性の検査完了と読み、ディスクの調査を終える。", "Read a successful space query as a completed health test and end the disk investigation.", 'diskfree は容量の照会です。媒体やファイルシステムの健全性の検査ではありません。', 'diskfree queries space; it does not test storage or filesystem health.')
    ],
    'ip-address-and-dns': [
      opt('別ネットワーク宛てのパケットを転送する。', 'Forward packets toward other networks.', 'その役割は通常ゲートウェイです。この演習では 10.20.0.1 です。', 'That is normally the gateway’s role; here it is 10.20.0.1.'),
      opt('ホスト名に対応する IP アドレスなどを回答する。', 'Resolve host names to IP addresses.', 'DNS は名前とアドレスなどを対応づけます。演習の DNS は 10.20.0.10 です。', 'DNS maps names to records such as addresses. This lab uses 10.20.0.10.'),
      opt('PC に IP アドレスのリースを配布する。', 'Distribute IP address leases to PCs.', 'リース配布は DHCP の役割です。DNS の名前解決とは区別します。', 'DHCP distributes leases. That differs from DNS name resolution.')
    ],
    'wifi-connection': [
      opt("無線接続は成立済みと読み、DHCP のリース期間を確認する。", "Read Wi-Fi as connected and check the DHCP lease duration.", 'State は disconnected です。まず無線接続を確認します。', 'State is disconnected. Check the wireless connection first.'),
      opt("無線が未接続と読み、接続先の選択と無線の有効状態を確認する。", "Read the wireless connection as disconnected and check the selected network and radio state.", '無線の未接続と Media disconnected が一致しています。接続自体が出発点です。', 'The wireless and adapter outputs both show disconnection. Start with the connection.'),
      opt('DNS の回答不良として、社内名の登録を確認する。', 'Treat this as a DNS-answer problem and inspect the internal name record.', 'まだ DNS の回答を調べられる接続がありません。出力が示すのは未接続です。', 'The evidence shows no connection, not a bad DNS answer.')
    ],
    'ping-loopback': [
      opt('PC からデフォルトゲートウェイまで ICMP が往復した。', 'ICMP traveled between the PC and its default gateway.', '宛先はゲートウェイではなく 127.0.0.1 です。', 'The target was 127.0.0.1, not the gateway.'),
      opt('この PC のループバック宛ての IP 通信が応答した。', 'The PC replied to IP traffic addressed to its local loopback.', '127.0.0.1 は自分自身です。外部の通信経路はまだ調べていません。', '127.0.0.1 is local. No external network path was tested.'),
      opt('Wi-Fi の接続先から、この PC へ応答が返った。', 'The Wi-Fi access point sent a reply back to this PC.', 'ループバックの通信は Wi-Fi の接続を検証しません。', 'Loopback traffic does not test the Wi-Fi connection.')
    ],
    'compare-dns-servers': [
      opt("社内名の登録漏れとして、DNS サーバー側のレコードを調べる。", "Treat the internal name as missing and inspect the DNS server’s records.", '10.20.0.10 を指定した照会では既存の回答が得られています。', 'The query to 10.20.0.10 returned an existing record.'),
      opt("利用すべき DNS と DHCP・VPN の配布設定を照合する。", "Compare the intended DNS server with DHCP and VPN settings.", '問い合わせ先で結果が変わります。まず利用すべき DNS と設定を照合します。', 'The result changes with the DNS server. Check the intended server and configuration.'),
      opt("ローカルキャッシュの更新不足を疑い、flushdns 後の変化を確認する。", "Suspect an unrefreshed local cache and check what changes after flushdns.", '今回比較した nslookup は DNS への直接照会です。問い合わせ先の差が根拠です。', 'These nslookup commands query DNS directly. The evidence is a difference between servers.')
    ],
    'inspect-dns-cache': [
      opt("DNS の旧レコードを原因と読み、サーバー側の登録を調べる。", "Attribute the issue to an old DNS record and inspect the server’s registration.", '直接照会の回答は 10.20.0.20 です。旧値はローカル表示にあります。', 'The direct answer is 10.20.0.20. The old value appears in the local cache.'),
      opt("直接照会とローカル表示を比較し、PC のキャッシュに旧値が残ると読む。", "Read the difference between the direct query and local display as evidence of a stale PC cache.", 'displaydns の .99 と nslookup の .20 が異なり、ローカルの古い情報を疑えます。', 'displaydns shows .99 while nslookup shows .20, suggesting stale local information.'),
      opt("nslookup が正常に返ったため、キャッシュの更新も完了と読む。", "Read a successful nslookup answer as completion of the local cache refresh too.", 'nslookup の直接照会は、表示された古いリゾルバーキャッシュの更新を意味しません。', 'A direct nslookup query does not establish that the stale resolver cache was refreshed.')
    ],
    'trace-a-route': [
      opt("応答のない機器で転送が止まった。そこの障害ログを調べる。", "Forwarding stopped at the unresponsive device; inspect its fault logs.", '* はその試行への応答なしです。後続に応答があれば転送は続いている場合があります。', '* means no probe response. Later replies may show that forwarding continued.'),
      opt("* は応答制限の可能性もあると読み、後続ホップと最終宛先の結果を確認する。", "Read * as possibly reflecting response limits, then examine later hops and the destination.", '途中の応答制限と宛先への到達性を分けて読む判断です。', 'This separates intermediate response limits from destination reachability.'),
      opt("* は名前解決の失敗と読み、DNS の設定を確認する。", "Read * as a name-resolution failure and check DNS configuration.", 'ホップの * はそのプローブのタイムアウトです。DNS の失敗表示とは異なります。', 'A hop’s * is a probe timeout, not a DNS-failure indicator.')
    ],
    'routing-table': [
      opt("DC 宛て /32 がポータルも含むと読み、Web サービス側を調べる。", "Assume the DC’s /32 route also covers the portal and investigate the web service.", '/32 は特定の一つの IP です。10.20.0.10 の経路は .20 を含みません。', '/32 covers one IP. A route to 10.20.0.10 does not cover .20.'),
      opt("VPN の接続とは別に、ポータル向けの配布経路を調べる。", "Inspect the distributed route to the portal separately from VPN connection status.", 'VPN は接続中でも、ポータルを含む社内経路が欠けています。', 'The VPN is connected, but the route covering the portal is missing.'),
      opt("デフォルト経路で社内宛ても VPN を通ると読み、ポータルのログを調べる。", "Assume the default route sends internal traffic through the VPN and inspect the portal’s logs.", '表示のデフォルト経路は自宅側です。存在するだけで VPN 経由とは言えません。', 'The displayed default route uses the home connection; its presence does not imply a VPN path.')
    ],
    'arp-neighbors': [
      opt('経路上の遠隔サーバーの MAC アドレスを順に記録した一覧。', 'A sequence of remote-server MAC addresses along the route.', '遠隔宛てでは通常、ローカルの次ホップの MAC を使います。', 'Remote traffic normally uses the MAC address of a local next hop.'),
      opt('この PC が保持する、ローカルリンクの IP と MAC の対応表。', 'Local-link IP-to-MAC mappings currently held by this PC.', 'arp -a は近隣の対応キャッシュです。必要に応じて追加・更新されます。', 'arp -a displays the neighbor cache, which is populated and updated as needed.'),
      opt('現在アプリで接続中のサーバーだけを記録した一覧。', 'A list limited to servers with active application connections.', 'ARP キャッシュはアプリ接続の一覧ではありません。接続状態には netstat などを使います。', 'The ARP cache is not an application-connection list; inspect connections separately.')
    ],
    'path-loss': [
      opt("途中の機器で転送損失が起きたと読み、その機器のエラーを調べる。", "Read the missing replies as forwarding loss at that device and inspect its errors.", 'プローブへの応答は制限され得ます。転送損失と同じとは限りません。', 'Probe responses may be limited without equivalent forwarding loss.'),
      opt("途中の応答が制限された可能性もある。宛先の損失と利用者の症状を比較する。", "Intermediate replies may be limited; compare destination loss with the user’s symptoms.", '途中の応答と最終宛先までの結果を合わせると、断定を避けて切り分けられます。', 'Combining intermediate and destination results supports a more reliable diagnosis.'),
      opt('宛先に応答があるので、業務アプリの遅さは確認対象から外す。', 'Exclude application slowness because the destination replied.', 'ICMP の応答は業務処理の時間を測定していません。実症状の確認も必要です。', 'An ICMP reply does not measure application response time. Check the actual symptom too.')
    ],
    'connections-and-pid': [
      opt('HTTP 要求に成功応答が返り、ページ取得が完了している。', 'The HTTP request succeeded and page retrieval is complete.', 'ESTABLISHED は TCP の状態です。HTTP の結果は表示していません。', 'ESTABLISHED is a TCP state; it does not report the HTTP result.'),
      opt("TCP 接続は成立したが、HTTP や業務処理の成功までは分からない。", "TCP is established, but that does not establish HTTP or workflow success.", '接続の成立と、必要な内容や業務処理の成功は別です。', 'A connection being established is separate from correct content or a successful workflow.'),
      opt('そのローカルポートは、これから来る接続を待ち受けている。', 'The local port is waiting for a new incoming connection.', '待ち受けの表示は LISTENING です。ESTABLISHED と区別します。', 'A listening socket is shown as LISTENING, not ESTABLISHED.')
    ],
    'winhttp-proxy': [
      opt("WinHTTP の値を curl の設定として扱い、その設定ファイルを調べる。", "Treat the WinHTTP value as curl’s configuration and inspect curl’s configuration file.", 'curl が同じ設定を使うとは限りません。対象クライアントの設定を確認します。', 'curl may use different configuration. Check the actual client’s settings.'),
      opt("この業務クライアントの WinHTTP 設定を、社内の想定設定と照合する。", "Compare this business client’s WinHTTP settings with the intended configuration.", 'この業務同期クライアントは WinHTTP を使用します。表示はその調査に対応します。', 'This sync client uses WinHTTP, so these settings are relevant to its investigation.'),
      opt("ブラウザーで開けるため WinHTTP も正常と読み、同期データの形式を調べる。", "Infer correct WinHTTP configuration from browser success and inspect the sync data format.", 'ブラウザーと WinHTTP クライアントでは、参照する設定が異なる場合があります。', 'The browser and WinHTTP client may use different proxy settings.')
    ],
    'firewall-profile': [
      opt('対象通信がこのファイアウォールで遮断されたことが分かる。', 'The result shows that this firewall blocked the connection in question.', 'ON は有効状態です。特定通信の遮断を示す記録ではありません。', 'ON means enabled; it is not a record of a particular blocked connection.'),
      opt("ON は有効状態であり、個別通信の許可・遮断の結果とは別。", "ON means enabled, while individual connection permissions are separate.", '全体状態と個別通信の判定を分けて読む必要があります。', 'Separate the overall profile state from a verdict for one connection.'),
      opt('Domain プロファイルなので、社内宛ての通信は許可済みと分かる。', 'A Domain profile shows that traffic to internal destinations is permitted.', 'プロファイル名だけでは、対象アプリやポートの許可を判断できません。', 'The profile name alone does not establish permission for an app or port.')
    ],
    'curl-detailed-request': [
      opt("標準エラー出力があるため TLS 失敗と読み、証明書を調べる。", "Read the presence of stderr output as a TLS failure and investigate the certificate.", '成功した要求の診断も標準エラー出力に書かれます。結果を合わせて読みます。', 'Diagnostics for successful requests also use standard error. Read the actual results.'),
      opt("詳細表示は成功時にも出るため、要求と応答、終了結果を照合して読む。", "Successful requests also produce verbose output, so read the request, response, and exit result together.", 'この演習では本文も得ています。出力先の名称だけでは失敗と判断しません。', 'This exercise also receives a body. The stream’s name alone does not indicate failure.'),
      opt("送信ヘッダーを応答ヘッダーとして扱い、サーバーの返却内容を確認する。", "Treat outgoing headers as response headers and use them to check what the server returned.", '詳細表示には送信と受信の両方があります。要求と応答を区別します。', 'Verbose output includes both directions. Distinguish the request from the response.')
    ],
    'domain-user-and-groups': [
      opt("AD へ直接照会した最新の所属情報と読み、変更反映済みとして扱う。", "Treat this as a fresh AD membership query and assume membership changes have been reflected.", 'whoami /groups は現在のログオン情報です。AD の変更が未反映の場合があります。', 'whoami /groups describes the current logon; recent AD changes may not be reflected.'),
      opt("現在のログオン情報と読み、対象側の許可・拒否と照合する。", "Read this as current logon information and compare it with the target’s allow and deny entries.", '所属と対象側の許可・拒否などを照合して、アクセスを調べます。', 'Investigate access by comparing membership with the target’s allow and deny entries.'),
      opt("Domain Users に属するため共有の変更は許可済みと読み、NTFS 権限だけを確認する。", "Infer share Modify permission from Domain Users membership and check only NTFS permissions.", 'グループ名だけでは共有や NTFS の権限は分かりません。', 'A group name alone does not establish share or NTFS permissions.')
    ],
    'group-policy-results': [
      opt("CORP-Desktop がドライブも割り当てる前提で、共有先の権限を調べる。", "Assume CORP-Desktop also maps the drive and investigate permissions on the share.", 'CORP-Desktop と CORP-Drive-Map は別のポリシーです。後者は一覧にありません。', 'CORP-Desktop and CORP-Drive-Map are different policies. The latter is absent.'),
      opt("必要な GPO がないため、DC 接続と更新後の適用結果を確認する。", "The required GPO is absent, so check DC access and post-refresh results.", '今回必要な CORP-Drive-Map が適用一覧にないため、配布と適用を調べます。', 'CORP-Drive-Map is missing from the applied list, so investigate delivery and application.'),
      opt("gpresult で更新も完了した前提で、共有サーバーの障害を調べる。", "Assume gpresult also completed a policy refresh and investigate a share-server fault.", 'gpresult は記録済みの結果の照会です。更新を実行するコマンドではありません。', 'gpresult queries recorded results; it does not perform a policy refresh.')
    ],
    'time-synchronization': [
      opt("最終同期時刻を現在の時計と読み、他 PC の現在時刻と比較する。", "Read the last sync timestamp as the current clock and compare it with another PC’s current time.", 'その欄は同期に成功した時点の記録です。現在時刻とは別です。', 'That field records when synchronization succeeded, not the current clock time.'),
      opt("記録時点の同期成功は分かるが、現在の時刻差は別に測って比較する。", "A successful sync was recorded, but the current offset needs a separate measurement and comparison.", '同期履歴と、現在の時刻差の実測を分けた解釈です。', 'This distinguishes synchronization history from a current offset measurement.'),
      opt("同期先が DC のため、現在の時刻差はゼロと読む。", "Read a DC time source as evidence of zero current offset.", '同期先の名前は、現在の差の測定値ではありません。', 'The time source’s name is not a measurement of current offset.')
    ],
    'share-server-diagnosis': [
      opt('ping 成功を SMB 接続成功として扱い、ファイル自体だけを調べる。', 'Treat ping success as SMB success and investigate only the file itself.', 'ping が確認したのは ICMP です。SMB の接続や認証は未確認です。', 'Ping tested ICMP. SMB connectivity and authentication remain untested.'),
      opt("正確なエラーと共有サービス・資格情報・権限を調べる。", "Inspect the exact error, sharing service, credentials, and permissions.", '割り当て・DNS・ICMP までを確認したので、共有アクセスの条件を調べます。', 'Mapping, DNS, and ICMP were checked; next investigate the conditions for share access.'),
      opt("DNS の回答を共有認証の成功と読み、ファイル破損の有無を確認する。", "Read a DNS answer as successful share authentication and check for file corruption.", 'DNS の回答はサーバーのアドレスです。共有への認証結果ではありません。', 'A DNS answer supplies an address, not a share-authentication result.')
    ],
    'renew-dhcp-lease': [
      opt("リースの更新に失敗した。DHCP サーバー側のログ確認を依頼する。", "The lease renewal failed; request a check of the DHCP server logs.", 'DHCP は同じアドレスのリースを更新できます。更新結果も確認します。', 'DHCP can renew a lease for the same address. Read the renewal result too.'),
      opt("同じアドレスでもリースを更新できるため、更新結果と更新後の設定を読む。", "A lease can be renewed for the same address, so read the renewal result and resulting settings.", 'アドレス変更は成功の条件ではありません。元の症状も別途確認します。', 'An address change is not required for success. Retest the original symptom separately.'),
      opt("静的 IP 設定と判断し、管理台帳の固定アドレスを確認する。", "Infer a static IP configuration and check its assigned address in the inventory.", '更新前の DHCP Enabled は Yes です。同じ番号でも DHCP の接続です。', 'DHCP Enabled was Yes. An unchanged address can still be DHCP-configured.')
    ],
    'refresh-dns-cache': [
      opt('DNS サーバー側のレコードを .99 から .20 へ変更した。', 'Changed the DNS server’s record from .99 to .20.', 'flushdns が変更するのは PC のキャッシュです。サーバーの回答は既に .20 でした。', 'flushdns clears the PC’s cache. The server already answered .20.'),
      opt('古いローカル情報を消去し、現在のアドレスから ICMP 応答を得た。', 'Cleared the local cache and received ICMP replies from the current IP.', '消去後の ping は 10.20.0.20 に応答しています。Web の動作は別の確認です。', 'The post-flush ping replies from 10.20.0.20. Web behavior needs a separate check.'),
      opt('ポータルから HTTP の成功応答を取得した。', 'Received a successful HTTP response from the portal.', 'この課題の再確認は ping です。HTTP 要求はまだ送っていません。', 'This lesson rechecks with ping; it has not sent an HTTP request.')
    ],
    'start-print-service': [
      opt("印刷完了と判断し、利用者へ対応終了を連絡する。", "Infer completed printing and tell the user that the incident is resolved.", 'RUNNING はサービス状態です。印刷ジョブの完了記録ではありません。', 'RUNNING is a service state, not a record of a completed print job.'),
      opt("サービス開始後の印刷操作を再試行して結果を確認する。", "Retry printing and check its result after the service has started.", 'サービス開始後に、利用者が必要な機能まで確認する手順です。', 'After service startup, verify the function the user actually needs.'),
      opt("自動起動への変更が済んだとして、設定変更の完了を報告する。", "Assume automatic startup was configured and report the configuration change as complete.", 'query の STATE と起動方法の設定は別です。net start は今回の開始操作です。', 'STATE differs from startup configuration. net start starts the service now.')
    ],
    'refresh-group-policy': [
      opt("更新メッセージだけを根拠に、利用者の設定も反映済みと読む。", "Read the refresh message alone as evidence that the user’s setting has been applied.", '更新の成功と実際の反映は別です。gpresult と対象設定を確認します。', 'A successful refresh differs from visible application. Check gpresult and the target setting.'),
      opt("対象 GPO と割り当て、再ログオンの要否を照合する。", "Compare the target GPO, mapping, and any required new sign-in.", 'この演習では適用一覧と Z: の反映を確認します。実機では追加条件にも従います。', 'This task checks the applied list and Z: mapping. Real systems may have further requirements.'),
      opt("割り当て表示を根拠に、共有への書き込み成功まで報告する。", "Use the mapping display to report successful writing to the share too.", '割り当ての反映は確認できますが、ファイルへの書き込みは試していません。', 'The mapping is visible, but no file write has been tested.')
    ],
    'system-file-verification': [
      opt('整合性の問題が見つかり、この実行で修復も完了した。', 'Integrity problems were found and repaired by this command.', '/verifyonly は検証のみです。修復操作を実行したことにはなりません。', '/verifyonly verifies only; it does not perform repair.'),
      opt("整合性違反の検出であり、修復完了ではないと読む。", "Read this as detection of integrity violations, not completion of a repair.", 'found integrity violations は検出結果です。次の対応の根拠として記録します。', 'found integrity violations is a detection result to record for the next step.'),
      opt('整合性の問題が見つかり、元の障害の原因も特定できた。', 'Integrity problems were detected, establishing the original fault’s cause.', '検出と元の症状の因果関係は別の確認です。出力だけで原因は確定しません。', 'Detection alone does not establish a causal link to the original symptom.')
    ],
    'windows-image-health': [
      opt('この実行で新しく詳細スキャンを完了した。', 'This command completed a fresh detailed scan.', '/CheckHealth は記録済み状態の確認です。新しいスキャンは /ScanHealth です。', '/CheckHealth checks recorded status; /ScanHealth performs a fresh scan.'),
      opt("記録済みの状態を参照した結果であり、新規スキャンや修復とは別。", "This is a check of recorded status, separate from a fresh scan or repair.", 'repairable は修復可能という状態です。修復を完了したという意味ではありません。', 'repairable describes a state that can be repaired, not a completed repair.'),
      opt('repairable の表示を、修復が完了した結果として読む。', 'Read repairable as the result of a completed repair.', '修復を試みるオプションは /RestoreHealth です。今回は指定していません。', '/RestoreHealth attempts repair; it was not used here.')
    ],
    'capstone-stale-portal': [
      opt('社内 DNS の登録を変更し、ポータルの名前解決を修復した。', 'Changed the company DNS record and repaired portal name resolution.', '変更したのは PC のキャッシュです。DNS サーバーのレコードは編集していません。', 'Only the PC’s cache was changed. The DNS server record was not edited.'),
      opt("キャッシュ更新後の HEAD 応答で、HTTP 200 を確認した。", "The HEAD request after refreshing the cache returned HTTP 200.", '記録は旧キャッシュ・DNS 回答・更新後の HTTP 応答を示しています。', 'The report records the old cache, DNS answer, and post-refresh HTTP response.'),
      opt('ポータルの本文を取得し、ログイン後の処理まで確認した。', 'Retrieved the portal body and verified the workflow after sign-in.', '-I は HEAD 要求です。本文やログイン後の処理は今回の確認対象に含まれません。', '-I sends HEAD. This check did not retrieve a body or test a signed-in workflow.')
    ],
    'capstone-printing': [
      opt('サービスの再照会で、印刷ジョブの正常終了を確認した。', 'The second service query confirmed a print job completed successfully.', '再照会が示すのはサービスの状態で、印刷ジョブの結果ではありません。', 'The second query reports service state, not a print-job result.'),
      opt("Spooler は開始済みだが、印刷操作はまだ未実施。", "Spooler has started, but printing has not yet been tried.", '変更前後の状態は保存済みです。実物への印刷は未確認として報告します。', 'Before/after states are recorded. Report physical printing as still untested.'),
      opt('Spooler の起動方法を自動に変更し、設定の反映を確認した。', 'Changed Spooler to automatic startup and verified the configuration.', 'net start はサービス開始です。起動方法を変更する操作は行っていません。', 'net start starts the service; no startup-mode change was performed.')
    ],
    'capstone-http-503': [
      opt('curl が正常終了したため、ポータルを利用可能と報告する。', 'Report the portal as available because curl exited successfully.', '通常の curl は 503 を受信しても終了コード 0 になり得ます。HTTP 状態も読みます。', 'curl can exit with code 0 after receiving 503. Inspect the HTTP status too.'),
      opt("DNS と ICMP の応答、HTTP 503 を根拠に、Web 側の運用担当へ調査を引き継ぐ。", "Hand the investigation to web operations with the DNS and ICMP replies and the HTTP 503 as evidence.", '層ごとの結果がそろっています。503 の発生元は Web 側の追加調査が必要です。', 'The layers show different results. Investigate the source of the 503 along the web path.'),
      opt("名前解決の失敗として、DNS サーバーの設定確認を依頼する。", "Treat this as a name-resolution failure and request a DNS-server configuration check.", 'nslookup は .20 を回答し、HTTP 応答も届いています。DNS 失敗という証拠ではありません。', 'nslookup returned .20 and an HTTP response arrived. This is not evidence of DNS failure.')
    ],
    'capstone-vpn-route': [
      opt('DC が見つかったため、ポータルへの VPN 経路も確認済み。', 'DC discovery also verifies the VPN route to the portal.', 'DC の /32 経路は .10 だけです。ポータルの .20 は含みません。', 'The DC’s /32 route covers .10 only, not the portal at .20.'),
      opt('DNS と DC 検出の成功と社内経路の不足を記録し、想定設定と照合する。', 'Record successful DNS and DC discovery alongside the missing internal route and compare the intended settings.', '回答の .20 に対する社内経路が不足しています。修復は未実施として引き継ぎます。', 'The route covering the returned .20 address is missing. Hand off with repair still pending.'),
      opt('ポータルが開かないため、VPN の社内 DNS が応答していない。', 'The internal VPN DNS server is not responding because the portal will not open.', 'nslookup は社内 DNS から .20 の回答を得ています。名前解決は確認済みです。', 'nslookup received the .20 answer from internal DNS. Name resolution was verified.')
    ]
  };
  const lesson = (spec) => {
    // Rotate answer positions deterministically so a correct option is not always in one place.
    let question = spec.question;
    if (question) {
      const options = interpretationChoices[spec.id];
      if (!options || options.length !== 3) throw new Error('Missing interpretation choices: ' + spec.id);
      question = { ...question, choices: options.map((choice, index) => ({ id: 'abc'[index], ...choice })), answer: 'b' };
      const shift = Array.from(spec.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % question.choices.length;
      const ordered = question.choices.slice(shift).concat(question.choices.slice(0, shift));
      const answerIndex = ordered.findIndex(choice => choice.id === question.answer);
      question = { ...question, choices: ordered.map((choice, index) => ({ ...choice, id: 'abc'[index] })), answer: 'abc'[answerIndex] };
    }
    return { ...spec, ...(question ? { question } : {}), session: { scenario: 'base', ...(spec.session || {}) } };
  };
  const tracks = [
    { id: 'basics', title: t('コマンドの入口', 'Getting comfortable'), subtitle: t('場所・ファイル・結果の保存', 'Paths, files, and saved evidence'), description: t('まずは短い操作から。現在地を確かめ、ファイルを読み、調査結果を残します。', 'Start with small steps: find your location, read files, and keep useful evidence.') },
    { id: 'pc', title: t('PC とアプリを調べる', 'Inspect the PC and its apps'), subtitle: t('端末情報・プロセス・サービス', 'System details, processes, and services'), description: t('「何が、どの状態か」をコマンドで確認します。変更の前に状態を把握する習慣をつけます。', 'Find out what is running and what state it is in. Build the habit of checking before changing.') },
    { id: 'network', title: t('ネットワークを切り分ける', 'Trace a network problem'), subtitle: t('接続 → IP → DNS → 経路 → Web', 'Connection → IP → DNS → route → web'), description: t('同じ「つながらない」でも原因はさまざま。層を一つずつ確認して、調査する範囲を絞ります。', '“Cannot connect” has many causes. Check one layer at a time to narrow the investigation.') },
    { id: 'workplace', title: t('職場の Windows', 'Windows at work'), subtitle: t('共有フォルダー・AD・ポリシー・時刻', 'Shares, AD, policies, and time'), description: t('AD DS ドメインに参加した架空の社内 PC で、日常の問い合わせに必要な情報を集めます。', 'Gather everyday support evidence on a fictional PC joined to an AD DS domain.') },
    { id: 'recovery', title: t('復旧と総合演習', 'Recover and put it together'), subtitle: t('確認 → 最小限の操作 → 再確認', 'Observe → make a small change → verify'), description: t('根拠のある操作だけを行い、改善したかを確かめます。最後は複数のコマンドで問い合わせに答えます。', 'Make a justified change and check the result. Finish by combining commands into a support investigation.') }
  ];
  const lessons = [
    // Every lesson starts from a fresh session; no earlier lesson is a prerequisite for state.
    lesson({
      id: 'help-first', track: 'basics', title: t('01 · 入り口は help', '01 · Start with help'),
      goal: t('画面、シェル、コマンドの違いを知り、使い方を調べる。', 'Distinguish a terminal, a shell, and a command, then look up help.'),
      explanation: [t('Windows Terminal は文字を入出力するためのアプリです。その中で動くコマンドプロンプト（CMD）と PowerShell は別のシェルです。この room は CMD を想定した練習用シミュレーターです。', 'Windows Terminal is an app that hosts text-based sessions. Command Prompt (CMD) and PowerShell are different shells that can run inside it. This room simulates a small, CMD-oriented environment.'), t('コマンドは「名前 + 引数」で指示します。help は利用できる操作の案内です。ここでの実行は架空の PC 内だけで完結し、実際の PC やインターネットにはアクセスしません。', 'A command is a name followed by arguments. help lists available commands. Everything here runs in a fictional PC; it never accesses your computer or the internet.'), t('模擬 PC のコマンド出力や日時は英語版 Windows をもとにしています。実機の日本語版 Windows では、メッセージや日時の表記が異なります。この教材の help 案内は表示言語に対応します。', 'Command output and dates on the simulated PC follow English-language Windows. Japanese-language Windows uses different message and date formats. This room’s help descriptions follow the selected UI language.')],
      task: t('help を表示し、続いて dir の使い方を確認してください。', 'Show help, then look up how to use dir.'),
      example: { command: 'help', note: t('名前を続けると、そのコマンドの案内を開けます。', 'Add a command name to open its help.') },
      hints: [t('まず help だけを入力します。', 'Start by entering help on its own.'), t('フォルダー一覧のコマンド名は dir です。', 'The directory-listing command is dir.'), t('2 行目は help dir です。', 'The second line is help dir.')],
      solution: ['help', 'help dir'], success: t('使い方を自分で確認する入口ができました。', 'You now have a way to look up a command before using it.'),
      verify: { commands: [{ name: 'help', argsEqual: [] }, check('help', ['dir'])], orderedCommands: [{ name: 'help', argsEqual: [] }, { name: 'help', argsEqual: ['dir'] }] }
    }),
    lesson({
      id: 'current-directory', track: 'basics', title: t('02 · 今いる場所を確かめる', '02 · Know where you are'),
      goal: t('現在のフォルダーを確認し、C:\\Lab に移動する。', 'Check the current folder and move to C:\\Lab.'),
      explanation: [t('プロンプトの C:\\Users\\student> は現在地を表します。引数なしの cd でも現在のフォルダーを表示できます。', 'C:\\Users\\student> in the prompt shows your current location. Running cd without arguments also displays the current directory.'), t('C:\\Lab のようにドライブから書く指定は絶対パスです。cd /d はドライブも含めて移動します。', 'A path starting with a drive, such as C:\\Lab, is an absolute path. cd /d changes the drive as well as the directory.'), t('日本語では課題・コマンド例・端末のバックスラッシュを円記号（¥）で表示し、英語ではバックスラッシュで表示します。表示言語を変えても入力内容や保存済みファイルは変わりません。パスに入力した ¥・￥ も区切りとして受け付けます。echo の本文や検索文字列の円記号はそのまま扱います。', 'Japanese UI displays backslashes as yen signs (¥) in lessons, examples, and the terminal; English UI displays backslashes (\\). Changing the display language does not change your input or saved files. This simulator also accepts typed ¥ and ￥ as path separators, while preserving yen signs in echo text and search strings.')],
      task: t('cd で現在地を表示してから、C:\\Lab に移動してください。', 'Display your location with cd, then move to C:\\Lab.'),
      example: { command: c`cd /d C:\Users\student\Documents`, note: t('この例は Documents へ移動します。課題では移動先を変えます。', 'This example opens Documents. Use the destination in the task instead.') },
      hints: [t('cd だけなら、場所を変更せずに表示します。', 'cd on its own displays the location without moving.'), t('移動先は C:\\Lab です。', 'Your destination is C:\\Lab.'), t('cd の後ろに /d と移動先を書きます。', 'Follow cd with /d and the destination.')],
      solution: ['cd', c`cd /d C:\Lab`], success: t('現在地が C:\\Lab になりました。ここを調査用フォルダーとして使います。', 'Your location is now C:\\Lab, the practice investigation folder.'),
      verify: { commands: [{ name: 'cd', argsEqual: [] }, check('cd', [c`C:\Lab`])], orderedCommands: [{ name: 'cd', argsEqual: [] }, check('cd', [c`C:\Lab`])], cwd: c`C:\Lab` }
    }),
    lesson({
      id: 'drives-and-parent', track: 'basics', title: t('03 · ドライブと一つ上の階層', '03 · Drives and parent folders'),
      goal: t('別ドライブへ移動し、.. の意味を確かめる。', 'Switch drives and use .. to go up a folder.'),
      explanation: [t('Windows の C: や D: はドライブを表します。.. は「現在のフォルダーの一つ上」です。', 'C: and D: identify drives in Windows. .. means the parent of the current folder.'), t('cd /d D:\\Support なら、ドライブとフォルダーをまとめて切り替えられます。単に cd D:\\Support とする場合の動きとは違います。', 'cd /d D:\\Support switches both drive and folder. Without /d, a drive change behaves differently in CMD.')],
      task: t('D:\\Support に移動して ticket.txt を読み、最後に cd .. で一つ上の D:\\ へ移動してください。', 'Move to D:\\Support, read ticket.txt there, then use cd .. to go up to D:\\.'),
      example: { command: 'cd ..', note: t('一つ上に移動する短い書き方です。先に目的のフォルダーへ移動しましょう。', 'This moves up one level. First navigate to the folder in the task.') },
      hints: [t('別ドライブへの移動は cd /d を使います。', 'Use cd /d to switch to another drive.'), t('内容表示は type ticket.txt です。', 'Use type ticket.txt to read the file.'), t('D:\\Support で cd .. を実行すると D:\\ になります。', 'From D:\\Support, cd .. takes you to D:\\.')],
      solution: [c`cd /d D:\Support`, 'type ticket.txt', 'cd ..'], success: t('ドライブ、フォルダー、相対パスを組み合わせて操作できました。', 'You used a drive, a folder, and a relative path together.'),
      verify: { orderedCommands: [{ ...check('type', [c`D:\Support\ticket.txt`]), cwd: c`D:\Support` }, { name: 'cd', contains: ['..'], cwd: c`D:\Support`, paths: ['D:\\'] }], cwd: 'D:\\' }
    }),
    lesson({
      id: 'list-files', track: 'basics', title: t('04 · ファイルを一覧する', '04 · List files'),
      goal: t('dir の一覧からファイルとフォルダーを見分ける。', 'Use dir to distinguish files from folders.'),
      explanation: [t('dir は指定したフォルダーの中身を一覧にします。<DIR> のある行はフォルダーです。ファイルの内容までは読みません。', 'dir lists a folder’s contents. Rows marked <DIR> are directories. It does not read the contents of files.'), t('/a は隠し属性などを含む一覧の指定です。実際の PC では、見慣れないファイルを一覧で見つけても、役割を確認する前に消さないようにします。', '/a includes entries with attributes such as Hidden. On a real PC, identify unfamiliar files before deciding what to do with them.')],
      task: t('C:\\Lab を /a 付きで一覧し、続いて C:\\Lab\\Logs を一覧してください。', 'List C:\\Lab with /a, then list C:\\Lab\\Logs.'),
      example: { command: c`dir C:\Users\student`, note: t('パスを指定すると、現在地を変えずに調べられます。', 'A path lets you inspect a folder without changing your location.') },
      hints: [t('最初は dir /a と対象のパスを使います。', 'Start with dir /a and the target path.'), t('Logs は Lab の中のフォルダーです。', 'Logs is a folder inside Lab.'), t('2 回目は dir C:\\Lab\\Logs です。', 'The second command is dir C:\\Lab\\Logs.')],
      solution: [c`dir /a C:\Lab`, c`dir C:\Lab\Logs`], success: t('ファイル名を確認してから内容を読む準備ができました。', 'You can now identify a file before opening it.'),
      verify: { commands: [check('dir', ['/a', c`C:\Lab`]), check('dir', [c`C:\Lab\Logs`])] }
    }),
    lesson({
      id: 'quoted-path', track: 'basics', title: t('05 · 空白を含むパス', '05 · Paths containing spaces'),
      goal: t('ダブルクォートでパスを一つの引数にする。', 'Use double quotes to keep a path in one argument.'),
      explanation: [t('通常、空白は引数の区切りです。Shared Files のような名前を含むパスは、全体を " で囲みます。', 'Spaces normally separate arguments. Enclose the entire path in double quotes when a folder name contains spaces, such as Shared Files.'), t('CMD ではシングルクォートは同じ働きをしません。type はテキストファイルの内容を表示するコマンドです。', 'Single quotes do not serve the same purpose in CMD. type displays the contents of a text file.')],
      task: t('C:\\Lab\\Shared Files\\guide.txt を読んでください。', 'Read C:\\Lab\\Shared Files\\guide.txt.'),
      example: { command: c`type "C:\Lab\readme.txt"`, note: t('空白がなくてもダブルクォートは使えます。課題のパスに置き換えます。', 'Double quotes also work without spaces. Substitute the path from the task.') },
      hints: [t('コマンドは type です。', 'Use type.'), t('ファイル名まで含めたパス全体を囲みます。', 'Quote the full path, including the file name.'), t('type "C:\\Lab\\Shared Files\\guide.txt" と入力します。', 'Enter type "C:\\Lab\\Shared Files\\guide.txt".')],
      solution: [c`type "C:\Lab\Shared Files\guide.txt"`], success: t('空白のあるパスも一つの対象として指定できました。', 'You passed a path with spaces as a single argument.'),
      verify: { commands: [check('type', [c`C:\Lab\Shared Files\guide.txt`])] }
    }),
    lesson({
      id: 'read-a-log', track: 'basics', title: t('06 · ログを読む', '06 · Read a log'),
      goal: t('ログの時刻とメッセージを読み、症状を拾う。', 'Read timestamps and messages to identify a symptom.'),
      explanation: [t('ログはアプリや OS が残す記録です。ERROR はエラーの記録ですが、その一行だけで根本原因が決まるとは限りません。前後の時刻と内容も読みます。', 'A log is a record written by an app or the OS. An ERROR entry records a problem, but one line does not always establish its root cause. Read the surrounding timestamps and messages.'), t('more は実際の CMD では長い出力をページ単位で読むために使えます。この room では短いログをまとめて表示します。', 'In real CMD, more pages through long output. This room displays its short practice log in full.')],
      task: t('more で C:\\Lab\\Logs\\app.log を読み、記録された症状を選んでください。', 'Read C:\\Lab\\Logs\\app.log using more, then identify the recorded symptom.'),
      example: { command: c`more C:\Lab\readme.txt`, note: t('読むファイルを指定します。', 'Specify the file you want to read.') },
      hints: [t('対象は Logs フォルダーの app.log です。', 'The target is app.log in the Logs folder.'), t('09:03 と 09:08 の行に注目します。', 'Look at the 09:03 and 09:08 entries.'), t('印刷サービスと印刷ジョブのエラーが記録されています。', 'The log records a printer-service problem and a failed print job.')],
      solution: [c`more C:\Lab\Logs\app.log`], success: t('観測された症状と、まだ調べる必要がある原因を区別できました。', 'You separated an observed symptom from a cause that still needs investigation.'),
      verify: { commands: [check('more', [c`C:\Lab\Logs\app.log`])] },
      question: ask(t('このログから読み取れることは？', 'What does this log establish?'), t('印刷に関する失敗は確認できます。原因の確定にはサービスや関連設定の追加調査が必要です。', 'The printing failures are recorded. The service and related settings need further investigation to establish the cause.'))
    }),
    lesson({
      id: 'make-a-working-copy', track: 'basics', title: t('07 · 作業用コピーをつくる', '07 · Make a working copy'),
      goal: t('フォルダーをつくり、元のファイルを残してコピーする。', 'Create a folder and copy a file while keeping the original.'),
      explanation: [t('mkdir はフォルダーの作成、copy はファイルのコピーです。調査資料は作業用フォルダーに集めると見返しやすくなります。', 'mkdir creates a folder; copy copies a file. Collecting evidence in a working folder makes it easier to revisit.'), t('copy の順番は「コピー元 コピー先」です。同名ファイルへの上書きには注意します。この課題では新しい場所を使います。', 'copy takes a source followed by a destination. Be careful with overwriting existing names. This task uses a new folder.')],
      task: t('C:\\Lab\\Work を作り、readme.txt をその中へコピーしてください。', 'Create C:\\Lab\\Work and copy readme.txt from C:\\Lab into it.'),
      example: { command: c`copy C:\Lab\readme.txt C:\Lab\Reports\notes.txt`, note: t('コピー先には新しいファイル名も指定できます。', 'The destination may include a new file name.') },
      hints: [t('先に mkdir C:\\Lab\\Work を実行します。', 'First run mkdir C:\\Lab\\Work.'), t('元ファイルは C:\\Lab\\readme.txt です。', 'The source is C:\\Lab\\readme.txt.'), t('コピー先を C:\\Lab\\Work\\readme.txt にします。', 'Set the destination to C:\\Lab\\Work\\readme.txt.')],
      solution: [c`mkdir C:\Lab\Work`, c`copy C:\Lab\readme.txt C:\Lab\Work\readme.txt`], success: t('元ファイルを残したまま作業用のコピーができました。', 'You created a working copy and kept the original.'),
      verify: { commands: [check('mkdir', [c`C:\Lab\Work`]), check('copy', [c`C:\Lab\readme.txt`, c`C:\Lab\Work\readme.txt`])], files: [{ path: c`C:\Lab\Work\readme.txt`, includes: ['PC-014 support notes'] }, { path: c`C:\Lab\readme.txt`, includes: ['PC-014 support notes'] }] }
    }),
    lesson({
      id: 'move-and-rename', track: 'basics', title: t('08 · 移動と名前の変更', '08 · Move and rename'),
      goal: t('ファイルの移動と名前変更で、作業ファイルを整理する。', 'Organize a working file by moving and renaming it.'),
      explanation: [t('move はファイルを移動し、ren は名前を変更します。copy と違い、移動後は元の場所からなくなります。', 'move relocates a file, and ren changes its name. Unlike copy, a move removes the file from its original location.'), t('ren の新しい名前は、この演習ではファイル名だけで指定します。フォルダーの移動は move で行います。', 'For ren, supply only the new file name in this exercise. Use move to change folders.'), t('move も、移動先に別のファイル名を指定すると名前を変更できます。この課題では Reports へ移した後、ren と move のどちらで名前を変更してもかまいません。', 'move can also rename a file when its destination uses a different file name. After moving the file into Reports, you can use either ren or move to rename it in this task.')],
      task: t('C:\\Lab\\draft.txt を Reports へ移し、ticket-1042.txt に名前を変えてください。', 'Move C:\\Lab\\draft.txt into Reports, then rename it to ticket-1042.txt.'),
      example: { command: c`ren C:\Lab\example.txt final.txt`, note: t('名前の変更の形です。課題には別のファイル名を使います。', 'This shows the form of a rename. Use the file names in the task.') },
      hints: [t('move の順番も「元 先」です。', 'move also takes the source before the destination.'), t('移動先は C:\\Lab\\Reports\\draft.txt です。', 'Move it to C:\\Lab\\Reports\\draft.txt.'), t('移動後のパスを ren に渡し、新しい名前を続けます。', 'Pass the moved file path to ren, followed by its new name.')],
      solution: [c`move C:\Lab\draft.txt C:\Lab\Reports\draft.txt`, c`ren C:\Lab\Reports\draft.txt ticket-1042.txt`], success: t('作業ファイルを目的の場所と名前に整理できました。', 'Your working file now has the intended location and name.'),
      session: { files: [{ path: c`C:\Lab\draft.txt`, content: 'Ticket 1042 working notes\n' }] },
      verify: { commands: [check('move', [c`C:\Lab\draft.txt`, c`C:\Lab\Reports\draft.txt`]), {...check('ren', [c`C:\Lab\Reports\draft.txt`, c`C:\Lab\Reports\ticket-1042.txt`]), anyNames: ['ren', 'move']}], files: [{ path: c`C:\Lab\Reports\ticket-1042.txt`, includes: ['Ticket 1042'] }] }
    }),
    lesson({
      id: 'save-and-append', track: 'basics', title: t('09 · 結果をファイルに残す', '09 · Save and append output'),
      goal: t('> と >> の違いを使って、調査メモを作る。', 'Use > and >> to create a short investigation note.'),
      explanation: [t('> は出力先のファイルを作成または上書きします。>> は末尾への追記です。画面に出る代わりにファイルへ保存されます。', '> creates or overwrites the output file. >> appends to its end. The output goes to the file instead of the screen.'), t('echo は指定した短い文字列を出力します。例では見やすさのため > の前後に空白を入れます。実際の CMD では文字列と > の間の空白も行末に保存されますが、この教材では末尾空白を簡略化しています。', 'echo outputs a short piece of text. The examples use spaces around > for readability. Real CMD also saves the space before > at the end of the line; this simulator simplifies trailing spaces.'), t('実機で echo 1>file のように数字を > に隣接させると、1 は本文ではなく標準出力の番号として解釈されます。空白を詰める書き方をすべての文字列へ一般化しないようにします。この出力先番号の構文も教材では簡略化しています。', 'In real CMD, the 1 in echo 1>file is interpreted as the standard-output stream number, not as text to print. Do not assume removing the space works for every string. This simulator also simplifies that stream-number syntax.')],
      task: t('Reports\\notes.txt に PC-014 を書き、次の行に Printer issue を追記して、type で確認してください。', 'Write PC-014 to C:\\Lab\\Reports\\notes.txt, append Printer issue on the next line, and verify it with type.'),
      example: { command: c`echo Investigation started > C:\Lab\Reports\example.txt`, note: t('1 回目は >、内容を残したい 2 回目は >> です。この教材では echo の末尾空白を簡略化しており、空白を入れたときの実機との差は再現しません。', 'Use > first, then >> to preserve existing contents. This simulator simplifies trailing spaces in echo and does not reproduce that spacing difference from real CMD.') },
      hints: [t('まず echo PC-014 の出力先を指定します。', 'First redirect the output of echo PC-014.'), t('2 回目に > を使うと、最初の行が失われます。', 'Using > for the second line would overwrite the first.'), t('echo Printer issue >> C:\\Lab\\Reports\\notes.txt の後、type で読みます。', 'Run echo Printer issue >> C:\\Lab\\Reports\\notes.txt, then read it with type.')],
      solution: [c`echo PC-014 > C:\Lab\Reports\notes.txt`, c`echo Printer issue >> C:\Lab\Reports\notes.txt`, c`type C:\Lab\Reports\notes.txt`], success: t('上書きと追記を使い分けて、2 行のメモを残せました。', 'You used overwrite and append to keep a two-line note.'),
      verify: { commands: [check('echo', ['PC-014']), check('echo', ['Printer issue']), check('type', [c`C:\Lab\Reports\notes.txt`])], files: [{ path: c`C:\Lab\Reports\notes.txt`, includes: ['PC-014', 'Printer issue'] }] }
    }),
    lesson({
      id: 'filter-and-save', track: 'basics', title: t('10 · 必要な行だけを残す', '10 · Keep the relevant lines'),
      goal: t('パイプと findstr でログからエラーを抽出する。', 'Use a pipe and findstr to extract error lines.'),
      explanation: [t('| は前のコマンドの出力を次のコマンドに渡すパイプです。findstr "ERROR" は ERROR を含む行を選びます。', '| is a pipe: it sends one command’s output to the next. findstr "ERROR" selects lines containing ERROR.'), t('絞り込んだ結果だけで文脈が十分とは限りません。元のログを残したうえで、共有用に短い抜粋を作ります。', 'A filtered result may omit useful context. Keep the original log while creating a short excerpt for sharing.')],
      task: t('type と findstr をパイプでつなぎ、app.log の ERROR 行だけを C:\\Lab\\Reports\\errors.txt に保存してください。', 'Connect type to findstr with a pipe, and save only the ERROR lines from app.log to C:\\Lab\\Reports\\errors.txt.'),
      example: { command: c`type C:\Lab\devices.csv | findstr "Sales"`, note: t('左が入力、右が絞り込みです。課題ではさらに > で保存します。', 'The left side supplies input and the right side filters it. Add > to save the task result.') },
      hints: [t('最初は type C:\\Lab\\Logs\\app.log です。', 'Begin with type C:\\Lab\\Logs\\app.log.'), t('その後ろに | findstr "ERROR" を加えます。', 'Add | findstr "ERROR".'), t('最後に > C:\\Lab\\Reports\\errors.txt を加えます。', 'Finish with > C:\\Lab\\Reports\\errors.txt.')],
      solution: [c`type C:\Lab\Logs\app.log | findstr "ERROR" > C:\Lab\Reports\errors.txt`], success: t('ログのエラー 2 行を、元ファイルを変えずに保存できました。', 'You saved both error lines without changing the original log.'),
      verify: { commands: [check('type', [c`C:\Lab\Logs\app.log`]), check('findstr', ['ERROR'])], pipelines: [[check('type', [c`C:\Lab\Logs\app.log`]), check('findstr', ['ERROR'])]], files: [{ path: c`C:\Lab\Reports\errors.txt`, includes: ['ERROR Printer service unavailable', 'ERROR Print job failed'] }] }
    }),
    lesson({
      id: 'environment-and-command-path', track: 'basics', title: t('11 · 環境変数と実行ファイル', '11 · Environment and executable paths'),
      goal: t('変数の値とコマンドの場所を確認する。', 'Inspect an environment variable and locate an executable.'),
      explanation: [t('環境変数は TEMP などの名前に値を持つ設定です。CMD では %TEMP% のように展開します。set TEMP は名前が TEMP で始まる変数を表示します。', 'Environment variables store settings under names such as TEMP. CMD expands a variable written as %TEMP%. set TEMP lists variables whose names begin with TEMP.'), t('where はコマンドの検索場所を調べます。curl.exe のように拡張子まで書くと、PowerShell の別名との混同を避けて実行ファイルを指定できます。', 'where finds matching executable paths. Writing curl.exe explicitly identifies the executable and avoids confusion with aliases in some PowerShell versions.')],
      task: t('set TEMP で一時フォルダーの設定を見て、where curl.exe で curl の場所を確認してください。', 'Inspect the temporary-folder setting with set TEMP, then locate curl with where curl.exe.'),
      example: { command: 'echo %USERNAME%', note: t('変数は % で囲んで値を参照します。', 'Surround a variable name with % to use its value.') },
      hints: [t('今回は変数を変更せず、表示だけをします。', 'Only inspect the variable; do not assign a new value.'), t('コマンドの場所を探す名前は where です。', 'The executable-search command is where.'), t('2 行目は where curl.exe です。', 'The second line is where curl.exe.')],
      solution: ['set TEMP', 'where curl.exe'], success: t('PC ごとに違う設定や実行ファイルの場所を、推測せず確認できました。', 'You checked machine-specific settings and executable paths instead of guessing.'),
      verify: { commands: [check('set', ['TEMP']), check('where', ['curl.exe'])] }
    })
    ,lesson({
      id: 'system-details', track: 'pc', title: t('12 · OS と端末情報', '12 · OS and machine details'),
      goal: t('問い合わせに必要な OS と基本情報を集める。', 'Collect OS and machine details for a support request.'),
      explanation: [t('ver は Windows のバージョンを短く表示します。systeminfo は OS、起動時刻、メモリなどをまとめて表示します。', 'ver gives a short Windows version string. systeminfo collects OS, boot-time, memory, and other machine details.'), t('表示された情報は、その PC の状態を説明する材料です。メモリが少ないなど一つの数値だけで、遅さの原因を決めつけないようにします。', 'These details describe the machine. A single number, such as available memory, does not by itself establish why an app is slow.')],
      task: t('ver を実行し、systeminfo の結果を C:\\Lab\\Reports\\system.txt に保存してください。', 'Run ver and save the output of systeminfo to C:\\Lab\\Reports\\system.txt.'),
      example: { command: 'systeminfo', note: t('画面に表示する代わりに、> で報告用に保存できます。', 'Use > to save the output for a report instead of displaying it.') },
      hints: [t('短いバージョン表示は ver です。', 'Use ver for the short version display.'), t('systeminfo の後ろに > と保存先を続けます。', 'Follow systeminfo with > and the destination.'), t('保存先は C:\\Lab\\Reports\\system.txt です。', 'The destination is C:\\Lab\\Reports\\system.txt.')],
      solution: ['ver', c`systeminfo > C:\Lab\Reports\system.txt`], success: t('報告に添えられる端末情報を保存できました。', 'You saved machine information that can accompany a support report.'),
      verify: { commands: [check('ver'), { ...check('systeminfo'), outputPath: c`C:\Lab\Reports\system.txt` }], files: [{ path: c`C:\Lab\Reports\system.txt`, includes: ['Host Name:', 'OS Name:', 'PC-014'] }] }
    }),
    lesson({
      id: 'machine-and-user', track: 'pc', title: t('13 · どの PC・誰の操作か', '13 · Which PC, which user?'),
      goal: t('コンピューター名と現在の実行ユーザーを確認する。', 'Identify the computer and the current execution account.'),
      explanation: [t('hostname は PC の名前です。whoami は現在のコマンドを実行しているアカウントを表示します。Windows にも whoami があります。', 'hostname displays the computer name. whoami displays the account running the current command. Windows includes whoami.'), t('CORP\\student は、CORP というドメイン側の student というアカウントを表す書き方です。別の資格情報で起動した画面では、想定と違うユーザーになることがあります。', 'CORP\\student identifies the student account in the CORP domain. A window started with different credentials may run under a different account.')],
      task: t('hostname と whoami を実行し、調査対象の PC とユーザーを確認してください。', 'Run hostname and whoami to identify the PC and the account you are investigating.'),
      example: { command: 'hostname', note: t('名前を読むだけなので、PC 名は変更しません。', 'This reads the name; it does not rename the PC.') },
      hints: [t('PC 名とユーザー名は別の情報です。', 'The computer name and account name are different pieces of information.'), t('ユーザーの確認には whoami を使います。', 'Use whoami to inspect the account.'), t('hostname、whoami の順に 1 行ずつ実行します。', 'Run hostname, then whoami on a separate line.')],
      solution: ['hostname', 'whoami'], success: t('対象を取り違えず、PC-014 と現在のアカウントを確認できました。', 'You confirmed PC-014 and the current account before investigating further.'),
      verify: { commands: [check('hostname'), check('whoami')] }
    }),
    lesson({
      id: 'list-processes', track: 'pc', title: t('14 · 動いているアプリを探す', '14 · Find running processes'),
      goal: t('プロセス名と PID の役割を理解する。', 'Understand process names and process IDs.'),
      explanation: [t('実行中のプログラムをプロセスと呼びます。tasklist はプロセス名や PID を一覧します。PID は、その実行中のプロセスを識別する番号です。', 'A running program is a process. tasklist lists process names and PIDs. A PID identifies a particular running process.'), t('同じ名前のプロセスが複数あることもあります。PID は起動し直すと変わる場合があるため、実機ではその場で確認します。', 'Several processes may share a name. PIDs can change after a restart, so check the current value on a real PC.')],
      task: t('tasklist を実行し、NotesApp.exe の PID を確認してください。', 'Run tasklist and identify the PID of NotesApp.exe.'),
      example: { command: 'tasklist', note: t('一覧ではプロセス名と PID をセットで読みます。', 'Read the image name and PID together.') },
      hints: [t('プロセス一覧のコマンドは tasklist です。', 'Use tasklist to list processes.'), t('NotesApp.exe の行を探します。', 'Find the NotesApp.exe row.'), t('演習内の NotesApp.exe の PID は 4320 です。', 'In this exercise, NotesApp.exe has PID 4320.')],
      solution: ['tasklist'], success: t('プロセスを名前だけでなく PID でも識別できました。', 'You identified a process by both its name and its PID.'),
      verify: { commands: [check('tasklist')] },
      question: ask(t('PID の説明として適切なのは？', 'Which statement about a PID is correct?'), t('PID はプロセスの実行単位の番号です。実機で操作するときは毎回その場で確認します。', 'A PID belongs to a process instance. Check it again before acting on a real system.'))
    }),
    lesson({
      id: 'find-a-pid', track: 'pc', title: t('15 · PID から名前を調べる', '15 · Look up a PID'),
      goal: t('条件付きの一覧で、対象プロセスを絞る。', 'Filter the process list to a particular PID.'),
      explanation: [t('/fi は tasklist のフィルターです。"PID eq 4320" は「PID が 4320 と等しい」という条件です。', '/fi supplies a tasklist filter. "PID eq 4320" means “PID equals 4320.”'), t('条件には空白があるのでダブルクォートで囲みます。ネットワーク接続に表示された PID を、アプリ名と対応づけるときにも使えます。', 'The filter contains spaces, so enclose it in double quotes. This is also useful for matching a connection’s PID to an application.')],
      task: t('tasklist の /fi を使い、PID 4320 だけを表示してください。', 'Use tasklist /fi to display only PID 4320.'),
      example: { command: 'tasklist /fi "PID eq 1200"', note: t('これは別の PID の例です。課題の番号に置き換えます。', 'This example uses another PID. Substitute the number from the task.') },
      hints: [t('全体は tasklist /fi "条件" の形です。', 'Use the form tasklist /fi "condition".'), t('等しいという条件は eq です。', 'eq means equals.'), t('条件を "PID eq 4320" にします。', 'Use the filter "PID eq 4320".')],
      solution: ['tasklist /fi "PID eq 4320"'], success: t('大量の一覧から対象だけを確認する方法ができました。', 'You can now narrow a long list to a single target.'),
      verify: { commands: [check('tasklist', ['/fi', 'PID eq 4320'], ['NotesApp.exe'])] }
    }),
    lesson({
      id: 'stop-one-app', track: 'pc', title: t('16 · 対象を確かめてアプリを終了', '16 · Stop a confirmed application'),
      goal: t('対象プロセスを確認してから、指定した PID を終了する。', 'Confirm the target process before stopping its PID.'),
      explanation: [t('taskkill は指定したプロセスを終了します。この課題では、保存済みの演習用 NotesApp.exe を終了してよいことが確認されています。', 'taskkill stops a specified process. In this task, you have confirmed that the practice NotesApp.exe has no unsaved work and may be stopped.'), t('実機では、まず通常の終了操作を試し、未保存データや他の利用者への影響を確認します。名前が似ているだけのサービスや、用途不明のプロセスをまとめて終了しません。', 'On a real PC, try closing the app normally first and consider unsaved work and other users. Do not stop unrelated services or unidentified processes in a batch.')],
      task: t('PID 4320 を tasklist で確認し、taskkill /PID 4320 で終了してください。', 'Confirm PID 4320 with tasklist, then stop it using taskkill /PID 4320.'),
      example: { command: 'tasklist /fi "PID eq 4320"', note: t('実行中の対象を確認してから終了操作に進みます。', 'Verify the running target before stopping it.') },
      hints: [t('先に PID から NotesApp.exe であることを確認します。', 'First verify that the PID belongs to NotesApp.exe.'), t('終了コマンドは taskkill です。', 'The stop command is taskkill.'), t('今回は /PID 4320 を指定します。/F を付ける必要はありません。', 'Use /PID 4320 here. You do not need /F.')],
      solution: ['tasklist /fi "PID eq 4320"', 'taskkill /PID 4320'], success: t('確認した一つのアプリだけを終了できました。', 'You stopped the one application you had verified.'),
      verify: { commands: [{ ...check('tasklist'), outputRowTokens: ['NotesApp.exe', '4320'] }, check('taskkill', ['/PID', '4320'])], orderedCommands: [{ ...check('tasklist'), outputRowTokens: ['NotesApp.exe', '4320'] }, recheck('taskkill', ['/PID', '4320'])], state: { 'pc.appRunning': false } },
      question: ask(t('実機で終了操作をする前に確認することは？', 'What should you check before stopping a real process?'), t('プロセスの終了は状態を変える操作です。対象を特定し、影響を確認してから必要な範囲に限定します。', 'Stopping a process changes system state. Identify it and assess the impact before acting.'))
    }),
    lesson({
      id: 'service-state', track: 'pc', title: t('17 · サービスの状態', '17 · Check a service state'),
      goal: t('画面のないバックグラウンド処理の状態を調べる。', 'Inspect a background service that may have no visible window.'),
      explanation: [t('サービスは Windows がバックグラウンドで動かす処理です。Spooler は印刷ジョブの管理に関係するサービスです。', 'A service is a background component managed by Windows. Spooler helps manage print jobs.'), t('sc.exe query で現在の状態を確認できます。RUNNING は動作中、STOPPED は停止中です。状態だけでアプリ全体の正常性は保証されません。', 'sc.exe query displays a service’s current state. RUNNING means it is running; STOPPED means it is stopped. This state alone does not prove that the whole application works.')],
      task: t('sc.exe query Spooler を実行し、この PC での印刷サービスの状態を確認してください。', 'Run sc.exe query Spooler and interpret the print service’s state.'),
      example: { command: 'sc.exe query Spooler', note: t('query は照会です。この段階ではサービスを変更しません。', 'query inspects the service without changing it.') },
      hints: [t('サービス名は Spooler です。', 'The service name is Spooler.'), t('STATE の行を読みます。', 'Read the STATE line.'), t('このシナリオでは STOPPED が表示されます。', 'This scenario shows STOPPED.')],
      solution: ['sc.exe query Spooler'], success: t('印刷の調査を進める根拠として、サービスの停止を確認できました。', 'You identified a stopped service as evidence for the print investigation.'),
      session: { scenario: 'service-stopped' }, verify: { commands: [check('sc', ['query', 'Spooler'], ['STOPPED'])] },
      question: ask(t('次の調査として適切なのは？', 'What is a sensible next step?'), t('停止は印刷できない理由の一つになり得ますが、停止した背景も確認してから対応します。', 'A stopped service can explain printing trouble, but investigate why it stopped before choosing a response.'))
    }),
    lesson({
      id: 'service-configuration', track: 'pc', title: t('18 · 状態と設定を分けて読む', '18 · State versus configuration'),
      goal: t('サービスの起動設定と現在の動作状態を区別する。', 'Distinguish service startup configuration from its current state.'),
      explanation: [t('sc.exe qc はサービスの構成を表示します。START_TYPE は起動方法の設定であり、「いま動作しているか」とは別です。', 'sc.exe qc displays service configuration. START_TYPE is the configured startup mode; it is separate from whether the service is running right now.'), t('自動起動の設定でも、何らかの理由で停止していることがあります。設定は qc、現在の状態は query で確かめます。', 'A service configured for automatic startup can still be stopped. Inspect configuration with qc and current state with query.')],
      task: t('Spooler の qc と query を実行し、設定と現在の状態を比較してください。', 'Run qc and query for Spooler and compare its configuration with its state.'),
      example: { command: 'sc.exe qc Spooler', note: t('qc は設定の照会です。起動方法は変更しません。', 'qc queries configuration; it does not change the startup mode.') },
      hints: [t('同じサービスに二種類の照会を行います。', 'Make two different queries against the same service.'), t('qc の START_TYPE と query の STATE を見ます。', 'Compare START_TYPE in qc with STATE in query.'), t('AUTO_START と STOPPED は同時に成り立ちます。', 'AUTO_START and STOPPED can both be true.')],
      solution: ['sc.exe qc Spooler', 'sc.exe query Spooler'], success: t('設定が自動だから動作中、という思い込みを避けられました。', 'You avoided assuming that “automatic” means “currently running.”'),
      session: { scenario: 'service-stopped' }, verify: { commands: [check('sc', ['qc', 'Spooler']), check('sc', ['query', 'Spooler'])] },
      question: ask(t('AUTO_START と STOPPED が表示されたら？', 'What if the results show AUTO_START and STOPPED?'), t('起動設定と現在の状態は別の情報です。両方を読むと状況が正確になります。', 'Configuration and current state describe different things. Reading both gives a clearer picture.'))
    }),
    lesson({
      id: 'recent-system-events', track: 'pc', title: t('19 · 最近のイベントを確認', '19 · Read recent system events'),
      goal: t('イベントログから、症状と同じ時間帯の記録を探す。', 'Inspect event records around the time of a symptom.'),
      explanation: [t('イベントログは Windows やサービスの記録です。wevtutil qe System は System ログを照会します。', 'Event logs record Windows and service activity. wevtutil qe System queries the System log.'), t('/c:3 は 3 件、/rd:true は新しい記録から、/f:text はテキスト形式です。エラーの番号だけで判断せず、時刻、発生元、本文を合わせて読みます。', '/c:3 limits the result to three records, /rd:true starts with the newest, and /f:text uses text output. Read the time, source, and message together rather than relying on an event number alone.')],
      task: t('System ログの新しい 3 件をテキストで表示し、結果を Reports\\events.txt に保存してください。', 'Query the three newest System events as text and save them to C:\\Lab\\Reports\\events.txt.'),
      example: { command: 'wevtutil qe System /c:3 /rd:true /f:text', note: t('この照会をファイルへ保存します。ログの消去操作は扱いません。', 'Save this query to a file. This lesson only reads events.') },
      hints: [t('必要なオプションは /c:3 /rd:true /f:text です。', 'Use /c:3 /rd:true /f:text.'), t('保存には > を使います。', 'Use > to save the output.'), t('保存先は C:\\Lab\\Reports\\events.txt です。', 'Save to C:\\Lab\\Reports\\events.txt.')],
      solution: [c`wevtutil qe System /c:3 /rd:true /f:text > C:\Lab\Reports\events.txt`], success: t('問い合わせの時間帯と照合できるイベント記録を残せました。', 'You saved event evidence that can be compared with the reported incident time.'),
      session: { scenario: 'service-stopped' }, verify: { commands: [{ ...check('wevtutil', ['qe', 'System', '/c:3', '/rd:true', '/f:text']), outputPath: c`C:\Lab\Reports\events.txt` }], files: [{ path: c`C:\Lab\Reports\events.txt`, includes: ['Event[0]', 'Log Name: System', 'Computer: PC-014'] }] }
    }),
    lesson({
      id: 'read-file-permissions', track: 'pc', title: t('20 · フォルダーの権限を読む', '20 · Read folder permissions'),
      goal: t('アクセス権を変更せず、現在の設定を確認する。', 'Inspect existing permissions without changing them.'),
      explanation: [t('icacls はファイルやフォルダーの NTFS アクセス権を扱うコマンドです。パスだけを渡すと、現在の設定を表示します。', 'icacls works with NTFS file and folder permissions. Supplying only a path displays the current permissions.'), t('(R) は読み取り、(RX) は読み取りと実行、(M) は変更、(F) はフルコントロールです。(OI) は子ファイル、(CI) は子フォルダーへの継承に関する指定で、(I) は親から継承した項目を示します。', '(R) means Read, (RX) Read and execute, (M) Modify, and (F) Full control. (OI) concerns inheritance by child files and (CI) by child folders. (I) marks an entry inherited from the parent.'), t('実効アクセスはグループ所属や拒否設定などにも左右されます。共有経由なら共有側の権限も関係します。', 'Effective access also depends on groups and deny entries. Network shares add a separate layer of share permissions.')],
      task: t('C:\\Lab\\Shared Files の権限を icacls で表示し、設定を読む際の注意点を選んでください。', 'Display permissions on C:\\Lab\\Shared Files with icacls and choose the correct interpretation rule.'),
      example: { command: c`icacls C:\Lab`, note: t('課題では空白があるパスを引用符で囲みます。', 'The task path contains spaces, so quote it.') },
      hints: [t('引数は確認したいパスだけです。', 'The only argument needed is the path you want to inspect.'), t('"C:\\Lab\\Shared Files" を指定します。', 'Specify "C:\\Lab\\Shared Files".'), t('変更オプションは付けずに読み取ります。', 'Read the output without using modification options.')],
      solution: [c`icacls "C:\Lab\Shared Files"`], success: t('設定を変えずに、アクセス権の調査を始められました。', 'You began a permissions investigation without changing the settings.'),
      session: { scenario: 'permission' }, verify: { commands: [check('icacls', [c`C:\Lab\Shared Files`])] },
      question: ask(t('権限表示を読んだ後の判断として適切なのは？', 'What is an appropriate conclusion after reading these entries?'), t('表示された一つの許可だけで実効アクセスの全体は分かりません。対象と利用経路を確認して追加調査します。', 'One allow entry does not describe all effective access. Check the target and access path before investigating further.'))
    }),
    lesson({
      id: 'disk-free-space', track: 'pc', title: t('21 · 空き容量を確かめる', '21 · Check free disk space'),
      goal: t('保存や更新の不具合で、空き容量を確認する。', 'Check disk space when saving or updating fails.'),
      explanation: [t('空き容量不足はファイル保存や更新の失敗につながることがあります。fsutil volume diskfree はボリュームの空き容量を表示します。実機では環境によって管理者権限が必要です。', 'Low free space can cause saving or update failures. fsutil volume diskfree displays volume free space. A real system may require an elevated prompt.'), t('出力はバイト単位です。必要容量は操作によって違うため、残量の表示だけで十分かどうかは決まりません。不要そうなシステムファイルを直接消すことは避けます。', 'The output uses bytes. Required space depends on the operation, so the displayed number alone does not establish whether there is enough. Avoid manually deleting unfamiliar system files.')],
      task: t('C: の空き容量を表示し、更新に必要な容量を確認する次の行動を選んでください。', 'Display free space on C: and choose the next step for an update investigation.'),
      example: { command: 'fsutil volume diskfree C:', note: t('これは容量の確認であり、ディスクの修復操作ではありません。', 'This inspects space; it does not repair the disk.') },
      hints: [t('volume diskfree の後ろに対象の C: を書きます。', 'Follow volume diskfree with the target C:.'), t('この表示では Total quota free bytes が利用者に使える空き容量です。Total bytes は総容量です。', 'In this output, Total quota free bytes is free space available to the caller. Total bytes is total capacity.'), t('次は更新処理の必要容量や、利用者が消してよいデータを確認します。', 'Next check the update’s space requirements and which user data may be cleaned up.')],
      solution: ['fsutil volume diskfree C:'], success: t('空き容量という測定値を得て、必要容量との比較に進めます。', 'You obtained a free-space measurement and can compare it with the requirement.'),
      verify: { commands: [check('fsutil', ['volume', 'diskfree', 'C:\\'])] },
      question: ask(t('容量表示から次に行うことは？', 'What should follow this space check?'), t('容量と必要量を比較して判断します。測定しただけでは、削除してよい対象や他の失敗原因までは分かりません。', 'Compare available space with the requirement. The measurement alone does not identify safe deletion targets or rule out other causes.'))
    })
    ,lesson({
      id: 'ip-address-and-dns', track: 'network', title: t('22 · IP・ゲートウェイ・DNS', '22 · IP, gateway, and DNS'),
      goal: t('ネットワーク設定の三つの役割を区別する。', 'Distinguish three key network settings.'),
      explanation: [t('IP アドレスは通信する機器の住所です。サブネットマスクは同じネットワークの範囲を表し、デフォルトゲートウェイは別ネットワークへの出口です。', 'An IP address identifies a device on the network. A subnet mask describes the local network range, and the default gateway is the exit to other networks.'), t('DNS サーバーは intranet.corp.example のような名前を IP アドレスに対応づけます。ipconfig /all で、アドレス・出口・名前解決先をまとめて確認します。', 'A DNS server maps names such as intranet.corp.example to IP addresses. ipconfig /all shows addresses, gateways, and DNS servers together.')],
      task: t('ipconfig /all を実行し、この PC の IPv4・ゲートウェイ・DNS サーバーを読み取ってください。', 'Run ipconfig /all and identify this PC’s IPv4 address, gateway, and DNS server.'),
      example: { command: 'ipconfig', note: t('/all を追加すると DNS や DHCP の情報も表示します。', 'Add /all to include DNS and DHCP details.') },
      hints: [t('使うコマンドは ipconfig /all です。', 'Use ipconfig /all.'), t('IPv4 Address、Default Gateway、DNS Servers の行を探します。', 'Find IPv4 Address, Default Gateway, and DNS Servers.'), t('演習の DNS は 10.20.0.10、ゲートウェイは 10.20.0.1 です。', 'The exercise DNS server is 10.20.0.10; its gateway is 10.20.0.1.')],
      solution: ['ipconfig /all'], success: t('住所、出口、名前の問い合わせ先を別々の設定として読めました。', 'You distinguished the address, the network exit, and the name-resolution server.'),
      verify: { commands: [check('ipconfig', ['/all'])] },
      question: ask(t('DNS サーバーの主な役割は？', 'What is the main role of a DNS server?'), t('DNS は名前解決を担います。デフォルトゲートウェイや PC 自身のアドレスとは別の役割です。', 'DNS provides name resolution. It has a different role from the default gateway or the PC’s own address.'))
    }),
    lesson({
      id: 'interface-configuration', track: 'network', title: t('23 · インターフェイスごとの設定', '23 · Inspect each network interface'),
      goal: t('netsh でネットワーク設定を読み取る。', 'Read network configuration with netsh.'),
      explanation: [t('インターフェイスは Wi-Fi や有線 LAN、VPN などの通信の窓口です。同じ PC に複数存在し、それぞれが設定を持ちます。', 'An interface is a network connection such as Wi-Fi, Ethernet, or a VPN. A PC can have several interfaces, each with its own settings.'), t('netsh は Windows のネットワーク設定を扱います。interface ipv4 show config は表示だけです。共有の接続確認などに使う net とは別のコマンドで、AD 専用でもありません。', 'netsh works with Windows network settings. interface ipv4 show config is a read-only query. It is separate from net, which can inspect share connections, and is not specific to Active Directory.')],
      task: t('netsh interface ipv4 show config を実行し、DHCP と DNS の設定を確認してください。', 'Run netsh interface ipv4 show config and inspect DHCP and DNS settings.'),
      example: { command: 'netsh interface ipv4 show config', note: t('show は設定を見る操作です。', 'show reads configuration.') },
      hints: [t('コマンドは netsh から始まります。', 'Start with netsh.'), t('対象の種類は interface ipv4 です。', 'The context is interface ipv4.'), t('最後に show config を付けます。', 'Finish with show config.')],
      solution: ['netsh interface ipv4 show config'], success: t('接続口ごとの設定を、変更せずに確認できました。', 'You inspected the settings of each connection without changing them.'),
      verify: { commands: [check('netsh', ['interface ipv4 show config'])] }
    }),
    lesson({
      id: 'wifi-connection', track: 'network', title: t('24 · Wi-Fi は接続されている？', '24 · Is Wi-Fi connected?'),
      goal: t('接続状態を先に確かめ、DNS の調査に進む前の問題を見つける。', 'Check the link before moving on to DNS troubleshooting.'),
      explanation: [t('Wi-Fi の接続状態と、インターネット上のサービスが使えることは別です。まず無線の接続先や State を確認します。', 'Being connected to Wi-Fi is different from being able to use an internet service. First inspect the wireless connection and its State.'), t('netsh wlan show interfaces は現在の無線インターフェイスを表示します。接続が切れていれば、接続先や電波・機内モードなどの確認が先になります。', 'netsh wlan show interfaces displays current wireless interfaces. If disconnected, first check the intended network, signal, airplane mode, and related connection settings.'), t('この演習で未接続のまま ping 10.20.0.1 を試すと、PING: transmit failed. General failure. と表示されます。この模擬環境では利用できる接続がないためですが、実機ではこの文だけで原因を断定せず、アダプターの状態と併せて読みます。', 'If you try ping 10.20.0.1 while disconnected here, it reports PING: transmit failed. General failure. In this scenario there is no usable connection; on real Windows, read this message together with adapter status rather than treating it as a unique diagnosis.')],
      task: t('無線インターフェイスと ipconfig /all を見て、この PC で最初に確認する範囲を選んでください。', 'Inspect the wireless interface and ipconfig /all, then choose where to start investigating.'),
      example: { command: 'netsh wlan show interfaces', note: t('保存されたプロファイル一覧ではなく、現在の接続状態を見ます。', 'This shows the current connection rather than the list of saved profiles.') },
      hints: [t('最初に netsh wlan show interfaces を実行します。', 'First run netsh wlan show interfaces.'), t('次に ipconfig /all でアダプターの状態を確認します。', 'Then inspect adapter status with ipconfig /all.'), t('State が disconnected なら、名前解決より接続自体の確認を優先します。', 'If State is disconnected, investigate the connection before name resolution.')],
      solution: ['netsh wlan show interfaces', 'ipconfig /all'], success: t('調査の開始点を、無線接続の状態まで絞れました。', 'You narrowed the starting point to the wireless connection.'),
      session: { scenario: 'wifi-off' }, verify: { commands: [check('netsh', ['wlan show interfaces']), check('ipconfig', ['/all'])] },
      question: ask(t('この結果で優先する確認は？', 'What should you check first for these results?'), t('このシナリオでは無線が未接続です。まず通信の土台を確認します。表示だけで電波や機器の故障まで断定はできません。', 'The wireless interface is disconnected in this scenario. Check the underlying connection first; this output alone does not prove a radio or hardware failure.'))
    }),
    lesson({
      id: 'ping-loopback', track: 'network', title: t('25 · 自分自身に ping', '25 · Ping the local loopback'),
      goal: t('127.0.0.1 の意味と ping の確認範囲を知る。', 'Understand 127.0.0.1 and what its ping result can establish.'),
      explanation: [t('ping は ICMP の応答を確かめるコマンドです。127.0.0.1 は自分自身を指すループバックアドレスです。', 'ping checks for an ICMP response. 127.0.0.1 is the loopback address, which refers to the local machine.'), t('ループバックの応答はローカルの IP 通信の確認です。ケーブル、Wi-Fi、DNS、外部サイトが正常という証明にはなりません。', 'A loopback reply checks local IP communication. It does not prove that the cable, Wi-Fi, DNS, or an external website works.'), t('実機で localhost を指定すると IPv6 の ::1 が選ばれる場合があります。この課題では IPv4 を確認するため、127.0.0.1 を明示します。この教材は IPv4 のみを扱い、localhost も 127.0.0.1 に対応させています。', 'On real Windows, localhost may select the IPv6 loopback ::1. This task explicitly uses 127.0.0.1 to check IPv4. The simulator models IPv4 only and maps localhost to 127.0.0.1 too.')],
      task: t('127.0.0.1 に ping を実行し、分かる範囲を選んでください。', 'Ping 127.0.0.1 and identify what the result tells you.'),
      example: { command: 'ping -n 2 127.0.0.1', note: t('-n 2 は 2 回の送信です。', '-n 2 sends two requests.') },
      hints: [t('対象は自分自身のループバックです。', 'The target is the local loopback.'), t('ping の後ろに 127.0.0.1 を指定します。', 'Follow ping with 127.0.0.1.'), t('応答があっても、まだ外部への接続は試していません。', 'A reply does not mean you have tested an external connection.')],
      solution: ['ping -n 2 127.0.0.1'], success: t('「応答した」と「どこまで確かめた」を分けて説明できました。', 'You separated “it replied” from “which part was tested.”'),
      verify: { commands: [check('ping', ['127.0.0.1'])] },
      question: ask(t('この成功が直接示すのは？', 'What does this success directly show?'), t('対象は自分自身です。外部の経路やサービスは、別の確認が必要です。', 'The target is the local machine. External paths and services require separate checks.'))
    }),
    lesson({
      id: 'ping-gateway', track: 'network', title: t('26 · 近くの出口を確認', '26 · Check the nearby gateway'),
      goal: t('設定されたゲートウェイへの到達性を確かめる。', 'Check reachability to the configured gateway.'),
      explanation: [t('次は、自分の PC の外側を確認します。ipconfig でゲートウェイを調べ、その IP に ping を送ります。', 'Next, test beyond the local PC. Find the gateway in ipconfig and ping its IP address.'), t('応答は ICMP が往復できた証拠です。応答がなくても、相手が ICMP を返さない設定の可能性があるため、「機器が停止している」とは限りません。', 'A reply demonstrates an ICMP round trip. No reply does not necessarily mean the device is down; it may not answer ICMP.')],
      task: t('ipconfig で出口を確かめ、10.20.0.1 に ping を送ってください。', 'Check the gateway with ipconfig, then ping 10.20.0.1.'),
      example: { command: 'ping -n 2 10.20.0.1', note: t('実機では表示された自分のゲートウェイを指定します。', 'On a real PC, use the gateway shown in its own configuration.') },
      hints: [t('最初は ipconfig です。', 'Start with ipconfig.'), t('Default Gateway のアドレスを読みます。', 'Read the Default Gateway address.'), t('この演習では ping -n 2 10.20.0.1 です。', 'For this exercise, use ping -n 2 10.20.0.1.')],
      solution: ['ipconfig', 'ping -n 2 10.20.0.1'], success: t('PC から近くの出口まで、ICMP の応答を確認できました。', 'You confirmed an ICMP response between the PC and its nearby gateway.'),
      verify: { commands: [check('ipconfig'), check('ping', ['10.20.0.1'])] }
    }),
    lesson({
      id: 'dns-lookup', track: 'network', title: t('27 · 名前を IP に解決する', '27 · Resolve a name to an IP'),
      goal: t('nslookup で DNS の回答を確認する。', 'Inspect a DNS answer with nslookup.'),
      explanation: [t('ブラウザーに名前を入れると、通常はその名前に対応する IP が必要です。nslookup は DNS サーバーに直接問い合わせる調査コマンドです。', 'A browser generally needs an IP address for the name you enter. nslookup is a diagnostic tool that asks a DNS server directly.'), t('DNS が回答したことと、その Web サービスが動作していることは別です。Server は問い合わせ先、Name と Address は回答された名前とアドレスです。', 'Receiving a DNS answer is separate from the web service working. Server identifies the DNS server; Name and Address identify the answer.')],
      task: t('intranet.corp.example を nslookup で調べ、DNS の回答を確認してください。', 'Look up intranet.corp.example with nslookup and inspect the answer.'),
      example: { command: 'nslookup example.com', note: t('課題では社内ポータルの名前を指定します。', 'Use the intranet portal’s name for the task.') },
      hints: [t('nslookup の後ろに調べる名前を続けます。', 'Follow nslookup with the name you want to resolve.'), t('対象は intranet.corp.example です。', 'The target is intranet.corp.example.'), t('回答の 10.20.0.20 と、DNS サーバーの 10.20.0.10 を混同しないようにします。', 'Distinguish the answer 10.20.0.20 from the DNS server 10.20.0.10.')],
      solution: ['nslookup intranet.corp.example'], success: t('名前解決の回答を、問い合わせ先とは分けて確認できました。', 'You distinguished the DNS answer from the server that supplied it.'),
      verify: { commands: [check('nslookup', ['intranet.corp.example'], ['10.20.0.20'])] }
    }),
    lesson({
      id: 'compare-dns-servers', track: 'network', title: t('28 · DNS の問い合わせ先を比較', '28 · Compare DNS servers'),
      goal: t('社内名が引けないとき、設定と問い合わせ先を比較する。', 'Compare configuration and query targets when an internal name does not resolve.'),
      explanation: [t('社内専用の名前は、社内 DNS にだけ登録されている場合があります。別の DNS に問い合わせても同じ答えが得られるとは限りません。', 'An internal name may exist only in the company’s DNS. Another DNS server may not return the same answer.'), t('nslookup 名前 DNSサーバー と指定すると、PC の設定を変えずに問い合わせ先だけを指定できます。これは設定変更の前に差を調べる方法です。', 'nslookup name DNS-server selects a query target without changing the PC’s settings. Use it to compare results before changing configuration.')],
      task: t('ipconfig /all を見て、通常の nslookup が失敗することを観測してから、DNS 10.20.0.10 を指定して社内名を再照会してください。', 'Inspect ipconfig /all, observe the failed normal nslookup, then query the internal name again using DNS server 10.20.0.10.'),
      example: { command: 'nslookup intranet.corp.example 10.20.0.10', note: t('通常の照会はこのシナリオではタイムアウトします。失敗の観測も課題の一部です。最後のアドレスで問い合わせ先を指定し、違いを確かめます。', 'The normal query times out in this scenario; observing that failure is part of the task. The final address selects the DNS server so you can compare the results.') },
      hints: [t('まず設定中の DNS サーバーを読みます。', 'First read the configured DNS server.'), t('通常の問い合わせは nslookup intranet.corp.example です。', 'The normal query is nslookup intranet.corp.example.'), t('2 回目は末尾に 10.20.0.10 を追加して比較します。', 'Add 10.20.0.10 to the second query and compare.')],
      solution: ['ipconfig /all', 'nslookup intranet.corp.example', 'nslookup intranet.corp.example 10.20.0.10'], success: t('社内 DNS を指定した場合との違いを、設定変更せずに確認できました。', 'You compared the internal DNS result without changing the configuration.'),
      session: { scenario: 'dns-wrong' }, verify: { commands: [check('ipconfig', ['/all']), { name: 'nslookup', argsEqual: ['intranet.corp.example'], expectCode: 1, errorIncludes: ['timed-out'] }, check('nslookup', ['intranet.corp.example', '10.20.0.10'], ['10.20.0.20'])], orderedCommands: [{ name: 'nslookup', argsEqual: ['intranet.corp.example'], expectCode: 1, errorIncludes: ['timed-out'] }, { ...check('nslookup', [], ['10.20.0.20']), argsEqual: ['intranet.corp.example', '10.20.0.10'] }] },
      question: ask(t('社内 DNS 指定時だけ回答される結果から、優先する調査は？', 'If only the internal DNS server answers, what should you investigate first?'), t('問い合わせ先によって結果が変わっています。正しい社内設定を確認します。Web アプリの正常性はまだ検証していません。', 'The answer changes with the query target. Confirm the intended company configuration. The web application itself has not yet been tested.'))
    }),
    lesson({
      id: 'inspect-dns-cache', track: 'network', title: t('29 · DNS キャッシュと回答の差', '29 · DNS cache versus fresh answers'),
      goal: t('PC が保持する情報と DNS への問い合わせ結果を比較する。', 'Compare locally cached information with a direct DNS answer.'),
      explanation: [t('Windows は名前解決結果を一時的にキャッシュします。DNS サーバーの情報が更新されても、ローカルに古い情報が残ることがあります。', 'Windows temporarily caches name-resolution results. A local entry may remain after the DNS server’s information changes.'), t('ipconfig /displaydns はローカルキャッシュを表示します。nslookup は DNS に直接問い合わせるため、通常のアプリが使う名前解決と差が出ることがあります。', 'ipconfig /displaydns shows the local cache. nslookup queries DNS directly, so its result can differ from the resolution used by an application.')],
      task: t('キャッシュと intranet.corp.example の DNS 回答を確認し、二つのアドレスを比較してください。', 'Inspect the cache and the DNS answer for intranet.corp.example, then compare the addresses.'),
      example: { command: 'ipconfig /displaydns', note: t('今回はまだ消去せず、差を記録します。', 'For now, inspect the difference before clearing anything.') },
      hints: [t('まず ipconfig /displaydns を実行します。', 'Start with ipconfig /displaydns.'), t('次は nslookup intranet.corp.example です。', 'Then run nslookup intranet.corp.example.'), t('キャッシュは 10.20.0.99、DNS 回答は 10.20.0.20 です。', 'The cached address is 10.20.0.99; the DNS answer is 10.20.0.20.')],
      solution: ['ipconfig /displaydns', 'nslookup intranet.corp.example'], success: t('古いローカル情報を疑うための、比較できる証拠が得られました。', 'You collected evidence that points to stale local information.'),
      session: { scenario: 'dns-cache' }, verify: { commands: [check('ipconfig', ['/displaydns'], ['10.20.0.99']), check('nslookup', ['intranet.corp.example'], ['10.20.0.20'])] },
      question: ask(t('この時点で考えられることは？', 'What is a reasonable interpretation at this point?'), t('この演習ではキャッシュと現在の DNS 回答が違います。次は対象を限定したキャッシュ更新と再確認が候補になります。', 'The cached entry differs from the current DNS answer in this exercise. A targeted cache refresh followed by a recheck is a reasonable next step.'))
    }),
    lesson({
      id: 'trace-a-route', track: 'network', title: t('30 · 途中の経路を見る', '30 · Trace the path'),
      goal: t('tracert で経路の応答を読み、* の限界を知る。', 'Read a tracert result and understand the limits of an asterisk.'),
      explanation: [t('tracert は宛先までの途中のルーターから応答を集め、経路を調べます。同じネットワーク内の相手なら、ルーターを経由せず直接届くこともあります。', 'tracert collects responses along the route to a destination. A host on the same local network may be reached directly without an intervening router.'), t('* はその試行の応答が得られなかったことを示します。途中の機器が応答を制限していても、その先への通信は通る場合があります。', 'An asterisk means no response was received for that probe. An intermediate device may limit these responses while still forwarding traffic.')],
      task: t('intranet.corp.example への経路を tracert で調べてください。', 'Trace the route to intranet.corp.example.'),
      example: { command: 'tracert example.com', note: t('課題では社内ポータルを指定します。', 'Use the intranet portal for the task.') },
      hints: [t('使うコマンドは tracert です。', 'Use tracert.'), t('対象は intranet.corp.example です。', 'The target is intranet.corp.example.'), t('少ないホップ数でも異常とは限りません。同じサブネットなら直接届きます。', 'A short path is not necessarily a problem. Hosts on the same subnet can be reached directly.')],
      solution: ['tracert intranet.corp.example'], success: t('経路を読む道具と、結果を断定しすぎない視点が身につきました。', 'You traced a path and learned not to overinterpret missing responses.'),
      verify: { commands: [check('tracert', ['intranet.corp.example'])] },
      question: ask(t('途中の 1 行だけ * だったら？', 'What if only one intermediate row shows *?'), t('tracert に返す応答と、通常の通信の転送は同じものではありません。全体の結果から判断します。', 'Responding to tracert probes and forwarding normal traffic are different actions. Interpret the full result.'))
    }),
    lesson({
      id: 'routing-table', track: 'network', title: t('31 · VPN と経路表', '31 · VPN and the routing table'),
      goal: t('VPN が接続済みでも、宛先への経路を確認する。', 'Check the destination route even when a VPN is connected.'),
      explanation: [t('route print は PC の経路表を表示します。宛先ごとに、どのインターフェイスやゲートウェイへ送るかが決まります。', 'route print displays the PC’s routing table. Routes determine which interface or gateway handles a destination.'), t('VPN が接続されていることだけでは、すべての社内宛先に適切な経路があるとは限りません。この課題は社内 10.20.0.0/24 宛ての経路が欠けた設定です。', 'A connected VPN does not guarantee a suitable route to every internal destination. This scenario lacks the intended route for the company’s 10.20.0.0/24 network.')],
      task: t('ipconfig /all と route print を確認し、社内ネットワークへ送る経路の状態を読んでください。', 'Inspect ipconfig /all and route print, then interpret the route toward the internal network.'),
      example: { command: 'route print', note: t('今回は経路の表示です。add や delete は使いません。', 'This is a read-only check; do not add or delete routes.') },
      hints: [t('VPN のアドレスと経路表の両方を見ます。', 'Inspect both the VPN address and the routing table.'), t('10.20.0.10 だけへの経路と、10.20.0.0/24 全体への経路は別です。', 'A route to 10.20.0.10 alone differs from a route covering 10.20.0.0/24.'), t('DC への経路だけでは、10.20.0.20 への社内経路を満たしません。', 'A route to the domain controller alone does not cover the intranet host at 10.20.0.20.')],
      solution: ['ipconfig /all', 'route print'], success: t('VPN の接続表示と、目的地への経路を分けて確認できました。', 'You distinguished VPN connection status from the route to the required destination.'),
      session: { scenario: 'vpn-route' }, verify: { commands: [check('ipconfig', ['/all']), check('route', ['print'])] },
      question: ask(t('この設定で優先して確認するのは？', 'What should be checked first for this configuration?'), t('宛先ごとの経路を確認します。勝手に経路を追加する前に、組織の VPN 設定と照合して担当者へ状況を伝えます。', 'Check the route for the actual destination. Compare it with the organization’s intended VPN configuration and report the evidence before adding routes.'))
    }),
    lesson({
      id: 'arp-neighbors', track: 'network', title: t('32 · 近隣機器の情報を見る', '32 · Inspect local neighbors'),
      goal: t('ARP キャッシュの用途と範囲を知る。', 'Understand the purpose and scope of the ARP cache.'),
      explanation: [t('ARP は、同じ IPv4 のリンク上で IP アドレスに対応する MAC アドレスを調べる仕組みです。arp -a は PC が持つ対応表を表示します。', 'ARP resolves an IPv4 address to a MAC address on the local link. arp -a displays the mappings this PC currently holds.'), t('遠いネットワークの相手には、通常は次のルーターの MAC アドレスを使います。ARP 一覧は、社内の全機器一覧ではありません。', 'For a destination beyond the local network, traffic normally uses the next-hop router’s MAC address. The ARP cache is not an inventory of every company device.')],
      task: t('arp -a を実行し、この一覧が表す範囲を選んでください。', 'Run arp -a and identify the scope of this information.'),
      example: { command: 'arp -a', note: t('キャッシュの表示だけを行います。', 'This only displays the cache.') },
      hints: [t('オプションは -a です。', 'Use the -a option.'), t('Internet Address と Physical Address を対応づけて読みます。', 'Read Internet Address alongside Physical Address.'), t('ここにいない機器が存在しない、とは判断できません。', 'A device missing from this list is not necessarily absent from the network.')],
      solution: ['arp -a'], success: t('近隣の対応表を、全ネットワークの一覧と混同せず読めました。', 'You read a local-neighbor table without treating it as a complete network inventory.'),
      verify: { commands: [check('arp', ['-a'])] },
      question: ask(t('ARP 一覧について正しいのは？', 'Which statement about the ARP cache is correct?'), t('必要に応じて対応が解決され、キャッシュも変化します。未掲載だけでは障害を断定できません。', 'Mappings are resolved as needed and the cache changes. Absence alone does not establish a fault.'))
    }),
    lesson({
      id: 'path-loss', track: 'network', title: t('33 · 遅い・途切れるを調べる', '33 · Investigate delay and loss'),
      goal: t('pathping の測定結果を読み、損失率の解釈を学ぶ。', 'Read pathping measurements without overinterpreting loss.'),
      explanation: [t('pathping は経路と応答の統計を調べるコマンドです。実機では計測に数分かかることがあります。この演習の表示は待ち時間を短縮した固定結果です。', 'pathping examines the route and response statistics. A real measurement can take several minutes. This exercise uses a shortened, deterministic result.'), t('途中だけ応答が少なくても、その機器が ICMP を制限している可能性があります。最終宛先での損失や、利用中アプリの症状と合わせて判断します。', 'Low response rates at an intermediate hop may reflect ICMP limits. Compare them with destination loss and the application’s actual symptoms.')],
      task: t('intranet.corp.example に pathping を実行し、測定を読む際の考え方を選んでください。', 'Run pathping for intranet.corp.example and choose how to interpret the measurement.'),
      example: { command: 'pathping intranet.corp.example', note: t('この room では実際の測定や待機は行いません。', 'This room does not perform real network measurements or waits.') },
      hints: [t('コマンドは pathping です。', 'Use pathping.'), t('対象の名前を後ろに続けます。', 'Append the destination name.'), t('経路途中の数値だけで故障箇所を決めつけないことがポイントです。', 'Do not identify a failed device from one intermediate statistic alone.')],
      solution: ['pathping intranet.corp.example'], success: t('統計は手がかりとして使い、利用者の症状との照合が必要だと確認できました。', 'You treated statistics as evidence to compare with the user’s symptoms.'),
      verify: { commands: [check('pathping', ['intranet.corp.example'])] },
      question: ask(t('途中の損失率だけが高い場合は？', 'What if loss is high only at an intermediate hop?'), t('測定への応答と実際の転送を区別します。複数の観測を合わせて切り分けます。', 'Distinguish responses to probes from traffic forwarding. Combine multiple observations.'))
    }),
    lesson({
      id: 'connections-and-pid', track: 'network', title: t('34 · 接続とアプリを対応づける', '34 · Match a connection to an app'),
      goal: t('netstat と tasklist を PID でつなぐ。', 'Join netstat and tasklist results using a PID.'),
      explanation: [t('netstat -ano は待ち受けや接続のアドレス、状態、PID を表示します。-a は接続と待ち受け、-n は数値表示、-o は PID です。', 'netstat -ano shows connection and listening addresses, states, and PIDs. -a includes listening sockets, -n uses numeric addresses, and -o includes the PID.'), t('ESTABLISHED は TCP 接続が成立した状態です。ページ内容が正しいことまでは保証しません。また netstat は任意の相手のポートを試すコマンドではありません。', 'ESTABLISHED means a TCP connection has been established. It does not guarantee correct page content. netstat also does not probe an arbitrary remote port.')],
      task: t('netstat -ano で接続を確認し、PID 4240 の名前を tasklist /fi で調べてください。', 'Inspect netstat -ano, then use tasklist /fi to identify PID 4240.'),
      example: { command: 'netstat -ano', note: t('一覧の右端の PID を、tasklist に渡して確認します。', 'Take the PID from the last column and look it up with tasklist.') },
      hints: [t('まず netstat -ano を実行します。', 'First run netstat -ano.'), t('名前を調べるフィルターは "PID eq 4240" です。', 'The process filter is "PID eq 4240".'), t('tasklist /fi "PID eq 4240" を実行します。', 'Run tasklist /fi "PID eq 4240".')],
      solution: ['netstat -ano', 'tasklist /fi "PID eq 4240"'], success: t('接続の番号から、その通信を持つアプリを確認できました。', 'You used a connection’s PID to identify its application.'),
      verify: { commands: [check('netstat', ['-ano']), check('tasklist', ['PID eq 4240'])] },
      question: ask(t('ESTABLISHED が示すのは？', 'What does ESTABLISHED mean?'), t('接続状態とアプリケーションの結果を分けて考えます。Web なら HTTP 応答も調べます。', 'Separate connection state from application results. For a web service, also inspect the HTTP response.'))
    }),
    lesson({
      id: 'winhttp-proxy', track: 'network', title: t('35 · アプリごとのプロキシ', '35 · Proxy settings depend on the client'),
      goal: t('WinHTTP のプロキシ設定を読み、対象アプリを確認する。', 'Inspect WinHTTP proxy settings and identify which client uses them.'),
      explanation: [t('プロキシは Web 通信を中継する仕組みです。Windows のすべてのアプリが同じ設定を使うわけではありません。', 'A proxy relays web requests. Windows applications do not all use the same proxy settings.'), t('netsh winhttp show proxy は WinHTTP の設定を表示します。この課題の「業務同期クライアント」は WinHTTP を使い、古いプロキシ設定を参照しています。curl やブラウザーに自動的に同じ設定が適用されるとは限りません。', 'netsh winhttp show proxy displays WinHTTP settings. In this scenario, the business sync client uses WinHTTP and an outdated proxy. Do not assume that curl or a browser automatically uses those same settings.')],
      task: t('WinHTTP のプロキシ設定を確認し、次に照合すべき内容を選んでください。', 'Inspect the WinHTTP proxy settings and choose what to compare next.'),
      example: { command: 'netsh winhttp show proxy', note: t('表示されるのは WinHTTP の設定です。', 'The result describes WinHTTP configuration.') },
      hints: [t('netsh の winhttp コンテキストを使います。', 'Use the winhttp context in netsh.'), t('操作は show proxy です。', 'Use show proxy.'), t('対象アプリが使う設定と、社内の正しい設定を照合します。', 'Compare the client’s actual configuration with the intended company configuration.')],
      solution: ['netsh winhttp show proxy'], success: t('「プロキシ設定」という言葉だけで全アプリを一括りにせず調べられました。', 'You checked the relevant proxy configuration without treating all applications as identical.'),
      session: { scenario: 'proxy-mismatch' }, verify: { commands: [check('netsh', ['winhttp show proxy'])] },
      question: ask(t('この結果について適切なのは？', 'Which interpretation is appropriate?'), t('どのアプリがどの設定を使うかが大切です。WinHTTP の設定表示だけで、curl やブラウザーの挙動までは確定しません。', 'Identify which configuration the client uses. WinHTTP settings alone do not establish curl or browser behavior.'))
    }),
    lesson({
      id: 'firewall-profile', track: 'network', title: t('36 · ファイアウォールは表示から', '36 · Read the firewall profile'),
      goal: t('有効なプロファイルを確認し、無効化に頼らず調査する。', 'Inspect the active profile and investigate without disabling it.'),
      explanation: [t('Windows ファイアウォールは通信ルールを適用します。Domain、Private、Public のプロファイルがあり、接続環境に応じて使われます。', 'Windows Firewall applies traffic rules. Domain, Private, and Public profiles apply in different network contexts.'), t('netsh advfirewall show currentprofile は現在のプロファイルの状態を表示します。ON という表示だけで、特定の通信が遮断されているとは判断できません。', 'netsh advfirewall show currentprofile displays current profile settings. ON by itself does not establish that a particular connection is blocked.')],
      task: t('現在のファイアウォールプロファイルを表示し、その結果から言える範囲を選んでください。', 'Display the current firewall profile and identify what the result can establish.'),
      example: { command: 'netsh advfirewall show currentprofile', note: t('状態の照会だけを行います。', 'This is a state query only.') },
      hints: [t('netsh advfirewall を使います。', 'Use netsh advfirewall.'), t('表示操作は show currentprofile です。', 'The query is show currentprofile.'), t('ON は有効という意味で、個別の通信の判定結果ではありません。', 'ON means enabled; it is not the verdict for a specific connection.')],
      solution: ['netsh advfirewall show currentprofile'], success: t('プロファイルの状態と、個別通信の原因調査を分けられました。', 'You separated profile state from diagnosis of an individual connection.'),
      verify: { commands: [check('netsh', ['advfirewall show currentprofile'])] },
      question: ask(t('State が ON なら？', 'What if State is ON?'), t('ON/OFF は全体状態の一つです。対象アプリ・方向・ポートなどの情報と照合します。', 'ON/OFF is one overall setting. Compare it with the app, direction, port, and other details of the connection.'))
    }),
    lesson({
      id: 'curl-headers', track: 'network', title: t('37 · curl.exe で Web の応答', '37 · Read a web response with curl.exe'),
      goal: t('curl の実体を確認し、HTTP ヘッダーを読む。', 'Check the curl executable and read HTTP response headers.'),
      explanation: [t('Windows 11 には curl.exe が標準で含まれます。搭載バージョンは更新状況で異なるため、--version で確認します。この room の表示は演習用の固定値です。', 'Windows 11 includes curl.exe. Its version depends on installed updates, so check --version. This room shows a fixed practice version.'), t('HTTP は Web の要求と応答の仕組みです。-I（大文字のアイ）は HEAD 要求でヘッダーを取得します。200 は成功応答ですが、画面の全機能までは検証しません。', 'HTTP defines web requests and responses. -I (uppercase i) makes a HEAD request to retrieve headers. A 200 response indicates success for that request; it does not test every page feature.')],
      task: t('curl.exe --version を確認し、https://example.com のヘッダーを -I で取得してください。', 'Check curl.exe --version, then retrieve headers from https://example.com with -I.'),
      example: { command: 'curl.exe -I https://intranet.corp.example', note: t('課題では URL を example.com に変更します。', 'Change the URL to example.com for the task.') },
      hints: [t('最初は curl.exe --version です。', 'First run curl.exe --version.'), t('ヘッダー取得は大文字の -I です。', 'Use uppercase -I to request headers.'), t('curl.exe -I https://example.com を実行します。', 'Run curl.exe -I https://example.com.')],
      solution: ['curl.exe --version', 'curl.exe -I https://example.com'], success: t('名前解決や ping の先にある、Web 自体の応答を確認できました。', 'You checked a web response beyond DNS and ping.'),
      verify: { commands: [check('curl', ['--version']), check('curl', ['-I', 'https://example.com'], ['200 OK'])] }
    }),
    lesson({
      id: 'curl-detailed-request', track: 'network', title: t('38 · 接続の過程と本文', '38 · Inspect the request and its body'),
      goal: t('curl -v で接続過程と HTTP 応答を分けて読む。', 'Use curl -v to distinguish connection details from the response body.'),
      explanation: [t('curl.exe -v は接続や送受信ヘッダーの詳しい情報を表示します。-I と違い、この例は GET 要求で本文も受け取ります。', 'curl.exe -v displays connection and request/response details. Unlike -I, this example makes a GET request and receives a body.'), t('詳細情報は通常、標準エラー出力に書かれます。「標準エラー」という名前でも、必ず失敗を意味するわけではありません。実際のログには認証情報が含まれ得るため、共有前に内容を確認します。', 'Verbose details normally go to the standard error stream. Despite that name, the stream can contain diagnostics from a successful request. Real logs may contain credentials, so review them before sharing.')],
      task: t('curl.exe -v で https://intranet.corp.example を開き、本文と診断表示を確認してください。', 'Use curl.exe -v with https://intranet.corp.example and inspect both the body and the diagnostic details.'),
      example: { command: 'curl.exe -v https://example.com', note: t('課題の URL は社内ポータルです。', 'Use the intranet portal URL for the task.') },
      hints: [t('詳しい表示の指定は -v です。', 'Use -v for verbose details.'), t('対象は https://intranet.corp.example です。', 'The target is https://intranet.corp.example.'), t('本文と診断が別々に表示されても、それだけでは失敗ではありません。', 'Separate body and diagnostic output does not itself indicate failure.')],
      solution: ['curl.exe -v https://intranet.corp.example'], success: t('接続と HTTP の段階を読み、本文の取得まで確認できました。', 'You inspected the connection and HTTP stages and received the response body.'),
      verify: { commands: [check('curl', ['-v', 'https://intranet.corp.example'], ['CORP Intranet'])] },
      question: ask(t('curl -v の詳しい表示について適切なのは？', 'What is true of curl -v diagnostic output?'), t('出力先の名前と成功・失敗は別です。接続の成否、HTTP の状態、必要な業務結果をそれぞれ確認します。', 'An output stream’s name is separate from success or failure. Check the connection, HTTP status, and required application result individually.'))
    })
    ,lesson({
      id: 'mapped-shares', track: 'workplace', title: t('39 · 共有フォルダーへの接続', '39 · Inspect mapped shares'),
      goal: t('net use でドライブ割り当てと接続先を読む。', 'Read drive mappings and their targets with net use.'),
      explanation: [t('共有フォルダーは、別の PC やサーバーのファイルをネットワーク経由で使う仕組みです。\\\\files.corp.example\\team のような UNC パスで表します。', 'A network share provides access to files on another PC or server. Its UNC path looks like \\\\files.corp.example\\team.'), t('Z: のようなドライブ文字に共有先が割り当てられることがあります。引数なしの net use は、その割り当てや接続状態を一覧します。', 'A share may be mapped to a drive letter such as Z:. net use without arguments lists mappings and connection status.')],
      task: t('net use を実行し、ドライブ文字と接続先サーバーを確認してください。', 'Run net use and inspect the drive letter and server target.'),
      example: { command: 'net use', note: t('一覧表示です。共有の作成、削除、資格情報の入力は行いません。', 'This lists connections without creating, deleting, or authenticating a new mapping.') },
      hints: [t('net と use を空白で区切って入力します。', 'Enter net and use separated by a space.'), t('Local がドライブ文字、Remote が接続先です。', 'Local is the drive letter; Remote is the share target.'), t('割り当てが存在することと、必要なファイルを使えることは別です。', 'A mapping existing is different from being able to use the required file.')],
      solution: ['net use'], success: t('ドライブの背後にある共有先を確認できました。', 'You identified the share behind a mapped drive.'),
      verify: { commands: [check('net', ['use'])] }
    }),
    lesson({
      id: 'domain-user-and-groups', track: 'workplace', title: t('40 · ドメインのユーザーとグループ', '40 · Domain users and groups'),
      goal: t('現在のユーザーとグループ情報を確認する。', 'Inspect the current user and group information.'),
      explanation: [t('AD DS は組織のユーザーや PC を管理する仕組みです。この演習の PC は corp.example ドメインに参加しています。クラウドの Entra ID や Intune の操作は扱いません。', 'Active Directory Domain Services (AD DS) manages users and computers for an organization. This practice PC belongs to corp.example. This course does not simulate Entra ID or Intune administration.'), t('whoami /user はユーザーと SID、/groups は現在のログオンに含まれるグループ情報を表示します。SID は Windows がアカウントを識別する値です。所属変更が現在のログオンに反映されていない場合もあります。', 'whoami /user displays the user and SID; /groups displays group information in the current logon context. A SID is Windows’ identifier for an account. Membership changes may not yet be reflected in the current logon.')],
      task: t('whoami /user と whoami /groups を実行し、現在の実行ユーザーとグループを確認してください。', 'Run whoami /user and whoami /groups to inspect the current account and its groups.'),
      example: { command: 'whoami /user', note: t('続いて /groups でも照会します。', 'Follow this with a /groups query.') },
      hints: [t('アカウントの確認は /user です。', 'Use /user for account details.'), t('所属の表示は /groups です。', 'Use /groups for group information.'), t('グループ表示だけで、すべての共有へのアクセスは保証されません。', 'A group listing alone does not guarantee access to every share.')],
      solution: ['whoami /user', 'whoami /groups'], success: t('アカウント名だけでなく、現在のログオンの情報を確認できました。', 'You inspected the current logon context as well as the account name.'),
      verify: { commands: [check('whoami', ['/user']), check('whoami', ['/groups'])] },
      question: ask(t('グループに所属していると表示されたら？', 'What follows from seeing a group in this output?'), t('アクセスは対象の設定や拒否設定などにも依存します。ログオン情報と対象側の設定を組み合わせて確認します。', 'Access also depends on the target’s permissions and deny entries. Inspect both the logon context and target configuration.'))
    }),
    lesson({
      id: 'group-policy-results', track: 'workplace', title: t('41 · 適用済みポリシーを読む', '41 · Read applied policy results'),
      goal: t('gpresult でグループポリシーの適用結果を見る。', 'Use gpresult to inspect Group Policy results.'),
      explanation: [t('グループポリシーは、組織が PC やユーザーの設定をまとめて適用する仕組みです。gpresult /r は、現在記録されている適用結果の概要を表示します。', 'Group Policy applies centrally managed settings to computers and users. gpresult /r summarizes the currently recorded policy results.'), t('「想定した設定」と「この PC に適用された結果」は別です。実機ではユーザーとコンピューターの範囲や、表示に必要な権限にも注意します。', 'The intended configuration is different from the result applied on this PC. On a real system, distinguish user and computer scope and the permissions needed to view them.')],
      task: t('gpresult /r を表示し、適用される想定の CORP-Drive-Map が現在の一覧にないことを確認してください。', 'Display gpresult /r and confirm that the expected CORP-Drive-Map policy is absent from the current applied list.'),
      example: { command: 'gpresult /r', note: t('適用された GPO の一覧と最終適用時刻を読みます。一覧にない理由は、これから調べます。', 'Read the applied GPO list and last application time. The reason for an absent policy still needs investigation.') },
      hints: [t('概要レポートは /r です。', 'Use /r for a summary.'), t('USER SETTINGS と適用された GPO の一覧を見ます。', 'Look at USER SETTINGS and the applied GPO list.'), t('CORP-Desktop はありますが、想定した CORP-Drive-Map はありません。', 'CORP-Desktop is listed, but the expected CORP-Drive-Map is absent.')],
      solution: ['gpresult /r'], success: t('設定が配布される予定かどうかと、現在の適用結果を区別できました。', 'You distinguished intended policy delivery from the current applied result.'),
      session: { scenario: 'ad-policy' }, verify: { commands: [{ ...check('gpresult', ['/r'], ['USER SETTINGS', 'CORP-Desktop']), outputExcludes: ['CORP-Drive-Map'] }] },
      question: ask(t('この演習で次に確認すべきなのは？', 'What should you check next in this exercise?'), t('対象のポリシーを絞り、配布に必要な通信と実際の適用結果を確認します。', 'Focus on the relevant policy and check both the communication needed for delivery and the applied result.'))
    }),
    lesson({
      id: 'locate-domain-controller', track: 'workplace', title: t('42 · ドメインコントローラーを探す', '42 · Locate a domain controller'),
      goal: t('DC の役割と検出結果の意味を知る。', 'Understand a domain controller’s role and the meaning of discovery.'),
      explanation: [t('ドメインコントローラー（DC）は、AD DS の情報や認証に関わるサーバーです。社内のログオンやポリシー調査で、どの DC が見つかるかを確認することがあります。', 'A domain controller (DC) hosts AD DS information and authentication services. During logon or policy troubleshooting, you may need to identify the DC that the client discovers.'), t('nltest /dsgetdc:ドメイン名 は DC の検出結果を表示します。検出成功だけで、すべての認証や業務サービスの成功を保証するものではありません。実機の利用可否は構成や管理ツールの導入状況でも異なります。', 'nltest /dsgetdc:domain displays DC discovery results. Discovery alone does not guarantee every authentication or business service works. Availability on real machines depends on their configuration and installed management tools.')],
      task: t('corp.example の DC を nltest で調べてください。', 'Use nltest to locate a DC for corp.example.'),
      example: { command: 'nltest /dsgetdc:corp.example', note: t('ドメイン名を : の直後に続けます。', 'Place the domain name immediately after the colon.') },
      hints: [t('オプションは /dsgetdc: です。', 'Use /dsgetdc:.'), t('この演習のドメインは corp.example です。', 'The exercise domain is corp.example.'), t('DC と Address の欄を読みます。', 'Read the DC and Address fields.')],
      solution: ['nltest /dsgetdc:corp.example'], success: t('この PC が検出する DC を具体的な名前とアドレスで確認できました。', 'You identified the discovered DC by name and address.'),
      verify: { commands: [check('nltest', ['/dsgetdc:corp.example'], ['dc01.corp.example'])] }
    }),
    lesson({
      id: 'domain-dns-records', track: 'workplace', title: t('43 · AD と DNS のつながり', '43 · How AD uses DNS'),
      goal: t('サービスの場所を知らせる SRV レコードを照会する。', 'Query an SRV record that advertises a service location.'),
      explanation: [t('DNS はホストの IP だけでなく、サービスの場所も知らせます。AD のクライアントは DC を探すときに SRV レコードを利用します。', 'DNS can advertise service locations as well as host addresses. AD clients use SRV records when locating domain controllers.'), t('この演習の問い合わせ名は _ldap._tcp.dc._msdcs.corp.example です。複雑な名前を暗記することより、社内 DNS に適切な問い合わせをしているかを確認することが大切です。', 'This exercise queries _ldap._tcp.dc._msdcs.corp.example. The aim is to check the correct query against internal DNS, not to memorize the long name.')],
      task: t('nslookup の -type=SRV で、DC 検出用のレコードを照会してください。', 'Use nslookup -type=SRV to query the DC-discovery record.'),
      example: { command: 'nslookup -type=SRV _ldap._tcp.dc._msdcs.corp.example', note: t('この名前は演習用です。実機では自組織のドメインに合わせます。', 'This is the practice domain. A real query must use the organization’s own domain.') },
      hints: [t('nslookup に種類の指定を追加します。', 'Add a record-type option to nslookup.'), t('指定は -type=SRV です。', 'Use -type=SRV.'), t('例の名前を使い、回答のサーバー名とポートを読みます。', 'Use the record name in the example and read the returned server and port.')],
      solution: ['nslookup -type=SRV _ldap._tcp.dc._msdcs.corp.example'], success: t('AD の発見処理にも DNS が関わることを確認できました。', 'You saw how DNS participates in AD service discovery.'),
      verify: { commands: [check('nslookup', ['-type=SRV', '_ldap._tcp.dc._msdcs.corp.example'])] }
    }),
    lesson({
      id: 'time-synchronization', track: 'workplace', title: t('44 · 時刻同期の状態', '44 · Inspect time synchronization'),
      goal: t('時刻の同期先と最終同期の状態を確認する。', 'Inspect the time source and synchronization status.'),
      explanation: [t('PC の時刻は、ログの照合やドメイン認証に関係します。時刻が大きくずれていると不具合の手がかりになります。', 'PC time matters for comparing logs and for domain authentication. A large clock difference can be relevant to a failure.'), t('w32tm /query /status は同期状態、/source は同期先を表示します。最終同期が成功していても、現在の時刻差がゼロだと測定したことにはなりません。', 'w32tm /query /status displays synchronization status, and /source displays the time source. A successful last synchronization does not measure a current offset of zero.')],
      task: t('w32tm で状態と同期先の両方を確認してください。', 'Use w32tm to inspect both synchronization status and the source.'),
      example: { command: 'w32tm /query /status', note: t('状態の後に /source の照会も行います。', 'Follow the status query with a /source query.') },
      hints: [t('まず /query /status を使います。', 'Start with /query /status.'), t('次は /query /source です。', 'Then use /query /source.'), t('同期先と最終成功時刻を読んでも、現在のずれの実測とは区別します。', 'Distinguish the source and last success time from a measured current clock offset.')],
      solution: ['w32tm /query /status', 'w32tm /query /source'], success: t('時刻同期の状態を確認し、未測定の時刻差までは断定しませんでした。', 'You inspected synchronization without claiming an unmeasured clock offset.'),
      verify: { commands: [check('w32tm', ['/query', '/status']), check('w32tm', ['/query', '/source'])] },
      question: ask(t('最終同期成功の表示から言えるのは？', 'What does a last-successful-sync entry establish?'), t('設定・履歴の確認と、現在の差の測定は別です。必要に応じて追加調査します。', 'Inspecting configuration and history is different from measuring the current difference. Investigate further when needed.'))
    }),
    lesson({
      id: 'collect-support-report', track: 'workplace', title: t('45 · 調査結果を一つにまとめる', '45 · Assemble a support report'),
      goal: t('端末・ネットワーク・ポリシーの出力を一つのファイルに保存する。', 'Save machine, network, and policy evidence in one file.'),
      explanation: [t('問い合わせの引き継ぎでは、対象 PC、症状、実施した確認、未解決の点をまとめると伝わりやすくなります。生の出力にも、何を確認したかの説明を添えます。', 'A useful handoff identifies the PC, symptom, checks performed, and unresolved questions. Explain what each raw output was used to check.'), t('ここでは > で最初の結果を保存し、>> で次の結果を追加します。実機の出力にはユーザー名や社内アドレスが含まれるので、共有範囲に合わせて内容を確認します。', 'Use > to save the first result and >> to append the next ones. Real output may contain account names and internal addresses; review it for the intended audience.')],
      task: t('systeminfo、ipconfig /all、gpresult /r の順に、Reports\\support.txt へ一つにまとめ、type で確認してください。', 'Save systeminfo, ipconfig /all, and gpresult /r in that order to C:\\Lab\\Reports\\support.txt, then review it with type.'),
      example: { command: c`systeminfo > C:\Lab\Reports\support.txt`, note: t('次のコマンドからは同じファイルへ >> で追記します。', 'Append subsequent commands to the same file with >>.') },
      hints: [t('最初の systeminfo だけ > を使います。', 'Only the first systeminfo command uses >.'), t('ipconfig /all と gpresult /r は >> で追記します。', 'Append ipconfig /all and gpresult /r with >>.'), t('最後は type C:\\Lab\\Reports\\support.txt です。', 'Finish with type C:\\Lab\\Reports\\support.txt.')],
      solution: [c`systeminfo > C:\Lab\Reports\support.txt`, c`ipconfig /all >> C:\Lab\Reports\support.txt`, c`gpresult /r >> C:\Lab\Reports\support.txt`, c`type C:\Lab\Reports\support.txt`], success: t('複数の確認結果を、上書きで失わずに一つの報告ファイルにまとめられました。', 'You combined several results into a report without overwriting earlier evidence.'),
      verify: { commands: [check('systeminfo'), check('ipconfig', ['/all']), check('gpresult', ['/r']), check('type', [c`C:\Lab\Reports\support.txt`])], files: [{ path: c`C:\Lab\Reports\support.txt`, includes: ['PC-014', 'DNS Servers', 'USER SETTINGS'] }] }
    }),
    lesson({
      id: 'share-server-diagnosis', track: 'workplace', title: t('46 · 共有先を段階的に確認', '46 · Check a share in stages'),
      goal: t('共有の割り当て、名前解決、到達性を別々に確認する。', 'Check share mapping, name resolution, and reachability separately.'),
      explanation: [t('「共有が開けない」という相談でも、割り当て、DNS、経路、共有サービス、資格情報、権限など複数の確認点があります。', 'A share-access problem can involve a mapping, DNS, routing, the sharing service, credentials, or permissions.'), t('まず net use で相手を特定し、サーバー名を nslookup と ping で確認します。この三つが成功しても、特定ファイルへの読み書きの成功までは分かりません。', 'First identify the target with net use, then check its server name with nslookup and ping. Success in all three still does not prove that a particular file can be read or written.')],
      task: t('net use、files.corp.example の名前解決、同じサーバーへの ping を確認し、次の調査範囲を選んでください。', 'Check net use, resolve files.corp.example, and ping it. Then choose what to investigate next.'),
      example: { command: 'nslookup files.corp.example', note: t('ファイルサーバー名を対象にします。', 'Use the file server’s name.') },
      hints: [t('最初は net use で割り当てを見ます。', 'First inspect mappings with net use.'), t('nslookup と ping の対象は files.corp.example です。', 'Use files.corp.example for both nslookup and ping.'), t('応答があっても、共有サービスや対象ファイルの権限は別の確認です。', 'A reply still leaves the sharing service and target permissions to be checked.')],
      solution: ['net use', 'nslookup files.corp.example', 'ping -n 2 files.corp.example'], success: t('確認済みの層を整理し、次に必要な調査を絞れました。', 'You identified the layers already checked and narrowed the next investigation.'),
      verify: { commands: [check('net', ['use']), check('nslookup', ['files.corp.example']), check('ping', ['files.corp.example'])] },
      question: ask(t('すべて応答したのに、特定ファイルだけ開けない場合は？', 'If all checks respond but one file still cannot be opened, what next?'), t('ここで確認したのは割り当てと名前解決、ICMP の到達性です。共有アクセスの成功には別の条件があります。', 'These checks cover the mapping, DNS, and ICMP reachability. Successful share access has additional requirements.'))
    })
    ,lesson({
      id: 'renew-dhcp-lease', track: 'recovery', title: t('47 · DHCP を更新して再確認', '47 · Renew DHCP and recheck'),
      goal: t('DHCP 更新の用途と影響を理解する。', 'Understand when a DHCP renewal is relevant and what it can affect.'),
      explanation: [t('DHCP は IP アドレスなどの設定を配布する仕組みです。ipconfig /renew は DHCP を利用する接続のリース更新を要求します。静的設定の修復や Web アプリの復旧をする万能コマンドではありません。', 'DHCP distributes settings such as IP addresses. ipconfig /renew requests a lease renewal for DHCP-configured connections. It is not a universal repair for static configuration or a web application.'), t('実機では接続への影響を確認し、管理者として開いたコマンドプロンプトで組織の運用手順に沿って実行します。この課題では更新が許可された演習 PC で、更新前後の設定を確認します。', 'On a real PC, assess connectivity impact and use an elevated Command Prompt in accordance with your organization’s procedures. This task uses an approved practice PC and compares settings before and after renewal.')],
      task: t('ipconfig /all を確認し、/renew を実行した後、もう一度 /all で設定を確認してください。', 'Inspect ipconfig /all, run /renew, then inspect /all again.'),
      example: { command: 'ipconfig /renew', note: t('新しいアドレスになるとは限りません。同じアドレスで更新されることもあります。', 'Renewal may retain the same address; a new address is not guaranteed.') },
      hints: [t('変更前を ipconfig /all で確認します。', 'Inspect the initial state with ipconfig /all.'), t('更新は ipconfig /renew です。', 'Renew with ipconfig /renew.'), t('最後に ipconfig /all を再実行して、アドレスと DNS を読みます。', 'Run ipconfig /all again and inspect the address and DNS settings.')],
      solution: ['ipconfig /all', 'ipconfig /renew', 'ipconfig /all'], success: t('更新操作の完了と、更新後の設定を分けて確認できました。', 'You checked both completion of the renewal and the resulting settings.'),
      verify: { commands: [check('ipconfig', ['/renew']), check('ipconfig', ['/all'])], orderedCommands: [check('ipconfig', ['/all']), recheck('ipconfig', ['/renew']), check('ipconfig', ['/all'])] },
      question: ask(t('更新後も同じ IP アドレスだったら？', 'What if the address is unchanged after renewal?'), t('更新は「必ず新しい番号に変える」操作ではありません。元の症状が改善したかは別途再確認します。', 'Renewal does not mean “always get a new number.” Recheck the original symptom separately.'))
    }),
    lesson({
      id: 'refresh-dns-cache', track: 'recovery', title: t('48 · 古い名前解決を更新', '48 · Refresh stale name resolution'),
      goal: t('古いキャッシュという根拠に対応し、宛先を再確認する。', 'Respond to evidence of a stale cache and verify the resolved destination.'),
      explanation: [t('この PC にはポータルの古いアドレス 10.20.0.99 が残り、DNS サーバーの現在の回答は 10.20.0.20 です。まずその差を確認します。', 'This PC retains the old portal address 10.20.0.99, while the DNS server now answers 10.20.0.20. First confirm the discrepancy.'), t('ipconfig /flushdns は Windows の DNS リゾルバーキャッシュを消去します。DNS サーバーの誤設定、経路、Web サーバー自体の障害までは直しません。アプリ独自のキャッシュが別にある場合もあります。', 'ipconfig /flushdns clears the Windows DNS resolver cache. It does not fix DNS-server configuration, routing, or the web server. Applications may also have their own caches.'), t('消去前に ping を試すと、旧アドレス宛てに Reply from 10.20.0.14: Destination host unreachable. と返ります。送信元の .14 は自分の PC で、宛先の成功応答ではありません。この教材の ping 統計と終了コードは簡略化しています。実機でも統計や終了コードだけで判断せず、Reply の内容と送信元を読みます。', 'Before the flush, ping to the old address reports Reply from 10.20.0.14: Destination host unreachable. The sender .14 is this PC, not a successful reply from the destination. This simulator simplifies ping statistics and exit codes. On real Windows, inspect the reply text and sender instead of relying on statistics or exit codes alone.')],
      task: t('キャッシュと DNS 回答を比較し、/flushdns 後に intranet.corp.example への ping を確認してください。', 'Compare the cache and DNS answer, flush the cache, then ping intranet.corp.example.'),
      example: { command: 'ipconfig /flushdns', note: t('根拠を確認してから使い、元の対象を再確認します。', 'Use this after checking the evidence, then retest the original target.') },
      hints: [t('/displaydns と nslookup でアドレスを比較します。', 'Compare the addresses using /displaydns and nslookup.'), t('古い情報の消去には ipconfig /flushdns を使います。', 'Use ipconfig /flushdns to clear the stale information.'), t('最後は ping -n 2 intranet.corp.example で 10.20.0.20 の応答を確かめます。', 'Finish with ping -n 2 intranet.corp.example and check for a reply from 10.20.0.20.')],
      solution: ['ipconfig /displaydns', 'nslookup intranet.corp.example', 'ipconfig /flushdns', 'ping -n 2 intranet.corp.example'], success: t('古いキャッシュを更新した後、現在のアドレスへの応答を確認できました。', 'After refreshing the cache, you confirmed a response from the current address.'),
      session: { scenario: 'dns-cache' }, verify: { commands: [check('ipconfig', ['/displaydns'], ['10.20.0.99']), check('nslookup', ['intranet.corp.example'], ['10.20.0.20']), check('ipconfig', ['/flushdns']), check('ping', ['intranet.corp.example'], ['Reply from 10.20.0.20'])], orderedCommands: [check('ipconfig', ['/displaydns'], ['10.20.0.99']), check('nslookup', ['intranet.corp.example'], ['10.20.0.20']), recheck('ipconfig', ['/flushdns']), check('ping', ['intranet.corp.example'], ['Reply from 10.20.0.20'])] },
      question: ask(t('この対応で確認できたことは？', 'What did this action verify?'), t('操作したのはこの PC のキャッシュです。Web が必要なら curl や利用者の操作でも再確認します。', 'The change affected this PC’s cache. If the issue concerns the web app, recheck it with curl or the user’s normal action.'))
    }),
    lesson({
      id: 'start-print-service', track: 'recovery', title: t('49 · 対象サービスだけを開始', '49 · Start the relevant service'),
      goal: t('確認した停止サービスを開始し、状態を再確認する。', 'Start a confirmed stopped service and recheck its state.'),
      explanation: [t('この演習では印刷できず、Spooler の停止が確認されています。開始操作が許可されているため、対象を指定して net start を実行します。実機では管理者権限が必要なことがあります。', 'Printing is unavailable and Spooler is stopped in this scenario. You have approval to start this specific service with net start. Real machines may require an elevated prompt.'), t('開始完了のメッセージだけで終わらず、sc.exe query で現在の状態を確認します。その先の実際の印刷テストは、実機で別に行う確認です。', 'Do not stop at the start-success message; inspect the current state with sc.exe query. A real print test is a further, separate check on the actual system.')],
      task: t('Spooler の停止を確認し、net start Spooler で開始、query で RUNNING を確認してください。', 'Confirm Spooler is stopped, run net start Spooler, then query it again for RUNNING.'),
      example: { command: 'sc.exe query Spooler', note: t('この照会を、操作の前と後で使います。', 'Use this query both before and after the change.') },
      hints: [t('最初の STATE は STOPPED です。', 'The initial STATE is STOPPED.'), t('開始コマンドは net start Spooler です。', 'Start it with net start Spooler.'), t('もう一度 sc.exe query Spooler を実行します。', 'Run sc.exe query Spooler again.')],
      solution: ['sc.exe query Spooler', 'net start Spooler', 'sc.exe query Spooler'], success: t('対象のサービスが停止から動作中になったことを、再照会で確認できました。', 'A second query confirmed that the service changed from stopped to running.'),
      session: { scenario: 'service-stopped' }, verify: { commands: [check('sc', ['query', 'Spooler'], ['STOPPED']), check('net', ['start', 'Spooler']), check('sc', ['query', 'Spooler'], ['RUNNING'])], orderedCommands: [check('sc', ['query', 'Spooler'], ['STOPPED']), recheck('net', ['start', 'Spooler']), check('sc', ['query', 'Spooler'], ['RUNNING'])], state: { 'pc.spoolerRunning': true } },
      question: ask(t('RUNNING になった後の確認は？', 'What should follow the RUNNING result?'), t('サービス開始と、利用者が必要とする機能の復旧は分けて確認します。', 'Verify service startup separately from recovery of the function the user needs.'))
    }),
    lesson({
      id: 'refresh-group-policy', track: 'recovery', title: t('50 · ポリシー更新と適用確認', '50 · Refresh policy and verify it'),
      goal: t('ポリシーを更新し、共有ドライブの反映を確かめる。', 'Refresh policy and verify the drive mapping.'),
      explanation: [t('この演習では DC へ接続でき、適用される想定の CORP-Drive-Map が現在の適用一覧にありません。gpupdate /force は既存ポリシーの再適用を要求します。', 'This PC can reach its DC, but the expected CORP-Drive-Map is absent from the current applied list. gpupdate /force requests reapplication of existing policy.'), t('実機ではポリシーによってサインアウトや再起動が必要なこともあります。更新コマンドの成功だけでなく、gpresult と利用者が見る設定を再確認します。', 'Some policies on real systems require sign-out or restart. Check both gpresult and the user-visible setting instead of relying only on the update-success message.')],
      task: t('gpresult /r を確認し、gpupdate /force の後、gpresult /r と net use でドライブ反映を再確認してください。', 'Inspect gpresult /r, run gpupdate /force, then recheck gpresult /r and net use for the drive mapping.'),
      example: { command: 'gpupdate /force', note: t('設定を新規作成する操作ではなく、既存ポリシーの更新です。', 'This refreshes existing policy; it does not create a new policy.') },
      hints: [t('更新前の適用一覧には CORP-Desktop があり、CORP-Drive-Map はありません。', 'Before refresh, the applied list contains CORP-Desktop but not CORP-Drive-Map.'), t('更新後は gpresult /r を再実行し、CORP-Drive-Map の追加と最終適用時刻を確認します。', 'Run gpresult /r again and check the added CORP-Drive-Map and last application time.'), t('最後に net use で Z: の割り当てを確認します。', 'Finish by checking the Z: mapping with net use.')],
      solution: ['gpresult /r', 'gpupdate /force', 'gpresult /r', 'net use'], success: t('ポリシーの更新と、その結果のドライブ割り当てを確認できました。', 'You verified both the policy refresh and the resulting drive mapping.'),
      session: { scenario: 'ad-policy' }, verify: { commands: [check('gpupdate', ['/force']), check('gpresult', ['/r'], ['CORP-Desktop', 'CORP-Drive-Map']), check('net', ['use'], ['Z:'])], orderedCommands: [{ ...check('gpresult', ['/r'], ['CORP-Desktop']), outputExcludes: ['CORP-Drive-Map'] }, recheck('gpupdate', ['/force']), check('gpresult', ['/r'], ['CORP-Desktop', 'CORP-Drive-Map']), check('net', ['use'], ['Z:'])], state: { 'net.domain.policyCurrent': true } },
      question: ask(t('gpupdate が成功したら、確認は終わり？', 'Does a successful gpupdate finish the investigation?'), t('更新要求の成功と、目的の設定や機能の確認を分けます。', 'Separate successful refresh from verification of the intended setting or function.'))
    }),
    lesson({
      id: 'system-file-verification', track: 'recovery', title: t('51 · システムファイルを検証', '51 · Verify system files'),
      goal: t('SFC の検証と修復を区別する。', 'Distinguish SFC verification from repair.'),
      explanation: [t('sfc は保護された Windows システムファイルを検証するツールです。/verifyonly は検証のみ、/scannow は検証と修復を試みる指定です。', 'sfc checks protected Windows system files. /verifyonly verifies them without repair; /scannow verifies and attempts repair.'), t('この room では結果を読む練習だけを行います。実機では管理者権限や作業時間を確保し、症状とログに沿って実施します。一般のアプリ設定や DNS の問題を直すコマンドではありません。', 'This lesson practices interpreting a simulated result. On a real PC, plan for elevation and execution time and follow the symptoms and logs. SFC is not a repair for ordinary app configuration or DNS problems.')],
      task: t('sfc /verifyonly を実行し、検出と修復の違いを選んでください。', 'Run sfc /verifyonly and distinguish detection from repair.'),
      example: { command: 'sfc /verifyonly', note: t('この課題は検証です。実際のシステムファイルは読み書きしません。', 'This task verifies only within the simulation; no real system files are accessed.') },
      hints: [t('オプションは /verifyonly です。', 'Use /verifyonly.'), t('integrity violations は整合性の問題が見つかったことを表します。', 'integrity violations indicates detected integrity problems.'), t('検出したことと、修復したことを区別します。', 'Distinguish finding a problem from repairing it.')],
      solution: ['sfc /verifyonly'], success: t('検証で問題が見つかっても、修復完了とは言えないことを確認できました。', 'You recognized that detecting an integrity problem is not the same as repairing it.'),
      session: { scenario: 'system-corrupt' }, verify: { commands: [check('sfc', ['/verifyonly'], ['integrity violations'])] },
      question: ask(t('この検証結果の読み方は？', 'How should this verification result be read?'), t('/verifyonly は修復しません。結果を記録し、適切な修復手順や担当者の判断につなげます。', '/verifyonly does not repair. Record the result and use it to choose an appropriate repair procedure or escalation.'))
    }),
    lesson({
      id: 'windows-image-health', track: 'recovery', title: t('52 · Windows イメージの状態', '52 · Check Windows image health'),
      goal: t('DISM の確認範囲と、修復操作との違いを知る。', 'Understand DISM’s health-check scope and distinguish it from repair.'),
      explanation: [t('DISM は Windows イメージを保守するツールです。/Online は稼働中の Windows を対象にする指定で、インターネット接続の意味ではありません。', 'DISM services Windows images. /Online targets the running Windows installation; it does not mean “connect to the internet.”'), t('/Cleanup-Image /CheckHealth は破損が記録されているかを短く確認します。新しい詳細スキャンは /ScanHealth、修復を試みるのは /RestoreHealth です。実機の修復は管理者権限や適切な修復元などの準備が必要です。', '/Cleanup-Image /CheckHealth checks whether corruption has already been flagged. /ScanHealth performs a scan; /RestoreHealth attempts repair. Real repairs require preparation such as elevation and a suitable repair source.')],
      task: t('DISM /Online /Cleanup-Image /CheckHealth を実行し、この操作が行った範囲を選んでください。', 'Run DISM /Online /Cleanup-Image /CheckHealth and identify what it actually did.'),
      example: { command: 'DISM /Online /Cleanup-Image /CheckHealth', note: t('この課題は既知の破損状態の照会です。修復は行いません。', 'This task queries the flagged health state; it does not repair it.') },
      hints: [t('対象は /Online です。', 'Select /Online.'), t('状態確認は /Cleanup-Image /CheckHealth です。', 'Use /Cleanup-Image /CheckHealth for the health check.'), t('repairable は修復可能な状態という意味で、修復済みとは違います。', 'repairable describes a state that can be repaired; it does not mean repaired.')],
      solution: ['DISM /Online /Cleanup-Image /CheckHealth'], success: t('既知の状態の確認、スキャン、修復を区別できました。', 'You distinguished checking a recorded state, scanning, and repairing.'),
      session: { scenario: 'system-corrupt' }, verify: { commands: [check('dism', ['/Online', '/Cleanup-Image', '/CheckHealth'], ['repairable'])] },
      question: ask(t('CheckHealth の完了は何を意味する？', 'What does completion of CheckHealth mean?'), t('CheckHealth の成功は確認コマンドが完了したことです。repairable という出力を、修復完了と読み違えないようにします。', 'Successful completion means the check finished. Do not confuse a repairable result with a completed repair.'))
    }),
    lesson({
      id: 'capstone-stale-portal', track: 'recovery', title: t('53 · 総合演習：この PC だけポータルが開かない', '53 · Case: only this PC cannot open the portal'),
      goal: t('DNS の差を記録し、最小限の対応後に Web 応答まで確認する。', 'Record a DNS discrepancy, make a targeted change, and verify the web response.'),
      explanation: [t('受付内容：「同僚は社内ポータルを使えるが、自分の PC だけ開かない」。まず PC のキャッシュと DNS サーバーの回答を比較します。', 'Support ticket: “My colleagues can open the portal, but my PC cannot.” Start by comparing the PC’s DNS cache with the DNS server’s answer.'), t('手順は ①変更前のキャッシュを保存、②DNS 回答を追記、③根拠に沿ってキャッシュ更新、④HTTP ヘッダーを取得して追記、です。最後に報告できる範囲を選びます。', 'Follow four steps: save the cache evidence, append the DNS answer, refresh the cache based on the discrepancy, and append the HTTP response headers. Then choose a conclusion supported by that evidence.')],
      task: t('Reports\\portal.txt にキャッシュと DNS 回答を記録し、flushdns 後の curl.exe -I の結果も追記してください。', 'Record the cache and DNS answer in C:\\Lab\\Reports\\portal.txt, then append the curl.exe -I result after flushing the cache.'),
      example: { command: c`ipconfig /displaydns > C:\Lab\Reports\portal.txt`, note: t('最初の証拠を保存します。続く結果は >> で追加します。', 'Save the first piece of evidence. Append later results with >>.') },
      hints: [t('まずキャッシュの 10.20.0.99 と nslookup の 10.20.0.20 を比較します。', 'First compare cached 10.20.0.99 with 10.20.0.20 from nslookup.'), t('次に ipconfig /flushdns を実行します。', 'Next run ipconfig /flushdns.'), t('curl.exe -I https://intranet.corp.example の結果を同じファイルへ追記します。', 'Append curl.exe -I https://intranet.corp.example to the same report.')],
      solution: [c`ipconfig /displaydns > C:\Lab\Reports\portal.txt`, c`nslookup intranet.corp.example >> C:\Lab\Reports\portal.txt`, 'ipconfig /flushdns', c`curl.exe -I https://intranet.corp.example >> C:\Lab\Reports\portal.txt`],
      success: t('根拠、対応、再確認の結果を残せました。次は利用者の元の操作で改善を確認します。', 'You recorded the evidence, action, and recheck. The next real-world step is to retest the user’s original workflow.'),
      session: { scenario: 'dns-cache' }, verify: { commands: [check('ipconfig', ['/displaydns'], ['10.20.0.99']), check('nslookup', ['intranet.corp.example'], ['10.20.0.20']), check('ipconfig', ['/flushdns']), check('curl', ['-I', 'https://intranet.corp.example'], ['200 OK'])], orderedCommands: [check('ipconfig', ['/displaydns'], ['10.20.0.99']), check('nslookup', ['intranet.corp.example'], ['10.20.0.20']), recheck('ipconfig', ['/flushdns']), check('curl', ['-I', 'https://intranet.corp.example'], ['200 OK'])], files: [{ path: c`C:\Lab\Reports\portal.txt`, includes: ['10.20.0.99', '10.20.0.20', '200 OK'] }] },
      question: ask(t('報告として適切なのは？', 'Which report matches the evidence?'), t('確認した対象と操作を具体的に伝えます。HEAD の成功は、ログインや業務処理の全機能を確認したことにはなりません。', 'Report the exact target and check. A successful HEAD request does not test sign-in or every business operation.'))
    }),
    lesson({
      id: 'capstone-printing', track: 'recovery', title: t('54 · 総合演習：印刷できない', '54 · Case: printing is unavailable'),
      goal: t('サービスとイベントを記録し、対象だけを開始して再確認する。', 'Record service and event evidence, start the target, and recheck it.'),
      explanation: [t('受付内容：「印刷ジョブを送れない」。この PC では Spooler の開始操作が許可されています。プリンター交換や PC 再起動の前に、状態と記録を確認します。', 'Support ticket: “I cannot submit a print job.” Starting Spooler is approved for this PC. Inspect its state and logs before considering a printer replacement or PC restart.'), t('手順は ①サービス状態を保存、②最近の System イベントを追記、③停止中の Spooler を開始、④再照会を追記、です。演習では実物のプリンターへの印刷までは行いません。', 'Save the service state, append recent System events, start the stopped Spooler, then append a second state query. This simulator does not send a real print job.')],
      task: t('Reports\\printing.txt に変更前後の Spooler 状態と最近のイベント 3 件を保存し、状態を RUNNING にしてください。', 'Save the before/after Spooler state and three recent events to C:\\Lab\\Reports\\printing.txt, and bring the service to RUNNING.'),
      example: { command: c`sc.exe query Spooler > C:\Lab\Reports\printing.txt`, note: t('変更前を保存してから、必要な操作に進みます。', 'Save the initial state before making the change.') },
      hints: [t('System イベントは wevtutil qe System /c:3 /rd:true /f:text です。', 'Query events with wevtutil qe System /c:3 /rd:true /f:text.'), t('イベントを >> で追記したら、net start Spooler を実行します。', 'Append the events with >>, then run net start Spooler.'), t('sc.exe query Spooler の再実行結果を同じファイルへ追記します。', 'Append a second sc.exe query Spooler result to the same file.')],
      solution: [c`sc.exe query Spooler > C:\Lab\Reports\printing.txt`, c`wevtutil qe System /c:3 /rd:true /f:text >> C:\Lab\Reports\printing.txt`, 'net start Spooler', c`sc.exe query Spooler >> C:\Lab\Reports\printing.txt`],
      success: t('サービスの開始を再照会で確認し、実際の印刷テストへ渡せる記録を残せました。', 'You verified service startup and saved evidence for a follow-up print test.'),
      session: { scenario: 'service-stopped' }, verify: { commands: [check('sc', ['query', 'Spooler'], ['STOPPED']), check('wevtutil', ['qe', 'System', '/c:3', '/rd:true', '/f:text']), check('net', ['start', 'Spooler']), check('sc', ['query', 'Spooler'], ['RUNNING'])], orderedCommands: [check('sc', ['query', 'Spooler'], ['STOPPED']), check('wevtutil', ['qe', 'System', '/c:3', '/rd:true', '/f:text']), recheck('net', ['start', 'Spooler']), check('sc', ['query', 'Spooler'], ['RUNNING'])], state: { 'pc.spoolerRunning': true }, files: [{ path: c`C:\Lab\Reports\printing.txt`, includes: ['STOPPED', 'RUNNING', 'Event[0]:', 'Event[1]:', 'Event[2]:', 'Log Name: System'] }] },
      question: ask(t('現時点で報告できることは？', 'What can be reported at this point?'), t('演習内で測定したことと未確認のことを分けて報告します。サービス開始だけでは物理的な印刷の成功を証明できません。', 'Distinguish measured results from untested behavior. Starting the service does not prove a physical print succeeded.'))
    }),
    lesson({
      id: 'capstone-http-503', track: 'recovery', title: t('55 · 総合演習：ping は通るのに開かない', '55 · Case: ping works, but the website does not'),
      goal: t('DNS・ICMP・HTTP を比較し、Web 側の応答を報告する。', 'Compare DNS, ICMP, and HTTP evidence and report the web response.'),
      explanation: [t('受付内容：「社内ポータルだけ使えない」。名前解決と ICMP の応答が正常でも、HTTP の段階でエラーを返すことがあります。', 'Support ticket: “Only the intranet portal is unavailable.” Name resolution and ICMP can work while the server returns an HTTP error.'), t('HTTP 503 はサービスを利用できない応答です。サーバー本体や中継先など、どこで発生したかは別途調査します。通常の curl は HTTP 503 を受信できた場合も終了コード 0 になるため、ステータス自体を読みます。', 'HTTP 503 is a service-unavailable response. Further investigation is needed to locate its source, which might be a server or intermediary. Without failure options, curl can exit with code 0 after receiving a 503, so read the HTTP status itself.')],
      task: t('社内ポータルを nslookup と ping で確認し、curl.exe -I の結果を Reports\\web.txt に保存して、調査を引き継ぐ先を選んでください。', 'Check the portal with nslookup and ping, save curl.exe -I output to C:\\Lab\\Reports\\web.txt, then choose the next investigation.'),
      example: { command: 'curl.exe -I https://intranet.corp.example', note: t('コマンドの実行成功だけでなく、HTTP の数字を読みます。', 'Read the HTTP status, not just whether the command ran.') },
      hints: [t('nslookup の回答は 10.20.0.20 です。', 'nslookup returns 10.20.0.20.'), t('同じ名前への ping も応答します。次に HTTP を確認します。', 'Ping to the same name also replies. Next inspect HTTP.'), t('curl の結果に 503 があれば、その応答を保存して Web 側の調査へつなぎます。', 'If curl returns 503, save the response and continue the web-service investigation.')],
      solution: ['nslookup intranet.corp.example', 'ping -n 2 intranet.corp.example', c`curl.exe -I https://intranet.corp.example > C:\Lab\Reports\web.txt`],
      success: t('到達性と Web の利用可否を切り分け、503 という具体的な証拠を残せました。', 'You distinguished reachability from web availability and saved the specific 503 response.'),
      session: { scenario: 'web-503' }, verify: { commands: [check('nslookup', ['intranet.corp.example']), check('ping', ['intranet.corp.example']), check('curl', ['-I', 'https://intranet.corp.example'], ['503 Service Unavailable'])], files: [{ path: c`C:\Lab\Reports\web.txt`, includes: ['503 Service Unavailable'] }] },
      question: ask(t('次の行動として適切なのは？', 'What is the appropriate next action?'), t('503 を返す応答先まで HTTP は届いていますが、利用可能な応答は得られていません。根本原因はサーバーや中継構成のログなどで追加確認します。', 'HTTP reached a responder, but it did not provide a usable service response. Investigate server or intermediary logs and configuration to establish the root cause.'))
    }),
    lesson({
      id: 'capstone-vpn-route', track: 'recovery', title: t('56 · 総合演習：VPN は接続済みなのに', '56 · Case: VPN connected, intranet unavailable'),
      goal: t('接続・名前解決・DC・経路を比較して、未確認の修復を断定しない報告を作る。', 'Compare connection, DNS, DC, and routing evidence without claiming an unverified repair.'),
      explanation: [t('受付内容：「自宅から VPN 接続はできたが、ポータルが開かない」。この設定では DC への個別経路はありますが、社内サブネット全体への経路が欠けています。', 'Support ticket: “I connected to the VPN from home, but the portal does not open.” This configuration has a specific route to the DC but lacks the intended route to the full internal subnet.'), t('ipconfig、DNS 回答、DC 検出、route print を比較します。ここでのゴールは勝手な経路追加ではなく、VPN 担当者が確認できる証拠を残して適切に引き継ぐことです。', 'Compare ipconfig, the DNS answer, DC discovery, and route print. The goal is to gather evidence for the VPN owner and hand off the problem with a clear next step.')],
      task: t('ipconfig /all、社内ポータルの nslookup、nltest の DC 検出、route print を Reports\\vpn.txt にまとめ、結論を選んでください。', 'Save ipconfig /all, the intranet nslookup result, nltest DC discovery, and route print to C:\\Lab\\Reports\\vpn.txt, then select a conclusion.'),
      example: { command: c`ipconfig /all > C:\Lab\Reports\vpn.txt`, note: t('残りの 3 コマンドは同じファイルに追記します。', 'Append the other three command results to the same file.') },
      hints: [t('nslookup の対象は intranet.corp.example です。', 'The nslookup target is intranet.corp.example.'), t('DC の確認は nltest /dsgetdc:corp.example です。', 'Check DC discovery with nltest /dsgetdc:corp.example.'), t('route print にある 10.20.0.10 への個別経路と、ポータル 10.20.0.20 を比較します。', 'Compare the specific route to 10.20.0.10 with the portal address 10.20.0.20.')],
      solution: [c`ipconfig /all > C:\Lab\Reports\vpn.txt`, c`nslookup intranet.corp.example >> C:\Lab\Reports\vpn.txt`, c`nltest /dsgetdc:corp.example >> C:\Lab\Reports\vpn.txt`, c`route print >> C:\Lab\Reports\vpn.txt`],
      success: t('接続済みという表示に頼らず、宛先ごとの違いを説明できる証拠をまとめました。', 'You went beyond “connected” and collected evidence that explains why different destinations behave differently.'),
      session: { scenario: 'vpn-route' }, verify: { commands: [check('ipconfig', ['/all']), check('nslookup', ['intranet.corp.example']), check('nltest', ['/dsgetdc:corp.example']), check('route', ['print'])], files: [{ path: c`C:\Lab\Reports\vpn.txt`, includes: ['10.20.0.20', '10.20.0.10', 'IPv4 Route Table', 'PPP adapter CORP-VPN:', 'Windows IP Configuration'] }] },
      question: ask(t('引き継ぎ内容として適切なのは？', 'Which handoff matches the evidence?'), t('DC への個別経路と、他の社内ホストへの経路は別です。確認した事実・不足している経路・未実施の修復を明確に伝えます。', 'A specific DC route is separate from routes to other internal hosts. State the observed facts, the missing route, and that no repair has yet been applied.'))
    })
  ];
  // Display-only labels are separate from grading rules and excluded from evidence signatures.
  const verificationLabels = {
    "help-first": {"commands": [{"ja": "help でコマンド一覧を表示", "en": "Display the command list with help"}, {"ja": "help dir で dir の使い方を表示", "en": "Display dir usage with help dir"}], "orderedCommands": [{"ja": "help でコマンド一覧を表示", "en": "Display the command list with help"}, {"ja": "help dir で dir の使い方を表示", "en": "Display dir usage with help dir"}]},
    "current-directory": {"commands": [{"ja": "cd で現在地を表示", "en": "Display the current folder with cd"}, {"ja": "C:\\Lab へ移動", "en": "Move to C:\\Lab"}], "orderedCommands": [{"ja": "cd で現在地を表示", "en": "Display the current folder with cd"}, {"ja": "C:\\Lab へ移動", "en": "Move to C:\\Lab"}], "cwd": {"ja": "現在地を C:\\Lab にする", "en": "End in C:\\Lab"}},
    "drives-and-parent": {"commands": [], "orderedCommands": [{"ja": "D:\\Support にいる状態で ticket.txt を読む", "en": "Read ticket.txt while in D:\\Support"}, {"ja": "D:\\Support から cd .. で D:\\ へ移動", "en": "Use cd .. from D:\\Support to reach D:\\"}], "cwd": {"ja": "現在地を D:\\ にする", "en": "End in D:\\"}},
    "list-files": {"commands": [{"ja": "C:\\Lab を /a 付きで一覧表示", "en": "List C:\\Lab with /a"}, {"ja": "C:\\Lab\\Logs を一覧表示", "en": "List C:\\Lab\\Logs"}]},
    "quoted-path": {"commands": [{"ja": "type で C:\\Lab\\Shared Files\\guide.txt を読む", "en": "Read C:\\Lab\\Shared Files\\guide.txt with type"}]},
    "read-a-log": {"commands": [{"ja": "more で C:\\Lab\\Logs\\app.log を読む", "en": "Read C:\\Lab\\Logs\\app.log with more"}]},
    "make-a-working-copy": {"commands": [{"ja": "C:\\Lab\\Work を作成", "en": "Create C:\\Lab\\Work"}, {"ja": "readme.txt を C:\\Lab\\Work\\readme.txt へコピー", "en": "Copy readme.txt to C:\\Lab\\Work\\readme.txt"}], "files": [{"ja": "C:\\Lab\\Work\\readme.txt に元の内容を保存", "en": "Keep the original content in C:\\Lab\\Work\\readme.txt"}, {"ja": "元の C:\\Lab\\readme.txt も保持", "en": "Preserve the original C:\\Lab\\readme.txt"}]},
    "move-and-rename": {"commands": [{"ja": "draft.txt を Reports へ移動", "en": "Move draft.txt into Reports"}, {"ja": "Reports 内で ticket-1042.txt に名前を変更", "en": "Rename it to ticket-1042.txt inside Reports"}], "files": [{"ja": "C:\\Lab\\Reports\\ticket-1042.txt に作業メモを保持", "en": "Keep the working notes in C:\\Lab\\Reports\\ticket-1042.txt"}]},
    "save-and-append": {"commands": [{"ja": "echo で PC-014 を出力", "en": "Output PC-014 with echo"}, {"ja": "echo で Printer issue を出力", "en": "Output Printer issue with echo"}, {"ja": "type で C:\\Lab\\Reports\\notes.txt を確認", "en": "Read C:\\Lab\\Reports\\notes.txt with type"}], "files": [{"ja": "C:\\Lab\\Reports\\notes.txt に PC-014 と Printer issue を両方保存", "en": "Save both PC-014 and Printer issue in C:\\Lab\\Reports\\notes.txt"}]},
    "filter-and-save": {"commands": [{"ja": "type で C:\\Lab\\Logs\\app.log を読む", "en": "Read C:\\Lab\\Logs\\app.log with type"}, {"ja": "findstr で ERROR の行を抽出", "en": "Filter ERROR lines with findstr"}], "files": [{"ja": "C:\\Lab\\Reports\\errors.txt に ERROR の 2 行を保存", "en": "Save both ERROR lines in C:\\Lab\\Reports\\errors.txt"}], "pipelines": [{"ja": "type と findstr をパイプでつなぐ", "en": "Connect type to findstr with a pipe"}]},
    "environment-and-command-path": {"commands": [{"ja": "set TEMP で一時フォルダーを表示", "en": "Display the temporary folder with set TEMP"}, {"ja": "where で curl.exe の場所を表示", "en": "Locate curl.exe with where"}]},
    "system-details": {"commands": [{"ja": "ver で Windows の版を表示", "en": "Display the Windows version with ver"}, {"ja": "systeminfo から C:\\Lab\\Reports\\system.txt へ出力を保存", "en": "Redirect systeminfo into C:\\Lab\\Reports\\system.txt"}], "files": [{"ja": "C:\\Lab\\Reports\\system.txt にホスト名と OS 情報を保存", "en": "Save host and OS details in C:\\Lab\\Reports\\system.txt"}]},
    "machine-and-user": {"commands": [{"ja": "hostname で PC 名を表示", "en": "Display the PC name with hostname"}, {"ja": "whoami で実行ユーザーを表示", "en": "Display the current user with whoami"}]},
    "list-processes": {"commands": [{"ja": "tasklist でプロセス一覧を表示", "en": "Display the process list with tasklist"}]},
    "find-a-pid": {"commands": [{"ja": "tasklist の PID フィルターで 4320 を表示", "en": "Use the tasklist PID filter to display 4320"}]},
    "stop-one-app": {"commands": [{"ja": "tasklist で PID 4320 と NotesApp.exe の行を表示", "en": "Show the PID 4320 / NotesApp.exe row with tasklist"}, {"ja": "taskkill /PID 4320 で対象アプリを終了", "en": "End the target app with taskkill /PID 4320"}], "orderedCommands": [{"ja": "tasklist で PID 4320 と NotesApp.exe の行を表示", "en": "Show the PID 4320 / NotesApp.exe row with tasklist"}, {"ja": "taskkill /PID 4320 で対象アプリを終了", "en": "End the target app with taskkill /PID 4320"}], "state": {"pc.appRunning": {"ja": "対象アプリが停止している", "en": "The target app is stopped"}}},
    "service-state": {"commands": [{"ja": "sc query で Spooler の STOPPED を確認", "en": "Check Spooler is STOPPED with sc query"}]},
    "service-configuration": {"commands": [{"ja": "sc qc で Spooler の構成を表示", "en": "Display Spooler configuration with sc qc"}, {"ja": "sc query で Spooler の現在状態を表示", "en": "Display Spooler state with sc query"}]},
    "recent-system-events": {"commands": [{"ja": "wevtutil で System の新しい 3 件を C:\\Lab\\Reports\\events.txt へ保存", "en": "Save the latest 3 System events to C:\\Lab\\Reports\\events.txt with wevtutil"}], "files": [{"ja": "C:\\Lab\\Reports\\events.txt に PC-014 の System イベントを保存", "en": "Save PC-014 System events in C:\\Lab\\Reports\\events.txt"}]},
    "read-file-permissions": {"commands": [{"ja": "icacls で Shared Files の権限を表示", "en": "Display Shared Files permissions with icacls"}]},
    "disk-free-space": {"commands": [{"ja": "fsutil volume diskfree で C: の空き容量を表示", "en": "Display C: free space with fsutil volume diskfree"}]},
    "ip-address-and-dns": {"commands": [{"ja": "ipconfig /all で IP・DNS 設定を表示", "en": "Display IP and DNS settings with ipconfig /all"}]},
    "interface-configuration": {"commands": [{"ja": "netsh で IPv4 インターフェイス設定を表示", "en": "Display IPv4 interface settings with netsh"}]},
    "wifi-connection": {"commands": [{"ja": "netsh wlan show interfaces で無線の状態を表示", "en": "Display wireless state with netsh wlan show interfaces"}, {"ja": "ipconfig /all で接続状態を表示", "en": "Display adapter state with ipconfig /all"}]},
    "ping-loopback": {"commands": [{"ja": "127.0.0.1 への ping を実行", "en": "Ping 127.0.0.1"}]},
    "ping-gateway": {"commands": [{"ja": "ipconfig で IP 設定を表示", "en": "Display IP settings with ipconfig"}, {"ja": "10.20.0.1 への ping を実行", "en": "Ping 10.20.0.1"}]},
    "dns-lookup": {"commands": [{"ja": "nslookup で社内ポータルの回答 10.20.0.20 を確認", "en": "Use nslookup to obtain 10.20.0.20 for the intranet"}]},
    "compare-dns-servers": {"commands": [{"ja": "ipconfig /all で設定中の DNS を表示", "en": "Display the configured DNS server with ipconfig /all"}, {"ja": "通常の nslookup でタイムアウトを確認", "en": "Observe the default nslookup timeout"}, {"ja": "DNS 10.20.0.10 を指定し、ポータルの回答 10.20.0.20 を確認", "en": "Query DNS 10.20.0.10 and obtain portal address 10.20.0.20"}], "orderedCommands": [{"ja": "通常の nslookup でタイムアウトを確認", "en": "Observe the default nslookup timeout"}, {"ja": "DNS 10.20.0.10 を指定し、ポータルの回答 10.20.0.20 を確認", "en": "Query DNS 10.20.0.10 and obtain portal address 10.20.0.20"}]},
    "inspect-dns-cache": {"commands": [{"ja": "ipconfig /displaydns で古い値 10.20.0.99 を確認", "en": "Observe stale value 10.20.0.99 with ipconfig /displaydns"}, {"ja": "nslookup で新しい回答 10.20.0.20 を確認", "en": "Obtain fresh answer 10.20.0.20 with nslookup"}]},
    "trace-a-route": {"commands": [{"ja": "tracert で社内ポータルへの経路を表示", "en": "Trace the intranet route with tracert"}]},
    "routing-table": {"commands": [{"ja": "ipconfig /all で VPN の接続情報を表示", "en": "Display VPN adapter details with ipconfig /all"}, {"ja": "route print で経路表を表示", "en": "Display the routing table with route print"}]},
    "arp-neighbors": {"commands": [{"ja": "arp -a で近隣機器の対応表を表示", "en": "Display neighbor mappings with arp -a"}]},
    "path-loss": {"commands": [{"ja": "pathping で社内ポータルへの経路と統計を表示", "en": "Display intranet path statistics with pathping"}]},
    "connections-and-pid": {"commands": [{"ja": "netstat -ano で接続と PID を表示", "en": "Display connections and PIDs with netstat -ano"}, {"ja": "tasklist /fi \"PID eq 4240\" で対象行を表示", "en": "Display the matching row with tasklist /fi \"PID eq 4240\""}]},
    "winhttp-proxy": {"commands": [{"ja": "netsh winhttp show proxy で設定を表示", "en": "Display settings with netsh winhttp show proxy"}]},
    "firewall-profile": {"commands": [{"ja": "netsh で currentprofile の設定を表示", "en": "Display currentprofile settings with netsh"}]},
    "curl-headers": {"commands": [{"ja": "curl.exe --version で版を表示", "en": "Display the curl version with --version"}, {"ja": "example.com へ HEAD 要求を送り 200 を確認", "en": "Send HEAD to example.com and observe 200"}]},
    "curl-detailed-request": {"commands": [{"ja": "curl.exe -v で社内ポータルの接続過程と本文を取得", "en": "Use curl.exe -v to retrieve intranet connection details and body"}]},
    "mapped-shares": {"commands": [{"ja": "net use で共有フォルダー接続を表示", "en": "Display mapped shares with net use"}]},
    "domain-user-and-groups": {"commands": [{"ja": "whoami /user でユーザー情報を表示", "en": "Display user details with whoami /user"}, {"ja": "whoami /groups でグループを表示", "en": "Display groups with whoami /groups"}]},
    "group-policy-results": {"commands": [{"ja": "gpresult /r で CORP-Desktop 適用済み・CORP-Drive-Map 未適用を確認", "en": "Use gpresult /r to observe CORP-Desktop applied and CORP-Drive-Map absent"}]},
    "locate-domain-controller": {"commands": [{"ja": "nltest で corp.example の DC を検出", "en": "Discover a DC for corp.example with nltest"}]},
    "domain-dns-records": {"commands": [{"ja": "nslookup で AD の LDAP 用 SRV レコードを照会", "en": "Query the AD LDAP SRV record with nslookup"}]},
    "time-synchronization": {"commands": [{"ja": "w32tm /query /status で同期状態を表示", "en": "Display synchronization state with w32tm /query /status"}, {"ja": "w32tm /query /source で同期先を表示", "en": "Display the time source with w32tm /query /source"}]},
    "collect-support-report": {"commands": [{"ja": "systeminfo で PC 情報を取得", "en": "Collect PC details with systeminfo"}, {"ja": "ipconfig /all でネットワーク情報を取得", "en": "Collect network details with ipconfig /all"}, {"ja": "gpresult /r でポリシー結果を取得", "en": "Collect policy results with gpresult /r"}, {"ja": "type で C:\\Lab\\Reports\\support.txt を確認", "en": "Read C:\\Lab\\Reports\\support.txt with type"}], "files": [{"ja": "C:\\Lab\\Reports\\support.txt に PC・DNS・ポリシーの情報を保存", "en": "Save PC, DNS and policy details in C:\\Lab\\Reports\\support.txt"}]},
    "share-server-diagnosis": {"commands": [{"ja": "net use で共有接続を表示", "en": "Display shared connections with net use"}, {"ja": "nslookup で files.corp.example を照会", "en": "Resolve files.corp.example with nslookup"}, {"ja": "files.corp.example への ping を実行", "en": "Ping files.corp.example"}]},
    "renew-dhcp-lease": {"commands": [{"ja": "ipconfig /renew でリースを更新", "en": "Renew the lease with ipconfig /renew"}, {"ja": "ipconfig /all で設定を表示", "en": "Display settings with ipconfig /all"}], "orderedCommands": [{"ja": "更新前に ipconfig /all で設定を表示", "en": "Display settings with ipconfig /all before renewal"}, {"ja": "ipconfig /renew でリースを更新", "en": "Renew the lease with ipconfig /renew"}, {"ja": "更新後に ipconfig /all で設定を再確認", "en": "Recheck settings with ipconfig /all after renewal"}]},
    "refresh-dns-cache": {"commands": [{"ja": "ipconfig /displaydns で古い値 10.20.0.99 を確認", "en": "Observe stale value 10.20.0.99 with ipconfig /displaydns"}, {"ja": "nslookup で新しい回答 10.20.0.20 を確認", "en": "Obtain fresh answer 10.20.0.20 with nslookup"}, {"ja": "ipconfig /flushdns でキャッシュを消去", "en": "Clear the cache with ipconfig /flushdns"}, {"ja": "ポータルへの ping で 10.20.0.20 の応答を確認", "en": "Ping the portal and observe a reply from 10.20.0.20"}], "orderedCommands": [{"ja": "ipconfig /displaydns で古い値 10.20.0.99 を確認", "en": "Observe stale value 10.20.0.99 with ipconfig /displaydns"}, {"ja": "nslookup で新しい回答 10.20.0.20 を確認", "en": "Obtain fresh answer 10.20.0.20 with nslookup"}, {"ja": "ipconfig /flushdns でキャッシュを消去", "en": "Clear the cache with ipconfig /flushdns"}, {"ja": "ポータルへの ping で 10.20.0.20 の応答を確認", "en": "Ping the portal and observe a reply from 10.20.0.20"}]},
    "start-print-service": {"commands": [{"ja": "sc query で Spooler の STOPPED を確認", "en": "Check Spooler is STOPPED with sc query"}, {"ja": "net start で Spooler を開始", "en": "Start Spooler with net start"}, {"ja": "sc query で Spooler の RUNNING を確認", "en": "Check Spooler is RUNNING with sc query"}], "orderedCommands": [{"ja": "sc query で Spooler の STOPPED を確認", "en": "Check Spooler is STOPPED with sc query"}, {"ja": "net start で Spooler を開始", "en": "Start Spooler with net start"}, {"ja": "sc query で Spooler の RUNNING を確認", "en": "Check Spooler is RUNNING with sc query"}], "state": {"pc.spoolerRunning": {"ja": "Spooler が動作している", "en": "Spooler is running"}}},
    "refresh-group-policy": {"commands": [{"ja": "gpupdate /force でポリシーを更新", "en": "Refresh policy with gpupdate /force"}, {"ja": "gpresult /r で CORP-Drive-Map の適用を確認", "en": "Confirm CORP-Drive-Map with gpresult /r"}, {"ja": "net use で Z: の割り当てを確認", "en": "Check the Z: mapping with net use"}], "orderedCommands": [{"ja": "更新前に gpresult /r で CORP-Drive-Map がないことを確認", "en": "Before refreshing, check CORP-Drive-Map is absent with gpresult /r"}, {"ja": "gpupdate /force でポリシーを更新", "en": "Refresh policy with gpupdate /force"}, {"ja": "gpresult /r で CORP-Drive-Map の適用を確認", "en": "Confirm CORP-Drive-Map with gpresult /r"}, {"ja": "net use で Z: の割り当てを確認", "en": "Check the Z: mapping with net use"}], "state": {"net.domain.policyCurrent": {"ja": "ポリシーが更新済みである", "en": "Policy is refreshed"}}},
    "system-file-verification": {"commands": [{"ja": "sfc /verifyonly で整合性違反の結果を確認", "en": "Observe integrity violations with sfc /verifyonly"}]},
    "windows-image-health": {"commands": [{"ja": "DISM /Online /Cleanup-Image /CheckHealth で repairable を確認", "en": "Observe repairable with DISM /Online /Cleanup-Image /CheckHealth"}]},
    "capstone-stale-portal": {"commands": [{"ja": "ipconfig /displaydns で古い値 10.20.0.99 を確認", "en": "Observe stale value 10.20.0.99 with ipconfig /displaydns"}, {"ja": "nslookup で新しい回答 10.20.0.20 を確認", "en": "Obtain fresh answer 10.20.0.20 with nslookup"}, {"ja": "ipconfig /flushdns でキャッシュを消去", "en": "Clear the cache with ipconfig /flushdns"}, {"ja": "curl.exe の HEAD 要求でポータルの 200 を確認", "en": "Observe portal status 200 with a curl.exe HEAD request"}], "orderedCommands": [{"ja": "ipconfig /displaydns で古い値 10.20.0.99 を確認", "en": "Observe stale value 10.20.0.99 with ipconfig /displaydns"}, {"ja": "nslookup で新しい回答 10.20.0.20 を確認", "en": "Obtain fresh answer 10.20.0.20 with nslookup"}, {"ja": "ipconfig /flushdns でキャッシュを消去", "en": "Clear the cache with ipconfig /flushdns"}, {"ja": "curl.exe の HEAD 要求でポータルの 200 を確認", "en": "Observe portal status 200 with a curl.exe HEAD request"}], "files": [{"ja": "C:\\Lab\\Reports\\portal.txt に古い値・新しい回答・200 の結果を保存", "en": "Save stale/fresh addresses and status 200 in C:\\Lab\\Reports\\portal.txt"}]},
    "capstone-printing": {"commands": [{"ja": "sc query で Spooler の STOPPED を確認", "en": "Check Spooler is STOPPED with sc query"}, {"ja": "wevtutil で System の新しい 3 件を表示", "en": "Display the latest 3 System events with wevtutil"}, {"ja": "net start で Spooler を開始", "en": "Start Spooler with net start"}, {"ja": "sc query で Spooler の RUNNING を確認", "en": "Check Spooler is RUNNING with sc query"}], "orderedCommands": [{"ja": "sc query で Spooler の STOPPED を確認", "en": "Check Spooler is STOPPED with sc query"}, {"ja": "wevtutil で System の新しい 3 件を表示", "en": "Display the latest 3 System events with wevtutil"}, {"ja": "net start で Spooler を開始", "en": "Start Spooler with net start"}, {"ja": "sc query で Spooler の RUNNING を確認", "en": "Check Spooler is RUNNING with sc query"}], "files": [{"ja": "C:\\Lab\\Reports\\printing.txt に変更前後の状態と System イベント 3 件を保存", "en": "Save both service states and 3 System events in C:\\Lab\\Reports\\printing.txt"}], "state": {"pc.spoolerRunning": {"ja": "Spooler が動作している", "en": "Spooler is running"}}},
    "capstone-http-503": {"commands": [{"ja": "nslookup で社内ポータルを照会", "en": "Resolve the intranet with nslookup"}, {"ja": "社内ポータルへの ping を実行", "en": "Ping the intranet"}, {"ja": "curl.exe の HEAD 要求で 503 を確認", "en": "Observe 503 with a curl.exe HEAD request"}], "files": [{"ja": "C:\\Lab\\Reports\\web.txt に 503 の応答を保存", "en": "Save the 503 response in C:\\Lab\\Reports\\web.txt"}]},
    "capstone-vpn-route": {"commands": [{"ja": "ipconfig /all で VPN の接続情報を表示", "en": "Display VPN adapter details with ipconfig /all"}, {"ja": "nslookup で社内ポータルを照会", "en": "Resolve the intranet with nslookup"}, {"ja": "nltest で DC を検出", "en": "Discover a DC with nltest"}, {"ja": "route print で経路表を表示", "en": "Display the routing table with route print"}], "files": [{"ja": "C:\\Lab\\Reports\\vpn.txt に IP 設定・名前解決・DC・経路表を保存", "en": "Save IP settings, name resolution, DC and routing details in C:\\Lab\\Reports\\vpn.txt"}]}
  };
  for (const lesson of lessons) lesson.verify.labels = verificationLabels[lesson.id];

  const references = [
    { title: t('Microsoft Learn — Windows コマンド', 'Microsoft Learn — Windows commands'), url: 'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/windows-commands' },
    { title: t('Microsoft Learn — Windows の curl', 'Microsoft Learn — curl on Windows'), url: 'https://learn.microsoft.com/en-us/windows/curl/' },
    { title: t('curl — Microsoft 同梱版について', 'curl — the version shipped by Microsoft'), url: 'https://curl.se/windows/microsoft.html' },
    { title: t('Microsoft Learn — WinHTTP の netsh', 'Microsoft Learn — netsh for WinHTTP'), url: 'https://learn.microsoft.com/en-us/windows/win32/winhttp/netsh-exe-commands' },
    { title: t('Microsoft Learn — Windows Time サービス', 'Microsoft Learn — Windows Time service'), url: 'https://learn.microsoft.com/en-us/windows-server/networking/windows-time-service/windows-time-service-tools-and-settings' },
    { title: t('Microsoft Support — Windows の Wi-Fi 接続問題と IP 構成の更新', 'Microsoft Support — Windows Wi-Fi troubleshooting and IP renewal'), url: 'https://support.microsoft.com/en-us/windows/experience/connectivity-networking/fix-wi-fi-connection-issues-in-windows' }
  ];
  return { version: '0.1.7', tracks, lessons, references };
});
