// -----------------------------------------------------------------------------
// The `$SYS` parser and the MQTT client: what Mosquitto sends, how each link
// state is told apart, what the client sends (never a publish, never a
// subscription outside `$SYS`), and the stable client id.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadClientId } from '../src/clientId.js';
import { createBrokerClient, SYS_WAIT_MS } from '../src/mosquitto/client.js';
import { parseSysMessage, parseVersion, SYS_TOPIC } from '../src/mosquitto/sys.js';
import { CAPTURES, CLIENT_ID, createFakeBroker } from './helpers/world.js';

const statsOf = (capture) => {
  const stats = {};
  for (const [topic, payload] of capture) {
    const stat = parseSysMessage(topic, Buffer.from(payload));
    if (stat) {
      stats[stat.key] = stat.value;
    }
  }
  return stats;
};

test('the Mosquitto 2.1 capture gives every statistic, the latest value winning', () => {
  const stats = statsOf(CAPTURES.v2);
  assert.equal(stats.version, '2.1.2');
  assert.equal(stats.uptimeSeconds, 169);
  assert.equal(stats.clientsConnected, 2);
  assert.equal(stats.clientsDisconnected, 0);
  assert.equal(stats.messagesReceived1min, 83.45);
  assert.equal(stats.subscriptions, 2);
  assert.equal(stats.retainedMessages, 56);
  assert.equal(stats.heapCurrent, 851675);
  assert.equal(typeof stats.bytesSent1min, 'number');
  // Published only when it changes: absent from a capture taken at rest.
  assert.equal(stats.clientsMaximum, 2);
});

test('the Mosquitto 1.6 capture has no heap', () => {
  const stats = statsOf(CAPTURES.v16);
  assert.equal(stats.version, '1.6.15');
  assert.equal(stats.uptimeSeconds, 0);
  assert.equal(stats.heapCurrent, undefined);
  assert.equal(stats.retainedMessages, 40);
});

test('the parser ignores other topics and values that do not parse', () => {
  assert.equal(parseSysMessage('home/temp', '21.5'), null);
  assert.equal(parseSysMessage('$SYS/broker/bridge/x/state', '1'), null);
  assert.equal(parseSysMessage('$SYS/broker/clients/connected', 'n/a'), null);
  assert.deepEqual(parseSysMessage('$SYS/broker/heap/current size', '1234 bytes'), {
    key: 'heapCurrent',
    value: 1234,
  });
  assert.equal(parseVersion('mosquitto version 2.0.18'), '2.0.18');
  assert.equal(parseVersion('VerneMQ 2'), 'VerneMQ 2');
  assert.equal(parseVersion('  '), null);
});

function client(t, broker, options = {}) {
  const states = [];
  const stats = [];
  const c = createBrokerClient({
    url: 'mqtt://alice:url%20secret@broker.example:1883',
    clientId: CLIENT_ID,
    onStat: (stat) => stats.push(stat),
    onState: (state, detail) => states.push([state, detail]),
    connect: broker.connect,
    ...options,
  });
  t.after(() => c.stop());
  return { c, states, stats };
}

test('the client subscribes to $SYS/broker/# only, read-only, with a clean session', (t) => {
  const broker = createFakeBroker();
  const { c, states, stats } = client(t, broker, { tlsInsecure: true });
  const { url, options } = broker.connections[0];
  assert.equal(url, 'mqtt://broker.example:1883');
  assert.equal(options.username, 'alice');
  assert.equal(options.password, 'url secret');
  assert.equal(options.clientId, CLIENT_ID);
  assert.equal(options.clean, true);
  assert.equal(options.rejectUnauthorized, false);
  broker.accept();
  broker.replay();
  assert.deepEqual(broker.client.subscriptions, [SYS_TOPIC]);
  assert.deepEqual(broker.client.published, []);
  assert.equal(c.state, 'connected');
  assert.deepEqual(states, [['connected', undefined]]);
  assert.ok(stats.length > 20, `${stats.length} statistics`);
});

test('the dedicated fields win over the credentials of the URL; TLS is checked by default', (t) => {
  const broker = createFakeBroker();
  client(t, broker, { username: 'bob', password: 'field' });
  const { options } = broker.connections[0];
  assert.equal(options.username, 'bob');
  assert.equal(options.password, 'field');
  assert.equal(options.rejectUnauthorized, undefined);
});

test('no $SYS message after the subscription: denied (ACL or sys_interval 0)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const broker = createFakeBroker();
  const { c, states } = client(t, broker);
  broker.accept();
  t.mock.timers.tick(SYS_WAIT_MS - 1);
  assert.equal(c.state, null);
  t.mock.timers.tick(1);
  assert.equal(c.state, 'denied');
  // The ACL fixed and Mosquitto restarted: the statistics arrive.
  broker.replay();
  assert.equal(c.state, 'connected');
  assert.deepEqual(
    states.map(([state]) => state),
    ['denied', 'connected'],
  );
});

test('a refused subscription (SUBACK 128) is denied at once', (t) => {
  const broker = createFakeBroker();
  broker.grantedQos = 128;
  const { c } = client(t, broker);
  broker.accept();
  assert.equal(c.state, 'denied');
});

test('bad credentials are refused, a network error or a closed link is unreachable', (t) => {
  const broker = createFakeBroker();
  const { c, states } = client(t, broker);
  const refused = new Error('Connection refused: Not authorized');
  refused.code = 5;
  broker.client.emit('error', refused);
  assert.equal(c.state, 'refused');
  broker.accept();
  broker.replay();
  broker.drop();
  assert.equal(c.state, 'unreachable');
  const down = new Error('connect ECONNREFUSED 192.0.2.10:1883');
  down.code = 'ECONNREFUSED';
  broker.client.emit('error', down);
  assert.deepEqual(
    states.map(([state]) => state),
    ['refused', 'connected', 'unreachable'],
  );
});

test('stopping the client is not an outage', (t) => {
  const broker = createFakeBroker();
  const { c, states } = client(t, broker);
  broker.accept();
  broker.replay();
  c.stop();
  broker.drop();
  assert.equal(broker.client.ended, true);
  assert.deepEqual(
    states.map(([state]) => state),
    ['connected'],
  );
});

test('the client id is drawn once and kept in /data', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'gladys-mosquitto-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = await loadClientId(dir);
  assert.match(first.clientId, /^gladys-mosquitto-[0-9a-f]{8}$/);
  assert.equal(first.persisted, true);
  assert.equal((await readFile(join(dir, 'client-id'), 'utf8')).trim(), first.clientId);
  const second = await loadClientId(dir);
  assert.equal(second.clientId, first.clientId);
  // A /data that cannot be written: a path under a file, an id for this run only.
  const fallback = await loadClientId(join(dir, 'client-id', 'below-a-file'));
  assert.equal(fallback.persisted, false);
  assert.match(fallback.clientId, /^gladys-mosquitto-/);
});
