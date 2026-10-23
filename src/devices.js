// -----------------------------------------------------------------------------
// One Gladys device: the Mosquitto broker, and the states of its features.
//
// The integration watches one broker, keyed on a fixed id: a new address
// (another host, TLS) keeps the same device and its history. Feature keys are
// forever (Gladys keys the history, scenes and dashboards on them): add new
// ones, never rename one.
//
// "Reachable" always exists. Every other feature appears once its `$SYS`
// topic was received (1.6 and the official images have no heap), and never
// leaves a device already added (the Discovery tab would offer a pointless
// "Update").
//
// Mosquitto's `load/*/1min` values are moving averages per minute: messages
// are published per minute (no such unit in Gladys: it is in the name),
// bytes are converted to bytes per second (a Gladys unit).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { FEATURE_NAMES, pick } from './i18n.js';

export const DEVICE_TYPE = 'broker';
export const BROKER_ID = 'mosquitto';
export const DEFAULT_NAME = 'Mosquitto';

const MAX_COUNT = 1000000;

export const round = (value, decimals = 0) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const counter = (key, stat) => ({
  key,
  stat,
  category: C.COUNTER_SENSOR,
  type: T.SENSOR.INTEGER,
  min: 0,
  max: MAX_COUNT,
  read: ({ stats }) => round(stats[stat]),
});

const byteRate = (key, stat) => ({
  key,
  stat,
  category: C.DATARATE,
  type: T.DATARATE.RATE,
  unit: U.BYTES_PER_SECOND,
  min: 0,
  max: 1000000000,
  read: ({ stats }) => round(stats[stat] / 60, 1),
});

/**
 * The features of the broker, in display order. `stat` is the statistic that
 * proves the feature exists; `read` turns the broker data ({ reachable,
 * stats }) into the state, or null when unknown (nothing is published then).
 */
export const FEATURES = [
  {
    key: 'reachable',
    category: C.INPUT,
    type: T.SENSOR.BINARY,
    min: 0,
    max: 1,
    read: ({ reachable }) => (reachable === null ? null : reachable ? 1 : 0),
  },
  counter('clients_connected', 'clientsConnected'),
  counter('clients_disconnected', 'clientsDisconnected'),
  counter('messages_received', 'messagesReceived1min'),
  counter('messages_sent', 'messagesSent1min'),
  byteRate('bytes_received', 'bytesReceived1min'),
  byteRate('bytes_sent', 'bytesSent1min'),
  counter('subscriptions', 'subscriptions'),
  counter('retained_messages', 'retainedMessages'),
  {
    // In days: Gladys has no "uptime" display, and days read best on a tile.
    key: 'uptime',
    stat: 'uptimeSeconds',
    category: C.DURATION,
    type: T.DURATION.DECIMAL,
    unit: U.DAYS,
    min: 0,
    max: 36500,
    keepHistory: false,
    read: ({ stats }) => round(stats.uptimeSeconds / 86400, 2),
  },
  {
    key: 'version',
    stat: 'version',
    category: C.TEXT,
    type: T.TEXT.TEXT,
    // NOT NULL in the core, even for a text (422 on "Add to Gladys").
    min: 0,
    max: 0,
    keepHistory: false,
    read: ({ stats }) => (stats.version ? { text: stats.version } : null),
  },
  {
    key: 'heap',
    stat: 'heapCurrent',
    category: C.DATA,
    type: T.DATA.SIZE,
    unit: U.KILOBYTE,
    min: 0,
    max: 100000000,
    read: ({ stats }) => round(stats.heapCurrent / 1024),
  },
];

/**
 * The feature keys the statistics prove the broker has.
 * @param {object} stats
 * @returns {string[]}
 */
export function featuresOf(stats) {
  return FEATURES.filter(
    (feature) => feature.stat && stats[feature.stat] !== null && stats[feature.stat] !== undefined,
  ).map((feature) => feature.key);
}

/** The external ids of the broker. */
export const brokerIds = (gladys) => gladys.externalIds(DEVICE_TYPE, BROKER_ID);

/** The feature key behind a feature external id of the broker, or null. */
export function featureKeyOf(gladys, externalId) {
  const prefix = `${brokerIds(gladys).device}:`;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const key = externalId.slice(prefix.length);
  return FEATURES.some((feature) => feature.key === key) ? key : null;
}

/**
 * The discovered device of the broker.
 * @param {object} gladys
 * @param {{ features: Iterable<string>, language: string }} options
 */
export function buildDevice(gladys, { features, language }) {
  const ids = brokerIds(gladys);
  const names = pick(FEATURE_NAMES, language);
  const keys = new Set(['reachable', ...features]);
  return {
    name: DEFAULT_NAME,
    external_id: ids.device,
    model: 'Eclipse Mosquitto',
    // The statistics are pushed by the broker: the core never polls.
    should_poll: false,
    features: FEATURES.filter((feature) => keys.has(feature.key)).map((feature) => ({
      name: names[feature.key],
      external_id: ids.feature(feature.key),
      category: feature.category,
      type: feature.type,
      ...(feature.unit ? { unit: feature.unit } : {}),
      min: feature.min,
      max: feature.max,
      read_only: true,
      has_feedback: false,
      keep_history: feature.keepHistory ?? true,
    })),
  };
}

/**
 * The states of the broker, in the publishStates format.
 * @param {object} gladys
 * @param {{ reachable: boolean|null, stats: object }} data
 */
export function buildStates(gladys, data) {
  const ids = brokerIds(gladys);
  const states = [];
  for (const feature of FEATURES) {
    const value = feature.read(data);
    if (value === null || value === undefined) {
      continue;
    }
    const id = ids.feature(feature.key);
    // A text feature takes `text`, never an empty one (the core ignores it).
    states.push(
      typeof value === 'object'
        ? { device_feature_external_id: id, text: value.text }
        : { device_feature_external_id: id, state: value },
    );
  }
  return states;
}
