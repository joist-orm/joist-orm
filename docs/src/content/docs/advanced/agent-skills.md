---
title: Agent Skills
description: Auto-shipped Agent Skills that teach coding agents how to use Joist
sidebar:
  order: 17
---

Joist ships several [Agent Skills](https://agentskills.io) to help coding agents write idiomatic Joist code.

A "skill" is just a directory with a `SKILL.md` file (YAML frontmatter plus a
markdown body) that the agent discovers and loads on demand when it detects a
relevant task.

## Enabling

Skills are enabled by default: running `joist-codegen` will, as part of the normal codegen cycle, also install the latest skills bundled in the `joist-orm` artifact to `.claude/skills` and `.agents/skills`:

```
.claude/skills/
  joist-em-basics/SKILL.md
  joist-upsert/SKILL.md
.agents/skills/
  joist-em-basics/SKILL.md
  joist-upsert/SKILL.md
```

We write both directories because different agents scan different locations:

- `.claude/skills/` is read by **Claude Code** (and opencode)
- `.agents/skills/` is read by **Codex** (and opencode)

So together they give native coverage across all three tools.

:::tip

If you want to disable skills, you can set `skills: false` in your `joist-codegen.json`:

```json
{
  "skills": true
}
```

:::

## Keeping them up to date

The installed `SKILL.md` files are **framework-owned**: `joist-codegen` overwrites them on every run so they stay in sync with your installed version of Joist.

Don't hand-edit the generated `SKILL.md` files — re-run codegen instead.

If you have suggestions of how to improve the skills, PRs to improve them would be great!

:::note

If you author your own project-specific skills, put them in separate
directories (i.e. not prefixed with `joist-`) so they aren't overwritten by
codegen.

:::
