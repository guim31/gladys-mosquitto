// -----------------------------------------------------------------------------
// Quiet logs: nothing at info level for a normal cycle, one line when a
// failure starts and one when it ends, never a password.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BROKER_URL, addBroker, createWorld, flush } from './helpers/world.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Capture every log line at the given level and above. */
function captureLogs(t, level = 'debug') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

const atLevel = (lines, level) => lines.filter((line) => line.includes(`[${level}]`));

async function tick(t, ms) {
  t.mock.timers.tick(ms);
  await flush();
}

test('a normal cycle writes nothing at info level', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.broker.accept();
  world.broker.replay();
  await tick(t, 0);
  await addBroker(world);
  const lines = captureLogs(t, 'info');
  for (let i = 1; i <= 30; i += 1) {
    world.broker.sys('uptime', `${169 + 10 * i} seconds`);
    world.broker.sys('load/messages/received/1min', String(60 + i));
    world.broker.sys('clients/connected', String(2 + (i % 3)));
    await tick(t, 10 * SECOND);
  }
  await tick(t, 2 * MINUTE);
  assert.deepEqual(lines, []);
});

test('an outage is told once, its end once, the rest goes to debug', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.broker.accept();
  world.broker.replay();
  await flush();
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 4; i += 1) {
    world.broker.drop();
    world.broker.client.emit('error', new Error('connect ECONNREFUSED'));
    await tick(t, MINUTE);
  }
  assert.equal(atLevel(lines, 'WARN').length, 1);
  world.broker.accept();
  world.broker.sys('uptime', '420 seconds');
  await flush();
  const info = atLevel(lines, 'INFO');
  assert.equal(info.length, 1, info.join('\n'));
  assert.match(info[0], /answers again/);
});

test('the passwords never appear in the logs, at any level', async (t) => {
  const lines = captureLogs(t, 'debug');
  const world = await createWorld({
    config: {
      broker_url: 'mqtt://alice:url-secret@broker.example:1883',
      password: 'field-secret',
    },
  });
  const refused = new Error('Connection refused: Not authorized');
  refused.code = 5;
  world.broker.client.emit('error', refused);
  world.broker.accept();
  world.broker.replay();
  await world.gladys.fake.action('check_connection', {});
  await world.gladys.fake.configUpdated({ broker_url: BROKER_URL, password: 'field-secret' });
  await flush();
  world.app.stop();
  assert.ok(lines.length > 5, 'the scenario logs something');
  for (const line of lines) {
    for (const secret of ['url-secret', 'field-secret']) {
      assert.ok(!line.includes(secret), `${secret} in: ${line}`);
    }
  }
});
