// -----------------------------------------------------------------------------
// The scene triggers, as transitions.
//
// Scene filters only compare for equality (a threshold belongs to a device
// feature), so a trigger with a threshold fires once per threshold crossed,
// and the scene author picks one (required filter).
//
// `broker_unreachable` — the broker has been unreachable for N minutes: once
// per outage and per threshold. A restart of a few seconds fires nothing,
// which the "Reachable" feature cannot offer.
// `broker_back` — the broker answers again after an outage of at least
// OUTAGE_MIN_MS (one that could have fired `broker_unreachable`).
// `broker_restarted` — the uptime of Mosquitto went backwards: the broker
// itself restarted (or crashed), even if no outage was seen.
// `clients_below` — fewer than N connected clients for CONFIRM_MS (a sensor,
// a bridge or Zigbee2MQTT that dropped). Re-armed when the count is back.
// `messages_above` — more than N messages published to the broker per minute
// (a device in a loop, a flood): once per crossing, at most once per
// QUIET_PERIOD_MS (a crossing within it is reported when it ends).
//
// After a restart of the integration, the first values are a baseline: a
// count already below a threshold fires nothing (it would re-run every scene).
// -----------------------------------------------------------------------------

export const TRIGGER = {
  BROKER_UNREACHABLE: 'broker_unreachable',
  BROKER_BACK: 'broker_back',
  BROKER_RESTARTED: 'broker_restarted',
  CLIENTS_BELOW: 'clients_below',
  MESSAGES_ABOVE: 'messages_above',
};

const MINUTE = 60 * 1000;

// Thresholds offered to the scene author.
export const UNREACHABLE_MINUTES = [1, 5, 15, 30, 60];
// The integration is a client too: Mosquitto counts it, hence no "below 1".
export const CLIENTS_THRESHOLDS = [2, 3, 4, 5, 10, 15, 20, 30, 50, 100];
export const MESSAGES_THRESHOLDS = [100, 500, 1000, 2000, 5000, 10000, 50000];

export const OUTAGE_MIN_MS = UNREACHABLE_MINUTES[0] * MINUTE;
export const CONFIRM_MS = MINUTE;
export const QUIET_PERIOD_MS = 30 * MINUTE;

/**
 * @param {object} options
 * @param {() => number} [options.now]
 */
export function createTriggerTracker({ now = () => Date.now() } = {}) {
  // Link: null before the first state, then when the outage started.
  let linkKnown = false;
  let downSince = null;
  let unreachableFired = new Set();
  let lastUptime = null;
  // Clients: per threshold, armed (seen at or above) and since when below.
  const clientsArmed = new Set();
  const clientsBelowSince = new Map();
  let lastClients = null;
  // Messages: per threshold, armed (seen at or below) and last fire.
  const messagesArmed = new Set();
  const messagesFiredAt = new Map();

  const checkClients = () => {
    const fired = [];
    if (lastClients === null) {
      return fired;
    }
    const at = now();
    for (const threshold of CLIENTS_THRESHOLDS) {
      if (lastClients >= threshold) {
        clientsArmed.add(threshold);
        clientsBelowSince.delete(threshold);
        continue;
      }
      if (!clientsArmed.has(threshold)) {
        continue;
      }
      if (!clientsBelowSince.has(threshold)) {
        clientsBelowSince.set(threshold, at);
      }
      if (at - clientsBelowSince.get(threshold) >= CONFIRM_MS) {
        clientsArmed.delete(threshold);
        clientsBelowSince.delete(threshold);
        fired.push(threshold);
      }
    }
    return fired;
  };

  return {
    /**
     * The link went up or down.
     * @param {boolean} up
     * @returns {{ back: boolean, offlineMinutes: number }}
     */
    onLink(up) {
      const at = now();
      if (!up) {
        if (downSince === null) {
          downSince = at;
          unreachableFired = new Set();
        }
        linkKnown = true;
        return { back: false, offlineMinutes: 0 };
      }
      const wasDown = downSince;
      downSince = null;
      // While the link was down, the clients count is stale.
      clientsBelowSince.clear();
      const known = linkKnown;
      linkKnown = true;
      if (!known || wasDown === null) {
        return { back: false, offlineMinutes: 0 };
      }
      const duration = at - wasDown;
      return {
        back: duration >= OUTAGE_MIN_MS,
        offlineMinutes: Math.floor(duration / MINUTE),
      };
    },

    /**
     * The uptime of the broker, in seconds.
     * @returns {boolean} the broker restarted
     */
    onUptime(seconds) {
      const restarted = lastUptime !== null && seconds < lastUptime;
      lastUptime = seconds;
      return restarted;
    },

    /**
     * The connected clients count.
     * @returns {number[]} the thresholds crossed downwards for CONFIRM_MS
     */
    onClients(count) {
      lastClients = count;
      return checkClients();
    },

    /**
     * The messages received per minute.
     * @returns {number[]} the thresholds crossed upwards
     */
    onMessages(perMinute) {
      const at = now();
      const fired = [];
      for (const threshold of MESSAGES_THRESHOLDS) {
        if (perMinute <= threshold) {
          messagesArmed.add(threshold);
          continue;
        }
        if (!messagesArmed.has(threshold)) {
          continue;
        }
        // Within the quiet period the threshold stays armed: a flood still
        // going on when it ends is reported then.
        const last = messagesFiredAt.get(threshold);
        if (last === undefined || at - last >= QUIET_PERIOD_MS) {
          messagesArmed.delete(threshold);
          messagesFiredAt.set(threshold, at);
          fired.push(threshold);
        }
      }
      return fired;
    },

    /**
     * The clock ticked: outage durations, clients still below.
     * @param {{ live?: boolean }} [options] the statistics are live
     * @returns {{ unreachable: number[], offlineMinutes: number, clients: number[] }}
     */
    onTick({ live = true } = {}) {
      const at = now();
      const unreachable = [];
      let offlineMinutes = 0;
      if (downSince !== null) {
        offlineMinutes = Math.floor((at - downSince) / MINUTE);
        for (const minutes of UNREACHABLE_MINUTES) {
          if (!unreachableFired.has(minutes) && at - downSince >= minutes * MINUTE) {
            unreachableFired.add(minutes);
            unreachable.push(minutes);
          }
        }
      }
      return {
        unreachable,
        offlineMinutes,
        // Without live statistics the last count is stale: no drop to confirm.
        clients: downSince === null && live ? checkClients() : [],
      };
    },

    /** A new configuration (another broker): forget everything. */
    reset() {
      linkKnown = false;
      downSince = null;
      unreachableFired = new Set();
      lastUptime = null;
      lastClients = null;
      clientsArmed.clear();
      clientsBelowSince.clear();
      messagesArmed.clear();
      messagesFiredAt.clear();
    },
  };
}
