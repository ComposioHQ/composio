// Helper function to stringify objects if needed
export const ifObjectStringify = (obj: any) => {
    return typeof obj === 'object' ? JSON.stringify(obj) : obj;
}