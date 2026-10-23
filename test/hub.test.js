// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and a fake broker
// replaying real `$SYS` captures: discovery, states, connection status,
// triggers, the configuration action, the scene action and the widget.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildDevice } from '../src/devices.js';
import { CONFIRM_MS, QUIET_PERIOD_MS } from '../src/triggers.js';
import {
  BROKER_URL,
  CAPTURES,
  addBroker,
  createWorld,
  discover,
  featureId,
  flush,
} from './helpers/world.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

async function tick(t, ms) {
  t.mock.timers.tick(ms);
  await flush();
}

/** A world with the broker discovered and added, on mocked timers. */
async function addedWorld(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  world.broker.accept();
  world.broker.replay(options.capture ?? CAPTURES.v2);
  await tick(t, 0);
  await addBroker(world);
  await flush();
  return world;
}

const events = (world, key) => world.gladys.fake.sceneEvents.filter((event) => event.key === key);

test('the broker is discovered once its statistics arrived, never before', async () => {
  const world = await createWorld();
  try {
    world.broker.accept();
    await flush();
    assert.deepEqual(world.gladys.fake.discoveredDevices, []);
    await discover(world);
    const [device] = world.gladys.fake.discoveredDevices;
    assert.equal(device.name, 'Mosquitto');
    assert.equal(device.should_poll, false);
    assert.equal(device.features[0].name, 'Joignable');
  } finally {
    world.app.stop();
  }
});

test('adding the broker publishes every state, the version as a text, and refreshes the widget', async (t) => {
  const world = await addedWorld(t);
  const last = (key) => world.gladys.fake.lastState(featureId(world.gladys, key));
  assert.equal(last('reachable'), 1);
  assert.equal(last('clients_connected'), 2);
  assert.equal(last('messages_received'), 83);
  // Bytes per minute -> bytes per second.
  assert.equal(last('bytes_sent'), 58.3);
  assert.equal(last('uptime'), 0);
  assert.equal(last('version'), '2.1.2');
  assert.equal(last('heap'), 832);
  assert.deepEqual(world.gladys.fake.widgetRefreshes, ['broker']);
});

test('only the changes are published, at most every 30 s', async (t) => {
  const world = await addedWorld(t);
  const before = world.gladys.fake.states.length;
  for (let i = 1; i <= 6; i += 1) {
    world.broker.sys('uptime', `${169 + 10 * i} seconds`);
    world.broker.sys('clients/connected', String(2 + (i % 2)));
    await tick(t, 10 * SECOND);
  }
  const published = world.gladys.fake.states.slice(before);
  assert.ok(published.length > 0 && published.length <= 3, `${published.length} states`);
  assert.ok(
    published.every((state) => state.device_feature_external_id.endsWith(':clients_connected')),
  );
});

test('an outage: Reachable at 0 at once, triggers after N minutes, then back', async (t) => {
  const world = await addedWorld(t);
  world.broker.drop();
  await flush();
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'reachable')), 0);
  // The numbers keep their last value.
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'clients_connected')), 2);
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message.fr, /injoignable/);
  for (let i = 0; i < 6; i += 1) {
    await tick(t, MINUTE);
  }
  assert.deepEqual(
    events(world, 'broker_unreachable').map((event) => event.data.after_minutes),
    ['1', '5'],
  );
  assert.equal(events(world, 'broker_unreachable')[1].data.minutes, 5);
  assert.equal(events(world, 'broker_unreachable')[0].data.broker, 'Mosquitto');
  world.broker.accept();
  world.broker.replay();
  await flush();
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'reachable')), 1);
  assert.deepEqual(
    events(world, 'broker_back').map((event) => event.data.offline_minutes),
    [6],
  );
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
});

test('a short blip fires neither "unreachable" nor "back"', async (t) => {
  const world = await addedWorld(t);
  world.broker.drop();
  await tick(t, 20 * SECOND);
  world.broker.accept();
  world.broker.replay();
  await tick(t, MINUTE);
  assert.deepEqual(events(world, 'broker_unreachable'), []);
  assert.deepEqual(events(world, 'broker_back'), []);
});

