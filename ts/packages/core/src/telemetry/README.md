# Telemetry System Overview

This document describes how telemetry is implemented in the SDK, including the main components, their responsibilities, and the data flow.

---

## 1. Telemetry Architecture Overview

**Purpose:**
The telemetry system collects, batches, and sends usage and error data from the SDK to a remote telemetry server, with minimal impact on application performance.

**Key Components:**

- `TelemetryTransport`: Main class for instrumentation and telemetry logic.
- `BatchProcessor`: Buffers and batches telemetry events before sending.
- `TelemetryService`: Handles HTTP requests to the telemetry API.
- **Types**: Define the structure of telemetry payloads.

---

## 2. BatchProcessor

**Role:** Efficiently batches telemetry events to reduce the number of API calls and avoid performance bottlenecks.

**How it works:**

- Maintains an internal array (`batch`) to store telemetry events.
- Configurable batch size and time interval (defaults: 100 items or 2 seconds).
- When an event is added via `pushItem`:
  - If the batch size is reached, immediately processes (sends) the batch.
  - If not, starts a timer (if not already running) to process the batch after the interval.
- `processBatch`:
  - Invokes a callback (provided at construction) with the current batch.
  - Clears the batch and resets the timer.

---

## 3. TelemetryTransport (Main Telemetry Class)

**Initialization:**

- Configured with metadata (SDK version, environment, provider, etc.).
- Sets up a `BatchProcessor` with a callback to send metrics via `TelemetryService.sendMetric`.

**Instrumentation:**

- The `instrument` method wraps all async methods of a given instance (e.g., SDK classes).
- For each method call:
  - Creates a telemetry payload with function name, arguments, timestamp, etc.
  - Pushes the payload to the batch processor.
  - If the method throws an error, captures error details and sends error telemetry immediately.

**Sending Telemetry:**

- **Metrics:** Batched and sent via `TelemetryService.sendMetric` (POST to `/metrics/invocations`).
- **Errors:** Sent immediately via `TelemetryService.sendErrorLog` (POST to `/errors`).

**Environment Awareness:**

- Telemetry is disabled in certain environments (e.g., `test`, `ci`, or if `TELEMETRY_DISABLED` is set).

---

## 4. TelemetryService

- **sendMetric:** Sends a batch of telemetry events to the `/metrics/invocations` endpoint.
- **sendErrorLog:** Sends a single error event to the `/errors` endpoint.
- **Implementation:** Uses `fetch` with JSON payloads.

---

## 5. Telemetry Payload Structure

**Types:** Defined in `TelemetryService.types.ts` using Zod schemas and TypeScript types.

**Payload Fields:**

- `functionName`: Name of the function/method invoked.
- `durationMs`: Duration of the invocation (optional).
- `timestamp`: Epoch time of the event.
- `props`: Additional properties (e.g., method arguments).
- `source`: Metadata about the SDK/runtime.
- `metadata`: Project/provider info.
- `error`: Error details (if any).

---

## 6. Error Handling

**Error Instrumentation:**

- If an instrumented method throws, the error is captured.
- Error details (name, message, stack, code) are included in the telemetry payload.
- Each error is assigned a unique `errorId` if not already present.

---

## 7. Usage Example

```typescript
const telemetry = new TelemetryTransport();
telemetry.setup(metadata); // metadata includes SDK version, provider, etc.
telemetry.instrument(someSdkInstance); // Instruments all async methods for telemetry
```

---

## 8. Summary of Flow

1. SDK initializes telemetry with environment and version info.
2. SDK classes are instrumented so all async method calls are logged.
3. Each method call generates a telemetry event, which is batched.
4. BatchProcessor sends events in bulk (by size or time) to the telemetry server.
5. Errors are captured and sent immediately.
6. TelemetryService handles the actual HTTP requests.

---

## 9. Telemetry Service Hosting & Source

- The telemetry services are hosted at: https://telemetry.composio.io
- The source code for the telemetry backend is available in the [ComposioHQ/hermes](https://github.com/ComposioHQ/hermes) repository.
- The relevant backend implementation can be found in the `/apps/telemetry-proxy` directory of that repository.
