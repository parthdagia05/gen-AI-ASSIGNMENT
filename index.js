import "dotenv/config";
import readline from "readline";
import Groq from "groq-sdk";
import { SYSTEM_PROMPT } from "./prompt.js";
import { toolMap } from "./tools.js";

if (!process.env.GROQ_API_KEY) {
  console.error("\nGROQ_API_KEY is not set. Add it to your .env file.\n");
  process.exit(1);
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

function parseAgentResponse(raw) {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  white: "\x1b[37m",
};

function printStep(step, content, extra = "") {
  const labels = {
    START: `${C.cyan}${C.bold}[START]${C.reset}`,
    THINK: `${C.yellow}${C.bold}[THINKING]${C.reset}`,
    TOOL: `${C.magenta}${C.bold}[TOOL CALL]${C.reset}`,
    OBSERVE: `${C.blue}${C.bold}[OBSERVING]${C.reset}`,
    OUTPUT: `${C.green}${C.bold}[OUTPUT]${C.reset}`,
  };

  const label = labels[step] || `${C.white}[${step}]${C.reset}`;
  const extraStr = extra ? ` ${C.dim}> ${extra}${C.reset}` : "";
  console.log(`\n${label}${extraStr}`);

  const safeContent = content || "";
  const display =
    safeContent.length > 600
      ? safeContent.slice(0, 600) + "  ...(truncated)"
      : safeContent;
  console.log(`${C.dim}${display}${C.reset}`);
}

async function runAgentLoop(userMessage) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let iteration = 0;
  const MAX_ITERATIONS = 30;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    let rawText;
    let retries = 0;
    const MAX_RETRIES = 3;

    while (retries <= MAX_RETRIES) {
      try {
        const completion = await groq.chat.completions.create({
          model: MODEL,
          messages,
          temperature: 0.7,
          max_tokens: 8192,
          response_format: { type: "json_object" },
        });
        rawText = completion.choices[0]?.message?.content ?? "";
        break;
      } catch (apiErr) {
        const status = apiErr.status || apiErr.response?.status;
        const isRateLimit =
          status === 429 ||
          apiErr.message?.includes("429") ||
          apiErr.message?.toLowerCase().includes("rate limit");

        if (isRateLimit && retries < MAX_RETRIES) {
          retries++;
          const delayMs = 15000 * retries;
          console.warn(
            `\n${C.yellow}Rate limit hit. Retrying in ${(delayMs / 1000).toFixed(0)}s (Attempt ${retries}/${MAX_RETRIES})...${C.reset}`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        console.error(`\n${C.red}Groq API error: ${apiErr.message}${C.reset}`);
        return;
      }
    }

    const parsed = parseAgentResponse(rawText);

    if (!parsed || !parsed.step) {
      console.error(
        `\n${C.red}Could not parse agent response (iteration ${iteration}).${C.reset}`
      );
      console.error(`${C.dim}Raw response:\n${rawText.slice(0, 400)}${C.reset}`);

      messages.push({ role: "assistant", content: rawText });
      messages.push({
        role: "user",
        content:
          "Your last response was not valid JSON. " +
          "You MUST respond with a single JSON object matching the schema: " +
          '{ "step": "THINK|TOOL|OBSERVE|OUTPUT", "content": "..." }. ' +
          "Try again.",
      });
      continue;
    }

    const { step, content, tool_name, tool_args } = parsed;

    printStep(step, content, tool_name || "");

    messages.push({ role: "assistant", content: rawText });

    if (step === "OUTPUT") {
      console.log(`\n${C.green}${C.bold}Agent completed the task.${C.reset}\n`);
      break;
    }

    if (step === "TOOL") {
      if (!tool_name || !toolMap[tool_name]) {
        const errMsg = `Unknown tool: "${tool_name}". Available: ${Object.keys(toolMap).join(", ")}`;
        console.error(`\n${C.red}${errMsg}${C.reset}`);
        messages.push({
          role: "user",
          content: JSON.stringify({ step: "OBSERVE", content: errMsg }),
        });
        continue;
      }

      console.log(
        `\n${C.magenta}  Executing: ${tool_name}(${JSON.stringify(tool_args || {})})${C.reset}`
      );

      let toolResult;
      try {
        toolResult = await toolMap[tool_name](tool_args || {});
      } catch (toolErr) {
        toolResult = `Tool execution error: ${toolErr.message}`;
      }

      const observePayload = JSON.stringify({
        step: "OBSERVE",
        content: toolResult,
      });

      messages.push({
        role: "user",
        content: observePayload,
      });

      printStep("OBSERVE", toolResult);
      continue;
    }

    messages.push({
      role: "user",
      content: "Continue to the next step.",
    });
  }

  if (iteration >= MAX_ITERATIONS) {
    console.warn(
      `\n${C.yellow}Reached maximum iterations (${MAX_ITERATIONS}). Stopping.${C.reset}\n`
    );
  }
}

function startCLI() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`
${C.cyan}${C.bold}Website Cloner Agent${C.reset}
${C.dim}Type a URL or instruction to begin. Examples:
  https://www.scaler.com/
  clone https://www.stripe.com/
  exit  (to quit)${C.reset}
`);

  function prompt() {
    rl.question(`${C.cyan}${C.bold}You >${C.reset}  `, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
        console.log(`\n${C.dim}Goodbye.${C.reset}\n`);
        rl.close();
        process.exit(0);
      }

      try {
        await runAgentLoop(trimmed);
      } catch (err) {
        console.error(`\n${C.red}Unexpected error: ${err.message}${C.reset}\n`);
      }

      prompt();
    });
  }

  prompt();
}

startCLI();
