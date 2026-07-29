/**
 * Probes the live Meta Ads MCP server with a real token: runs the handshake, lists
 * the tools your account actually has, and optionally calls one.
 *
 *   npm run mcp:probe                       # handshake + tools/list
 *   npm run mcp:probe -- <tool> '<json>'    # tools/call
 *
 * Reads META_ACCESS_TOKEN from .env.local. Meta's published tool list is unreliable
 * (their docs pages currently 500, and tools roll out per account), so the server's
 * own tools/list is the only trustworthy source.
 */
import {
  META_MCP_URL,
  McpError,
  callMetaMcpTool,
  listMetaMcpTools,
  mcpResultToText,
} from '../src/lib/mcp.js';

const token = process.env.META_ACCESS_TOKEN;

if (!token) {
  console.error('META_ACCESS_TOKEN is not set in .env.local.');
  process.exit(1);
}

console.log(`Endpoint: ${META_MCP_URL}`);
console.log(`Token:    ${token.slice(0, 6)}…${token.slice(-4)} (${token.length} chars)\n`);

try {
  const tools = await listMetaMcpTools(token);

  console.log(`Handshake OK. ${tools.length} tool(s) available:\n`);
  for (const tool of tools) {
    console.log(`  ${tool.name}`);
    if (tool.description) console.log(`      ${tool.description.slice(0, 160)}`);
  }

  const [, , toolName, toolArgs] = process.argv;

  if (toolName) {
    console.log(`\nCalling ${toolName} ...`);
    const result = await callMetaMcpTool(token, toolName, toolArgs ? JSON.parse(toolArgs) : {});
    console.log(mcpResultToText(result).slice(0, 4000));
  } else if (tools.length) {
    console.log('\nInspect one with:  npm run mcp:probe -- <tool-name> \'{"arg":"value"}\'');
    console.log('\nFull schema of the first tool:');
    console.log(JSON.stringify(tools[0], null, 2).slice(0, 2000));
  }
} catch (error) {
  if (error instanceof McpError) {
    console.error(`\nFAILED (HTTP ${error.status}): ${error.message}`);
    if (error.status === 401) console.error('  -> No credential presented. Is the token empty?');
    if (error.status === 403) {
      console.error('  -> Token rejected. Check that the app has the');
      console.error('     "Create & manage ads with ads MCP server" use case enabled,');
      console.error('     and that the token carries ads_mcp_management + ads_read.');
    }
  } else {
    console.error('\nFAILED:', error);
  }
  process.exit(1);
}
