# Mosquitto for Gladys Assistant

The health of your [Eclipse Mosquitto](https://mosquitto.org) MQTT broker in
[Gladys Assistant](https://gladysassistant.com): connected clients, message rates, traffic,
subscriptions, uptime, version and outages, read from the statistics Mosquitto publishes on its
`$SYS` topics.

Gladys's own **MQTT** service connects to a broker to drive devices (including the Home Assistant
discovery format), but shows no statistics of the broker itself: this integration fills that gap. It
can watch the broker installed by Gladys (its credentials are on the MQTT page of Gladys) as well as
any other Mosquitto.

## Features

- **One device per broker**: Reachable, connected clients, disconnected persistent clients, messages
  received and sent per minute, incoming and outgoing traffic (B/s), subscriptions, retained
  messages, uptime (days), version (text), memory used. A feature is only created when Mosquitto
  publishes its topic (1.6 has no memory figure).
- **Scene triggers**: broker unreachable for N minutes, broker back, broker restarted (uptime back to
  zero), fewer connected clients than N for a minute, message spike above N per minute.
- **Scene action** "Broker summary": a ready-made sentence and the key numbers.
- **Dashboard widget**: the state, version and uptime of the broker, and four live tiles.
- **Configuration action** "Check the connection", and a clear status when the ACL does not let the
  user read `$SYS`, with the exact lines to add.
- Read-only: subscribes to `$SYS/broker/#` only, never publishes. Stable client id (kept in
  `/data`), clean session, optional TLS (`mqtts://`, self-signed certificates on request).
- English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1 or later.
- Mosquitto 1.6 or later (tested against 2.1.2 and 1.6.15), with `sys_interval` not set to 0.
- A user allowed to read `$SYS` (`topic read $SYS/#` in the ACL file), or anonymous access.

## Installation

In Gladys: **Integrations → Install from GitHub**, with this repository's URL
(`https://github.com/guim31/gladys-mosquitto`), or from the store once published. Enter the broker
address and credentials in the Configuration tab, click **Check the connection**, then add the
broker from the Discovery tab. The user documentation is in [`docs/`](docs/en.md) (English, French,
German, Spanish).

## Limitations

- One broker per installation.
- Mosquitto only: other brokers publish different `$SYS` topics, or none.
- The rates are Mosquitto's own moving averages; states reach Gladys at most every 30 seconds
  (Reachable at once).

## Development

Node.js 22+, ESM, no build step. Runtime dependencies:
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js) and
[`mqtt`](https://github.com/mqttjs/MQTT.js) (MIT).

```bash
npm install
npm test              # node --test, on the SDK's fake Gladys and a fake broker replaying real $SYS captures
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
```

```
index.js                  SDK wiring (src/app.js registers the handlers)
src/app.js                handlers: discovery, action, scene action, widget, configuration
src/hub.js                link state, statistics, throttled states, scene events, clock
src/devices.js            the broker device, its features and states
src/triggers.js           outages, restarts, clients thresholds, message spikes
src/scenes.js             "Broker summary" scene action
src/widgets.js            "Mosquitto broker" dashboard widget
src/i18n.js               every text, in en/fr/de/es
src/clientId.js           stable MQTT client id, kept in /data
src/mosquitto/sys.js      $SYS topics -> statistics
src/mosquitto/client.js   MQTT client: link states, ACL denial (credentials never logged)
test/                     node --test; real captures in test/fixtures/sys/
```

`test/gladys-rules.test.js` checks every discovered device against the category/type table
extracted from the Gladys core.

To run the integration outside Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="mosquitto" \
DATA_DIR=./data \
npm start
```

Releases are made by the **Release** workflow (Actions → Release); never edit the versions by
hand. A hand-pushed `vX.Y.Z` tag also builds the image and the GitHub Release, but then `version`
in `package.json` and in the manifest (with the `docker_image` tag) must be bumped and committed
before tagging. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Eclipse Mosquitto](https://github.com/eclipse-mosquitto/mosquitto) by Roger Light and
  contributors (EPL-2.0 / EDL-1.0): the `$SYS` topics, documented in
  [mosquitto(8)](https://mosquitto.org/man/mosquitto-8.html). The fixtures are captures of the
  official `eclipse-mosquitto` images; no code of Mosquitto is included.
- Cover: the official Mosquitto logo (`logo/mosquitto-text-side.svg` of the Mosquitto repository,
  EPL-2.0 / EDL-1.0), its text in white on the brand's navy blue.
- [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the Eclipse Foundation or the
Mosquitto project. "Eclipse Mosquitto" is a trademark of the Eclipse Foundation.

## License

[Apache-2.0](LICENSE)
