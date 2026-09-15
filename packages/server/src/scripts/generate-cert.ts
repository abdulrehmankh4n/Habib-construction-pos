import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import selfsigned from 'selfsigned';
import { loadConfig } from '../config';

const config = loadConfig();
const dir = path.join(config.dataDir, 'certs');
fs.mkdirSync(dir, { recursive: true });

const ips = Object.values(os.networkInterfaces())
  .flat()
  .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4')
  .map((i) => i.address);
const extra = process.argv.slice(2);

const altNames = [
  { type: 2, value: 'localhost' },
  { type: 2, value: os.hostname() },
  ...[...new Set([...ips, ...extra.filter((e) => /^\d+\.\d+\.\d+\.\d+$/.test(e))])].map((ip) => ({ type: 7, ip })),
  ...extra.filter((e) => !/^\d+\.\d+\.\d+\.\d+$/.test(e)).map((name) => ({ type: 2, value: name })),
];

const pems = selfsigned.generate([{ name: 'commonName', value: os.hostname() }], {
  days: 3650,
  keySize: 2048,
  algorithm: 'sha256',
  extensions: [
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames },
  ],
});

fs.writeFileSync(path.join(dir, 'server.crt'), pems.cert);
fs.writeFileSync(path.join(dir, 'server.key'), pems.private, { mode: 0o600 });
console.log(`Certificate written to ${dir}`);
console.log(`Valid for: ${altNames.map((a) => ('ip' in a ? a.ip : a.value)).join(', ')}`);
console.log('Restart the server; it will now use HTTPS. Install server.crt as a trusted certificate on each counter PC/phone.');
