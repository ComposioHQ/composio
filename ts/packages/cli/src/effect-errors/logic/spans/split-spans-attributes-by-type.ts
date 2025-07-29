interface FilteredEffectAttributes {
  stacktrace: string[];
  attributes: ReadonlyMap<string, unknown>;
}

export const splitSpansAttributesByTypes = (attributes: ReadonlyMap<string, unknown>) =>
  Array.from(attributes.entries()).reduce<FilteredEffectAttributes>(
    (prev, [key, value]) => {
      if (key === 'code.stacktrace') {
        return {
          attributes: prev.attributes,
          stacktrace: [...prev.stacktrace, value] as string[],
        };
      }

      return {
        attributes: new Map([...prev.attributes, [key, value]]),
        stacktrace: prev.stacktrace,
      };
    },
    {
      stacktrace: [],
      attributes: new Map(),
    }
  );
