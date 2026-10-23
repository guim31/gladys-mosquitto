// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys), so index.js stays a few lines and the tests drive the very same
// wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { loadClientId } from './clientId.js';
import { normalizeConfig } from './config.js';
import { brokerIds } from './devices.js';
import { MosquittoHub } from './hub.js';
import { MESSAGES } from './i18n.js';
import { SCENE_ACTION, brokerSummary } from './scenes.js';
import { WIDGET, getBrokerWidget } from './widgets.js';

const logger = createLogger({ name: 'mosquitto-app' });

export const ACTION = {
  CHECK_CONNECTION: 'check_connection',
};

/**
 * @param {object} gladys
 * @param {object} [options] test seams: connectMqtt, loadClientId, now, timings
 * @returns {{ hub: MosquittoHub, stop: () => void }}
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new MosquittoHub({
    gladys,
    now: options.now,
    connectMqtt: options.connectMqtt,
    loadClientId: options.loadClientId ?? (() => loadClientId()),
    timings: options.timings,
  });

  const isBroker = (device) => device?.external_id === brokerIds(gladys).device;

  // --- Discovery: the broker, once it sent its statistics ----------------------
  gladys.onScanRequest(async () => {
    logger.info('Scan requested');
    await hub.publishDiscovery();
  });

  // --- Read-only device ----------------------------------------------------------
  gladys.onSetValue(async (device, feature) => {
    throw new Error(`${feature.external_id} is read-only`);
  });

  // No poll: Mosquitto pushes its statistics. Registered anyway, for a device
  // that would have been created with polling: nothing to do.
  gladys.onPoll(async () => {});

  // The broker just added (or updated) in Gladys: the SDK forgot what it had
  // published and the core dropped the states sent before it existed. Send
  // everything now, and refresh the open widgets.
  const onBrokerChanged = async (device) => {
    if (!isBroker(device)) {
      return;
    }
    await hub.publish();
    hub.requestWidgetRefresh();
  };
  gladys.onDeviceCreated(onBrokerChanged);
  gladys.onDeviceUpdated(onBrokerChanged);

  // --- Configuration screen action ----------------------------------------------
  gladys.onAction(ACTION.CHECK_CONNECTION, async () => {
    logger.info('Action check_connection');
    return hub.checkConnection();
  });

  // --- Scene action ---------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTION.BROKER_SUMMARY, () => brokerSummary(hub));

  // --- Dashboard widget -----------------------------------------------------------
  gladys.onWidgetGet(WIDGET.BROKER, (request) => getBrokerWidget(hub, request));

  // --- Configuration -------------------------------------------------------------
  gladys.onConfigUpdated(async (raw) => {
    logger.info('Configuration updated');
    await hub.configure(normalizeConfig(raw));
  });

  // --- Connection lifecycle (the SDK logs the Gladys link itself) -------------
  gladys.on('connected', async () => {
    try {
      await hub.configure(normalizeConfig(await gladys.getConfig()));
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, MESSAGES.publishFailed).catch(() => {});
    }
  });

  return {
    hub,
    stop() {
      hub.stop();
    },
  };
}
