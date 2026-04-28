+++
id = "s0005"
title = "Examples"
tags = ["examples"]
paths = ["examples/**"]
+++

## Behavior

- The repository contains example project shells.
- The example project shells include a Discord chatbot example.
- The example project shells include a web server example.
- Empty example project shells do not define runtime behavior.
- The web server example may contain non-working code for designing the Peranto and Peranto Fastify APIs.
- The web server example uses non-existent `peranto` and `peranto-fastify` packages while those APIs are being designed.
- The web server example includes a counter managed by a counter component.
- The web server example stores the counter value in memory and does not persist it.
- The web server example shares one counter value across all users.
- The web server example increases the shared counter value by one when a user clicks a button.

## Constraints

- Example project shells must remain empty until behavior is explicitly specified.
- Example project shells must not assume package metadata, runtime code, prompts, routes, commands, configuration, credentials, or external service behavior unless explicitly specified.
- Non-working API design examples must not be presented as runnable examples.
- The web server counter example must keep the counter state in the counter component.

## Anticipated Changes

- The Discord chatbot example may receive specified behavior later.
- The web server example may receive specified behavior later.

## Dangers

- Adding concrete runtime behavior without explicit specification would make the examples imply unsupported behavior.
- Adding credentials, tokens, or environment-specific assumptions would make the examples unsafe to reuse.
