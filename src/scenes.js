// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`).
//
// `broker_summary` — the state of the broker as a ready-made sentence
// ("Mosquitto 2.1.2 has been running for 3 days, 12 clients connected, 64
// messages received and 87 sent per minute.") plus its numbers, for a daily
// report or a check before a scene that relies on MQTT. Its language is the
// one of the configuration (a scene action does not receive the user's
// language). An unreachable broker is an answer, not an error: the scene can
// branch on `reachable`.
// -----------------------------------------------------------------------------

import { round } from './devices.js';
import { brokerSentence } from './i18n.js';

export const SCENE_ACTION = {
  BROKER_SUMMARY: 'broker_summary',
};

/**
 * @param {import('./hub.js').MosquittoHub} hub
 */
export function brokerSummary(hub) {
  const data = hub.data();
  const { stats } = data;
  return {
    summary: brokerSentence(data, hub.config?.language ?? 'fr'),
    reachable: data.reachable === true,
    clients_connected: round(stats.clientsConnected),
    messages_received_per_minute: round(stats.messagesReceived1min),
    messages_sent_per_minute: round(stats.messagesSent1min),
    uptime_hours: round(stats.uptimeSeconds / 3600, 1),
    version: stats.version ?? '',
  };
}
