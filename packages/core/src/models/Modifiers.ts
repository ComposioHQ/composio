/**
 * @fileoverview Modifiers class for Composio SDK, used to manage tool execution modifiers.
 * 
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-05-05
 * @module Modifiers
 */
import { AfterToolExecuteModifier, BeforeToolExecuteModifer, TransformToolSchemaModifier } from "../types/modifiers.types";
import { InstrumentedInstance } from "../types/telemetry.types";
import { Tool, ToolExecuteParams, ToolExecuteResponse } from "../types/tool.types";

/**
 * Modifiers class
 * 
 * This class is used to manage the modifiers for the tools in the Composio SDK.
 * It provides methods to add before and after execution modifiers, as well as schema transformation modifiers.
 */
export class Modifiers implements InstrumentedInstance {
    readonly FILE_NAME: string = 'core/models/Modifiers.ts';
    private beforeToolExecuteModifiers: Map<string, Set<BeforeToolExecuteModifer>> = new Map();
    private afterToolExecuteModifiers: Map<string, Set<AfterToolExecuteModifier>> = new Map();
    private transformToolSchemaModifiers:  Map<string, Set<TransformToolSchemaModifier>> = new Map();

    constructor() {}

    /**
     * Method to modify the tool schema before it is executed.
     * @param {string} toolSlug slug of the tool to be modified
     * @param modifier function to modify the tool execution parameters
     */
    useBeforeToolExecute(toolSlug: string, modifier: BeforeToolExecuteModifer) {
        if (!this.beforeToolExecuteModifiers.has(toolSlug)) {
            this.beforeToolExecuteModifiers.set(toolSlug, new Set());
        }
        this.beforeToolExecuteModifiers.get(toolSlug)?.add(modifier);
    }

    /**
     * Method to apply the before tool execute modifiers.
     * @param {string} toolSlug slug of the tool to be modified
     * @param {ToolExecuteParams} toolExecuteParams parameters to be passed to the tool
     * @returns {ToolExecuteParams} modified parameters
     */
    applyBeforeToolExecute(toolSlug: string, toolExecuteParams: ToolExecuteParams): ToolExecuteParams {
        const modifiers = this.beforeToolExecuteModifiers.get(toolSlug);
        if (modifiers) {
            for (const modifier of modifiers) {
                toolExecuteParams = modifier(toolSlug, toolExecuteParams);
            }
        }
        return toolExecuteParams;
    }


    /**
     * Method to modify the tool schema after it is executed.
     * @param {string} toolSlug slug of the tool to be modified
     * @param modifier function to modify the tool execution response
     */
    useAfterToolExecute(toolSlug: string, modifier: AfterToolExecuteModifier) {
        if (!this.afterToolExecuteModifiers.has(toolSlug)) {
            this.afterToolExecuteModifiers.set(toolSlug, new Set());
        }
        this.afterToolExecuteModifiers.get(toolSlug)?.add(modifier);
    }

    /**
     * Method to apply the after tool execute modifiers.
     * @param {string} toolSlug slug of the tool to be modified
     * @param {ToolExecuteResponse} toolExecuteResponse response from the tool execution
     * @returns {ToolExecuteResponse} modified response
     */
    applyAfterToolExecute(toolSlug: string, toolExecuteResponse: ToolExecuteResponse): ToolExecuteResponse {
        const modifiers = this.afterToolExecuteModifiers.get(toolSlug);
        if (modifiers) {
            for (const modifier of modifiers) {
                toolExecuteResponse = modifier(toolSlug, toolExecuteResponse);
            }
        }
        return toolExecuteResponse;
    }

    /**
     * Method to register modifiers for the tool schema.
     * @param {string} toolSlug slug of the tool to be modified
     * @param modifier function to modify the tool schema
     */
    useTransformToolSchema(toolSlug: string, modifier:TransformToolSchemaModifier) {
        if (!this.transformToolSchemaModifiers.has(toolSlug)) {
            this.transformToolSchemaModifiers.set(toolSlug, new Set());
        }
        this.transformToolSchemaModifiers.get(toolSlug)?.add(modifier);
    }

    /**
     * Method to apply the transform tool schema modifiers.
     * @param toolSlug slug of the tool to be modified
     * @param toolSchema schema of the tool to be modified
     * @returns {Tool}
     */
    applyTransformToolSchema(toolSlug: string, toolSchema: Tool): Tool {
        const modifiers = this.transformToolSchemaModifiers.get(toolSlug);
        if (modifiers) {
            for (const modifier of modifiers) {
                toolSchema = modifier(toolSlug, toolSchema);
            }
        }
        return toolSchema;
    }
}