+++
id = "s0001"
title = "Meta-spec for Stelaro"
paths = ["worklog/spec/**/*.md"]
agent_mode = "read_only"
+++

# Meta-spec for Stelaro

This governs this project's specs.

## Principles

- Stelaro is an opinionated, typed component system for Node.js applications.
- Its goal is maintainability: application parts should remain understandable and changeable independently as the application grows.
- Components express their boundaries through typed call contracts, explicit dependencies, and scoped configuration.

## Public use

- The project's deliverables are the core package and its integration packages.
- Using the public APIs MUST NOT require access to this repository or its worklog.