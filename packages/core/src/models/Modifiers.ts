/**
 * @fileoverview Modifiers class for Composio SDK, used to manage tool execution modifiers.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-05-05
 * @module Modifiers
 */
import {
  AfterToolExecuteModifier,
  BeforeToolExecuteModifer,
  GlobalAfterToolExecuteModifier,
  GlobalBeforeToolExecuteModifier,
  GlobalTransformToolSchemaModifier,
  TransformToolSchemaModifier,
} from '../types/modifiers.types';
import { InstrumentedInstance } from '../types/telemetry.types';
import { Tool, ToolExecuteParams, ToolExecuteResponse } from '../types/tool.types';

/**
 * Modifiers class
 *
 * This class is used to manage the modifiers for the tools in the Composio SDK.
 * It provides methods to add before and after execution modifiers, as well as schema transformation modifiers.
 */
export class Modifiers implements InstrumentedInstance {
  readonly FILE_NAME: string = 'core/models/Modifiers.ts';
  private beforeToolExecuteModifiers: Map<string, Set<BeforeToolExecuteModifer>> = new Map();
  private globalBeforeToolExecuteModifiers: Set<GlobalBeforeToolExecuteModifier> = new Set();
  private afterToolExecuteModifiers: Map<string, Set<AfterToolExecuteModifier>> = new Map();
  private globalAfterToolExecuteModifiers: Set<GlobalAfterToolExecuteModifier> = new Set();
  private transformToolSchemaModifiers: Map<string, Set<TransformToolSchemaModifier>> = new Map();
  private globalTransformToolSchemaModifiers: Set<GlobalTransformToolSchemaModifier> = new Set();

  constructor() {}

  /**
   * Function signature for modifying the tool execution parameters.
   */
  useBeforeToolExecute(globalModifier: GlobalBeforeToolExecuteModifier): void;
  useBeforeToolExecute(toolSlug: string, modifier: BeforeToolExecuteModifer): void;
  /**
   * Method to modify the tool schema before it is executed.
   * We provide two methods to register modifiers:
   * 1. useBeforeToolExecute(modifier: GlobalBeforeToolExecuteModifier): void
   * 2. useBeforeToolExecute(toolSlug: string, modifier: BeforeToolExecuteModifer): void
   * @param {string} toolSlug slug of the tool to be modified
   * @param modifier function to modify the tool execution parameters
   */
  useBeforeToolExecute(
    arg1: string | GlobalBeforeToolExecuteModifier,
    modifier?: BeforeToolExecuteModifer
  ): void {
    if (typeof arg1 === 'string' && modifier) {
      const toolSlug = arg1;
      if (!this.beforeToolExecuteModifiers.has(toolSlug)) {
        this.beforeToolExecuteModifiers.set(toolSlug, new Set());
      }
      this.beforeToolExecuteModifiers.get(toolSlug)?.add(modifier);
    } else if (typeof arg1 === 'function') {
      const globalModifier = arg1;
      this.globalBeforeToolExecuteModifiers.add(globalModifier);
    }
  }

  /**
   * Method to apply the before tool execute modifiers.
   * @param {string} toolSlug slug of the tool to be modified
   * @param {ToolExecuteParams} toolExecuteParams parameters to be passed to the tool
   * @returns {ToolExecuteParams} modified parameters
   */
  applyBeforeToolExecute(
    toolSlug: string,
    toolExecuteParams: ToolExecuteParams
  ): ToolExecuteParams {
    // Apply global modifiers
    let modifiedToolExecuteParams = { ...toolExecuteParams };
    for (const globalModifier of this.globalBeforeToolExecuteModifiers) {
      modifiedToolExecuteParams = globalModifier(toolSlug, modifiedToolExecuteParams);
    }
    // Apply tool-specific modifiers
    const modifiers = this.beforeToolExecuteModifiers.get(toolSlug);
    if (modifiers) {
      for (const modifier of modifiers) {
        modifiedToolExecuteParams = modifier(modifiedToolExecuteParams);
      }
    }
    return modifiedToolExecuteParams;
  }

