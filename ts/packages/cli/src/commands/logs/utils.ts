export type SearchParam = {
  field?: string;
  operation?: string;
  value?: string;
};

export const toSearchParam = (field: string, value: string): SearchParam => ({
  field,
  operation: '==',
  value,
});
