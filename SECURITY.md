# Security

The feedback bridge is intentionally protected by Cloudflare Access. A valid
Access identity is required before `/api/feedback` accepts a submission.

The extension origin check is an additional browser integration guard, not an
authentication boundary. Do not deploy the bridge without the Cloudflare
Access policy enabled and the webhook values supplied through an environment
file outside this repository.

To report a security issue, contact the Sligo Labs maintainers privately rather
than opening a public issue with exploit details.
