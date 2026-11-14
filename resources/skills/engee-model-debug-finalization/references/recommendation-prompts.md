# Recommendation Prompts

Use these prompts when writing `.skill_drafts/debug-skill-recommendations-YYYY-MM-DD.md`.

## Diagnose Inefficiency

- Which repeated actions consumed the most time?
- Which tool calls generated low-value context?
- Which scripts were rewritten instead of reused?
- Which model operations rebuilt too much state?
- Which logs were too verbose for the decision being made?

## Convert R&D Into Reusable Process

- What did the session teach about model debugging?
- What did the session teach about block discovery?
- What did the session teach about API calls and runtime state?
- What did the session teach about checkpoint naming?
- What should be a patch workflow rather than a rebuild workflow?

## Decide Skill vs Script vs Convention

Use a skill when:

- the process requires judgment;
- several tools must be coordinated;
- the agent must preserve context carefully;
- the workflow should generalize across projects.

Use a script when:

- the operation is deterministic;
- the same code would be rewritten often;
- validation can be automated.

Use a project convention when:

- the rule is simple;
- no automation is needed;
- the convention mainly guides naming or folder layout.

## Recommended Output Sections

```markdown
# Debug Skill Recommendations YYYY-MM-DD

## Friction Observed

## Reusable Patterns

## Candidate Skills

## Candidate Scripts

## Project Conventions

## Next Experiment To Improve Workflow
```

## Model-Debugging Specific Questions

- Should the next iteration patch an open checkpoint instead of rebuilding?
- What checkpoint should never be overwritten?
- What simulation ladder should be used?
- What metrics decide pass/fail?
- What runtime state must be treated as unreliable after interruption?
- What should be logged minimally to answer the hypothesis?

