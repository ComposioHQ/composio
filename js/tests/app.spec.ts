import { describe, it, expect } from "@jest/globals";

describe("Basic Jest Test Suite", () => {
    it("should pass a basic truthy test", () => {
        expect(true).toBeTruthy();
    });

    it("should pass a basic equality test", () => {
        expect(2 + 2).toBe(4);
    });
});
