when working in typescript:

- when adding a package to a project add it with an install command, instead of manually editing the package json
- run check/format/lint commands when your done making a change. if they don't exist, suggest making them for the project you're in
- avoid explicit return types unless absolutely needed
- `as any` should be an absolute last resort. always use real type safety. lean on type inference instead of manually writing new types over and over again
- parse, don't validate: turn unknown/loose input into precise types at the boundary, then pass the parsed type around instead of re-checking it everywhere
- make illegal states unrepresentable where practical. prefer types/data structures that encode invariants over boolean validation helpers
