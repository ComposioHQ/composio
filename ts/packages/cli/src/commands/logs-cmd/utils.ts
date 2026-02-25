export type SearchParam = {
  field?: string;
  operation?: string;
  value?: string;
};

export const parseSearchParams = (values: ReadonlyArray<string>): Array<SearchParam> =>
  values.flatMap(value => {
    const [field, operation, ...rest] = value.split(':');
    const parsedValue = rest.join(':').trim();

    if (!field?.trim() || !operation?.trim() || !parsedValue) {
      return [];
    }

    return [
      {
        field: field.trim(),
        operation: operation.trim(),
        value: parsedValue,
      },
    ];
  });

export const toSearchParam = (field: string, value: string): SearchParam => ({
  field,
  operation: '==',
  value,
});
