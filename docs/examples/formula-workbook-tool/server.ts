import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { Composio, experimental_createTool } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { generateText, stepCountIs } from 'ai';
import { z } from 'zod/v3';
import { WorkPaper } from '@bilig/workpaper';

// #region workbook
const pricingWorkbook = WorkPaper.buildFromSheets({
  Inputs: [
    ['Metric', 'Value'],
    ['Units', 50],
    ['Unit price', 1200],
    ['Discount rate', 0.1],
    ['Approval threshold', 50000],
  ],
  Summary: [
    ['Metric', 'Value'],
    ['Gross revenue', '=Inputs!B2*Inputs!B3'],
    ['Discount amount', '=B2*Inputs!B4'],
    ['Net revenue', '=B2-B3'],
    ['Approved', '=IF(B4>=Inputs!B5,"yes","no")'],
  ],
});

const inputsSheet = pricingWorkbook.getSheetId('Inputs');
const summarySheet = pricingWorkbook.getSheetId('Summary');

if (inputsSheet === undefined || summarySheet === undefined) {
  throw new Error('Pricing workbook did not initialize correctly');
}
// #endregion workbook

function readNumberCell(row: number): number {
  const value = pricingWorkbook.getCellValue({ sheet: summarySheet, row, col: 1 });
  if (typeof value !== 'number') {
    throw new Error(`Expected Summary row ${row + 1} to contain a number`);
  }
  return value;
}

function readTextCell(row: number): string {
  const value = pricingWorkbook.getCellValue({ sheet: summarySheet, row, col: 1 });
  if (typeof value !== 'string') {
    throw new Error(`Expected Summary row ${row + 1} to contain text`);
  }
  return value;
}

// #region custom-tool
const runPricingWorkbook = experimental_createTool('RUN_PRICING_WORKBOOK', {
  name: 'Run pricing workbook',
  description:
    'Write pricing inputs into a formula workbook, recalculate the dependent formulas, and return computed outputs with JSON persistence proof.',
  preload: true,
  inputParams: z.object({
    units: z.number().int().positive().describe('Number of units in the quote'),
    unitPrice: z.number().positive().describe('Price per unit'),
    discountRate: z.number().min(0).max(1).describe('Discount rate as a decimal'),
  }),
  outputParams: z.object({
    grossRevenue: z.number(),
    discountAmount: z.number(),
    netRevenue: z.number(),
    approved: z.string(),
    exportedWorkPaper: z.boolean(),
  }),
  execute: async input => {
    pricingWorkbook.setCellContents({ sheet: inputsSheet, row: 1, col: 1 }, input.units);
    pricingWorkbook.setCellContents({ sheet: inputsSheet, row: 2, col: 1 }, input.unitPrice);
    pricingWorkbook.setCellContents({ sheet: inputsSheet, row: 3, col: 1 }, input.discountRate);

    return {
      grossRevenue: readNumberCell(1),
      discountAmount: readNumberCell(2),
      netRevenue: readNumberCell(3),
      approved: readTextCell(4),
      exportedWorkPaper: Boolean(pricingWorkbook.exportSnapshot()),
    };
  },
});
// #endregion custom-tool

// #region session
const composio = new Composio({ provider: new VercelProvider() });
const userId = process.env.COMPOSIO_USER_ID ?? 'formula-workbook-demo';

const session = await composio.create(userId, {
  experimental: {
    customTools: [runPricingWorkbook],
  },
});

const tools = await session.tools();
// #endregion session

// #region run
try {
  const result = await generateText({
    model: openai('gpt-5.4'),
    tools,
    stopWhen: stepCountIs(6),
    prompt:
      'Run the pricing workbook for 80 units at $1,500 with a 20% discount. Report the net revenue and whether the quote is approved.',
  });

  console.log(result.text);
} finally {
  pricingWorkbook.dispose();
}
// #endregion run
