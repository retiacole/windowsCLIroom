'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Network = require('../src/network.js');
const session = (scenario = 'base') => ({net: Network.seed(scenario)});
const run = (s, name, ...args) => Network.run(s, name, args, '');

test('seed is deterministic, JSON-only, isolated, and PC scenarios use base network', () => {
  const a = Network.seed('base');
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.deepEqual(a, Network.seed('base'));
  a.adapter.ip = 'changed';
  assert.equal(Network.seed('base').adapter.ip, '10.20.0.14');
  for (const scenario of ['unknown', 'service-stopped', 'permission', 'system-corrupt']) {
    assert.deepEqual(Network.seed(scenario), Network.seed('base'));
  }
});

test('IP, interface, DNS, route and neighbor data agree', () => {
  const s = session();
  for (const result of [run(s, 'ipconfig', '/all'), run(s, 'netsh', 'interface', 'ipv4', 'show', 'config'), run(s, 'route', 'print')]) {
    assert.equal(result.code, 0);
    assert.match(result.stdout, /10\.20\.0\.14/);
    assert.match(result.stdout, /10\.20\.0\.1/);
  }
  assert.match(run(s, 'ipconfig', '/all').stdout, /DNS Servers[^\n]+10\.20\.0\.10/);
  assert.match(run(s, 'nslookup', 'intranet.corp.example').stdout, /Name:\s+intranet\.corp\.example\nAddress:\s+10\.20\.0\.20/);
  assert.match(run(s, 'arp', '-a').stdout, /10\.20\.0\.1\s+02-20-00-00-00-01/);
});

test('disconnected Wi-Fi affects every remote observation while loopback works', () => {
  const s = session('wifi-off');
  assert.match(run(s, 'ipconfig', '/all').stdout, /Media disconnected/);
  assert.match(run(s, 'netsh', 'wlan', 'show', 'interfaces').stdout, /disconnected/);
  assert.doesNotMatch(run(s, 'route', 'print').stdout, /0\.0\.0\.0\s+0\.0\.0\.0/);
  assert.equal(run(s, 'ping', '127.0.0.1').code, 0);
  assert.equal(run(s, 'ping', '10.20.0.1').code, 1);
  assert.equal(run(s, 'nslookup', 'intranet.corp.example').code, 1);
  assert.equal(run(s, 'curl', '-I', 'https://intranet.corp.example').code, 6);
  assert.equal(run(s, 'ipconfig', '/renew').code, 1);
  assert.equal(s.net.adapter.connected, false);
  assert.doesNotMatch(run(s, 'netstat', '-ano').stdout, /ESTABLISHED/);
  assert.match(run(s, 'net', 'use').stdout, /Unavailable/);
});

test('wrong DNS leaves IP connectivity intact; explicit DNS query bypasses configuration', () => {
  const s = session('dns-wrong');
  assert.equal(run(s, 'ping', '10.20.0.20').code, 0);
  assert.equal(run(s, 'ping', 'intranet.corp.example').code, 1);
  assert.equal(run(s, 'nslookup', 'intranet.corp.example').code, 1);
  assert.equal(run(s, 'nslookup', 'intranet.corp.example', '10.20.0.10').code, 0);
  assert.equal(run(s, 'curl', '-I', 'https://intranet.corp.example').code, 6);
  assert.equal(run(s, 'ipconfig', '/renew').code, 0);
  assert.equal(s.net.adapter.dns, '192.0.2.53', 'DHCP renewal does not reset a manual DNS choice');
  assert.equal(s.net.adapter.leaseRenewals, 1);
  assert.match(run(s, 'netsh', 'interface', 'ipv4', 'show', 'config').stdout, /Statically Configured DNS Servers:\s+192\.0\.2\.53/);
});

