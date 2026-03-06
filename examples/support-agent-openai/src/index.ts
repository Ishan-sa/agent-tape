import {
  createRunRecorderFromEnv,
  wrapOpenAIClient,
  wrapTools,
  type OpenAIRequest,
  type OpenAIResponse,
  type OpenAIStyleClient,
  type OpenAIToolCall,
} from "@agenttape/adapter-openai";
import type { JsonValue } from "@agenttape/core";

interface ToolOutput {
  tool_call_id: string;
  name: string;
  result: JsonValue;
}

function asObject(value: JsonValue): Record<string, JsonValue> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, JsonValue>;
  }
  throw new Error("Expected object arguments");
}

function createMockOpenAIClient(): OpenAIStyleClient {
  return {
    responses: {
      async create(request: OpenAIRequest): Promise<OpenAIResponse> {
        const toolOutputs = request.tool_outputs as ToolOutput[] | undefined;

        if (toolOutputs && toolOutputs.length > 0) {
          const docResult = toolOutputs.find((output) => output.name === "search_docs")?.result;
          const pricingResult = toolOutputs.find((output) => output.name === "lookup_pricing")?.result;

          const docSummary =
            typeof docResult === "string" ? docResult : JSON.stringify(docResult ?? "No docs found");
          const pricingSummary =
            typeof pricingResult === "string"
              ? pricingResult
              : JSON.stringify(pricingResult ?? "No pricing found");

          return {
            id: "mock-response-2",
            output_text: `Support answer: ${docSummary}. Pricing: ${pricingSummary}.`,
            tool_calls: [],
          };
        }

        const toolCalls: OpenAIToolCall[] = [
          {
            id: "tool-call-1",
            name: "search_docs",
            arguments: {
              query:
                typeof request.input === "string"
                  ? request.input
                  : JSON.stringify(request.input),
            },
          },
          {
            id: "tool-call-2",
            name: "lookup_pricing",
            arguments: {
              plan: "pro",
            },
          },
        ];

        return {
          id: "mock-response-1",
          output_text: "",
          tool_calls: toolCalls,
        };
      },
    },
  };
}

async function main(): Promise<void> {
  const userQuery =
    process.argv.slice(2).join(" ") || "What does AgentTape do and how much does the Pro plan cost?";

  const recorder = await createRunRecorderFromEnv();

  const tools = wrapTools(
    {
      search_docs: async (args: JsonValue): Promise<JsonValue> => {
        const params = asObject(args);
        const query = typeof params.query === "string" ? params.query : "";

        if (query.toLowerCase().includes("agenttape")) {
          return "AgentTape records, replays, and diffs tool-using agent runs.";
        }

        return "No matching internal docs.";
      },
      lookup_pricing: async (args: JsonValue): Promise<JsonValue> => {
        const params = asObject(args);
        const plan = typeof params.plan === "string" ? params.plan : "free";

        const pricingTable: Record<string, string> = {
          free: "$0/month",
          pro: "$49/month",
          enterprise: "Contact sales",
        };

        return {
          plan,
          price: pricingTable[plan.toLowerCase()] ?? "Unknown",
        };
      },
    },
    recorder,
  );

  const client = wrapOpenAIClient(createMockOpenAIClient(), recorder);

  try {
    const firstResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: userQuery,
      tools: [
        {
          type: "function",
          name: "search_docs",
        },
        {
          type: "function",
          name: "lookup_pricing",
        },
      ],
    });

    const toolOutputs: ToolOutput[] = [];
    for (const toolCall of firstResponse.tool_calls ?? []) {
      const tool = tools[toolCall.name as keyof typeof tools];
      if (!tool) {
        throw new Error(`Unknown tool requested by model: ${toolCall.name}`);
      }
      const result = await tool(toolCall.arguments, { callId: toolCall.id });
      toolOutputs.push({
        tool_call_id: toolCall.id,
        name: toolCall.name,
        result,
      });
    }

    const finalResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: userQuery,
      tool_outputs: toolOutputs,
    });

    const answer = finalResponse.output_text ?? "No answer generated.";
    console.log(answer);

    await recorder.record("run_completed", {
      answer,
      toolCallCount: toolOutputs.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recorder.record("run_failed", {
      error: message,
    });
    throw error;
  } finally {
    await recorder.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
