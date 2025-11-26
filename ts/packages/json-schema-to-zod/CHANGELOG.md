# @composio/json-schema-to-zod

## 0.1.19

### Patch Changes

- b5cc23f: Fix dangerously skip version check in non agentic providers, Throw error instead of process.exit when api key doesn't exist, bump zod-to-json-schema to 3.25.0, which supports "zod/3"

## 0.1.18

### Patch Changes

- cfc2c50: Update zod version to 4

## 0.1.17

### Patch Changes

- 157bf7b: Fix array parsing

## 0.1.16

### Patch Changes

- 8741165: Add zod 4 support via zod/v3 and fix zod schema parsing

## 0.1.15

### Patch Changes

- 51033d8: Fix additional properties in nested structures

## 0.1.14

### Patch Changes

- 5027e18: Fix openai responses schema parsing

## 0.1.13

### Patch Changes

- Fix parsing of additional properties

## 0.1.12

### Patch Changes

- Fix additionalProperties to be always present

## 0.1.11

### Patch Changes

- Fix jsonSchema to zod parsing which used to eliminate min/max and examples proeperties

## 0.1.10

### Patch Changes

- 7276d1e: Fix issues with json schema to zod parsing causing nested objects to be marked as required
- 7276d1e: Fix issues with objects with default values being marked as required
- 06612f5: Downgrade chalk to v4 to allow CJS as well
- 77e96e4: Fix JSON Schema to Zod Parsing
- cb1b401: Bump packages for authconfig fixes
- Create stable release

## 0.1.10-next.5

### Patch Changes

- 77e96e4: Fix JSON Schema to Zod Parsing

## 0.1.10-next.4

### Patch Changes

- Bump packages for authconfig fixes

## 0.1.10-next.3

### Patch Changes

- 06612f5: Downgrade chalk to v4 to allow CJS as well

## 0.1.10-next.2

### Patch Changes

- Downgrade chalk to v4 to allow CJS as well

## 0.1.10-next.1

### Patch Changes

- Fix issues with objects with default values being marked as required

## 0.1.10-next.0

### Patch Changes

- Fix issues with json schema to zod parsing causing nested objects to be marked as required

## 0.1.9

### Patch Changes

- Add host name support in SDK

## 0.1.8

### Patch Changes

- 1ab34ef: Fix json schema support in tools

## 0.1.7

### Patch Changes

- c8e89d5: Fix telemetry transport

## 0.1.6

### Patch Changes

- 37a1f01: Feat better connected account creation flow

## 0.1.5

### Patch Changes

- df31cc2: Fix json schema parsing

## 0.1.2

### Patch Changes

- f943ba4: Export all the types from the core SDK

## 0.1.2

### Patch Changes

- 208e320: Update json schema transformations issues related to strict mode

## 0.1.1

### Patch Changes

- 4ddfafc: Add json schema to zod schema