test('DNS cache and server queries differ until flush, and curl uses system resolution', () => {
  const s = session('dns-cache');
  const cached = JSON.stringify(s.net.cache);
  assert.match(run(s, 'nslookup', 'intranet.corp.example').stdout, /10\.20\.0\.20/);
  assert.equal(JSON.stringify(s.net.cache), cached, 'nslookup must not rewrite the resolver cache');
  assert.match(run(s, 'ipconfig', '/displaydns').stdout, /10\.20\.0\.99/);
  const stale = run(s, 'ping', '-n', '1', 'intranet.corp.example');
  assert.match(stale.stdout, /10\.20\.0\.99/);
  assert.equal(stale.code, 1);
  assert.equal(run(s, 'curl', '-I', 'https://intranet.corp.example').code, 28);
  assert.equal(run(s, 'ipconfig', '/flushdns').code, 0);
  assert.deepEqual(s.net.cache, []);
  assert.match(run(s, 'ipconfig', '/displaydns').stdout, /empty/);
  const fresh = run(s, 'ping', 'intranet.corp.example');
  assert.equal(fresh.code, 0);
  assert.match(fresh.stdout, /Reply from 10\.20\.0\.20/);
  assert.equal(run(s, 'curl', '-I', 'https://intranet.corp.example').code, 0);
  assert.deepEqual(s.net.cache, [{name: 'intranet.corp.example', address: '10.20.0.20', ttl: 300}]);
});

test('missing corporate VPN route is distinct from failed DNS or no Internet', () => {
  const s = session('vpn-route');
  const adapters = run(s, 'ipconfig', '/all').stdout;
  const wifi = adapters.split('PPP adapter CORP-VPN:')[0];
  const vpn = adapters.split('PPP adapter CORP-VPN:')[1];
  assert.match(wifi, /DNS Servers[^\n]+192\.168\.50\.1/);
  assert.doesNotMatch(wifi, /DNS Servers[^\n]+10\.20\.0\.10/);
  assert.match(vpn, /DNS Servers[^\n]+10\.20\.0\.10/);
  const config = run(s, 'netsh', 'interface', 'ipv4', 'show', 'config').stdout;
  assert.match(config, /DNS servers configured through DHCP:\s+192\.168\.50\.1/);
  assert.match(config, /CORP-VPN[\s\S]+Statically Configured DNS Servers:\s+10\.20\.0\.10/);
  assert.match(run(s, 'netsh', 'wlan', 'show', 'interfaces').stdout, /SSID\s+: Home-Wi-Fi/);
  assert.match(run(s, 'netsh', 'wlan', 'show', 'profiles').stdout, /All User Profile\s+: Home-Wi-Fi/);
  const table = run(s, 'route', 'print').stdout;
  assert.match(table, /192\.168\.50\.14/);
  assert.match(table, /10\.20\.0\.10\s+255\.255\.255\.255/);
  assert.doesNotMatch(table, /10\.20\.0\.0\s+255\.255\.255\.0/);
  assert.equal(run(s, 'nslookup', 'intranet.corp.example').code, 0);
  assert.match(run(s, 'nslookup', 'intranet.corp.example').stdout, /Server:\s+dc01\.corp\.example\nAddress:\s+10\.20\.0\.10/);
  assert.equal(run(s, 'nslookup', 'example.com', '192.168.50.1').code, 0);
  const externalDns = run(s, 'nslookup', 'intranet.corp.example', '192.168.50.1');
  assert.equal(externalDns.code, 1);
  assert.match(externalDns.stderr, /Non-existent domain/);
  assert.equal(run(s, 'ping', 'intranet.corp.example').code, 1);
  assert.equal(run(s, 'ping', 'dc01.corp.example').code, 0);
  assert.equal(run(s, 'curl', '-I', 'https://example.com').code, 0);
  assert.equal(run(s, 'curl', '-I', 'https://intranet.corp.example').code, 28);
  assert.equal(run(s, 'nltest', '/dsgetdc:corp.example').code, 0);
});

test('WinHTTP proxy mismatch does not automatically affect curl', () => {
  const s = session('proxy-mismatch');
  assert.match(run(s, 'netsh', 'winhttp', 'show', 'proxy').stdout, /proxy-old\.corp\.example:8080/);
  assert.match(run(s, 'netsh', 'winhttp', 'show', 'advproxy').stdout, /"AutoDetect": false/);
  assert.match(run(s, 'curl', '-I', 'https://intranet.corp.example').stdout, /HTTP\/1\.1 200 OK/);
});

