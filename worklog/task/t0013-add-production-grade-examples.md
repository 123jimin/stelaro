+++
id = "t0013"
title = "Add production-grade examples"
status = "pending"
tags = ["examples", "fastify", "discord", "application"]
modifies = ["s0005"]
blocked_by = ["t0009", "t0010"]
+++

## Scope

- Add one full web server backend example built from public Peranto APIs.
- Add one rich Discord chatbot example built from public Peranto APIs.
- Ensure examples demonstrate typed component calls, gateway integration, logging, and validated configuration.
- Keep examples free of credentials and environment-specific assumptions.
- Update the examples spec with approved behavior.

## Out of Scope

- Production deployment manifests.
- Real service credentials, tokens, or secrets.
- Database integrations unless separately specified.
- Prompt or model-provider integrations unless separately specified.

## Dependencies

- Depends on `t0007` for component-scoped logging.
- Depends on `t0008` for validated configuration.
- Depends on `t0009` for the Fastify gateway package.
- Depends on `t0010` for the Discord gateway package.
