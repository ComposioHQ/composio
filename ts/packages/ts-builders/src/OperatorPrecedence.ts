/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

/**
 * TypeScript operator precedence levels for automatic parentheses placement.
 * Higher numbers indicate higher precedence (bind more tightly).
 *
 * Based on TypeScript/JavaScript operator precedence:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
 */
export enum OperatorPrecedence {
  // Lowest precedence
  Union = 1, // A | B
  Intersection = 2, // A & B
  Conditional = 3, // A extends B ? C : D

  // Typeof types are special cases, see:
  // https://stackoverflow.com/questions/70102722/whats-the-precedence-of-typescript-operators#comment123924051_70102722
  TypeofType = 4, // typeof T

  // Function types
  FunctionType = 4, // () => void

  // Object types (lower precedence than arrays so they need parentheses in more contexts)
  ObjectType = 5, // { a: string }

  // Array and tuple types
  ArrayType = 6, // T[]
  TupleType = 6, // [A, B, C]

  // Indexing and property access
  IndexAccess = 7, // T[K]

  // Unary operators
  KeyofType = 8, // keyof T

  // Highest precedence (atomic types, least likely to need parentheses)
  Atomic = 10, // string, number, boolean, literal types, named types
}

/**
 * Context in which a type is being written, used to determine if parentheses are needed
 */
export enum TypeContext {
  Root = 'root', // Top-level, no context
  UnionMember = 'union_member', // Inside a union type
  IntersectionMember = 'intersection_member', // Inside an intersection type
  ArrayElement = 'array_element', // T in T[]
  TupleElement = 'tuple_element', // T in [T, ...]
  IndexAccess = 'index_access', // T in T[K] or K in T[K]
  KeyofOperand = 'keyof_operand', // T in keyof T
  TypeofOperand = 'typeof_operand', // T in typeof T
  FunctionReturn = 'function_return', // T in () => T
  FunctionParameter = 'function_parameter', // T in (x: T) => void
  ObjectProperty = 'object_property', // T in { prop: T }
  ConditionalCheck = 'conditional_check', // T in T extends U ? V : W
  ConditionalTrue = 'conditional_true', // V in T extends U ? V : W
  ConditionalFalse = 'conditional_false', // W in T extends U ? V : W
}

/**
 * Maps contexts to the minimum precedence level that doesn't require parentheses
 */
export const CONTEXT_PRECEDENCE: Record<TypeContext, OperatorPrecedence> = {
  [TypeContext.Root]: OperatorPrecedence.Union,
  [TypeContext.UnionMember]: OperatorPrecedence.ArrayType, // Functions (4) < ArrayType (6) = true, parentheses added
  [TypeContext.IntersectionMember]: OperatorPrecedence.Conditional,
  [TypeContext.ArrayElement]: OperatorPrecedence.Atomic, // Objects (5) < Atomic (10) = true, parentheses added
  [TypeContext.TupleElement]: OperatorPrecedence.ArrayType,
  [TypeContext.IndexAccess]: OperatorPrecedence.ArrayType, // Objects (5) < ArrayType (6) = true, Arrays (6) < ArrayType (6) = false
  [TypeContext.KeyofOperand]: OperatorPrecedence.ObjectType, // Functions (4) < ObjectType (5) = true, Unions (1) < ObjectType (5) = true, Objects (5) < ObjectType (5) = false, Arrays (6) < ObjectType (5) = false
  [TypeContext.FunctionReturn]: OperatorPrecedence.FunctionType,
  [TypeContext.TypeofOperand]: OperatorPrecedence.TypeofType,
  [TypeContext.FunctionParameter]: OperatorPrecedence.FunctionType,
  [TypeContext.ObjectProperty]: OperatorPrecedence.ObjectType,
  [TypeContext.ConditionalCheck]: OperatorPrecedence.Conditional,
  [TypeContext.ConditionalTrue]: OperatorPrecedence.Conditional,
  [TypeContext.ConditionalFalse]: OperatorPrecedence.Conditional,
};

/**
 * Determines if parentheses are needed when writing a type in a given context
 */
export function needsParentheses(
  typePrecedence: OperatorPrecedence,
  context: TypeContext
): boolean {
  const contextPrecedence = CONTEXT_PRECEDENCE[context];
  return typePrecedence < contextPrecedence;
}
