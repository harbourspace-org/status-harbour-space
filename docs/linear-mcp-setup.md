# Connecting Linear MCP to Claude Code

Once Linear MCP is connected, Claude Code (and other MCP clients) can create, list, and update Linear issues directly — no copy-paste from `linear-issues.md`.

## Option A — Connect via the Claude.ai web app (easiest)

This is the same connector type already wired up on this machine for Figma, Asana, Atlassian, etc. Linear is on that list.

1. Go to **claude.ai** → **Settings** → **Connectors** (or **Integrations**)
2. Find **Linear** and click **Connect**
3. Sign in to Linear and authorise the connector
4. In Claude Code, restart the session (`/clear` then re-open) — the new tools appear in the deferred-tools list
5. Verify with: ask Claude "list my Linear teams"; it should call `mcp__claude_ai_Linear__list_teams` (or similar) instead of asking you to do it manually

After this, Claude Code can create the issues from `linear-issues.md` directly. Just ask: "create all the issues from linear-issues.md in the Status Page project on the HSDEV team".

## Option B — Self-hosted Linear MCP server (CLI-only)

Use this if you do not want to go through claude.ai or you want the integration to work in CI / non-interactive contexts.

1. Get a Linear API key: **linear.app** → **Settings** → **API** → **Personal API keys** → **Create key**. Scope: read + write.

2. Add the MCP server to your global Claude Code config (`~/.claude/settings.json` or via `claude mcp add`):

```bash
claude mcp add linear --scope user \
  --env LINEAR_API_KEY=lin_api_xxxxxxxxxxxx \
  -- npx -y @modelcontextprotocol/server-linear
```

If that exact server package name has changed, search for the current Linear MCP server on the [official MCP registry](https://github.com/modelcontextprotocol/servers) — Linear is community-supported and the package name has shifted historically.

3. Restart Claude Code. The Linear tools should appear when you run a session.

4. Test with: "list issues assigned to me in Linear".

## Once connected — bulk-creating the backlog

With either option in place, ask Claude:

> Create all the issues from `status-harbour-space/linear-issues.md` in Linear. Use the team that owns Platform / Infra. Group them under a new project called "Status Page (status.harbour.space)". Apply the labels and priorities listed in each issue. Set the `Blocked by` relationships as written.

Claude will then make one MCP call per issue. Review the first one before letting it run through all 25+.

## What the integration does NOT replace

- Decisions about which team owns the project (you still pick)
- Priorities and estimates if your team uses different scales
- Cycle / sprint assignments

These are easier to set in the Linear UI after the issues exist than to specify up front.
