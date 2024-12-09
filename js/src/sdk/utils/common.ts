// Helper function to stringify objects if needed
export const serializeValue = (obj: Record<string, unknown> | string | number | boolean | null | undefined) => {
    return typeof obj === 'object' ? JSON.stringify(obj) : obj;
}
