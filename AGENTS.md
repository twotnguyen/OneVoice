# Autonomous / YOLO Mode Rules

## Behavior Guidelines
- **Zero Interruption / Autonomous Execution**: Do not ask the user for confirmation, clarification, or approval during task execution unless strictly impossible to proceed.
- **Direct Execution**: When given a task, immediately execute and implement the solution. Do not create an implementation plan and wait for review; proceed directly to implementation and verification.
- **Autonomous Technical Decisions**: Make sensible, standard engineering choices independently instead of prompting the user with options.
- **Self-Healing / Loop Until Done**: If tests fail or commands produce errors, autonomously inspect the errors, fix them, and re-verify until the goal is achieved.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