test('HTTP 503 is an HTTP response; curl default exits zero and -f exits 22', () => {
  const s = session('web-503');
  assert.equal(run(s, 'ping', 'intranet.corp.example').code, 0);
  const head = run(s, 'curl.exe', '-I', 'https://intranet.corp.example');
  assert.equal(head.code, 0);
  assert.match(head.stdout, /^HTTP\/1\.1 503 Service Unavailable/);
  assert.match(head.stdout, /Content-Type: text\/html; charset=utf-8/);
  assert.match(head.stdout, /Retry-After: 120/);
  assert.doesNotMatch(head.stdout, /Please contact/);
  const get = run(s, 'curl', '-i', 'https://intranet.corp.example');
  assert.equal(get.code, 0);
  assert.match(get.stdout, /HTTP\/1\.1 503 Service Unavailable/);
  assert.match(get.stdout, /Please contact the application team/);
  assert.match(get.stdout, /<!doctype html>[\s\S]+<h1>Service Unavailable<\/h1>/);
  const body = run(s, 'curl', 'https://intranet.corp.example').stdout;
  assert.match(head.stdout, new RegExp('Content-Length: ' + Buffer.byteLength(body, 'utf8') + '\\n'));
  const failure = run(s, 'curl', '-f', 'https://intranet.corp.example');
  assert.equal(failure.code, 22);
  assert.equal(failure.stdout, '');
  assert.match(failure.stderr, /curl: \(22\)/);
});

test('curl distinguishes HEAD, GET with headers, verbose diagnostics, and absent service', () => {
  const s = session();
  assert.match(run(s, 'curl', '--version').stdout, /fixed teaching example/);
  const head = run(s, 'curl', '-Iv', 'https://intranet.corp.example');
  assert.match(head.stderr, /> HEAD \/ HTTP\/1\.1/);
  assert.doesNotMatch(head.stdout, /Welcome/);
  const get = run(s, 'curl', '-iv', 'https://intranet.corp.example');
  assert.match(get.stderr, /> GET \/ HTTP\/1\.1/);
  assert.match(get.stdout, /HTTP\/1\.1 200 OK[\s\S]+Welcome/);
  assert.match(get.stderr, /10\.20\.0\.20:443/);
  assert.equal(run(s, 'curl', 'https://intranet.corp.example/health').stdout, 'OK\n');
  assert.match(run(s, 'curl', '-I', 'http://example.com/missing').stdout, /404 Not Found/);
  assert.equal(run(s, 'curl', 'http://dc01.corp.example').code, 7);
});

test('domain policy refresh updates observable policy and drive-map state', () => {
  const s = session('ad-policy');
  const beforeReport = run(s, 'gpresult', '/r').stdout;
  assert.doesNotMatch(beforeReport, /CORP-Drive-Map|Pending refresh|Simulator scenario note/);
  assert.match(beforeReport, /Last time Group Policy was applied: 10\/27\/2026 9:00:00 AM/);
  assert.match(run(s, 'net', 'use').stdout, /no entries/);
  const before = JSON.stringify(s.net);
  assert.equal(run(s, 'gpupdate', '/force', '/invented').unsupported, true);
  assert.equal(JSON.stringify(s.net), before);
  assert.equal(run(s, 'gpupdate', '/force').code, 0);
  assert.doesNotMatch(run(s, 'gpresult', '/r').stdout, /Pending refresh/);
  assert.match(run(s, 'gpresult', '/r').stdout, /CORP-Drive-Map/);
  assert.match(run(s, 'gpresult', '/r').stdout, /Last time Group Policy was applied: 10\/28\/2026 9:10:00 AM/);
  assert.match(run(s, 'net', 'use').stdout, /Z:\s+\\\\files\.corp\.example\\Team/);
  assert.equal(s.net.domain.refreshes, 1);
  assert.equal(s.net.domain.policyCurrent, true);
});

