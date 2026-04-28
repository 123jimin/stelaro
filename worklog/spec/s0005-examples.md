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

## Constraints

- Example project shells must remain empty until behavior is explicitly specified.
- Example project shells must not assume package metadata, runtime code, prompts, routes, commands, configuration, credentials, or external service behavior unless explicitly specified.

## Anticipated Changes

- The Discord chatbot example may receive specified behavior later.
- The web server example may receive specified behavior later.

## Dangers

- Adding concrete runtime behavior without explicit specification would make the examples imply unsupported behavior.
- Adding credentials, tokens, or environment-specific assumptions would make the examples unsafe to reuse.
