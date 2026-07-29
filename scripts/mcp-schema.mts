/**
 * Prints the full input schema for named MCP tools.
 *   npm run mcp:schema -- ads_entity_get_report ads_insights_performance_trend
 */
import { listMetaMcpTools } from '../src/lib/mcp.js';

const token = process.env.META_ACCESS_TOKEN;
if (!token) { console.error('META_ACCESS_TOKEN is not set.'); process.exit(1); }

const wanted = process.argv.slice(2);
const tools = await listMetaMcpTools(token);

if (!wanted.length) {
  for (const t of tools) console.log(t.name);
  process.exit(0);
}

for (const name of wanted) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) { console.log(`\n### ${name} — NOT FOUND`); continue; }

  console.log(`\n### ${tool.name}`);
  console.log((tool.description ?? '').slice(0, 1200));
  console.log('--- inputSchema ---');
  console.log(JSON.stringify(tool.inputSchema, null, 2).slice(0, 6000));
}
