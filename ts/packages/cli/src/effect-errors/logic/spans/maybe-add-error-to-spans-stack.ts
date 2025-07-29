export const removeNodeModulesEntriesFromStack = (stack: string) => {
  const lines = stack.split('\r\n');

  return lines.filter(line => line.includes(process.cwd()) && !line.includes('/node_modules/'));
};

export const maybeAddErrorToSpansStack = (
  stack: string | undefined,
  spanAttributesStack: string[] | undefined
) => {
  const effectStack: string[] = [];

  if (stack && spanAttributesStack !== undefined) {
    effectStack.push(...removeNodeModulesEntriesFromStack(stack));
  }
  if (spanAttributesStack !== undefined) {
    effectStack.push(...spanAttributesStack);
  }

  return effectStack;
};
