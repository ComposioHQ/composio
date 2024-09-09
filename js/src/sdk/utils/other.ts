export const isNewerVersion  = (v1: string, v2: string): boolean => {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (parts1[i] > parts2[i]) return true;
        if (parts1[i] < parts2[i]) return false;
    }
    return false;
}