test('policy refresh failure preserves state when the DC cannot be discovered', () => {
  const s = session('dns-wrong');
  s.net.domain.policyCurrent = false;
  assert.notEqual(run(s, 'gpupdate', '/force').code, 0);
  assert.equal(s.net.domain.policyCurrent, false);
  assert.equal(s.net.domain.refreshes, 0);
  assert.equal(run(s, 'nltest', '/dsgetdc:corp.example').code, 1355);
});

test('domain discovery, SRV records, time source, and gpresult scopes are coherent', () => {
  const s = session();
  assert.match(run(s, 'nltest', '/dsgetdc:corp.example').stdout, /dc01\.corp\.example/);
  const srv = run(s, 'nslookup', '-type=SRV', '_ldap._tcp.dc._msdcs.corp.example');
  assert.equal(srv.code, 0);
  assert.match(srv.stdout, /port = 389[\s\S]+dc01\.corp\.example/);
  assert.equal(run(s, 'w32tm', '/query', '/source').stdout, 'dc01.corp.example\n');
  assert.match(run(s, 'w32tm', '/query', '/status').stdout, /Last Successful Sync Time:[\s\S]+Source: dc01\.corp\.example/);
  assert.doesNotMatch(run(s, 'gpresult', '/r', '/scope', 'user').stdout, /COMPUTER SETTINGS/);
  assert.doesNotMatch(run(s, 'gpresult', '/scope', 'computer', '/r').stdout, /USER SETTINGS/);
});

test('netstat PID mapping and combined flags match the process model', () => {
  const s = session();
  const output = run(s, 'netstat', '-ano').stdout;
  assert.match(output, /0\.0\.0\.0:135[^\n]+1080/);
  assert.match(output, /0\.0\.0\.0:445[^\n]+\s4/);
  assert.match(output, /10\.20\.0\.20:443[^\n]+4240/);
  assert.equal(output, run(s, 'netstat', '-a', '-n', '-o').stdout);
  assert.doesNotMatch(run(s, 'netstat').stdout, /LISTENING/);
});

test('trace and pathping model a direct subnet without inventing an extra gateway', () => {
  const s = session();
  const trace = run(s, 'tracert', '-d', 'intranet.corp.example');
  assert.equal(trace.code, 0);
  assert.match(trace.stdout, /1\s+<1 ms\s+<1 ms\s+<1 ms\s+10\.20\.0\.20/);
  assert.doesNotMatch(trace.stdout, /10\.20\.0\.1(?:\s|$)/);
  const stats = run(s, 'pathping', 'intranet.corp.example');
  assert.match(stats.stdout, /Lost\/Sent/);
  assert.match(stats.stdout, /0\/100 =  0%/);
});

test('firewall profile reads are read-only and profiles are bounded', () => {
  const s = session();
  const before = JSON.stringify(s.net);
  const profiles = run(s, 'netsh', 'advfirewall', 'show', 'allprofiles');
  assert.equal(profiles.code, 0);
  assert.match(profiles.stdout, /Domain Profile Settings/);
  assert.match(profiles.stdout, /Private Profile Settings/);
  assert.match(profiles.stdout, /Public Profile Settings/);
  const current = run(s, 'netsh', 'advfirewall', 'show', 'currentprofile');
  assert.doesNotMatch(current.stdout, /Public Profile Settings/);
  assert.equal(JSON.stringify(s.net), before);
});

test('unknown hosts and servers are explicitly unsupported, not fake diagnoses', () => {
  const s = session();
  for (const [name, args] of [
    ['ping', ['real-unmodeled.example']], ['tracert', ['8.8.8.8']], ['pathping', ['8.8.8.8']],
    ['nslookup', ['real-unmodeled.example']], ['nslookup', ['example.com', '8.8.8.8']],
    ['curl', ['https://real-unmodeled.example']]
  ]) {
    const result = Network.run(s, name, args, '');
    assert.equal(result.unsupported, true, name);
    assert.notEqual(result.code, 0, name);
    assert.match(result.stderr, /not modeled/, name);
  }
});

