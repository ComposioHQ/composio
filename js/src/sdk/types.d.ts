export type Optional<T> = T | null;
export type Dict<T> = { [key: string]: T };
export type Sequence<T> = Array<T>;

export type IPythonActionDetails = {
  data: {
    name: string;
    display_name: string;
    description: string;
    parameters: unknown;
    response: unknown;
    appKey: string;
    appId: string;
    tags: string[];
    appName: string;
    enabled: boolean;
    logo: string;
  }[];
  error: unknown | null;
  traceback: unknown | null;
};
