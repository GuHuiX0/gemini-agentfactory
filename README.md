# Gemini AgentFactory Agents

A reusable set of Gemini CLI subagents for an artifact-first software engineering workflow.

## Agents

- `specifier`: turns product requests into testable specifications.
- `coder`: implements an accepted specification.
- `test-designer`: independently derives behavioral unit tests.
- `cleaner`: refactors production code while preserving behavior.
- `hardener`: strengthens tests against meaningful surviving mutants.
- `qa`: verifies user-visible flows with end-to-end tests.

## Install

Copy the Markdown files into your Gemini CLI global agents directory:

```powershell
New-Item -ItemType Directory -Force "$HOME/.gemini/agents"
Copy-Item *.md "$HOME/.gemini/agents/"
```

Gemini CLI loads user-level agents from `~/.gemini/agents/*.md`. These prompts define role boundaries, but prompt rules alone are not a security sandbox; use tool policies or filesystem isolation when strict write permissions are required.