test('unsupported options are rejected before mutation or misleading success', () => {
  const samples = [
    ['ipconfig', ['/all', '/flushdns']], ['ipconfig', ['/release']], ['ping', ['-t', 'example.com']],
    ['ping', ['-n', '9999999', 'example.com']], ['nslookup', ['-debug', 'example.com']],
    ['tracert', ['-bad', 'example.com']], ['route', ['delete', '0.0.0.0']], ['arp', ['-d']],
    ['netstat', ['-b']], ['netsh', ['advfirewall', 'set', 'allprofiles', 'state', 'off']],
    ['net', ['use', 'Z:', '/delete']], ['gpresult', ['/h', 'report.html']],
    ['nltest', ['/sc_reset:corp.example']], ['w32tm', ['/resync']], ['gpupdate', ['/force', '/bad']],
    ['curl', ['--output', 'out.txt', 'https://example.com']], ['curl', ['https://example.com:12345']],
    ['curl', ['--insecure', 'https://example.com']], ['curl', ['--version', 'https://example.com']]
  ];
  for (const [name, args] of samples) {
    const s = session('dns-cache'), before = JSON.stringify(s.net);
    const result = Network.run(s, name, args, '');
    assert.equal(result.unsupported, true, name + ' ' + args.join(' '));
    assert.notEqual(result.code, 0);
    assert.equal(JSON.stringify(s.net), before);
  }
});

test('command case and executable suffix normalize; other shell-owned commands delegate', () => {
  const s = session();
  assert.equal(run(s, 'IPCONFIG.EXE', '/ALL').code, 0);
  assert.equal(run(s, 'PING.EXE', 'INTRANET.CORP.EXAMPLE').code, 0);
  assert.equal(run(s, 'hostname'), null);
  assert.equal(run(s, 'net', 'start'), null);
  assert.equal(run(s, 'net', 'stop', 'Spooler'), null);
  assert.equal(run(s, 'notacommand'), null);
});

test('malformed persisted state and invalid inputs return bounded errors, never exceptions', () => {
  for (const s of [null, {}, {net: null}, {net: {version: 1, cache: []}}, {net: {version: 1, cache: 'bad'}}]) {
    assert.doesNotThrow(() => Network.run(s, 'ipconfig', ['/all'], ''));
    assert.notEqual(Network.run(s, 'ipconfig', ['/all'], '').code, 0);
  }
  assert.equal(Network.run(session(), 'ping', [null], '').code, 1);
  assert.equal(Network.run(session(), 'ping', new Array(65).fill('x'), '').code, 1);
  assert.equal(Network.run(session(), 'ping', ['x'.repeat(4097)], '').code, 1);
});

test('restoring a session preserves legitimate cache, renewal and policy transitions', () => {
  for (const scenario of ['base', 'dns-cache', 'ad-policy', 'wifi-off', 'vpn-route']) {
    const s = session(scenario);
    assert.deepEqual(Network.restore(JSON.parse(JSON.stringify(s.net)), scenario), s.net);
    run(s, 'ipconfig', '/flushdns');
    run(s, 'ping', 'intranet.corp.example');
    run(s, 'ipconfig', '/renew');
    run(s, 'gpupdate', '/force');
    const restored = Network.restore(JSON.parse(JSON.stringify(s.net)), scenario);
    assert.deepEqual(restored, s.net);
    restored.cache.push({name: 'extra'});
    assert.notDeepEqual(restored.cache, s.net.cache, 'restoration returns isolated data');
  }
});

