import { runAgentTests } from "@agenttape/test-runner";

export interface CliTestOptions {
  updateBaseline: boolean;
}

export async function runTests(options: CliTestOptions): Promise<number> {
  console.log("Running AgentTape tests\n");

  const summary = await runAgentTests({
    updateBaseline: options.updateBaseline,
  });

  for (const result of summary.results) {
    if (result.pass) {
      const suffix = result.reason ? ` (${result.reason})` : "";
      console.log(`✓ ${result.name}${suffix}`);
      continue;
    }

    console.log(`✗ ${result.name}`);
    if (result.reason) {
      console.log("\nFailure:");
      console.log(result.reason);
      console.log("");
    }
  }

  console.log(`Passed: ${summary.passed}/${summary.total}`);

  return summary.failed > 0 ? 1 : 0;
}
