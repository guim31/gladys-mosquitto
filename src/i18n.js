// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish says "usted" (house rule, enforced by
// test/i18n.test.js). Vocabulary follows the Gladys front translations.
//
// An integration of type "device" does not receive the user's language: the
// feature names, the scene action outputs and the action messages follow the
// `language` field of the configuration (French by default). Widgets get the
// viewer's language with every request.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

/** Pick the text of a language, English as the fallback. */
export function pick(texts, language) {
  return texts[LANGUAGES.includes(language) ? language : 'en'] ?? texts.en;
}

// Feature names, by feature key (src/devices.js). Frozen at device creation
// in Gladys: changing one only affects brokers added afterwards.
export const FEATURE_NAMES = {
  en: {
    reachable: 'Reachable',
    clients_connected: 'Connected clients',
    clients_disconnected: 'Disconnected persistent clients',
    messages_received: 'Messages received (/min)',
    messages_sent: 'Messages sent (/min)',
    bytes_received: 'Incoming traffic',
    bytes_sent: 'Outgoing traffic',
    subscriptions: 'Subscriptions',
    retained_messages: 'Retained messages',
    uptime: 'Uptime',
    version: 'Version',
    heap: 'Memory used',
  },
  fr: {
    reachable: 'Joignable',
    clients_connected: 'Clients connectés',
    clients_disconnected: 'Clients persistants déconnectés',
    messages_received: 'Messages reçus (/min)',
    messages_sent: 'Messages envoyés (/min)',
    bytes_received: 'Trafic entrant',
    bytes_sent: 'Trafic sortant',
    subscriptions: 'Abonnements',
    retained_messages: 'Messages retenus',
    uptime: 'Durée de fonctionnement',
    version: 'Version',
    heap: 'Mémoire utilisée',
  },
  de: {
    reachable: 'Erreichbar',
    clients_connected: 'Verbundene Clients',
    clients_disconnected: 'Getrennte persistente Clients',
    messages_received: 'Empfangene Nachrichten (/min)',
    messages_sent: 'Gesendete Nachrichten (/min)',
    bytes_received: 'Eingehender Datenverkehr',
    bytes_sent: 'Ausgehender Datenverkehr',
    subscriptions: 'Abonnements',
    retained_messages: 'Gespeicherte Nachrichten',
    uptime: 'Laufzeit',
    version: 'Version',
    heap: 'Belegter Speicher',
  },
  es: {
    reachable: 'Accesible',
    clients_connected: 'Clientes conectados',
    clients_disconnected: 'Clientes persistentes desconectados',
    messages_received: 'Mensajes recibidos (/min)',
    messages_sent: 'Mensajes enviados (/min)',
    bytes_received: 'Tráfico entrante',
    bytes_sent: 'Tráfico saliente',
    subscriptions: 'Suscripciones',
    retained_messages: 'Mensajes retenidos',
    uptime: 'Tiempo en marcha',
    version: 'Versión',
    heap: 'Memoria usada',
  },
};

// Connection status messages (Gladys shows them on the integration page) and
// errors of the actions. `sysDenied` takes the user name of the ACL hint.
export const MESSAGES = {
  notConfigured: {
    en: 'Enter the address of your Mosquitto broker in the configuration.',
    fr: "Saisissez l'adresse de votre broker Mosquitto dans la configuration.",
    de: 'Gib die Adresse deines Mosquitto-Brokers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su broker Mosquitto en la configuración.',
  },
  unreachable: {
    en: 'The Mosquitto broker cannot be reached: check its address and that it is running.',
    fr: 'Le broker Mosquitto est injoignable : vérifiez son adresse et qu’il fonctionne.',
    de: 'Der Mosquitto-Broker ist nicht erreichbar: Prüfe seine Adresse und ob er läuft.',
    es: 'No se puede acceder al broker Mosquitto: compruebe su dirección y que esté en marcha.',
  },
  refused: {
    en: 'Mosquitto refused the connection: check the user name and the password.',
    fr: "Mosquitto refuse la connexion : vérifiez le nom d'utilisateur et le mot de passe.",
    de: 'Mosquitto lehnt die Verbindung ab: Prüfe Benutzername und Passwort.',
    es: 'Mosquitto rechaza la conexión: compruebe el nombre de usuario y la contraseña.',
  },
  sysDenied: {
    en: (user) =>
      `Connected, but no $SYS statistics. Add "user ${user}" then "topic read $SYS/#" to the ACL file and restart Mosquitto (sys_interval must not be 0).`,
    fr: (user) =>
      `Connecté, mais aucune statistique $SYS. Ajoutez « user ${user} » puis « topic read $SYS/# » au fichier ACL et redémarrez Mosquitto (sys_interval ne doit pas valoir 0).`,
    de: (user) =>
      `Verbunden, aber keine $SYS-Statistiken. Füge „user ${user}“ und dann „topic read $SYS/#“ zur ACL-Datei hinzu und starte Mosquitto neu (sys_interval darf nicht 0 sein).`,
    es: (user) =>
      `Conectado, pero sin estadísticas $SYS. Añada «user ${user}» y luego «topic read $SYS/#» al archivo ACL y reinicie Mosquitto (sys_interval no debe ser 0).`,
  },
  noData: {
    en: 'No statistics received from Mosquitto yet.',
    fr: 'Aucune statistique reçue de Mosquitto pour le moment.',
    de: 'Noch keine Statistiken von Mosquitto empfangen.',
    es: 'Todavía no se ha recibido ninguna estadística de Mosquitto.',
  },
  publishFailed: {
    en: 'Gladys refused the broker device: see the integration logs.',
    fr: "Gladys a refusé l'appareil du broker : consultez les journaux de l'intégration.",
    de: 'Gladys hat das Gerät des Brokers abgelehnt: Sieh dir die Protokolle der Integration an.',
    es: 'Gladys rechazó el dispositivo del broker: consulte los registros de la integración.',
  },
};