test('restoring a session rejects arbitrary destinations, altered model and injected objects', () => {
  const cases = [
    net => { net.adapter.dns = '8.8.8.8'; },
    net => { net.scenario = 'web-503'; },
    net => { net.cache = [{name: 'example.com', address: '203.0.113.99', ttl: 300}]; },
    net => { net.cache = [{name: 'unknown.example', address: '10.20.0.20', ttl: 300}]; },
    net => { net.cache = [{name: 'example.com', address: '192.0.2.80', ttl: 9999999}]; },
    net => { net.cache = new Array(5).fill({name: 'example.com', address: '192.0.2.80', ttl: 300}); },
    net => { net.domain.policyCurrent = false; },
    net => { net.adapter.leaseRenewals = Infinity; },
    net => { net.domain.refreshes = -1; },
    net => { net.adapter = Object.create({ip: '10.20.0.14'}); },
    net => { Object.defineProperty(net, '__proto__', {value: {}, enumerable: true}); }
  ];
  for (const mutate of cases) {
    const net = Network.seed('base');
    mutate(net);
    assert.throws(() => Network.restore(net, 'base'), /Invalid saved network state/);
  }
  const stale = Network.seed('dns-cache');
  assert.throws(() => Network.restore(stale, 'base'), /Invalid saved network state/);
});

test('legacy v0.1 exports migrate the exact previous DNS model and preserve learner changes', () => {
  const legacyState = net => {
    const old = JSON.parse(JSON.stringify(net));
    delete old.vpn.dns;
    if (old.scenario === 'vpn-route') { old.adapter.dns = '10.20.0.10'; old.adapter.ssid = 'CORP-Staff'; }
    return old;
  };
  for (const scenario of ['base', 'dns-cache', 'vpn-route', 'ad-policy', 'wifi-off', 'dns-wrong', 'proxy-mismatch', 'web-503']) {
    const s = session(scenario);
    assert.deepEqual(Network.restore(legacyState(s.net), scenario), s.net);
    run(s, 'ipconfig', '/flushdns');
    run(s, 'ping', 'intranet.corp.example');
    run(s, 'ipconfig', '/renew');
    run(s, 'gpupdate', '/force');
    const imported = Network.restore(legacyState(s.net), scenario);
    assert.deepEqual(imported, s.net);
    assert.deepEqual(Network.restore(JSON.parse(JSON.stringify(imported)), scenario), s.net, 'migrated data remains exportable');
  }
  for (const corrupt of [
    net => { net.adapter.dns = '8.8.8.8'; },
    net => { net.adapter.ssid = 'Injected'; },
    net => { net.vpn.ip = '203.0.113.99'; },
    net => { net.vpn.dns = '8.8.8.8'; },
    net => { net.adapter.dns = '192.168.50.1'; },
    net => { net.cache.push({name: 'example.com', address: '8.8.8.8', ttl: 300}); }
  ]) {
    const old = legacyState(Network.seed('vpn-route'));
    corrupt(old);
    assert.throws(() => Network.restore(old, 'vpn-route'), /Invalid saved network state/);
  }
});

test('native command streams end in one newline so appended reports retain line boundaries', () => {
  const s = session();
  const network = run(s, 'ipconfig', '/all').stdout;
  const policy = run(s, 'gpresult', '/r').stdout;
  assert.match(network + policy, /NetBIOS over Tcpip[^\n]+Enabled\nMicrosoft \(R\) Windows/);
  for (const result of [
    run(s, 'ping', '-n', '1', 'intranet.corp.example'),
    run(s, 'nslookup', 'example.com'),
    run(s, 'curl', '-v', 'https://example.com'),
    run(s, 'curl', '-I', 'https://example.com'),
    run(s, 'curl', '-I', 'https://unknown.example'),
    run(session('dns-wrong'), 'nslookup', 'intranet.corp.example'),
    Network.run({}, 'ipconfig', ['/all'], ''),
    Network.run(s, 'ping', [null], '')
  ]) {
    for (const stream of ['stdout', 'stderr']) {
      if (result[stream]) {
        assert.ok(result[stream].endsWith('\n'), stream + ' requires a trailing newline');
        assert.ok(!result[stream].endsWith('\n\n'), stream + ' must not gain a duplicate newline');
      } else assert.equal(result[stream], '');
    }
  }
  assert.equal(run(s, 'curl', 'https://intranet.corp.example/health').stdout, 'OK\n');
});

