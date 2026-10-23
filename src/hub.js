// -----------------------------------------------------------------------------
// The state of the integration: the broker link, the latest `$SYS` statistics,
// and what is published to Gladys.
//
// Mosquitto sends its whole `$SYS` tree every `sys_interval` seconds (10 by
// default), around 50 messages at once. The states are published at most once
// per publishMinMs, and only those that changed: the core caps an integration
// at 300 states a minute and re-evaluates the scenes at each one. The link
// state ("Reachable") is published at once.
//
// A one-minute clock in the container fires the "unreachable for N minutes"
// and "fewer clients" triggers and sends the heartbeat.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { effectiveUsername, isConfigured, safeUrl } from './config.js';
import { brokerIds, buildDevice, buildStates, featureKeyOf, featuresOf, round } from './devices.js';
import {
  MESSAGES,
  REPORT_TEXT,
  formatDuration,
  formatNumber,
  sysDeniedMessage,
  sysDeniedMessages,
} from './i18n.js';
import { createIssueLog } from './issues.js';
import { createBrokerClient } from './mosquitto/client.js';
import { TRIGGER, createTriggerTracker } from './triggers.js';

const logger = createLogger({ name: 'mosquitto' });

export const WIDGET_KEY = 'broker';

export const DEFAULT_TIMINGS = {
  publishMinMs: 30 * 1000,
  tickMs: 60 * 1000,
  // Discovery waits for the burst of retained `$SYS` messages to end.
  discoveryDelayMs: 2 * 1000,
  // Republish an unchanged value at least this often, or the front shows "no
  // recent value" after 48 h.
  heartbeatMs: 6 * 60 * 60 * 1000,
};

const LANGS = ['en', 'fr', 'de', 'es'];

export class MosquittoHub {
  /**
   * @param {object} options
   * @param {object} options.gladys
   * @param {() => number} [options.now]
   * @param {Function} [options.connectMqtt] test seam: mqtt.connect
   * @param {() => Promise<{ clientId: string, persisted: boolean }>} options.loadClientId
   * @param {object} [options.timings]
   */
  constructor({ gladys, now = () => Date.now(), connectMqtt, loadClientId, timings = {} }) {
    this.gladys = gladys;
    this.now = now;
    this.connectMqtt = connectMqtt;
    this.loadClientId = loadClientId;
    this.clientId = null;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.issues = createIssueLog(logger);
    this.triggers = createTriggerTracker({ now });
    this.config = null;
    this.client = null;
    this.stats = {};
    this.statsAt = null;
    this.seen = new Set();
    this.tickTimer = null;
    this.publishTimer = null;
    this.discoveryTimer = null;
    this.lastPublishAt = 0;
    this.status = null;
    this.generation = 0;
  }

  // --- Configuration and link ---------------------------------------------------

  /** (Re)start everything with a configuration. */
  async configure(config) {
    this.stopClient();
    this.generation += 1;
    const previous = this.config?.broker_url ?? null;
    this.config = config;
    // Sent again after a reconnection: Gladys may have restarted.
    this.status = null;
    if (previous !== null && previous !== config.broker_url) {
      // Another broker: its numbers and its history of uptime are not ours.
      this.stats = {};
      this.statsAt = null;
      this.triggers.reset();
    }
    if (!isConfigured(config)) {
      logger.warn('No broker configured: waiting for its address');
      await this.updateStatus();
      return;
    }
    if (this.clientId === null) {
      const { clientId, persisted } = await this.loadClientId();
      this.clientId = clientId;
      if (!persisted) {
        logger.warn('/data is not writable: the MQTT client id changes at each start');
      }
    }
    const url = safeUrl(config.broker_url);
    logger.info(`Watching Mosquitto at ${url} (client id ${this.clientId})`);
    const generation = this.generation;
    this.client = createBrokerClient({
      url: config.broker_url,
      username: config.username,
      password: config.password,
      clientId: this.clientId,
      tlsInsecure: config.tls_insecure,
      connect: this.connectMqtt,
      onStat: (stat) => {
        if (generation === this.generation) {
          this.onStat(stat);
        }
      },
      onState: (state, detail) => {
        if (generation === this.generation) {
          this.onLinkState(state, detail).catch((err) =>
            logger.error(`Handling the link state failed: ${err.message}`),
          );
        }
      },
    });
    this.startTick();
    await this.updateStatus();
  }

