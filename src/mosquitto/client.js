// -----------------------------------------------------------------------------
// The MQTT client: subscribed to `$SYS/broker/#` only, never publishes.
//
// mqtt.js reconnects by itself; this module reports the link state and the
// statistics. Link states:
//   - connected   the broker accepted us and `$SYS` messages arrive;
//   - denied      connected, but no `$SYS` message: the ACL does not let the
//                 user read `$SYS` (Mosquitto still grants the subscription
//                 and silently delivers nothing), or `sys_interval` is 0;
//   - refused     bad user name or password (CONNACK 4/5, v5 134/135);
//   - unreachable no answer, connection lost, TLS failure.
//
// The `$SYS` topics are retained: a subscriber gets them all within a second.
// Without any after SYS_WAIT_MS, the subscription is considered denied.
// The credentials go in the connection options, never in a logged address.
// -----------------------------------------------------------------------------

import mqtt from 'mqtt';
import { parseSysMessage, SYS_TOPIC } from './sys.js';

export const RECONNECT_PERIOD_MS = 15 * 1000;
export const CONNECT_TIMEOUT_MS = 10 * 1000;
export const SYS_WAIT_MS = 15 * 1000;
export const KEEPALIVE_S = 30;

/** A percent-encoded URL part; a malformed one is kept as typed. */
function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Bad credentials, by CONNACK code (v3.1.1: 4, 5; v5: 134, 135) or message. */
export const isRefusal = (err) =>
  [4, 5, 134, 135].includes(err?.code) || /not authori[sz]ed|bad user name/i.test(err?.message);

/**
 * @param {object} options
 * @param {string} options.url broker URL (mqtt://, mqtts://, ws://, wss://)
 * @param {string} [options.username]
 * @param {string} [options.password]
 * @param {string} options.clientId stable, unique per installation
 * @param {boolean} [options.tlsInsecure] accept a self-signed certificate
 * @param {(stat: { key: string, value: number|string }) => void} options.onStat
 * @param {(state: string, detail?: string) => void} options.onState
 * @param {Function} [options.connect] test seam: mqtt.connect
 */
export function createBrokerClient({
  url,
  username = '',
  password = '',
  clientId,
  tlsInsecure = false,
  onStat,
  onState,
  connect = mqtt.connect,
}) {
  let state = null;
  let stopped = false;
  let sysTimer = null;
  let lastMessageAt = null;
  const parsed = new URL(url);
  // Credentials typed in the URL (mqtt://user:pass@host) are honoured, the
  // dedicated fields win.
  const user = username || decode(parsed.username);
  const pass = password || decode(parsed.password);
  parsed.username = '';
  parsed.password = '';

  const client = connect(parsed.toString(), {
    clientId,
    ...(user ? { username: user } : {}),
    ...(pass ? { password: pass } : {}),
    reconnectPeriod: RECONNECT_PERIOD_MS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    keepalive: KEEPALIVE_S,
    // mqtt.js stops retrying after a CONNACK error (bad credentials, server
    // unavailable): the user fixing Mosquitto must not have to save the
    // configuration again.
    reconnectOnConnackError: true,
    // No persistent session: the integration would show in the broker's own
    // "disconnected clients" count each time Gladys restarts.
    clean: true,
    ...(tlsInsecure ? { rejectUnauthorized: false } : {}),
  });

  const setState = (next, detail) => {
    // Closing the client on purpose (new configuration, shutdown) is not an
    // outage.
    if (stopped || state === next) {
      return;
    }
    state = next;
    onState(next, detail);
  };

  const clearSysTimer = () => {
    clearTimeout(sysTimer);
    sysTimer = null;
  };

  client.on('connect', () => {
    client.subscribe(SYS_TOPIC, { qos: 0 }, (err, granted) => {
      if (stopped) {
        return;
      }
      if (err) {
        setState('denied', `subscription failed (${err.message})`);
        return;
      }
      // 128 (v3.1.1) and 135 (v5): the broker refuses the subscription.
      if ((granted ?? []).some((grant) => grant.qos >= 128)) {
        setState('denied', 'subscription refused');
        return;
      }
      clearSysTimer();
      sysTimer = setTimeout(() => {
        sysTimer = null;
        setState('denied', `no $SYS message within ${SYS_WAIT_MS / 1000} s`);
      }, SYS_WAIT_MS);
      sysTimer.unref?.();
    });
  });

  client.on('message', (topic, payload) => {
    const stat = parseSysMessage(topic, payload);
    if (!stat) {
      return;
    }
    clearSysTimer();
    lastMessageAt = Date.now();
    setState('connected');
    onStat(stat);
  });

  client.on('error', (err) => {
    clearSysTimer();
    setState(isRefusal(err) ? 'refused' : 'unreachable', err?.message);
  });

  client.on('offline', () => {
    clearSysTimer();
    // After a refusal mqtt.js goes offline before retrying: still a login
    // problem, until a retry fails otherwise (ECONNREFUSED -> unreachable).
    if (state !== 'refused') {
      setState('unreachable', 'offline');
    }
  });
  client.on('close', () => {
    clearSysTimer();
    if (state === 'connected' || state === 'denied') {
      setState('unreachable', 'connection closed');
    }
  });

  return {
    get state() {
      return state;
    },
    get lastMessageAt() {
      return lastMessageAt;
    },
    stop() {
      stopped = true;
      clearSysTimer();
      client.removeAllListeners('message');
      client.end(true);
    },
  };
}
