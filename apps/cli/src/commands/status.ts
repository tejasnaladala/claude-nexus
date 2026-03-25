export async function statusCommand(): Promise<void> {
  console.log(`\n🔮 Claude Nexus Status\n`);
  console.log(`Status command shows the state of the current nexus connection.`);
  console.log(`This requires a running agent process.`);
  console.log(`\nUse 'nexus start' to start a nexus, or 'nexus join <url>' to connect.\n`);
}
