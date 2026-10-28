(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCRNetwork = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Every address and response belongs to this offline training model.
  const RECORDS = Object.freeze({
    'intranet.corp.example': '10.20.0.20',
    'files.corp.example': '10.20.0.30',
    'dc01.corp.example': '10.20.0.10',
    'example.com': '192.0.2.80'
  });
  const SCENARIOS = ['base', 'wifi-off', 'dns-wrong', 'dns-cache', 'proxy-mismatch', 'web-503', 'vpn-route', 'ad-policy'];
  const OWNED = ['ipconfig', 'ping', 'nslookup', 'tracert', 'route', 'arp', 'pathping', 'netstat', 'netsh', 'net', 'gpresult', 'nltest', 'w32tm', 'gpupdate', 'curl'];
  const ok = (stdout, effects) => ({stdout, stderr: '', code: 0, ...(effects ? {effects} : {})});
  const fail = (stderr, code = 1) => ({stdout: '', stderr, code});
  const unsupported = (syntax) => ({...fail('Simulator: unsupported command or option. Supported: ' + syntax), unsupported: true});
  const lines = (items) => items.join('\n');

  function seed(scenario) {
    const s = SCENARIOS.includes(scenario) ? scenario : 'base';
    return {
      version: 1,
      scenario: s,
      adapter: {
        name: 'Wi-Fi', connected: s !== 'wifi-off', ssid: s === 'vpn-route' ? 'Home-Wi-Fi' : 'CORP-Staff',
        mac: '02-20-00-00-00-14', ip: s === 'vpn-route' ? '192.168.50.14' : '10.20.0.14',
        mask: '255.255.255.0', gateway: s === 'vpn-route' ? '192.168.50.1' : '10.20.0.1',
        dhcp: true, dns: s === 'dns-wrong' ? '192.0.2.53' : s === 'vpn-route' ? '192.168.50.1' : '10.20.0.10',
        dnsAutomatic: s !== 'dns-wrong', leaseRenewals: 0
      },
      vpn: {connected: s === 'vpn-route', ip: '10.99.0.14', corporateRoute: s !== 'vpn-route', dns: '10.20.0.10'},
      cache: s === 'dns-cache' ? [{name: 'intranet.corp.example', address: '10.20.0.99', ttl: 300}] : [],
      winhttp: {proxy: s === 'proxy-mismatch' ? 'proxy-old.corp.example:8080' : '', bypass: s === 'proxy-mismatch' ? '<local>' : ''},
      domain: {name: 'corp.example', controller: 'dc01.corp.example', policyCurrent: s !== 'ad-policy', refreshes: 0, timeSource: 'dc01.corp.example'},
      http: {intranetStatus: s === 'web-503' ? 503 : 200},
      firewall: {domain: 'ON', private: 'ON', public: 'ON', current: s === 'wifi-off' || s === 'vpn-route' ? 'Public' : 'Domain'}
    };
  }

  function restore(raw, scenario) {
    const restored = seed(scenario);
    const invalid = () => { throw new Error('Invalid saved network state.'); };
    if (!raw || typeof raw !== 'object' || !raw.adapter || !raw.domain || !Array.isArray(raw.cache) || raw.cache.length > Object.keys(RECORDS).length) invalid();
    const counter = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
    if (!counter(raw.adapter.leaseRenewals) || !counter(raw.domain.refreshes) || typeof raw.domain.policyCurrent !== 'boolean') invalid();
    if (!raw.domain.policyCurrent && (restored.scenario !== 'ad-policy' || raw.domain.refreshes > 0)) invalid();
    if (restored.scenario === 'ad-policy' && raw.domain.policyCurrent && raw.domain.refreshes === 0) invalid();
    const seen = new Set();
    const cache = [];
    for (const entry of raw.cache) {
      if (!entry || typeof entry !== 'object' || !Object.prototype.hasOwnProperty.call(RECORDS, entry.name) || seen.has(entry.name)) invalid();
      if (entry.address !== RECORDS[entry.name] && !(restored.scenario === 'dns-cache' && entry.name === 'intranet.corp.example' && entry.address === '10.20.0.99')) invalid();
      if (entry.ttl !== 300) invalid();
      seen.add(entry.name);
      cache.push({name: entry.name, address: entry.address, ttl: 300});
    }
    restored.cache = cache;
    restored.adapter.leaseRenewals = raw.adapter.leaseRenewals;
    restored.domain.refreshes = raw.domain.refreshes;
    restored.domain.policyCurrent = raw.domain.policyCurrent;
    // Compare the complete fixed shape, rejecting injected keys and altered lab data.
    const sameShape = (value, expected) => {
      if (expected === null || typeof expected !== 'object') return value === expected;
      if (!value || typeof value !== 'object' || Array.isArray(value) !== Array.isArray(expected)) return false;
      const prototype = Object.getPrototypeOf(value);
      if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
      const actualKeys = Object.keys(value).sort(), expectedKeys = Object.keys(expected).sort();
      return actualKeys.length === expectedKeys.length && expectedKeys.every((key, i) => key === actualKeys[i] && sameShape(value[key], expected[key]));
    };
    if (!sameShape(raw, restored)) {
      // v0.1 exports used one DNS field for both adapters. Accept only that exact
      // earlier model, then upgrade it; never copy arbitrary network settings.
      const legacy = JSON.parse(JSON.stringify(restored));
      delete legacy.vpn.dns;
      if (restored.scenario === 'vpn-route') {
        legacy.adapter.dns = '10.20.0.10';
        legacy.adapter.ssid = 'CORP-Staff';
      }
      if (!sameShape(raw, legacy)) invalid();
    }
    return restored;
  }

  function knownTarget(net, raw) {
    const host = String(raw).toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || host === '127.0.0.1') return {host, ip: '127.0.0.1', literal: true};
    if (host === 'pc-014' || host === 'pc-014.corp.example') return {host, ip: net.adapter.ip, literal: true};
    if (Object.prototype.hasOwnProperty.call(RECORDS, host)) return {host, ip: RECORDS[host], literal: false};
    if (['10.20.0.1', '10.20.0.10', '10.20.0.14', '10.20.0.20', '10.20.0.30', '10.20.0.99', '192.0.2.80', net.adapter.ip, net.adapter.gateway, net.vpn.ip].includes(host)) {
      return {host, ip: host, literal: true};
    }
    return null;
  }

  function reachable(net, ip) {
    if (ip === '127.0.0.1' || ip === net.adapter.ip) return true;
    if (!net.adapter.connected) return false;
    if (ip === '10.20.0.99') return false;
    if (net.vpn.connected && !net.vpn.corporateRoute && /^10\.20\.0\./.test(ip) && ip !== '10.20.0.10') return false;
    return true;
  }

  function resolverDns(net) { return net.vpn.connected ? net.vpn.dns : net.adapter.dns; }

  function resolve(net, raw, useCache = true, server) {
    const target = knownTarget(net, raw);
    if (!target) return {error: 'unsupported', host: raw};
    if (target.literal) return target;
    if (useCache) {
      const cached = net.cache.find(entry => entry.name === target.host);
      if (cached) return {...target, ip: cached.address};
    }
    const dns = server || resolverDns(net);
    if (!net.adapter.connected || !reachable(net, dns)) return {error: 'dns', host: raw};
    if (dns === '192.168.50.1' && net.scenario === 'vpn-route') {
      if (target.host !== 'example.com') return {error: 'nxdomain', host: raw};
    } else if (dns !== '10.20.0.10') return {error: 'dns', host: raw};
    if (useCache) net.cache.push({name: target.host, address: target.ip, ttl: 300});
    return target;
  }

  function targetError(target, name) {
    if (target.error === 'unsupported') return unsupported(name + ' <known lab host or address>; this host is not modeled: ' + target.host);
    if (target.error === 'dns' || target.error === 'nxdomain') return fail(name === 'ping'
      ? 'Ping request could not find host ' + target.host + '. Please check the name and try again.'
      : name + ': could not resolve host ' + target.host + '.');
    return null;
  }

  function adapterText(net, all, wifiOnly = false) {
    const a = net.adapter;
    const out = ['Windows IP Configuration'];
    if (all) out.push('', '   Host Name . . . . . . . . . . . . : PC-014', '   Primary Dns Suffix  . . . . . . . : corp.example', '   Node Type . . . . . . . . . . . . : Hybrid');
    out.push('', 'Wireless LAN adapter Wi-Fi:', '', '   Connection-specific DNS Suffix  . : ' + (net.vpn.connected ? '' : 'corp.example'));
    if (all) out.push('   Description . . . . . . . . . . . : Virtual Wi-Fi Adapter', '   Physical Address. . . . . . . . . : ' + a.mac, '   DHCP Enabled. . . . . . . . . . . : Yes');
    if (!a.connected) out.push('   Media State . . . . . . . . . . . : Media disconnected');
    else {
      out.push('   IPv4 Address. . . . . . . . . . . : ' + a.ip, '   Subnet Mask . . . . . . . . . . . : ' + a.mask, '   Default Gateway . . . . . . . . . : ' + a.gateway);
      if (all) out.push('   DHCP Server . . . . . . . . . . . : ' + a.gateway, '   DNS Servers . . . . . . . . . . . : ' + a.dns, '   NetBIOS over Tcpip. . . . . . . . : Enabled');
    }
    if (net.vpn.connected && !wifiOnly) {
      out.push('', 'PPP adapter CORP-VPN:', '', '   Connection-specific DNS Suffix  . : corp.example');
      if (all) out.push('   Description . . . . . . . . . . . : CORP-VPN', '   DHCP Enabled. . . . . . . . . . . : No');
      out.push('   IPv4 Address. . . . . . . . . . . : ' + net.vpn.ip, '   Subnet Mask . . . . . . . . . . . : 255.255.255.255', '   Default Gateway . . . . . . . . . :');
      if (all) out.push('   DNS Servers . . . . . . . . . . . : ' + net.vpn.dns);
    }
    return lines(out);
  }

  function ipconfig(net, args) {
    const usage = 'ipconfig [/all | /displaydns | /flushdns | /renew [Wi-Fi]]';
    const mode = (args[0] || '').toLowerCase();
    // /renew accepts an adapter name; this model has one DHCP adapter.
    // https://learn.microsoft.com/windows-server/administration/windows-commands/ipconfig
    if (args.length > 1 && !(mode === '/renew' && args.length === 2 && args[1].toLowerCase() === net.adapter.name.toLowerCase())) return unsupported(usage);
    if (!mode || mode === '/all') return ok(adapterText(net, mode === '/all'));
    if (mode === '/displaydns') {
      const out = ['Windows IP Configuration'];
      if (!net.cache.length) out.push('', 'The DNS Resolver Cache is empty.');
      for (const entry of net.cache) out.push('', '    ' + entry.name, '    ----------------------------------------', '    Record Name . . . . . : ' + entry.name, '    Record Type . . . . . : 1', '    Time To Live  . . . . : ' + entry.ttl, '    Data Length . . . . . : 4', '    Section . . . . . . . : Answer', '    A (Host) Record . . . : ' + entry.address);
      return ok(lines(out));
    }
    if (mode === '/flushdns') {
      net.cache = [];
      return ok('Windows IP Configuration\n\nSuccessfully flushed the DNS Resolver Cache.', ['DNS resolver cache cleared']);
    }
    if (mode === '/renew') {
      if (!net.adapter.connected) return fail('No operation can be performed on Wi-Fi while it has its media disconnected.');
      net.adapter.leaseRenewals += 1;
      return ok(adapterText(net, false, args.length === 2), ['DHCP lease renewed; manually configured DNS is unchanged']);
    }
    return unsupported(usage);
  }

  function hostArgs(args, command) {
    let host = null, count = 4, numeric = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i].toLowerCase();
      if (command === 'ping' && arg === '-n') {
        if (!/^\d+$/.test(args[i + 1] || '') || +args[i + 1] < 1 || +args[i + 1] > 10) return null;
        count = +args[++i];
      } else if (['tracert', 'pathping'].includes(command) && arg === '-d') numeric = true;
      else if (arg === '-4') { /* Only IPv4 is modeled. */ }
      else if (/^[-/]/.test(arg) || host !== null) return null;
      else host = args[i];
    }
    return host === null ? null : {host, count, numeric};
  }

  function ping(net, args) {
    const parsed = hostArgs(args, 'ping');
    if (!parsed) return unsupported('ping [-4] [-n 1..10] <host>');
    const target = resolve(net, parsed.host);
    const error = targetError(target, 'ping');
    if (error) return error;
    const connected = reachable(net, target.ip);
    // These are specific modeled failures, not diagnoses inferred from every
    // timeout: Wi-Fi is the only remote interface here, and .99 has no ARP peer.
    // https://learn.microsoft.com/troubleshoot/windows-server/networking/troubleshoot-tcp-ip-communication-guidance
    const localPrefix = net.adapter.ip.split('.').slice(0, 3).join('.') + '.';
    const noInterface = !connected && !net.adapter.connected;
    const unresolvedNeighbor = !connected && net.adapter.connected && target.ip === '10.20.0.99' && target.ip.startsWith(localPrefix);
    const reply = connected ? 'Reply from ' + target.ip + ': bytes=32 time<1ms TTL=128'
      : noInterface ? 'PING: transmit failed. General failure.'
      : unresolvedNeighbor ? 'Reply from ' + net.adapter.ip + ': Destination host unreachable.'
      : 'Request timed out.';
    const out = ['', 'Pinging ' + (target.literal ? target.ip : target.host + ' [' + target.ip + ']') + ' with 32 bytes of data:'];
    for (let i = 0; i < parsed.count; i++) out.push(reply);
    out.push('', 'Ping statistics for ' + target.ip + ':', '    Packets: Sent = ' + parsed.count + ', Received = ' + (connected ? parsed.count : 0) + ', Lost = ' + (connected ? 0 : parsed.count) + ' (' + (connected ? '0' : '100') + '% loss),');
    if (connected) out.push('Approximate round trip times in milli-seconds:', '    Minimum = 0ms, Maximum = 0ms, Average = 0ms');
    return {stdout: lines(out), stderr: '', code: connected ? 0 : 1};
  }

  function nslookup(net, args) {
    const usage = 'nslookup <lab host> [lab DNS address] | nslookup -type=SRV _ldap._tcp.dc._msdcs.corp.example';
    const items = args.slice();
    let srv = false;
    if ((items[0] || '').toLowerCase() === '-type=srv') { srv = true; items.shift(); }
    if (items.length < 1 || items.length > 2 || items.some(item => /^[-/]/.test(item))) return unsupported(usage);
    const host = items[0].toLowerCase().replace(/\.$/, '');
    const server = items[1] || resolverDns(net);
    const servers = ['10.20.0.10', '192.0.2.53', 'dc01.corp.example', ...(net.scenario === 'vpn-route' ? ['192.168.50.1'] : [])];
    if (!servers.includes(server.toLowerCase())) return unsupported(usage + '; DNS server not modeled: ' + server);
    const dns = server.toLowerCase() === 'dc01.corp.example' ? '10.20.0.10' : server;
    if (srv && host !== '_ldap._tcp.dc._msdcs.corp.example') return unsupported(usage);
    const target = srv ? resolve(net, 'dc01.corp.example', false, dns) : resolve(net, host, false, dns);
    if (target.error === 'unsupported') return targetError(target, 'nslookup');
    // A configured address is still shown while disconnected, but the model
    // cannot establish the server's name without a reachable DNS server.
    const serverName = dns === '10.20.0.10' && net.adapter.connected && reachable(net, dns) ? 'dc01.corp.example' : 'UnKnown';
    const heading = 'Server:  ' + serverName + '\nAddress:  ' + dns;
    if (target.error === 'nxdomain') return {stdout: heading, stderr: '*** UnKnown can\'t find ' + host + ': Non-existent domain', code: 1};
    if (target.error || !net.adapter.connected || !reachable(net, dns) || !['10.20.0.10', '192.168.50.1'].includes(dns)) return {stdout: heading + '\n\nDNS request timed out.\n    timeout was 2 seconds.', stderr: '*** Request to ' + serverName + ' timed-out', code: 1};
    if (srv) return ok(heading + '\n\n' + host + ' SRV service location:\n          priority = 0\n          weight = 100\n          port = 389\n          svr hostname = dc01.corp.example\ndc01.corp.example internet address = 10.20.0.10');
    return ok(heading + '\n\nName:    ' + target.host + '\nAddress:  ' + target.ip);
  }

  function traceRoute(net, args, pathpingMode) {
    const command = pathpingMode ? 'pathping' : 'tracert';
    const parsed = hostArgs(args, command);
    if (!parsed) return unsupported(command + ' [-d] [-4] <host>');
    const target = resolve(net, parsed.host);
    const error = targetError(target, command);
    if (error) return error;
    const out = ['', 'Tracing route to ' + target.host + ' [' + target.ip + ']', 'over a maximum of 30 hops:', ''];
    const up = reachable(net, target.ip);
    const local = target.ip === '127.0.0.1' || target.ip === net.adapter.ip;
    const localSubnet = target.ip.startsWith(net.adapter.ip.split('.').slice(0, 3).join('.') + '.');
    let hops = [];
    if (local || localSubnet && up) hops = [target.ip];
    else if (up) hops = [net.adapter.gateway, target.ip];
    else if (net.adapter.connected && !localSubnet) hops = [net.adapter.gateway, '*'];
    else hops = ['*'];
    if (pathpingMode) out.push('  0  PC-014 [' + net.adapter.ip + ']');
    hops.forEach((ip, i) => out.push(ip === '*' ? '  ' + (i + 1) + '     *        *        *     Request timed out.' : '  ' + (i + 1) + '    <1 ms    <1 ms    <1 ms  ' + ip));
    if (up) out.push('', 'Trace complete.');
    else out.push('', 'Simulator: remaining unresponsive hops omitted. A non-response alone does not identify the cause.');
    if (pathpingMode) {
      out.push('', 'Computing statistics for 50 seconds... (simulated; no real waiting)', '            Source to Here   This Node/Link', 'Hop  RTT    Lost/Sent = Pct  Lost/Sent = Pct  Address');
      hops.forEach((ip, i) => out.push(ip === '*' ? ' ' + (i + 1) + '  ---     100/100 =100%   100/100 =100%    *' : ' ' + (i + 1) + '  0ms       0/100 =  0%     0/100 =  0%    ' + ip));
      out.push('', 'Statistics are fictional. ICMP filtering can affect these results.');
    }
    return ok(lines(out));
  }

  function route(net, args) {
    const words = args.map(arg => arg.toLowerCase());
    if (!(words.length === 1 && words[0] === 'print') &&
      !(words.length === 2 && words.includes('print') && words.includes('-4'))) return unsupported('route print [-4] (this simulator models IPv4 only)');
    const a = net.adapter;
    const out = ['Interface List', ' 12...02 20 00 00 00 14 ......Virtual Wi-Fi Adapter'];
    if (net.vpn.connected) out.push(' 24...........................CORP-VPN');
    out.push('  1...........................Software Loopback Interface 1', '', 'IPv4 Route Table', 'Active Routes:', 'Network Destination        Netmask          Gateway       Interface  Metric');
    if (a.connected) {
      out.push('          0.0.0.0          0.0.0.0     ' + a.gateway.padStart(12) + '    ' + a.ip.padStart(12) + '     25');
      const subnet = a.ip.split('.').slice(0, 3).join('.') + '.0';
      out.push(subnet.padStart(17) + '    255.255.255.0         On-link    ' + a.ip.padStart(12) + '    281');
      if (net.vpn.connected) out.push('       10.20.0.10  255.255.255.255         On-link     10.99.0.14      5', '       10.99.0.14  255.255.255.255         On-link     10.99.0.14    261');
    }
    out.push('        127.0.0.0        255.0.0.0         On-link       127.0.0.1    331', '', 'Persistent Routes:', '  None');
    return ok(lines(out));
  }

  function arp(net, args) {
    if (args.length !== 1 || args[0].toLowerCase() !== '-a') return unsupported('arp -a');
    if (!net.adapter.connected) return ok('No ARP Entries Found.');
    const out = ['Interface: ' + net.adapter.ip + ' --- 0xc', '  Internet Address      Physical Address      Type', '  ' + net.adapter.gateway.padEnd(22) + '02-20-00-00-00-01     dynamic'];
    if (!net.vpn.connected) out.push('  10.20.0.10            02-20-00-00-00-10     dynamic', '  10.20.0.20            02-20-00-00-00-20     dynamic');
    return ok(lines(out));
  }

  function netstat(net, args) {
    let all = false, pid = false, numeric = false;
    for (const arg of args) {
      if (!/^-[ano]+$/i.test(arg)) return unsupported('netstat [-a] [-n] [-o] (combined flags supported)');
      all = all || /a/i.test(arg); pid = pid || /o/i.test(arg); numeric = numeric || /n/i.test(arg);
    }
    const out = ['', 'Active Connections', '', '  Proto  Local Address          Foreign Address        State' + (pid ? '           PID' : '')];
    if (all) {
      out.push('  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING' + (pid ? '       1080' : ''), '  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING' + (pid ? '       4' : ''));
    }
    if (reachable(net, '10.20.0.20')) out.push('  TCP    ' + (net.adapter.ip + ':49712').padEnd(23) + (numeric ? '10.20.0.20:443' : 'intranet.corp.example:https').padEnd(23) + 'ESTABLISHED' + (pid ? '     4240' : ''));
    if (all) out.push('  UDP    0.0.0.0:5353           *:*' + (pid ? '                                    4240' : ''));
    return ok(lines(out));
  }

  function netsh(net, args) {
    const words = args.map(arg => arg.toLowerCase());
    if (['int', 'interface'].includes(words[0]) && ['ip', 'ipv4'].includes(words[1])) {
      words[0] = 'interface'; words[1] = 'ipv4';
    }
    // The single supported WLAN abbreviation is unambiguous in real NetShell.
    // https://learn.microsoft.com/previous-versions/windows/desktop/netshell/netshell-and-command-abbreviation
    if (words.length === 3 && words[0] === 'wlan' && words[1] === 'show' && words[2] === 'interface') words[2] = 'interfaces';
    const key = words.join(' ');
    const a = net.adapter;
    if (key === 'wlan show interfaces') return ok(lines(['There is 1 interface on the system:', '', '    Name                   : Wi-Fi', '    Description            : Virtual Wi-Fi Adapter', '    Physical address       : ' + a.mac.toLowerCase().replace(/-/g, ':'), '    State                  : ' + (a.connected ? 'connected' : 'disconnected'), ...(a.connected ? ['    SSID                   : ' + a.ssid, '    Network type           : Infrastructure', '    Radio type             : 802.11ac', '    Authentication         : ' + (net.vpn.connected ? 'WPA2-Personal' : 'WPA2-Enterprise'), '    Channel                : 36', '    Receive rate (Mbps)    : 866.7', '    Transmit rate (Mbps)   : 866.7', '    Signal                 : 92%', '    Profile                : ' + a.ssid] : [])]));
    if (key === 'wlan show profiles') return ok('Profiles on interface Wi-Fi:\n\nGroup policy profiles (read only)\n---------------------------------\n    CORP-Staff\n\nUser profiles\n-------------\n    ' + (net.vpn.connected ? 'All User Profile     : Home-Wi-Fi' : '<None>'));
    if (key === 'interface ipv4 show config') {
      const out = ['Configuration for interface "Wi-Fi"', '    DHCP enabled:                         Yes', ...(a.connected ? ['    IP Address:                           ' + a.ip, '    Subnet Prefix:                        ' + a.ip.split('.').slice(0, 3).join('.') + '.0/24 (mask 255.255.255.0)', '    Default Gateway:                      ' + a.gateway] : ['    Interface state:                      disconnected']), '    ' + (a.dnsAutomatic ? 'DNS servers configured through DHCP:  ' : 'Statically Configured DNS Servers:     ') + a.dns];
      if (net.vpn.connected) out.push('', 'Configuration for interface "CORP-VPN"', '    DHCP enabled:                         No', '    IP Address:                           ' + net.vpn.ip, '    Subnet Prefix:                        ' + net.vpn.ip + '/32 (mask 255.255.255.255)', '    Statically Configured DNS Servers:     ' + net.vpn.dns);
      return ok(lines(out));
    }
    if (key === 'winhttp show proxy') return ok(net.winhttp.proxy ? 'Current WinHTTP proxy settings:\n\n    Proxy Server(s) : ' + net.winhttp.proxy + '\n    Bypass List     : ' + net.winhttp.bypass : 'Current WinHTTP proxy settings:\n\n    Direct access (no proxy server).');
    if (key === 'winhttp show advproxy') return ok('Current WinHTTP advanced proxy settings (simulated):\n\n' + JSON.stringify({Proxy: net.winhttp.proxy, ProxyBypass: net.winhttp.bypass, AutoconfigUrl: '', AutoDetect: false}, null, 2));
    if (key === 'advfirewall show allprofiles' || key === 'advfirewall show currentprofile') {
      const profiles = key.endsWith('allprofiles') ? ['Domain', 'Private', 'Public'] : [net.firewall.current];
      return ok(profiles.map(profile => profile + ' Profile Settings:\n----------------------------------------------------------------------\nState                                 ' + net.firewall[profile.toLowerCase()] + '\nFirewall Policy                       BlockInbound,AllowOutbound\nLocalFirewallRules                    N/A (GPO-store only)').join('\n\n') + '\n\nOk.');
    }
    return unsupported('netsh wlan show interfaces|profiles; netsh interface ipv4 show config; netsh winhttp show proxy|advproxy; netsh advfirewall show allprofiles|currentprofile');
  }

  function netUse(net, args) {
    if ((args[0] || '').toLowerCase() !== 'use') return null;
    if (args.length !== 1) return unsupported('net use (list existing mappings only)');
    if (!net.domain.policyCurrent) return ok('New connections will be remembered.\n\nThere are no entries in the list.');
    return ok('New connections will be remembered.\n\nStatus       Local     Remote                    Network\n-------------------------------------------------------------------------------\n' + (reachable(net, '10.20.0.30') ? 'OK' : 'Unavailable').padEnd(13) + 'Z:        \\\\files.corp.example\\Team Microsoft Windows Network\nThe command completed successfully.');
  }

  function gpresult(net, args) {
    let report = false, scope = 'both';
    for (let i = 0; i < args.length; i++) {
      const arg = args[i].toLowerCase();
      if (arg === '/r' && !report) report = true;
      else if (arg === '/scope' && scope === 'both' && ['user', 'computer'].includes((args[i + 1] || '').toLowerCase())) scope = args[++i].toLowerCase();
      else return unsupported('gpresult /r [/scope user|computer]');
    }
    if (!report) return unsupported('gpresult /r [/scope user|computer]');
    const out = ['Microsoft (R) Windows (R) Operating System Group Policy Result tool', '', 'RSOP data for CORP\\student on PC-014 : Logging Mode', '', 'OS Configuration:            Member Workstation', 'Domain Name:                 CORP', 'Domain Type:                 Windows 2008 or later'];
    const appliedAt = net.domain.refreshes > 0 ? '10/28/2026 9:10:00 AM' : net.domain.policyCurrent ? '10/28/2026 9:00:00 AM' : '10/27/2026 9:00:00 AM';
    if (scope !== 'user') out.push('', 'COMPUTER SETTINGS', '------------------', '    CN=PC-014,OU=Workstations,DC=corp,DC=example', '    Last time Group Policy was applied: ' + appliedAt, '    Group Policy was applied from:      dc01.corp.example', '    Applied Group Policy Objects', '    -----------------------------', '        Default Domain Policy', '        CORP-Workstation-Baseline');
    if (scope !== 'computer') {
      out.push('', 'USER SETTINGS', '-------------', '    CN=student,OU=Sales,DC=corp,DC=example', '    Last time Group Policy was applied: ' + appliedAt, '    Group Policy was applied from:      dc01.corp.example', '    Applied Group Policy Objects', '    -----------------------------', '        CORP-Desktop');
      if (net.domain.policyCurrent) out.push('        CORP-Drive-Map');
    }
    return ok(lines(out));
  }

  function nltest(net, args) {
    if (args.length !== 1 || !/^\/dsgetdc:corp\.example$/i.test(args[0])) return unsupported('nltest /dsgetdc:corp.example');
    const dc = resolve(net, 'dc01.corp.example', false);
    if (dc.error || !reachable(net, '10.20.0.10')) return fail('Getting DC name failed: Status = 1355 0x54b ERROR_NO_SUCH_DOMAIN', 1355);
    return ok('           DC: \\\\dc01.corp.example\n      Address: \\\\10.20.0.10\n     Dom Name: corp.example\n  Forest Name: corp.example\n Dc Site Name: Main-Office\nOur Site Name: Main-Office\n        Flags: GC DS LDAP KDC TIMESERV WRITABLE DNS_DC DNS_DOMAIN DNS_FOREST CLOSE_SITE FULL_SECRET WS DS_8 DS_9 DS_10\nThe command completed successfully');
  }

  function w32tm(net, args) {
    if (args.length !== 2 || args[0].toLowerCase() !== '/query' || !['/status', '/source'].includes(args[1].toLowerCase())) return unsupported('w32tm /query /status|/source');
    if (args[1].toLowerCase() === '/source') return ok(net.domain.timeSource);
    return ok('Leap Indicator: 0(no warning)\nStratum: 3 (secondary reference - syncd by (S)NTP)\nPrecision: -23 (119.209ns per tick)\nRoot Delay: 0.0010000s\nRoot Dispersion: 0.0100000s\nReferenceId: 0x0A14000A (source IP:  10.20.0.10)\nLast Successful Sync Time: 10/28/2026 9:00:00 AM\nSource: ' + net.domain.timeSource + '\nPoll Interval: 10 (1024s)');
  }

  function gpupdate(net, args) {
    if (args.length > 1 || args.length === 1 && args[0].toLowerCase() !== '/force') return unsupported('gpupdate [/force]');
    const dc = resolve(net, 'dc01.corp.example', false);
    if (dc.error || !reachable(net, '10.20.0.10')) return fail('Updating policy...\n\nComputer policy could not be updated successfully. The domain controller could not be reached.\nUser policy could not be updated successfully.');
    net.domain.policyCurrent = true;
    net.domain.refreshes += 1;
    return ok('Updating policy...\n\nComputer Policy update has completed successfully.\nUser Policy update has completed successfully.', ['Group Policy refreshed; Z: drive mapping applied in the training model']);
  }

  function curl(net, args) {
    const usage = 'curl.exe [--version] | curl.exe [-I|--head] [-i|--include] [-v|--verbose] [-f|--fail] <http(s)://lab-host/path>';
    if (args.length === 1 && ['--version', '-V'].includes(args[0])) return ok('curl 8.14.1 (Windows) libcurl/8.14.1 Schannel\nRelease-Date: 2025-06-04\nProtocols: http https\nFeatures: HTTPS-proxy IPv6 SSL\nSimulator: version text is a fixed teaching example; only documented HTTP(S) commands are implemented.');
    let head = false, include = false, verbose = false, failHttp = false, url = null;
    for (const arg of args) {
      if (arg === '--head') head = true;
      else if (arg === '--include') include = true;
      else if (arg === '--verbose') verbose = true;
      else if (arg === '--fail') failHttp = true;
      else if (/^-[Iivf]+$/.test(arg)) {
        head = head || arg.includes('I'); include = include || arg.includes('i'); verbose = verbose || arg.includes('v'); failHttp = failHttp || arg.includes('f');
      } else if (/^[-/]/.test(arg) || url !== null) return unsupported(usage);
      else url = arg;
    }
    if (url === null) return unsupported(usage);
    const match = /^(https?):\/\/([^/:?#]+)(?::(\d+))?(\/[^#]*)?(?:#.*)?$/i.exec(url);
    if (!match) return unsupported(usage);
    const protocol = match[1].toLowerCase(), host = match[2].toLowerCase(), port = match[3] ? +match[3] : protocol === 'https' ? 443 : 80;
    if (port !== 80 && port !== 443 || protocol === 'https' && port !== 443 || protocol === 'http' && port !== 80) return unsupported('curl.exe: only lab HTTP port 80 and HTTPS port 443 are modeled.');
    const target = resolve(net, host);
    if (target.error === 'unsupported') return targetError(target, 'curl.exe');
    if (target.error) return fail('curl: (6) Could not resolve host: ' + host, 6);
    if (!reachable(net, target.ip)) return fail('curl: (28) Failed to connect to ' + host + ' port ' + port + ': Connection timed out', 28);
    const serverHost = Object.keys(RECORDS).find(name => RECORDS[name] === target.ip);
    if (!['intranet.corp.example', 'example.com'].includes(serverHost)) return fail('curl: (7) Failed to connect to ' + host + ' port ' + port + ': Could not connect to server', 7);
    const path = match[4] || '/';
    let status = serverHost === 'intranet.corp.example' ? net.http.intranetStatus : 200;
    if (!['/', '/health'].includes(path)) status = 404;
    const phrase = {200: 'OK', 404: 'Not Found', 503: 'Service Unavailable'}[status];
    const body = status === 503 ? '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>503 Service Unavailable</title></head><body><h1>Service Unavailable</h1><p>Service temporarily unavailable. Please contact the application team.</p></body></html>\n' : status === 404 ? 'The requested resource was not found.\n' : path === '/health' ? 'OK\n' : serverHost === 'example.com' ? 'Example Domain (offline training response)\n' : 'CORP Intranet\nWelcome to the employee portal.\n';
    const header = lines(['HTTP/1.1 ' + status + ' ' + phrase, 'Content-Type: ' + (status === 503 ? 'text/html' : 'text/plain') + '; charset=utf-8', ...(status === 503 ? ['Retry-After: 120'] : []), 'Content-Length: ' + body.length, 'Server: LabWeb/1.0', 'Connection: close']);
    let stderr = verbose ? lines(['* Host ' + host + ':' + port + ' was resolved.', '* IPv4: ' + target.ip, '*   Trying ' + target.ip + ':' + port + '...', '* Connected to ' + host + ' (' + target.ip + ') port ' + port, ...(protocol === 'https' ? ['* SSL connection using TLSv1.3 (simulated)'] : []), '> ' + (head ? 'HEAD' : 'GET') + ' ' + path + ' HTTP/1.1', '> Host: ' + host, '> User-Agent: curl/8.14.1', '> Accept: */*', '>', ...header.split('\n').map(line => '< ' + line), '<', '* Closing connection']) : '';
    if (failHttp && status >= 400) stderr += (stderr ? '\n' : '') + 'curl: (22) The requested URL returned error: ' + status;
    return {stdout: head ? header + '\n' : (include ? header + '\n\n' : '') + (failHttp && status >= 400 ? '' : body), stderr, code: failHttp && status >= 400 ? 22 : 0};
  }

  function run(session, name, args, stdin) {
    const finish = result => {
      if (!result) return result;
      for (const stream of ['stdout', 'stderr']) {
        if (typeof result[stream] === 'string' && result[stream] && !result[stream].endsWith('\n')) result[stream] += '\n';
      }
      return result;
    };
    const normalized = String(name || '').toLowerCase().replace(/\.exe$/, '');
    if (!OWNED.includes(normalized)) return null;
    if (normalized === 'net' && (!Array.isArray(args) || String(args[0] || '').toLowerCase() !== 'use')) return null;
    if (!Array.isArray(args) || args.length > 64 || args.some(arg => typeof arg !== 'string' || arg.length > 4096)) return finish(fail('Simulator: invalid command arguments.'));
    try {
      const net = session.net;
      if (!net || net.version !== 1 || !Array.isArray(net.cache)) return finish(fail('Simulator: invalid network state. Reset the lesson.'));
      const dispatch = {ipconfig, ping, nslookup, tracert: (n, a) => traceRoute(n, a, false), pathping: (n, a) => traceRoute(n, a, true), route, arp, netstat, netsh, net: netUse, gpresult, nltest, w32tm, gpupdate, curl};
      return finish(dispatch[normalized](net, args, stdin));
    } catch (_) {
      return finish(fail('Simulator: invalid network state. Reset the lesson.'));
    }
  }

  const reference = [
    ['ipconfig', 'ipconfig [/all | /displaydns | /flushdns | /renew [Wi-Fi]]', 'IP・DNS 設定とキャッシュを確認', 'Inspect IP/DNS settings and the resolver cache.'],
    ['ping', 'ping [-n 1..10] [-4] <host>', 'ICMP 応答を確認（アプリの正常性は別途確認）', 'Check ICMP replies; success does not prove application health.'],
    ['nslookup', 'nslookup <host> [10.20.0.10] | nslookup -type=SRV _ldap._tcp.dc._msdcs.corp.example', 'DNS サーバーの回答を確認（ローカルキャッシュとは別）', 'Query the DNS server independently of the local resolver cache.'],
    ['tracert', 'tracert [-d] [-4] <host>', '経路の応答を確認（無応答だけでは原因を断定不可）', 'Inspect responding hops; a silent hop alone does not identify a fault.'],
    ['route', 'route print [-4]', 'IPv4 ルーティングテーブルを表示', 'Display the IPv4 routing table.'],
    ['arp', 'arp -a', '近隣 IP と MAC アドレスの対応を表示', 'Display cached local-neighbor IP/MAC mappings.'],
    ['pathping', 'pathping [-d] [-4] <host>', '経路と ICMP 応答の統計を確認', 'Inspect route and ICMP response statistics.'],
    ['netstat', 'netstat [-a] [-n] [-o] | netstat -ano', '接続・待ち受け・PID を表示（接続先のポート試験とは別）', 'Display local connections, listeners and PIDs; this is not a remote port test.'],
    ['netsh', 'netsh wlan show interfaces|interface|profiles; netsh interface|int ipv4|ip show config; netsh winhttp show proxy|advproxy; netsh advfirewall show allprofiles|currentprofile', '無線 LAN・IPv4・WinHTTP・ファイアウォール設定を確認', 'Inspect WLAN, IPv4, WinHTTP and firewall configuration.'],
    ['net use', 'net use', '既存の共有フォルダー接続を一覧表示', 'List existing shared-folder connections.'],
    ['gpresult', 'gpresult /r [/scope user|computer]', '最後に適用されたグループポリシーの結果を確認', 'Inspect the last applied Group Policy results.'],
    ['nltest', 'nltest /dsgetdc:corp.example', 'ドメインコントローラーの検出結果を確認', 'Locate the domain controller.'],
    ['w32tm', 'w32tm /query /status|/source', '時刻同期の状態・同期先を確認（ずれの量は別途確認）', 'Inspect time synchronization and source; this does not prove zero clock offset.'],
    ['gpupdate', 'gpupdate [/force]', 'グループポリシーを更新', 'Refresh Group Policy.'],
    ['curl', 'curl.exe --version | curl.exe [-I] [-i] [-v] [-f] <http(s)://lab-host/path>', 'HTTP 応答を確認（-I は HEAD、-i はヘッダー付き GET）', 'Inspect HTTP responses: -I sends HEAD; -i includes headers with GET.']
  ].map(([name, syntax, summaryJa, summaryEn]) => ({name, syntax, summaryJa, summaryEn}));

  return {seed, restore, run, reference};
});