test('ping uses Windows DNS failure text without changing other DNS client errors', () => {
  const s = session('dns-wrong');
  const failed = run(s, 'ping', 'intranet.corp.example');
  assert.equal(failed.code, 1);
  assert.equal(failed.stderr, 'Ping request could not find host intranet.corp.example. Please check the name and try again.\n');
  assert.equal(failed.stdout, '');
  assert.match(run(s, 'nslookup', 'intranet.corp.example').stderr, /timed-out/);
  assert.match(run(s, 'curl', '-I', 'https://intranet.corp.example').stderr, /curl: \(6\) Could not resolve host:/);
  assert.match(run(s, 'ping', '10.20.0.20').stdout, /Reply from 10\.20\.0\.20: bytes=32/);
});

test('ping distinguishes no usable interface, unresolved local neighbor, and remote timeout', () => {
  const disconnected = run(session('wifi-off'), 'ping', '-n', '2', '10.20.0.1');
  assert.equal(disconnected.code, 1);
  assert.equal(disconnected.stdout.match(/PING: transmit failed\. General failure\./g).length, 2);
  assert.doesNotMatch(disconnected.stdout, /Request timed out|Destination host unreachable/);
  assert.equal(run(session('wifi-off'), 'ping', '127.0.0.1').code, 0);
  const stale = session('dns-cache');
  const missing = run(stale, 'ping', '-n', '2', 'intranet.corp.example');
  assert.equal(missing.code, 1);
  assert.match(missing.stdout, /Pinging intranet\.corp\.example \[10\.20\.0\.99\]/);
  assert.equal(missing.stdout.match(/Reply from 10\.20\.0\.14: Destination host unreachable\./g).length, 2);
  assert.doesNotMatch(missing.stdout, /Request timed out|General failure|bytes=32/);
  assert.match(run(session(), 'ping', '10.20.0.99').stdout, /Reply from 10\.20\.0\.14: Destination host unreachable/);
  const vpn = run(session('vpn-route'), 'ping', '10.20.0.99');
  assert.match(vpn.stdout, /Request timed out/);
  assert.doesNotMatch(vpn.stdout, /Destination host unreachable|General failure/);
  run(stale, 'ipconfig', '/flushdns');
  const recovered = run(stale, 'ping', 'intranet.corp.example');
  assert.equal(recovered.code, 0);
  assert.match(recovered.stdout, /Reply from 10\.20\.0\.20: bytes=32/);
  assert.doesNotMatch(recovered.stdout, /unreachable|timed out|General failure/);
});

test('netsh IPv4 context aliases match the formal command and do not accept arbitrary prefixes', () => {
  for (const scenario of ['base', 'wifi-off', 'dns-wrong', 'vpn-route']) {
    const s = session(scenario), before = JSON.stringify(s.net);
    const formal = run(s, 'netsh', 'interface', 'ipv4', 'show', 'config');
    for (const args of [['int','ipv4','show','config'],['interface','ip','show','config'],['int','ip','show','config'],['INT','IP','SHOW','CONFIG']]) assert.deepEqual(run(s, 'netsh', ...args), formal);
    assert.equal(JSON.stringify(s.net), before);
    for (const args of [['i','ip','show','config'],['int','ipv','show','config'],['int','ip','show','conf'],['int','ip','show','config','bogus']]) {
      const result = run(s, 'netsh', ...args);
      assert.equal(result.unsupported, true);
      assert.match(result.stderr, /netsh interface ipv4 show config/);
    }
  }
});

