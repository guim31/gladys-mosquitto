// -----------------------------------------------------------------------------
// The "Mosquitto broker" dashboard widget: the state of the broker and its key
// numbers.
//
// Content budget of the core: 8 components, 2 texts at most. Here: 1 status
// list (state, version, uptime), up to 4 live tiles bound to the broker's
// features (they follow the published states without any refresh), 1
// caption. Pre-localized from the viewer's `language` (the core caches the
// content per settings, language and units).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { brokerIds } from './devices.js';
import { formatDuration, pick, relativeTime } from './i18n.js';
import { WIDGET_KEY } from './hub.js';

export const WIDGET = {
  BROKER: WIDGET_KEY,
};

export const CONTENT_TTL_SECONDS = 30;

export const TEXT = {
  en: {
    notConfigured: 'Enter the address of the Mosquitto broker in the integration configuration.',
    pickBroker: 'Pick the broker in the widget settings.',
    unknownBroker: 'Add the Mosquitto broker to Gladys first (Discovery tab), then pick it here.',
    broker: 'Broker',
    online: 'Online',
    unreachable: 'Unreachable',
    refused: 'Login refused',
    noSys: 'No $SYS statistics',
    connecting: 'Connecting…',
    version: 'Version',
    uptime: 'Uptime',
    clients: 'Clients',
    received: 'Received /min',
    sent: 'Sent /min',
    subscriptions: 'Subscriptions',
    updated: (ago) => `Statistics ${ago}`,
  },
  fr: {
    notConfigured:
      "Saisissez l'adresse du broker Mosquitto dans la configuration de l'intégration.",
    pickBroker: 'Choisissez le broker dans les réglages du widget.',
    unknownBroker:
      "Ajoutez d'abord le broker Mosquitto à Gladys (onglet Découverte), puis choisissez-le ici.",
    broker: 'Broker',
    online: 'En ligne',
    unreachable: 'Injoignable',
    refused: 'Connexion refusée',
    noSys: 'Pas de statistiques $SYS',
    connecting: 'Connexion…',
    version: 'Version',
    uptime: 'En marche depuis',
    clients: 'Clients',
    received: 'Reçus /min',
    sent: 'Envoyés /min',
    subscriptions: 'Abonnements',
    updated: (ago) => `Statistiques ${ago}`,
  },
  de: {
    notConfigured:
      'Gib die Adresse des Mosquitto-Brokers in der Konfiguration der Integration ein.',
    pickBroker: 'Wähle den Broker in den Einstellungen des Widgets.',
    unknownBroker:
      'Füge den Mosquitto-Broker zuerst zu Gladys hinzu (Tab „Erkennung“) und wähle ihn dann hier.',
    broker: 'Broker',
    online: 'Online',
    unreachable: 'Nicht erreichbar',
    refused: 'Anmeldung abgelehnt',
    noSys: 'Keine $SYS-Statistiken',
    connecting: 'Verbinde…',
    version: 'Version',
    uptime: 'Laufzeit',
    clients: 'Clients',
    received: 'Empfangen /min',
    sent: 'Gesendet /min',
    subscriptions: 'Abonnements',
    updated: (ago) => `Statistiken ${ago}`,
  },
  es: {
    notConfigured:
      'Introduzca la dirección del broker Mosquitto en la configuración de la integración.',
    pickBroker: 'Elija el broker en los ajustes del widget.',
    unknownBroker:
      'Añada primero el broker Mosquitto a Gladys (pestaña Descubrimiento) y luego elíjalo aquí.',
    broker: 'Broker',
    online: 'En línea',
    unreachable: 'Inaccesible',
    refused: 'Conexión rechazada',
    noSys: 'Sin estadísticas $SYS',
    connecting: 'Conectando…',
    version: 'Versión',
    uptime: 'En marcha desde hace',
    clients: 'Clientes',
    received: 'Recibidos /min',
    sent: 'Enviados /min',
    subscriptions: 'Suscripciones',
    updated: (ago) => `Estadísticas ${ago}`,
  },
};

// The live tiles: feature key, label key, icon.
const TILES = [
  ['clients_connected', 'clients', 'users'],
  ['messages_received', 'received', 'download'],
  ['messages_sent', 'sent', 'upload'],
  ['subscriptions', 'subscriptions', 'rss'],
];

const LINK = {
  connected: ['online', WIDGET_COLORS.SUCCESS],
  denied: ['noSys', WIDGET_COLORS.WARNING],
  refused: ['refused', WIDGET_COLORS.DANGER],
  unreachable: ['unreachable', WIDGET_COLORS.DANGER],
};

const textContent = (text) => ({
  ttl_seconds: CONTENT_TTL_SECONDS,
  components: [{ type: 'text', variant: 'body', text }],
});

/**
 * Pure builder of the widget content.
 * @param {object} input
 * @param {object} input.gladys
 * @param {string|null} input.link the link state of the client
 * @param {object} input.stats
 * @param {Set<string>} input.features the feature keys of the added device
 * @param {string} input.language
 * @param {number|null} input.statsAt ms
 * @param {number} input.now ms
 */
export function buildBrokerContent({ gladys, link, stats, features, language, statsAt, now }) {
  const text = pick(TEXT, language);
  const [stateKey, color] = LINK[link] ?? ['connecting', WIDGET_COLORS.NEUTRAL];
  const items = [{ label: text.broker, value: text[stateKey], icon: 'server', color }];
  if (stats.version) {
    items.push({ label: text.version, value: stats.version, icon: 'tag' });
  }
  if (link === 'connected' && Number.isFinite(stats.uptimeSeconds)) {
    items.push({
      label: text.uptime,
      value: formatDuration(stats.uptimeSeconds, language),
      icon: 'clock',
    });
  }
  const components = [{ type: 'status', items }];
  const ids = brokerIds(gladys);
  for (const [key, label, icon] of TILES) {
    if (features.has(key)) {
      components.push({
        type: 'value',
        label: text[label],
        icon,
        device_feature: ids.feature(key),
      });
    }
  }
  if (statsAt !== null) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: text.updated(relativeTime((now - statsAt) / 1000, language)),
    });
  }
  return { ttl_seconds: CONTENT_TTL_SECONDS, components };
}

/**
 * The onWidgetGet handler of the broker widget.
 * @param {import('./hub.js').MosquittoHub} hub
 * @param {{ settings?: object, language?: string }} request
 */
export function getBrokerWidget(hub, { settings = {}, language = 'en' } = {}) {
  const text = pick(TEXT, language);
  if (!isConfigured(hub.config)) {
    return textContent(text.notConfigured);
  }
  if (!settings.device) {
    return textContent(text.pickBroker);
  }
  const device = hub.addedDevice();
  if (!device || device.external_id !== settings.device) {
    return textContent(text.unknownBroker);
  }
  // Tiles only for the features of the device as added: a feature seen since
  // is not in Gladys until the user updates the device.
  const ids = brokerIds(hub.gladys);
  const added = new Set((device.features ?? []).map((feature) => feature.external_id));
  const features = new Set(TILES.map(([key]) => key).filter((key) => added.has(ids.feature(key))));
  return buildBrokerContent({
    gladys: hub.gladys,
    link: hub.client?.state ?? null,
    stats: hub.stats,
    features,
    language,
    statsAt: hub.statsAt,
    now: hub.now(),
  });
}
