// -----------------------------------------------------------------------------
// The `$SYS/broker/#` topics of Mosquitto, turned into numbers.
//
// Mosquitto publishes them every `sys_interval` seconds (10 by default),
// retained: a new subscriber receives them all at once. Every value is a
// plain-text payload ("159 seconds", "63.77", "mosquitto version 2.1.2").
// Which topics exist depends on the version and on the build: 1.6 and the
// official Docker images have no `heap/*`. Some (`clients/maximum`) are only
// sent when they change.
// A topic that never comes stays unknown: its feature is never created.
//
// Verified against eclipse-mosquitto 2.1.2 and 1.6.15 (test/fixtures/sys/).
// -----------------------------------------------------------------------------

export const SYS_PREFIX = '$SYS/broker/';
export const SYS_TOPIC = '$SYS/broker/#';

const number = (payload) => {
  const value = Number.parseFloat(payload);
  return Number.isFinite(value) ? value : null;
};

/**
 * The statistics read, by topic (after `$SYS/broker/`). `heap/current size`
 * is the name of Mosquitto 1.4 and older.
 */
export const SYS_STATS = {
  version: { key: 'version', parse: (payload) => parseVersion(payload) },
  uptime: { key: 'uptimeSeconds', parse: number },
  'clients/connected': { key: 'clientsConnected', parse: number },
  'clients/disconnected': { key: 'clientsDisconnected', parse: number },
  'clients/maximum': { key: 'clientsMaximum', parse: number },
  // `load/messages/*` counts every MQTT packet (PINGREQ, SUBSCRIBE, PUBACK…):
  // the messages users mean are the PUBLISH ones.
  'load/publish/received/1min': { key: 'messagesReceived1min', parse: number },
  'load/publish/sent/1min': { key: 'messagesSent1min', parse: number },
  'load/bytes/received/1min': { key: 'bytesReceived1min', parse: number },
  'load/bytes/sent/1min': { key: 'bytesSent1min', parse: number },
  'subscriptions/count': { key: 'subscriptions', parse: number },
  'retained messages/count': { key: 'retainedMessages', parse: number },
  'store/messages/count': { key: 'storedMessages', parse: number },
  'heap/current': { key: 'heapCurrent', parse: number },
  'heap/current size': { key: 'heapCurrent', parse: number },
};

/** "mosquitto version 2.1.2" -> "2.1.2"; another broker's text is kept as is. */
export function parseVersion(payload) {
  const text = String(payload ?? '').trim();
  if (text === '') {
    return null;
  }
  const match = text.match(/^mosquitto version (\S+)/i);
  return (match ? match[1] : text).slice(0, 40);
}

/**
 * One `$SYS` message.
 * @param {string} topic
 * @param {Buffer|string} payload
 * @returns {{ key: string, value: number|string } | null} null for a topic
 *   not read, or a value that does not parse
 */
export function parseSysMessage(topic, payload) {
  if (typeof topic !== 'string' || !topic.startsWith(SYS_PREFIX)) {
    return null;
  }
  const stat = SYS_STATS[topic.slice(SYS_PREFIX.length)];
  if (!stat) {
    return null;
  }
  const value = stat.parse(Buffer.isBuffer(payload) ? payload.toString('utf8') : payload);
  return value === null ? null : { key: stat.key, value };
}