test('the uptime going backwards fires "restarted" once', async (t) => {
  const world = await addedWorld(t);
  world.broker.sys('uptime', '179 seconds');
  world.broker.sys('uptime', '3 seconds');
  world.broker.sys('uptime', '13 seconds');
  await flush();
  const restarted = events(world, 'broker_restarted');
  assert.equal(restarted.length, 1);
  assert.equal(restarted[0].data.version, '2.1.2');
});

test('fewer clients for a minute fires "clients_below" for each threshold crossed, once', async (t) => {
  const world = await addedWorld(t);
  world.broker.sys('clients/connected', '6');
  await flush();
  world.broker.sys('clients/connected', '3');
  await tick(t, CONFIRM_MS / 2);
  // Back before the minute: nothing.
  world.broker.sys('clients/connected', '6');
  await tick(t, CONFIRM_MS);
  assert.deepEqual(events(world, 'clients_below'), []);
  world.broker.sys('clients/connected', '3');
  await tick(t, CONFIRM_MS);
  await tick(t, MINUTE);
  await tick(t, MINUTE);
  assert.deepEqual(
    events(world, 'clients_below').map((event) => event.data.below),
    ['4', '5'],
  );
  assert.equal(events(world, 'clients_below')[0].data.clients, 3);
});

test('a count already low at start is a baseline, not a drop', async (t) => {
  // The capture has 2 clients: every threshold above is already crossed.
  const world = await addedWorld(t);
  await tick(t, 3 * MINUTE);
  assert.deepEqual(events(world, 'clients_below'), []);
});

test('a message spike fires "messages_above" per threshold, then rests 30 minutes', async (t) => {
  const world = await addedWorld(t);
  world.broker.sys('load/messages/received/1min', '1500.25');
  await flush();
  assert.deepEqual(
    events(world, 'messages_above').map((event) => event.data.above),
    ['100', '500', '1000'],
  );
  assert.equal(events(world, 'messages_above')[0].data.messages_per_minute, 1500);
  // Down and up again within the quiet period: nothing more.
  world.broker.sys('load/messages/received/1min', '50');
  world.broker.sys('load/messages/received/1min', '150');
  await flush();
  assert.equal(events(world, 'messages_above').length, 3);
  await tick(t, QUIET_PERIOD_MS);
  world.broker.sys('load/messages/received/1min', '50');
  world.broker.sys('load/messages/received/1min', '150');
  await flush();
  assert.equal(events(world, 'messages_above').length, 4);
});

test('a user without $SYS rights: a status with the ACL line to add', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const world = await createWorld({
    config: { broker_url: BROKER_URL, username: 'gladys', password: 'x' },
  });
  t.after(() => world.app.stop());
  world.broker.accept();
  await tick(t, 15 * SECOND);
  const status = world.gladys.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.deepEqual(Object.keys(status.message).sort(), ['de', 'en', 'es', 'fr']);
  assert.match(status.message.en, /user gladys" then "topic read \$SYS\/#"/);
  assert.match(status.message.fr, /« user gladys » puis « topic read \$SYS\/# »/);
  const ack = await world.gladys.fake.action('check_connection', {});
  assert.equal(ack.success, false);
  assert.match(JSON.stringify(ack), /topic read \$SYS/);
});

test('bad credentials and no configuration give their own status', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  assert.match(world.gladys.fake.connectionStatus.message.en, /Enter the address/);
  await world.gladys.fake.configUpdated({ broker_url: '192.0.2.10', password: 'wrong' });
  assert.equal(world.broker.connections[0].url, 'mqtt://192.0.2.10');
  const refused = new Error('Connection refused: Not authorized');
  refused.code = 5;
  world.broker.client.emit('error', refused);
  await flush();
  assert.match(world.gladys.fake.connectionStatus.message.de, /Benutzername und Passwort/);
});

