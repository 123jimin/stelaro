+++
id = "t0011"
title = "Implement resources and templates"
status = "pending"
tags = ["component", "context", "resources", "templates"]
modifies = ["s0001", "s0003", "s0004", "s0012", "s0014"]
blocked_by = []
+++

## Scope

- Define approved component-owned resources and templates behavior.
- Specify how prompts, views, message templates, and similar reusable assets are declared.
- Specify how behavior receives or resolves resources and templates through context.
- Implement the approved core resources and templates behavior.
- Update web and Discord examples where resources or templates make the public API clearer.
- Update affected specs with approved behavior.

## Out of Scope

- Specific prompt engineering behavior.
- Template engine selection unless explicitly approved.
- Remote resource storage.
- Hot Module Replacement of resources and templates.

## Dependencies

- Depends on `t0008` for validated configuration boundaries.
