export interface Point {
    x: number;
    y: number;
}

export interface Path {
    points: Point[];
    label: number;
    isFabric: boolean;
}

/**
 * Extract vector paths from a label map, with optional simplification and smoothing.
 */
export function getProcessedPaths(
    labels: Uint16Array,
    width: number,
    height: number,
    fabricLabels: Set<number>,
    options: { simplify?: number; smooth?: number; manualMask?: Uint8Array | null } = {}
): Path[] {
    const rawPaths = vectorizeLabelMap(labels, width, height, fabricLabels, options.manualMask);
    return rawPaths.map(p => ({
        ...p,
        points: smoothPath(simplifyPath(p.points, options.simplify ?? 0.5), options.smooth ?? 2)
    }));
}

/**
 * Extract vector paths from a label map.
 */
export function vectorizeLabelMap(
    labels: Uint16Array,
    width: number,
    height: number,
    fabricLabels: Set<number>,
    manualMask?: Uint8Array | null
): Path[] {
    const paths: Path[] = [];
    const numLabels = Math.max(...Array.from(labels)) + 1;

    for (let l = 0; l < numLabels; l++) {
        const isFabric = fabricLabels.has(l);
        const mask = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i++) {
            const isManualFabric = manualMask && manualMask[i] === 0;
            if (labels[i] === l && !isManualFabric) mask[i] = 1;
        }

        const contours = findContours(mask, width, height);
        for (const contour of contours) {
            if (contour.length < 3) continue;
            paths.push({
                points: contour,
                label: l,
                isFabric
            });
        }
    }

    return paths;
}

function findContours(mask: Uint8Array, width: number, height: number): Point[][] {
    const contours: Point[][] = [];
    const visited = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (mask[idx] === 1 && !visited[idx]) {
                if (isEdge(mask, x, y, width, height)) {
                    const contour = traceMooreContour(mask, x, y, width, height);
                    if (contour.length > 2) {
                        contours.push(contour);
                        // Mark all interior pixels as visited if we wanted to avoid internal holes,
                        // but for simplicity we'll just mark the boundary.
                        for (const p of contour) {
                            visited[Math.round(p.y) * width + Math.round(p.x)] = 1;
                        }
                    }
                }
            }
        }
    }
    return contours;
}

function isEdge(mask: Uint8Array, x: number, y: number, width: number, height: number): boolean {
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) return true;
    return mask[y * width + (x + 1)] === 0 ||
        mask[y * width + (x - 1)] === 0 ||
        mask[(y + 1) * width + x] === 0 ||
        mask[(y - 1) * width + x] === 0;
}

/**
 * Moore-Neighbor tracing algorithm.
 */
function traceMooreContour(
    mask: Uint8Array,
    startX: number,
    startY: number,
    width: number,
    height: number
): Point[] {
    const points: Point[] = [];
    let curr: Point = { x: startX, y: startY };
    let prev: Point = { x: startX - 1, y: startY };

    const directions = [
        { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
        { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }
    ];

    let iterations = 0;
    const maxIterations = width * height;

    while (iterations < maxIterations) {
        points.push({ ...curr });

        // Find direction from curr to prev
        let startDir = 0;
        for (let i = 0; i < 8; i++) {
            if (curr.x + directions[i].x === prev.x && curr.y + directions[i].y === prev.y) {
                startDir = i;
                break;
            }
        }

        let found = false;
        for (let i = 1; i <= 8; i++) {
            const d = (startDir + i) % 8;
            const nextX = curr.x + directions[d].x;
            const nextY = curr.y + directions[d].y;

            if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) {
                if (mask[nextY * width + nextX] === 1) {
                    prev = { x: curr.x + directions[(d + 7) % 8].x, y: curr.y + directions[(d + 7) % 8].y };
                    curr = { x: nextX, y: nextY };
                    found = true;
                    break;
                }
            }
        }

        if (!found || (curr.x === startX && curr.y === startY)) break;
        iterations++;
    }

    return points;
}

export function simplifyPath(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const dist = perpendicularDistance(points[i], points[0], points[end]);
        if (dist > maxDist) {
            index = i;
            maxDist = dist;
        }
    }

    if (maxDist > epsilon) {
        const recResults1 = simplifyPath(points.slice(0, index + 1), epsilon);
        const recResults2 = simplifyPath(points.slice(index), epsilon);
        return [...recResults1.slice(0, -1), ...recResults2];
    } else {
        return [points[0], points[end]];
    }
}

function perpendicularDistance(p: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0) return Math.sqrt((p.x - lineStart.x) ** 2 + (p.y - lineStart.y) ** 2);
    return Math.abs(dy * p.x - dx * p.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / mag;
}

export function smoothPath(points: Point[], iterations: number): Point[] {
    let current = points;
    for (let i = 0; i < iterations; i++) {
        const next: Point[] = [];
        if (current.length < 3) return current;

        for (let j = 0; j < current.length; j++) {
            const p0 = current[j];
            const p1 = current[(j + 1) % current.length];

            next.push({
                x: 0.75 * p0.x + 0.25 * p1.x,
                y: 0.75 * p0.y + 0.25 * p1.y
            });
            next.push({
                x: 0.25 * p0.x + 0.75 * p1.x,
                y: 0.25 * p0.y + 0.75 * p1.y
            });
        }
        current = next;
    }
    return current;
}