test('a broker already added and unreachable at start still shows Reachable at 0', async () => {
  const gladys = (await createWorld({ connect: false })).gladys;
  const device = buildDevice(gladys, { features: ['clients_connected'], language: 'fr' });
  const world = await createWorld({ devices: [device] });
  try {
    world.broker.drop();
    await flush();
    assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'reachable')), 0);
    await world.gladys.fake.scanRequest();
    // Discovery keeps the features of the added device.
    const [discovered] = world.gladys.fake.discoveredDevices;
    assert.deepEqual(
      discovered.features.map((feature) => feature.external_id),
      device.features.map((feature) => feature.external_id),
    );
  } finally {
    world.app.stop();
  }
});

test('a new broker address forgets the numbers of the previous one', async (t) => {
  const world = await addedWorld(t);
  await world.gladys.fake.configUpdated({ broker_url: 'mqtt://other.example' });
  assert.deepEqual(world.app.hub.stats, {});
  assert.equal(world.broker.clients[0].ended, true);
  // Its first uptime is not a restart.
  world.broker.accept();
  world.broker.sys('uptime', '5 seconds');
  await flush();
  assert.deepEqual(events(world, 'broker_restarted'), []);
});

test('"Check the connection" reports the version and the key numbers', async (t) => {
  const world = await addedWorld(t);
  const ack = await world.gladys.fake.action('check_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.fr,
    'Connecté à mqtt://broker.example:1883 (Mosquitto 2.1.2). 2 clients connectés, 83 messages reçus et 116 envoyés par minute. En marche depuis 2 minutes.',
  );
  world.broker.drop();
  const down = await world.gladys.fake.action('check_connection', {});
  assert.equal(down.success, false);
});

test('the scene action gives the sentence and the numbers, and answers when unreachable', async (t) => {
  const world = await addedWorld(t);
  const ack = await world.gladys.fake.sceneAction('broker_summary', {});
  assert.deepEqual(ack.data.outputs, {
    summary:
      'Mosquitto 2.1.2 fonctionne depuis 2 minutes, 2 clients connectés, 83 messages reçus et 116 envoyés par minute.',
    reachable: true,
    clients_connected: 2,
    messages_received_per_minute: 83,
    messages_sent_per_minute: 116,
    uptime_hours: 0,
    version: '2.1.2',
  });
  world.broker.drop();
  const down = await world.gladys.fake.sceneAction('broker_summary', {});
  assert.equal(down.data.outputs.summary, 'Mosquitto est injoignable.');
  assert.equal(down.data.outputs.reachable, false);
});

test('the widget is valid, within budget, and bound to features of the device', async (t) => {
  const world = await addedWorld(t, { capture: CAPTURES.v16 });
  const device = world.gladys.devices[0];
  const ids = new Set(device.features.map((feature) => feature.external_id));
  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await world.gladys.fake.widgetGet('broker', {
      settings: { device: device.external_id },
      language,
    });
    const { content } = ack.data;
    validateWidgetContent(content);
    assert.ok(content.components.length <= 8);
    assert.ok(content.components.filter((c) => c.type === 'text').length <= 2);
    const status = content.components.find((c) => c.type === 'status');
    assert.ok(status.items.every((item) => String(item.value).length <= 40));
    for (const component of content.components.filter((c) => c.device_feature)) {
      assert.ok(ids.has(component.device_feature), component.device_feature);
    }
    assert.equal(content.components.filter((c) => c.type === 'value').length, 4);
  }
  const fr = await world.gladys.fake.widgetGet('broker', {
    settings: { device: device.external_id },
    language: 'fr',
  });
  assert.deepEqual(fr.data.content.components[0].items[0], {
    label: 'Broker',
    value: 'En ligne',
    icon: 'server',
    color: 'success',
  });
  const unknown = await world.gladys.fake.widgetGet('broker', { settings: {}, language: 'fr' });
  assert.match(unknown.data.content.components[0].text, /Choisissez le broker/);
});

test('the broker is read-only', async (t) => {
  const world = await addedWorld(t);
  const device = world.gladys.devices[0];
  const ack = await world.gladys.fake.setValue(device, device.features[0], 1);
  assert.equal(ack.success, false);
});
