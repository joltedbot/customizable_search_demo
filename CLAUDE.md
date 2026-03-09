# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Template:** Before first use, fill in [Build Commands](#build-commands) and [Architecture Overview](#architecture-overview).

## Table of Contents
1. [Critical Rules](#critical-rules)
2. [RPI Framework](#rpi-framework-research--plan--implement)
3. [Build Commands](#build-commands)
4. [Architecture Overview](#architecture-overview)
5. [Testing Guidelines](#testing-guidelines)
6. [Code Style Guidelines](#code-style-guidelines)
7. [Communication Style](#communication-style)
8. [General Guidelines](#general-guidelines)

## Critical Rules

**Uncommitted Changes Check — Session Start:**
- **ALWAYS run `git status` as the very first action at the start of every session**
- If there are uncommitted changes (modified, staged, or new untracked source files):
  - **STOP — do not modify, create, or delete any files**
  - Show the affected files and warn: "There are uncommitted changes. Making edits now risks losing work done since the last commit."
  - Ask: "How would you like to handle this before I proceed? (e.g., commit, stash, discard, or confirm it is safe to continue)"
  - **Do not make any file changes until the user explicitly confirms**

**Unexpected File Changes — Mid-Session Detection:**
- If you detect changes to files you did not make in the current session:
  - **STOP immediately — do not make any further changes**
  - **Do NOT attempt to fix, roll back, stash, drop, reset, or otherwise "correct" this** — any automated correction risks overwriting the user's work
  - Inform the user which files changed and that concurrent human and agent edits can cause conflicts
  - Ask: "Did you make these changes? How would you like to proceed?"
  - **Wait for explicit instructions before taking any further action**

## RPI Framework: Research → Plan → Implement

For non-trivial changes, follow this three-phase approach with explicit user approval at each phase boundary. Each STOP is a hard gate — do not proceed without explicit user approval.

**Requires RPI:** Architecture changes, multi-file refactors, new features, complex bug fixes
**Skip RPI:** Typo fixes, single-line edits, formatting changes, simple corrections

Track each RPI project in a single `.md` file stored in `.claude/plans/` within the repo. Use a descriptive filename (e.g., `setup-md-plan.md`). The file should have three sections corresponding to the phases below, plus a **Phase Status** block at the bottom showing which phases are complete and whether implementation is pending/in-progress.

### Phase 1: Research (What should be done)
- Understand the request and analyze current codebase state
- Ask clarifying questions iteratively to define scope and desired outcomes
- Document key decisions, constraints, and critical context for later phases
- **STOP:** Present research findings and get user confirmation before proceeding to Plan

### Phase 2: Plan (How should it be done)
- Design implementation approach based on Research phase findings
- Break down work into discrete, validatable stages
- Collaborate with user to refine plan where helpful
- Self-review holistically — does it achieve the goal? Are there issues?
- Document the complete plan with stage-by-stage breakdown
- **STOP:** Get explicit user approval before proceeding to Implement

### Phase 3: Implement (Execute the plan)
- **STOP FIRST:** Get explicit user approval to START work
- Follow all standing instructions including the three-strikes rule
- Execute plan in stages; validate success after EACH stage
- If major deviations from plan are needed:
  - STOP implementation immediately
  - Analyze impact on overall plan, revise the plan document
  - Get user approval before continuing
- Perform final validation and testing after all stages complete
- Document what was implemented and any deviations from plan

### Implementation Verification
- **Always ask for explicit confirmation before implementing code changes**
- After clarifying questions are answered, ask: "Should I proceed with the implementation?"
- Wait for explicit confirmation before writing any code
- For non-RPI changes, the same applies — confirm approach before writing code

### Three-Strike Rule
When changes result in compilation errors, test failures, or other blocking issues:
1. **First attempt**: Try a straightforward fix
2. **Second attempt**: Try one alternative approach
3. **Third attempt**: Try one more focused solution
4. **After three failures**: STOP, revert changes, reassess, and ask the user how to proceed

## Build Commands

<!-- TODO: Add commands for build, lint, test, and how to run a single test. Example:
- Build: `npm run build`
- Test: `npm test`
- Single test: `npm test -- --testNamePattern="test name"`
- Lint: `npm run lint`
-->

## Architecture Overview

<!-- TODO: Describe the high-level architecture — key layers, data flow, and non-obvious design decisions that require reading multiple files to understand. Omit what can be easily discovered by browsing files. -->

## Testing Guidelines

<!-- TODO: Add project-specific testing approach — what to test, what not to test, how to structure tests, and any testing frameworks or conventions in use. -->


## Code Style Guidelines

<!-- TODO: Add project-specific conventions — naming patterns, formatting rules, patterns to avoid, etc. -->


## Communication Style

- **Concise over exhaustive** — Brief, clear answers; offer to elaborate if needed
- **Design questions**: 2-3 options with 1-2 sentence pros/cons, clear recommendation, ask if more detail needed
- **Implementation**: Step-by-step plans when requested; focus on what and why, not full code blocks unless asked
- **No redundancy**: Reference earlier points rather than restating
- **Scale to scope**: Simple questions get simple answers; complex tasks get detailed plans

## General Guidelines

- Prefer simple, idiomatic solutions
- Ask questions when knowledge of intent improves the solution
- Ask before adding new dependencies
- If architecture makes a solution complex, discuss changes rather than working around issues
- Recommend refactoring separately when found code isn't part of the current task
- If a solution fails multiple times, stop and ask for input
