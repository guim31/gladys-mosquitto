# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-23

### Added

- The Mosquitto broker as a Gladys device, from its `$SYS` statistics: reachable, connected clients,
  disconnected persistent clients, messages received and sent per minute, incoming and outgoing
  traffic, subscriptions, retained messages, uptime, version and memory used (when published).
- Scene triggers: broker unreachable for N minutes, broker back, broker restarted, fewer connected
  clients, message spike.
- Scene action "Broker summary": a sentence and the key numbers of the broker.
- Dashboard widget "Mosquitto broker": state, version, uptime and four live tiles.
- "Check the connection" action, and a status giving the ACL lines to add when the user cannot read
  `$SYS`.
- Read-only MQTT client: `$SYS/broker/#` only, stable client id, clean session, optional TLS.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/guim31/gladys-mosquitto/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-mosquitto/releases/tag/v1.0.0
