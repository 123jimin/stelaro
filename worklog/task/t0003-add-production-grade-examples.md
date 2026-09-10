+++
id = "t0003"
title = "Add production-grade examples"
tags = ["examples", "fastify", "discord", "application"]
modifies = ["s0012", "s0014"]
status = "pending"
+++

# Add production-grade examples (NEEDS APPROVAL)

Add production-shaped Fastify and Discord examples built only from public
Stelaro APIs.

## Completion Conditions

- The Fastify example is a complete web backend and the Discord example is a
  feature-rich chatbot.
- Both demonstrate typed component calls, gateway integration, component
  logging, and validated configuration.
- Examples contain no credentials or environment-specific assumptions.
- `s0012` and `s0014` describe the approved behavior and the examples pass the
  project build, lint, and relevant tests.

## Out of Scope

- Deployment manifests, real credentials or secrets, database integrations,
  and prompt or model-provider integrations unless separately specified.