// Anonymous clients: the ACL lines placed before any `user` line apply to them.
export const SYS_DENIED_ANONYMOUS = {
  en: 'Connected, but no $SYS statistics. Add "topic read $SYS/#" at the top of the ACL file, before any "user" line, and restart Mosquitto (sys_interval must not be 0).',
  fr: 'Connecté, mais aucune statistique $SYS. Ajoutez « topic read $SYS/# » en tête du fichier ACL, avant toute ligne « user », et redémarrez Mosquitto (sys_interval ne doit pas valoir 0).',
  de: 'Verbunden, aber keine $SYS-Statistiken. Füge „topic read $SYS/#“ am Anfang der ACL-Datei ein, vor jeder „user“-Zeile, und starte Mosquitto neu (sys_interval darf nicht 0 sein).',
  es: 'Conectado, pero sin estadísticas $SYS. Añada «topic read $SYS/#» al principio del archivo ACL, antes de cualquier línea «user», y reinicie Mosquitto (sys_interval no debe ser 0).',
};

/** The ACL hint of a configuration, in the four languages (connection status). */
export function sysDeniedMessages(user) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, sysDeniedMessage(user, lang)]));
}

/** The ACL hint of a configuration, in a language. */
export function sysDeniedMessage(user, language) {
  const lang = LANGUAGES.includes(language) ? language : 'en';
  return user ? MESSAGES.sysDenied[lang](user) : SYS_DENIED_ANONYMOUS[lang];
}

// The "Check the connection" report and the scene sentence.
export const REPORT_TEXT = {
  en: {
    ok: (url, version) => `Connected to ${url} (Mosquitto ${version}).`,
    numbers: (clients, received, sent) =>
      `${clients} clients connected, ${received} messages received and ${sent} sent per minute.`,
    uptime: (duration) => `Running for ${duration}.`,
    down: (url) => `${url} cannot be reached.`,
    pending: (url) => `Still connecting to ${url}: try again in a few seconds.`,
    refused: (url) => `${url} refused the user name or the password.`,
  },
  fr: {
    ok: (url, version) => `Connecté à ${url} (Mosquitto ${version}).`,
    numbers: (clients, received, sent) =>
      `${clients} clients connectés, ${received} messages reçus et ${sent} envoyés par minute.`,
    uptime: (duration) => `En marche depuis ${duration}.`,
    down: (url) => `${url} est injoignable.`,
    pending: (url) => `Connexion à ${url} en cours : réessayez dans quelques secondes.`,
    refused: (url) => `${url} refuse le nom d'utilisateur ou le mot de passe.`,
  },
  de: {
    ok: (url, version) => `Verbunden mit ${url} (Mosquitto ${version}).`,
    numbers: (clients, received, sent) =>
      `${clients} Clients verbunden, ${received} Nachrichten empfangen und ${sent} gesendet pro Minute.`,
    uptime: (duration) => `Läuft seit ${duration}.`,
    down: (url) => `${url} ist nicht erreichbar.`,
    pending: (url) => `Verbindung mit ${url} läuft noch: Versuche es in ein paar Sekunden erneut.`,
    refused: (url) => `${url} lehnt Benutzername oder Passwort ab.`,
  },
  es: {
    ok: (url, version) => `Conectado a ${url} (Mosquitto ${version}).`,
    numbers: (clients, received, sent) =>
      `${clients} clientes conectados, ${received} mensajes recibidos y ${sent} enviados por minuto.`,
    uptime: (duration) => `En marcha desde hace ${duration}.`,
    down: (url) => `No se puede acceder a ${url}.`,
    pending: (url) => `Conectando todavía con ${url}: vuelva a intentarlo en unos segundos.`,
    refused: (url) => `${url} rechaza el nombre de usuario o la contraseña.`,
  },
};

