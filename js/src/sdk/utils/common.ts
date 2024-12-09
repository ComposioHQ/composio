// Helper function to stringify objects if needed
export const serializeValue = (obj: unknown) => {
    return typeof obj === 'object' ? JSON.stringify(obj) : obj;
}
