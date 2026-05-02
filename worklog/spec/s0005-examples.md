+++
id = "s0005"
title = "Examples"
tags = ["examples"]
paths = ["examples/**"]
+++

## Related Specs

- s0001: High-Level Architecture
- s0002: Application
- s0003: Component
- s0004: Context

## Behavior

- The repository contains example project shells.
- The example project shells include a Discord chatbot example.
- The example project shells include a web server example.
- Empty example project shells do not define runtime behavior.
- The web server example may contain non-working code for designing the Peranto and Peranto Fastify APIs.
- The web server example uses non-existent `peranto` and `peranto-fastify` packages while those APIs are being designed.
- The web server example separates application declaration from runtime creation.
- The web server example creates the application with `createApplication`.
- The web server example includes a counter managed by a counter component.
- The web server example stores the counter value in memory and does not persist it.
- The web server example shares one counter value across all users.
- The web server example increases the shared counter value by one when a user clicks a button.
- The web server example accepts a POST request that sets the shared counter value to a specific value.
- The web server example logs whenever the shared counter value is changed.
- The web server example defines component call inputs and outputs with Arktype schemas.
- The web server counter example declares component state with a state factory on the counter component.
- The web server counter example accesses state through handler context.

## Constraints

- Example project shells must remain empty until behavior is explicitly specified.
- Example project shells must not assume package metadata, runtime code, prompts, routes, commands, configuration, credentials, or external service behavior unless explicitly specified.
- Non-working API design examples must not be presented as runnable examples.
- The web server counter example must keep the counter state in the counter component.
- The web server route that sets the counter must change the value through the counter component.
- The web server counter example must log counter changes from the counter component.
- The web server example must not use non-schema placeholders for component call input and output definitions.

## Anticipated Changes

- The Discord chatbot example may receive specified behavior later.
- The web server example may receive specified behavior later.

## Dangers

- Adding concrete runtime behavior without explicit specification would make the examples imply unsupported behavior.
- Adding credentials, tokens, or environment-specific assumptions would make the examples unsafe to reuse.
