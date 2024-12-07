/**
 * E2E Tests for plugin demos and examples.
 */

const { execFile } = require("child_process");
const path = require("path");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

// Paths
const EXAMPLES_PATH = path.resolve(__dirname, "../examples");

// Plugin test definitions
const EXAMPLES = {
  portfolio_generator: {
    file: path.join(EXAMPLES_PATH, "portfolio-generator", "demo.mjs"),
    match: {
      type: "stdout",
      values: ["🎉Output from agent: "],
    },
  },
  lead_generator_agent: {
    file: path.join(EXAMPLES_PATH, "reddit-research", "demo.mjs"),
    match: {
      type: "stdout",
      values: ["🎉Output from agent: "],
    },
  },
  lead_outreach_agent: {
    file: path.join(EXAMPLES_PATH, "lead_outreach_agent", "demo.mjs"),
    match: {
      type: "stdout",
      values: ["🎉Output from agent: "],
    },
  },
};

describe("E2E Tests for plugin demos and examples", () => {
  jest.setTimeout(300000); // Set timeout to 5 minutes

  for (const [exampleName, example] of Object.entries(EXAMPLES)) {
    test(`should run ${exampleName} example successfully`, async () => {
      const options = {
        env: { ...process.env },
        cwd: example.cwd || process.cwd(),
      };

      const { stdout, stderr } = await execFileAsync(
        "node",
        [example.file],
        options
      );
      const output = example.match.type === "stdout" ? stdout : stderr;
      for (const match of example.match.values) {
        expect(output).toContain(match);
      }
    });
  }
});
