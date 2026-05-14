my pi setup

config
- gpt 5.5
- low reasoning
- openai-codex provider
- aura-dark theme
- ctrl+enter sends follow up messages

mcps
- grep for github code search
- cloudflare for cloudflare api access
- planetscale for database mcp access
- axiom for logs / datasets
- sentry for error tracking

extensions
- [@parallel-web/pi-extension](https://www.npmjs.com/package/@parallel-web/pi-extension): most effective web search ive found
- [pi-better-openai](https://www.npmjs.com/package/pi-better-openai): better openai/codex models, usage, and image generation
- [pi-mcp-adapter](https://www.npmjs.com/package/pi-mcp-adapter): self explanatory
- [pi-goal](https://www.npmjs.com/package/pi-goal): implementation of codex's /goal
- [@plannotator/pi-extension](https://www.npmjs.com/package/@plannotator/pi-extension): planning annotations, also nice for reviewing
- [pi-session-search](https://www.npmjs.com/package/pi-session-search): searching past sessions
- code-pride: reminds the agent to reread edited code before finishing
- label-tool: automatically names sessions from the first prompt
- no-sed-edit: blocks sed file edits so the agent uses the edit tool instead
- pi-docs: adds my pi docs paths, cwd, and date to the prompt
- read-fully: reminds the agent to read files after searching
