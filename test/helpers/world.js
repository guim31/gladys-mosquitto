// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake MQTT broker that replays
// real `$SYS` captures, and the integration wired on top through
// registerHandlers — the same wiring as index.js.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

// `retained messages/count` and `heap/current size` hold a space.
const LINE = /^(\$SYS\/broker\/(?:retained messages\/count|heap\/current size|\S+)) (.*)$/;

/** A `mosquitto_sub -v` capture: [topic, payload] pairs, in order. */
export function readCapture(name) {
  return readFileSync(new URL(`../fixtures/sys/${name}.txt`, import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const match = line.match(LINE);
      if (!match) {
        throw new Error(`unreadable capture line: ${line}`);
      }
      return [match[1], match[2]];
    });
}

/** Real captures of eclipse-mosquitto, see test/fixtures/sys/README.md. */
export const CAPTURES = {
  v2: readCapture('mosquitto-2.1.2'),
  v16: readCapture('mosquitto-1.6.15'),
};

export const BROKER_URL = 'mqtt://broker.example:1883';
export const CLIENT_ID = 'gladys-mosquitto-0a1b2c3d';

/** A fake broker: mqtt.connect() returning a client the test drives. */
export function createFakeBroker() {
  const broker = {
    clients: [],
    connections: [],
    // What the next SUBACK grants: 0, or 128 for a refusal.
    grantedQos: 0,
    /** The latest client. */
    get client() {
      return broker.clients[broker.clients.length - 1];
    },
    connect(url, options) {
      const client = new EventEmitter();
      client.subscriptions = [];
      client.published = [];
      client.ended = false;
      client.subscribe = (topic, opts, callback) => {
        client.subscriptions.push(topic);
        callback?.(null, [{ topic, qos: broker.grantedQos }]);
      };
      client.publish = (...args) => client.published.push(args);
      client.end = () => {
        client.ended = true;
      };
      broker.clients.push(client);
      broker.connections.push({ url, options });
      return client;
    },
    /** The broker accepts the connection. */
    accept() {
      broker.client.emit('connect');
    },
    /** One `$SYS` message. */
    sys(suffix, payload) {
      broker.client.emit('message', `$SYS/broker/${suffix}`, Buffer.from(String(payload)));
    },
    /** A whole capture, as Mosquitto sends it to a new subscriber. */
    replay(capture = CAPTURES.v2) {
      for (const [topic, payload] of capture) {
        broker.client.emit('message', topic, Buffer.from(payload));
      }
    },
    /** The broker goes away. */
    drop() {
      broker.client.emit('close');
      broker.client.emit('offline');
    },
  };
  return broker;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array<object>} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {object} [options.timings]
 */
export async function createWorld({
  config = { broker_url: BROKER_URL },
  devices = [],
  connect = true,
  timings,
} = {}) {
  const broker = createFakeBroker();
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    connectMqtt: broker.connect,
    loadClientId: async () => ({ clientId: CLIENT_ID, persisted: true }),
    timings: { discoveryDelayMs: 0, ...timings },
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, broker, app, hub: app.hub };
}

/** Let the pending promise callbacks and zero-delay timers run. */
export const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/** Connect, replay a capture and wait for the discovery. */
export async function discover(world, capture = CAPTURES.v2) {
  world.broker.accept();
  world.broker.replay(capture);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await flush();
}

/** Create the discovered broker in Gladys, as the user would. */
export async function addBroker(world) {
  const discovered = world.gladys.fake.discoveredDevices;
  const device = discovered[discovered.length - 1];
  if (!device) {
    throw new Error('the broker was not discovered');
  }
  await world.gladys.fake.deviceCreated(device);
  return device;
}

/** A feature external id of the broker. */
export const featureId = (gladys, key) => gladys.externalIds('broker', 'mosquitto').feature(key);
