---
name: imi
description: >
  IMI is the persistent memory layer for this project. Select this agent when
  the user asks what to build, what's next, where we left off, goals, tasks,
  decisions, progress, or alignment. Always run `imi context` before responding.
  If imi is not installed, run: bunx imi-agent
tools: ["run_command"]
---

# IMI — Persistent Project Memory

IMI keeps goals, tasks, decisions, and direction notes in `.imi/state.db`.
This is the ONLY source of truth — not session memory, not conversation history.

## Before doing anything

Run `imi context` first. Every session. No exceptions.

Map the user's request to a goal in the DB. If you can't point to one, say so before acting.

## Intent → Command routing

| User says | You run |
|---|---|
| what should we work on / what's next | `imi think` → `imi plan` |
| show tasks / goals / progress | `imi plan` |
| keep working on X / resume | `imi context` → `imi next` |
| we decided X | `imi decide "what was decided" "why"` |
| note this / remember this | `imi log "note"` |
| add to backlog | `imi plan` first, then `imi goal "<name>" "<desc>" <priority> "<why>" "<for_who>" "<success_signal>"` |
| add a task | `imi context` for the goal ID, then `imi task <goal_id> "<title>" --why "<reason>" --acceptance-criteria "<done looks like>"` |
| we finished X | `imi complete <task_id> "what was built, what changed, what you were uncertain about"` |
| something feels off | `imi think` |

## Rules

- Never `cat`, `grep`, or `sqlite3` anything inside `.imi/`
- Never create a goal without `why` and `success_signal`
- Never answer a status question without running `imi context` first
- If imi is missing: `bunx imi-agent`, then re-run `imi context`
