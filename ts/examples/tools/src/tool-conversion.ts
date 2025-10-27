import { Composio, jsonSchemaToZodSchema } from '@composio/core';
import zodToJsonSchema from 'zod-to-json-schema';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const tool = await composio.tools.getRawComposioToolBySlug(
  'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND'
);
const inputParams = tool.inputParameters;
console.log(`---------- Original Input Parameters ----------`);
console.log(JSON.stringify(inputParams, null, 2));

const zodSchema = jsonSchemaToZodSchema(inputParams ?? {});
console.log(`---------- Zod Schema Parsed ----------`);
console.log(JSON.stringify(zodToJsonSchema(zodSchema, { target: "jsonSchema7"}), null, 2));