test('WLAN interface abbreviation and IPv4 route filtering preserve scenario evidence', () => {
  for (const scenario of ['base', 'wifi-off', 'vpn-route']) {
    const s = session(scenario), before = JSON.stringify(s.net);
    const interfaces = run(s, 'netsh', 'wlan', 'show', 'interfaces');
    assert.deepEqual(run(s, 'netsh', 'wlan', 'show', 'interface'), interfaces);
    assert.deepEqual(run(s, 'NETSH', 'WLAN', 'SHOW', 'INTERFACE'), interfaces);
    const table = run(s, 'route', 'print');
    assert.deepEqual(run(s, 'route', 'print', '-4'), table);
    assert.deepEqual(run(s, 'route', '-4', 'PRINT'), table);
    assert.equal(JSON.stringify(s.net), before, 'read-only alternatives preserve the network state');
    for (const args of [['print', '-6'], ['print', '-4', '-4'], ['print', '10.*'], ['delete', '-4']]) {
      const result = run(s, 'route', ...args);
      assert.equal(result.unsupported, true);
      assert.match(result.stderr, /route print \[-4\].*IPv4 only/);
    }
    const unsupportedWlan = run(s, 'netsh', 'wlan', 'show', 'inter');
    assert.equal(unsupportedWlan.unsupported, true);
    assert.match(unsupportedWlan.stderr, /netsh wlan show interfaces/);
    assert.equal(JSON.stringify(s.net), before);
  }
});

test('DHCP renewal accepts the modeled adapter name without changing manual DNS or VPN state', () => {
  for (const scenario of ['base', 'dns-wrong', 'vpn-route']) {
    const s = session(scenario), dns = s.net.adapter.dns, vpn = JSON.stringify(s.net.vpn);
    const result = run(s, 'ipconfig', '/renew', 'Wi-Fi');
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Wireless LAN adapter Wi-Fi/);
    assert.doesNotMatch(result.stdout, /PPP adapter CORP-VPN/);
    assert.equal(s.net.adapter.leaseRenewals, 1);
    assert.equal(s.net.adapter.dns, dns);
    assert.equal(JSON.stringify(s.net.vpn), vpn);
    assert.equal(run(s, 'ipconfig', '/RENEW', 'wi-fi').code, 0);
    assert.equal(s.net.adapter.leaseRenewals, 2);
  }
  const offline = session('wifi-off'), before = JSON.stringify(offline.net);
  const result = run(offline, 'ipconfig', '/renew', 'Wi-Fi');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /media disconnected/);
  assert.equal(JSON.stringify(offline.net), before);
});

test('unsupported adapter selections and extra arguments give the supported form without changing state', () => {
  for (const args of [['/renew', 'Ethernet'], ['/renew', 'CORP-VPN'], ['/renew', '*'], ['/renew', 'Wi-Fi', '/all'], ['/flushdns', 'Wi-Fi'], ['/all', 'Wi-Fi']]) {
    const s = session('dns-cache'), before = JSON.stringify(s.net);
    const result = run(s, 'ipconfig', ...args);
    assert.equal(result.unsupported, true, args.join(' '));
    assert.match(result.stderr, /\/renew \[Wi-Fi\]/);
    assert.equal(JSON.stringify(s.net), before);
  }
});

test('disconnected DNS queries retain the configured address without claiming a resolved server name', () => {
  const offline = session('wifi-off'), before = JSON.stringify(offline.net);
  for (const args of [
    ['intranet.corp.example'], ['intranet.corp.example', '10.20.0.10'],
    ['intranet.corp.example', 'dc01.corp.example'], ['-type=SRV', '_ldap._tcp.dc._msdcs.corp.example']
  ]) {
    const result = run(offline, 'nslookup', ...args);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /^Server:\s+UnKnown\nAddress:\s+10\.20\.0\.10\n/);
    assert.match(result.stdout, /DNS request timed out/);
    assert.match(result.stderr, /Request to UnKnown timed-out/);
    assert.doesNotMatch(result.stdout + result.stderr, /Server:\s+dc01|Request to dc01|Name:\s+intranet/);
  }
  assert.equal(JSON.stringify(offline.net), before);
  const connected = run(session(), 'nslookup', 'intranet.corp.example');
  assert.equal(connected.code, 0);
  assert.match(connected.stdout, /^Server:\s+dc01\.corp\.example/);
  assert.match(connected.stdout, /Name:\s+intranet\.corp\.example\nAddress:\s+10\.20\.0\.20/);
});
