# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the third-party services and devices the integration talks to.

What the integration handles:

- **Secrets**: the MQTT user name and password, kept by Gladys in the integration configuration
  (the password in a `secret` field, never sent back to the browser). They go in the connection
  options of the MQTT client, never in a logged address; credentials typed in the broker URL are
  removed from it before any log or message.
- **`/data`**: only `client-id`, the MQTT client id drawn at the first start
  (`gladys-mosquitto-` and eight hexadecimal characters). No statistics are stored.
- **Network**: one outbound MQTT connection (TCP, TLS or WebSocket) to the configured broker. The
  client subscribes to `$SYS/broker/#` only and never publishes. With "Accept a self-signed
  certificate", the certificate of the broker is not checked: use it on your own network only.
