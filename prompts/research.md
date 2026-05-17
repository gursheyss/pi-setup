---
description: Run holistic multi-step technical research using repo examples, web sources, and API/source inspection
argument-hint: "<topic>"
---

Research: $ARGUMENTS

Use a holistic, evidence-driven research workflow. Do not stop after collecting links; compare sources, verify claims, and synthesize a practical recommendation.

## 1. Clarify the target

First, restate the research question and infer:
- the concrete problem being solved
- relevant libraries/frameworks/platforms
- constraints or assumptions to verify
- what evidence would change the recommendation

Ask a clarifying question only if the topic is too ambiguous to research well. Otherwise proceed.

## 2. Repository examples

Use grep/GitHub code search tools to find real-world implementations.

Focus on:
- production-looking repositories over toy examples
- multiple independent implementations
- common patterns and repeated idioms
- edge cases, error handling, testing, and configuration
- abandoned or outdated patterns to avoid

For each strong example, note:
- repo/file reference
- relevant code shape or API usage
- why it is useful evidence

## 3. Web/docs/blogs/discussions

Use parallel web search for official docs, blog posts, issue threads, discussions, changelogs, and tweets/posts when relevant.

Prioritize:
- official documentation and source-owned examples
- maintainer comments and changelogs
- recent articles for fast-moving APIs
- community writeups only when they explain tradeoffs or failures

Distinguish facts from opinions. Track URLs for citation.

## 4. API and source inspection

Inspect actual source, type definitions, function signatures, and package examples when possible.

Verify:
- current API names and signatures
- required/optional parameters
- lifecycle constraints
- version-specific behavior
- error modes and edge cases
- whether docs/examples match source reality

Do not rely only on blog posts if source or types are available.

## 5. Synthesis

Combine the evidence into a concise research report with this structure:

### Summary
A short answer with the recommended direction.

### Recommendation
The approach you would use and why.

### Evidence
Grouped findings from:
- repository examples
- official docs/source/API inspection
- blogs/discussions/community sources

Include links or repo references.

### Alternatives and tradeoffs
Compare viable options and when each is appropriate.

### Pitfalls
Important mistakes, outdated advice, version differences, or operational risks.

### Implementation guidance
Concrete next steps, API calls, code shape, or migration strategy if applicable.

### Open questions
Only include unresolved questions that materially affect the decision.
