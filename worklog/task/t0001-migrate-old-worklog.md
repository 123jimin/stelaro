+++
id = "t0001"
title = "Migrate old worklog"
status = "pending"
modifies = []
+++

# Migrate old worklog

Migrate `worklog-old/` to the current worklog format.

## Plan

Worklog authority: `~/Documents/GitHub/plugin-worklog/worklog/spec`.

- Keep current s01 unchanged and retain legacy IDs. After importing retained specs, add root s29 (Package boundaries) and s30 (i18n catalog workflow).
- Organize:
  - `core/`: s02–s04, s06–s09, s20, s28.
  - `filesystem/`: s19, s21, s22.
  - `gateways/`: s15–s17.
  - `integrations/`: s25, s27, s30.
  - `examples/`: s10, s12–s14.
  - `documentation/`: s18, s23.
- Redistribute old s01 into s29 and the owning application, component, gateway, and logging specs. Remap every old s01 reference by meaning.
- Split s27: retain runtime contracts and client-safety constraints; move external/offline catalog workflow to s30. Resolve conflicting strings/AST claims without inferring implementation status.
- Do not import body-empty s24 or repurpose its ID; record the Vite specification gap.
- Deduplicate ownership: layout → s19; overlays → s08; confinement and its limits → s22; common mounts → s15; documentation categories → s23. Keep Discord's execution pipeline together in s17.
- Preserve `UNIMPLEMENTED` requirements and behavioral limits. Move non-binding ideas to notes and actionable work to tasks; omit empty sections and the old design-phase authority exception.
- Check all 25 legacy files are accounted for, with 26 target specs and resolved references. Follow each target's `agent_mode`; reorganization does not approve changed behavior.

Legacy task/decision handling and the final `modifies` list remain to be determined.
