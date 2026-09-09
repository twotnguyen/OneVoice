# Autonomous / YOLO Mode Rules

## Behavior Guidelines
- **Zero Interruption / Autonomous Execution**: Do not ask the user for confirmation, clarification, or approval during task execution unless strictly impossible to proceed.
- **Direct Execution**: When given a task, immediately execute and implement the solution. Do not create an implementation plan and wait for review; proceed directly to implementation and verification.
- **Autonomous Technical Decisions**: Make sensible, standard engineering choices independently instead of prompting the user with options.
- **Self-Healing / Loop Until Done**: If tests fail or commands produce errors, autonomously inspect the errors, fix them, and re-verify until the goal is achieved.
