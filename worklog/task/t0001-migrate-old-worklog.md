+++
id = "t0001"
title = "Migrate old worklog"
status = "active"
modifies = ["s0002", "s0029", "s0030"]
+++

# Migrate old worklog

Migrate the 25 legacy specs in `worklog-old/` to the current format. Keep
behavior, limits, and legacy IDs intact while removing repetition and
non-binding design prose.

## Plan

Worklog authority: `~/Documents/GitHub/plugin-worklog/worklog/spec`.

- Keep current s01 unchanged and retain legacy IDs. Add root s29 (Package
  boundaries) and s30 (i18n catalog workflow).
- Organize specs as follows:
  - `core/`: s02–s04, s06–s09, s20, s28.
  - `filesystem/`: s19, s21, s22.
  - `gateways/`: s15–s17.
  - `integrations/`: s25, s27, s30.
  - `examples/`: s10, s12–s14.
  - `documentation/`: s18, s23.
- Redistribute old s01 into s29 and the owning application, component,
  gateway, and logging specs. Remap references by meaning.
- Split s27: keep runtime and client-safety contracts; move external/offline
  catalog workflow to s30. Resolve string/AST conflicts without inferring
  implementation status.
- Do not import body-empty s24 or reuse its ID; record the Vite specification
  gap.
- Deduplicate ownership: layout → s19; overlays → s08; confinement → s22;
  common mounts → s15; documentation categories → s23. Keep Discord's
  execution pipeline in s17.
- Preserve `UNIMPLEMENTED` requirements and behavioral limits. Move ideas to
  notes and actionable work to tasks. Omit empty sections and the old
  design-phase authority exception.
- Account for all 25 legacy specs, produce 26 target specs, and resolve
  references. Follow each target's `agent_mode`; reorganization does not
  approve behavior changes.

Legacy task/decision handling and the final `modifies` list remain to be determined.

## Working Notes

Keep normative behavior in `Behavior` and `Constraints`; trim
introductory repetition, duplicate ownership, and speculative prose. Preserve
qualified limits, `UNIMPLEMENTED` markers, examples, and references needed to
interpret the contract. Do not compress distinct requirements into vague
summary language.