export const SUMMARY_TEXT = {
  en: {
    up: (version, duration) => `Mosquitto ${version} has been running for ${duration}`,
    clients: (count) => `${count} clients connected`,
    messages: (received, sent) => `${received} messages received and ${sent} sent per minute`,
    unreachable: 'Mosquitto cannot be reached.',
    noData: 'No statistics from Mosquitto yet.',
  },
  fr: {
    up: (version, duration) => `Mosquitto ${version} fonctionne depuis ${duration}`,
    clients: (count) => `${count} clients connectés`,
    messages: (received, sent) => `${received} messages reçus et ${sent} envoyés par minute`,
    unreachable: 'Mosquitto est injoignable.',
    noData: 'Aucune statistique de Mosquitto pour le moment.',
  },
  de: {
    up: (version, duration) => `Mosquitto ${version} läuft seit ${duration}`,
    clients: (count) => `${count} Clients verbunden`,
    messages: (received, sent) =>
      `${received} Nachrichten empfangen und ${sent} gesendet pro Minute`,
    unreachable: 'Mosquitto ist nicht erreichbar.',
    noData: 'Noch keine Statistiken von Mosquitto.',
  },
  es: {
    up: (version, duration) => `Mosquitto ${version} lleva en marcha ${duration}`,
    clients: (count) => `${count} clientes conectados`,
    messages: (received, sent) => `${received} mensajes recibidos y ${sent} enviados por minuto`,
    unreachable: 'No se puede acceder a Mosquitto.',
    noData: 'Todavía no hay estadísticas de Mosquitto.',
  },
};

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

export const locale = (language) => LOCALES[language] ?? LOCALES.en;

/** A number with the decimal separator of the language. */
export function formatNumber(value, language, decimals = 0) {
  return new Intl.NumberFormat(locale(language), {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value);
}

/** "3 days", "5 hours", "12 minutes", "40 seconds", in the language. */
export function formatDuration(seconds, language) {
  const abs = Math.max(0, seconds);
  const [unit, value] =
    abs >= 86400
      ? ['day', Math.floor(abs / 86400)]
      : abs >= 3600
        ? ['hour', Math.floor(abs / 3600)]
        : abs >= 60
          ? ['minute', Math.floor(abs / 60)]
          : ['second', Math.floor(abs)];
  // Plain spaces: the no-break ones of some locales would surprise a message.
  return new Intl.NumberFormat(locale(language), { style: 'unit', unit, unitDisplay: 'long' })
    .format(value)
    .replace(/[\u00a0\u202f]/g, ' ');
}

/** "3 minutes ago", in the language. */
export function relativeTime(seconds, language) {
  const format = new Intl.RelativeTimeFormat(locale(language), { numeric: 'auto' });
  const abs = Math.max(0, seconds);
  if (abs < 60) {
    return format.format(-Math.round(abs), 'second');
  }
  if (abs < 3600) {
    return format.format(-Math.round(abs / 60), 'minute');
  }
  return format.format(-Math.round(abs / 3600), 'hour');
}

/**
 * The broker as one sentence: "Mosquitto 2.1.2 has been running for 3 days,
 * 12 clients connected, 64 messages received and 87 sent per minute."
 * @param {{ reachable: boolean|null, stats: object }} data
 * @param {string} language
 */
export function brokerSentence({ reachable, stats }, language) {
  const text = pick(SUMMARY_TEXT, language);
  if (reachable === false) {
    return text.unreachable;
  }
  const n = (value) => formatNumber(value, language, 0);
  const parts = [];
  if (stats.version && Number.isFinite(stats.uptimeSeconds)) {
    parts.push(text.up(stats.version, formatDuration(stats.uptimeSeconds, language)));
  }
  if (Number.isFinite(stats.clientsConnected)) {
    parts.push(text.clients(n(stats.clientsConnected)));
  }
  if (Number.isFinite(stats.messagesReceived1min) && Number.isFinite(stats.messagesSent1min)) {
    parts.push(text.messages(n(stats.messagesReceived1min), n(stats.messagesSent1min)));
  }
  if (parts.length === 0) {
    return text.noData;
  }
  const sentence = parts.join(', ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
