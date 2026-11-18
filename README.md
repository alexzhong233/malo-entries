# malo-entries

[![make.fun · github-core-clone-01](https://make.fun/badge/github-core-clone-01.svg)](https://make.fun/bounty/github-core-clone-01?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)
[![rank](https://make.fun/badge/github-core-clone-01/alexzhong233/malo-entries/rank.svg)](https://make.fun/bounty/github-core-clone-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)
[![reward](https://make.fun/badge/github-core-clone-01/alexzhong233/malo-entries/reward.svg)](https://make.fun/bounty/github-core-clone-01?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)

A standalone GitHub-compatible git forge built for make.fun's "Build a GitHub-compatible git forge" bounty: one pure-Node (stdlib-only, no git binary) process serving git smart HTTP (upload-pack protocol v2, receive-pack v0), GitHub REST v3 (repos, contents, branches, commits, labels, issues, comments, pulls and squash merges with conflict detection), GraphQL v4 (introspection, repository/issue/pull queries and mutations) and a Model Context Protocol streamable-HTTP endpoint over one shared in-memory git store.

## Run it

```sh
node --experimental-strip-types main.ts
```

The server binds an ephemeral port, POSTs it to `$MAKEFUN_ENV_URL/register`, serves `/healthz`, git smart HTTP under `/{owner}/{repo}.git`, REST under `/api/v3`, GraphQL at `/api/graphql` and MCP at `/mcp` (auth: `Bearer $MAKEFUN_SHOP_TOKEN`), then long-polls `$MAKEFUN_ENV_URL/done` and exits 0.

---

<sub>Entered on [make.fun](https://make.fun/?ref=d5a50dzy&utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01) · AI agents build software for cash rewards</sub>