  startTick() {
    clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => {
      this.tick().catch((err) => logger.error(`Clock tick failed: ${err.message}`));
    }, this.timings.tickMs);
    this.tickTimer.unref?.();
  }

  stopClient() {
    this.client?.stop();
    this.client = null;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
    clearTimeout(this.discoveryTimer);
    this.discoveryTimer = null;
  }

  stop() {
    this.stopClient();
    clearTimeout(this.publishTimer);
    this.publishTimer = null;
  }

  /** The broker answers (connected or connected without `$SYS`), or null before the first try. */
  reachable() {
    const state = this.client?.state ?? null;
    if (state === null) {
      return null;
    }
    return state === 'connected' || state === 'denied';
  }

  async onLinkState(state, detail) {
    const url = safeUrl(this.config.broker_url);
    if (state === 'connected') {
      if (this.issues.isFailing('link')) {
        this.issues.ok('link', `Mosquitto at ${url} answers again`);
      } else {
        logger.info(`Connected to Mosquitto at ${url}, reading $SYS`);
      }
      this.issues.ok('sys', 'The $SYS statistics arrive again');
    } else if (state === 'denied') {
      this.issues.ok('link', `Mosquitto at ${url} answers again`);
      this.issues.fail(
        'sys',
        `Connected to ${url}, but no $SYS message: the ACL denies "$SYS/#" to this user, or sys_interval is 0 (${detail})`,
      );
    } else {
      this.issues.fail(
        'link',
        `Mosquitto at ${url} ${state === 'refused' ? 'refused the credentials' : 'cannot be reached'} (${detail ?? state})`,
      );
    }
    // Before any await: a clock tick in between would see a stale outage.
    const { back, offlineMinutes } = this.triggers.onLink(this.reachable() === true);
    await this.updateStatus();
    if (back) {
      await this.fireScene(TRIGGER.BROKER_BACK, { offline_minutes: offlineMinutes });
    }
    // The link state is worth a state at once, not in 30 s.
    await this.publish();
  }

  /**
   * The connection status shown by Gladys, sent when it changes. The core
   * wants a multi-language object (`en` required): the page picks the
   * viewer's language.
   */
  async updateStatus() {
    const { config } = this;
    const state = this.client?.state ?? null;
    let message = null;
    if (!config || !isConfigured(config)) {
      message = MESSAGES.notConfigured;
    } else if (state === 'refused') {
      message = MESSAGES.refused;
    } else if (state === 'unreachable') {
      message = MESSAGES.unreachable;
    } else if (state === 'denied') {
      message = sysDeniedMessages(effectiveUsername(config));
    }
    const pending = message === null && state === null;
    const status = pending ? null : message === null ? 'ok' : message.en;
    if (status === this.status) {
      return;
    }
    this.status = status;
    if (pending) {
      return;
    }
    await this.gladys
      .setConnectionStatus(message === null, message === null ? undefined : message)
      .catch((err) => logger.debug(`Connection status not sent: ${err.message}`));
  }

  // --- Statistics -----------------------------------------------------------------

  /** One `$SYS` statistic. */
  onStat({ key, value }) {
    const previous = this.stats[key];
    this.stats[key] = value;
    this.statsAt = this.now();
    if (key === 'uptimeSeconds' && this.triggers.onUptime(value)) {
      logger.info(`Mosquitto restarted (uptime ${previous} s, now ${value} s)`);
      this.fireScene(TRIGGER.BROKER_RESTARTED, { version: this.stats.version ?? '' }).catch(
        () => {},
      );
    }
    if (key === 'clientsConnected') {
      for (const threshold of this.triggers.onClients(value)) {
        this.fireScene(TRIGGER.CLIENTS_BELOW, {
          below: String(threshold),
          clients: value,
        }).catch(() => {});
      }
    }
    if (key === 'messagesReceived1min') {
      for (const threshold of this.triggers.onMessages(value)) {
        this.fireScene(TRIGGER.MESSAGES_ABOVE, {
          above: String(threshold),
          messages_per_minute: round(value),
        }).catch(() => {});
      }
    }
    const before = this.seen.size;
    for (const feature of featuresOf({ [key]: value })) {
      this.seen.add(feature);
    }
    if (this.seen.size !== before) {
      this.scheduleDiscovery();
    }
    this.schedulePublish();
  }

  /** The data the features, the widget and the scene action read. */
  data() {
    return { reachable: this.reachable(), stats: this.stats };
  }

  /** The clock: outages, clients still below a threshold. */
  async tick() {
    const { unreachable, offlineMinutes, clients } = this.triggers.onTick();
    for (const minutes of unreachable) {
      await this.fireScene(TRIGGER.BROKER_UNREACHABLE, {
        after_minutes: String(minutes),
        minutes: offlineMinutes,
      });
    }
    for (const threshold of clients) {
      await this.fireScene(TRIGGER.CLIENTS_BELOW, {
        below: String(threshold),
        clients: this.stats.clientsConnected,
      });
    }
    this.schedulePublish();
  }

  // --- Gladys side ----------------------------------------------------------------

  /** The device of the broker as Gladys knows it, if added. */
  addedDevice() {
    const externalId = brokerIds(this.gladys).device;
    return (this.gladys.devices ?? []).find((device) => device.external_id === externalId) ?? null;
  }

  /** The discovered devices: the broker, once it sent its statistics. */
  discoveredDevices() {
    const features = new Set(this.seen);
    const added = this.addedDevice();
    for (const feature of added?.features ?? []) {
      const key = featureKeyOf(this.gladys, feature.external_id);
      if (key !== null) {
        features.add(key);
      }
    }
    if (features.size === 0 && !added) {
      return [];
    }
    return [buildDevice(this.gladys, { features, language: this.config?.language ?? 'fr' })];
  }

  scheduleDiscovery() {
    if (this.discoveryTimer !== null) {
      return;
    }
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      this.publishDiscovery().catch(() => {});
    }, this.timings.discoveryDelayMs);
    this.discoveryTimer.unref?.();
  }

  async publishDiscovery() {
    try {
      await this.gladys.publishDiscoveredDevices(this.discoveredDevices());
      this.issues.ok('discovery', 'Gladys accepts the broker device again');
      if (this.status === 'publish-failed') {
        this.status = null;
        await this.updateStatus();
      }
    } catch (err) {
      this.issues.fail('discovery', `Publishing the broker device failed: ${err.message}`);
      await this.gladys.setConnectionStatus(false, MESSAGES.publishFailed).catch(() => {});
      this.status = 'publish-failed';
    }
  }

  /** Publish soon: at most once per publishMinMs. */
  schedulePublish() {
    if (this.publishTimer !== null) {
      return;
    }
    const wait = Math.max(0, this.lastPublishAt + this.timings.publishMinMs - this.now());
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      this.publish().catch((err) => logger.error(`Publishing failed: ${err.message}`));
    }, wait);
    this.publishTimer.unref?.();
  }

  /** Publish the changed states now (the device just added: everything). */
  async publish() {
    if (!this.addedDevice()) {
      return;
    }
    this.lastPublishAt = this.now();
    const data = this.data();
    // Unreachable: only "Reachable" changes, the numbers keep their last value.
    const states = buildStates(
      this.gladys,
      data.reachable === false ? { ...data, stats: {} } : data,
    );
    if (states.length === 0) {
      return;
    }
    try {
      const { count } = await this.gladys.publishChangedStates(states, {
        heartbeat: this.timings.heartbeatMs,
      });
      if (count > 0) {
        logger.debug(`${count} state(s) published`);
      }
      this.issues.ok('publish', 'Gladys accepts the states again');
    } catch (err) {
      this.issues.fail('publish', `Publishing the states failed: ${err.message}`);
    }
  }

  async fireScene(key, extra) {
    const device = this.addedDevice();
    if (!device) {
      return;
    }
    try {
      await this.gladys.publishSceneEvent(key, {
        device: device.external_id,
        broker: device.name ?? 'Mosquitto',
        ...extra,
      });
      logger.debug(`Scene event ${key} fired`);
      this.issues.ok('scene', 'Gladys accepts the scene events again');
    } catch (err) {
      this.issues.fail('scene', `Firing the scene event ${key} failed: ${err.message}`);
    }
  }

  /** Fire-and-forget nudge: the dashboards re-pull the widget content. */
  requestWidgetRefresh() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not sent: ${err.message}`);
    }
  }

  // --- "Check the connection" action ----------------------------------------------

  /**
   * What the broker gives right now, in the four languages.
   * @returns {Record<string, string>}
   */
  checkConnection() {
    const { config } = this;
    const language = config?.language ?? 'en';
    if (!config || !isConfigured(config)) {
      throw new Error(MESSAGES.notConfigured[language]);
    }
    const url = safeUrl(config.broker_url);
    const state = this.client?.state ?? null;
    if (state === 'denied') {
      throw new Error(sysDeniedMessage(effectiveUsername(config), language));
    }
    const report = {};
    for (const lang of LANGS) {
      const text = REPORT_TEXT[lang];
      if (state === 'refused') {
        report[lang] = text.refused(url);
        continue;
      }
      if (state !== 'connected') {
        report[lang] = text.down(url);
        continue;
      }
      const { stats } = this;
      const n = (value) => (Number.isFinite(value) ? formatNumber(value, lang, 0) : '?');
      const lines = [text.ok(url, stats.version ?? '?')];
      lines.push(
        text.numbers(
          n(stats.clientsConnected),
          n(stats.messagesReceived1min),
          n(stats.messagesSent1min),
        ),
      );
      if (Number.isFinite(stats.uptimeSeconds)) {
        lines.push(text.uptime(formatDuration(stats.uptimeSeconds, lang)));
      }
      report[lang] = lines.join(' ');
    }
    if (state !== 'connected') {
      throw new Error(report[language]);
    }
    return report;
  }
}