  /**
   * Function signature for modifying the tool execution response.
   */
  useAfterToolExecute(globalModifier: GlobalAfterToolExecuteModifier): void;
  useAfterToolExecute(toolSlug: string, modifier: AfterToolExecuteModifier): void;

  /**
   * Method to modify the tool schema after it is executed.
   * @param {string} toolSlug slug of the tool to be modified
   * @param modifier function to modify the tool execution response
   */
  useAfterToolExecute(
    arg1: string | GlobalAfterToolExecuteModifier,
    modifier?: AfterToolExecuteModifier
  ) {
    if (typeof arg1 === 'string' && modifier) {
      const toolSlug = arg1;
      if (!this.afterToolExecuteModifiers.has(toolSlug)) {
        this.afterToolExecuteModifiers.set(toolSlug, new Set());
      }
      this.afterToolExecuteModifiers.get(toolSlug)?.add(modifier);
    } else if (typeof arg1 === 'function') {
      const globalModifier = arg1;
      this.globalAfterToolExecuteModifiers.add(globalModifier);
    }
  }

  /**
   * Method to apply the after tool execute modifiers.
   * @param {string} toolSlug slug of the tool to be modified
   * @param {ToolExecuteResponse} toolExecuteResponse response from the tool execution
   * @returns {ToolExecuteResponse} modified response
   */
  applyAfterToolExecute(
    toolSlug: string,
    toolExecuteResponse: ToolExecuteResponse
  ): ToolExecuteResponse {
    // Apply global modifiers
    let modifiedToolExecuteResponse = { ...toolExecuteResponse };
    for (const globalModifier of this.globalAfterToolExecuteModifiers) {
      modifiedToolExecuteResponse = globalModifier(toolSlug, modifiedToolExecuteResponse);
    }
    // Apply tool-specific modifiers
    const modifiers = this.afterToolExecuteModifiers.get(toolSlug);
    if (modifiers) {
      for (const modifier of modifiers) {
        modifiedToolExecuteResponse = modifier(modifiedToolExecuteResponse);
      }
    }
    return modifiedToolExecuteResponse;
  }

  /**
   * Function signature for modifying the tool schema.
   */
  useTransformToolSchema(globalModifier: GlobalTransformToolSchemaModifier): void;
  useTransformToolSchema(toolSlug: string, modifier: TransformToolSchemaModifier): void;
  /**
   * Method to register modifiers for the tool schema.
   * @param {string} toolSlug slug of the tool to be modified
   * @param modifier function to modify the tool schema
   */
  useTransformToolSchema(arg1: string | GlobalTransformToolSchemaModifier, modifier?: TransformToolSchemaModifier) {
    if (typeof arg1 === 'string' && modifier) {
      const toolSlug = arg1;
      if (!this.transformToolSchemaModifiers.has(toolSlug)) {
        this.transformToolSchemaModifiers.set(toolSlug, new Set());
      }
      this.transformToolSchemaModifiers.get(toolSlug)?.add(modifier);
    } else if (typeof arg1 === 'function') {
      const globalModifier = arg1;
      this.globalTransformToolSchemaModifiers.add(globalModifier);
    }
  }

  /**
   * Method to apply the transform tool schema modifiers.
   * @param toolSlug slug of the tool to be modified
   * @param toolSchema schema of the tool to be modified
   * @returns {Tool}
   */
  applyTransformToolSchema(toolSlug: string, toolSchema: Tool): Tool {
    // Apply global modifiers
    let modifiedToolSchema = { ...toolSchema };
    for (const globalModifier of this.globalTransformToolSchemaModifiers) {
      modifiedToolSchema = globalModifier(toolSlug, modifiedToolSchema);
    }
    // Apply tool-specific modifiers
    const modifiers = this.transformToolSchemaModifiers.get(toolSlug);
    if (modifiers) {
      for (const modifier of modifiers) {
        modifiedToolSchema = modifier(modifiedToolSchema);
      }
    }
    return modifiedToolSchema;
  }
}
