/**
 * Connected Component Analysis (CCA) for 2D label maps.
 */
export function findConnectedComponents(
    labels: Uint16Array,
    width: number,
    height: number
): {
    count: number;
    componentLabels: Uint32Array;
    regionSizes: Map<number, number>;
    regionColors: Map<number, number>; // Maps componentID -> original palette index
} {
    const n = width * height;
    const componentLabels = new Uint32Array(n).fill(0);
    let currentComponentId = 1;
    const regionSizes = new Map<number, number>();
    const regionColors = new Map<number, number>();

    const stack = new Int32Array(n);

    for (let i = 0; i < n; i++) {
        if (componentLabels[i] !== 0) continue;

        const targetColor = labels[i];
        let stackPtr = 0;
        stack[stackPtr++] = i;
        componentLabels[i] = currentComponentId;
        let size = 0;

        while (stackPtr > 0) {
            const idx = stack[--stackPtr];
            size++;

            const x = idx % width;
            const y = Math.floor(idx / width);

            // Check 4-connectivity
            const neighbors = [
                [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
            ];

            for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = ny * width + nx;
                    if (componentLabels[nIdx] === 0 && labels[nIdx] === targetColor) {
                        componentLabels[nIdx] = currentComponentId;
                        stack[stackPtr++] = nIdx;
                    }
                }
            }
        }

        regionSizes.set(currentComponentId, size);
        regionColors.set(currentComponentId, targetColor);
        currentComponentId++;
    }

    return {
        count: currentComponentId - 1,
        componentLabels,
        regionSizes,
        regionColors
    };
}
