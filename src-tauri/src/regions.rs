use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct GridPoint {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PatternRegion {
    pub id: usize,
    pub number: usize,
    pub color_index: usize,
    pub color_key: String,
    pub dmc_code: String,
    pub hex: String,
    pub area: usize,
    pub min_x: usize,
    pub min_y: usize,
    pub centroid_x: f32,
    pub centroid_y: f32,
    pub loops: Vec<Vec<GridPoint>>,
}

#[derive(Debug, Deserialize)]
pub struct RegionExtractionPayload {
    pub width: u32,
    pub height: u32,
    pub stitches: Vec<RegionStitch>,
    pub legend: Vec<RegionLegendEntry>,
}

#[derive(Debug, Deserialize)]
pub struct RegionStitch {
    pub x: u32,
    pub y: u32,
    pub dmc_code: String,
    pub hex: String,
}

#[derive(Debug, Deserialize)]
pub struct RegionLegendEntry {
    pub dmc_code: String,
    pub hex: String,
}

const NO_REGION: usize = usize::MAX;

pub fn extract_regions(payload: &RegionExtractionPayload) -> Result<Vec<PatternRegion>, String> {
    let width = payload.width as usize;
    let height = payload.height as usize;
    let len = width * height;

    let mut palette_by_key: HashMap<String, usize> = HashMap::new();
    let mut palette_code = Vec::<String>::new();
    let mut palette_hex = Vec::<String>::new();

    for entry in &payload.legend {
        if is_fabric_code(&entry.dmc_code) {
            continue;
        }
        let key = color_key(&entry.dmc_code, &entry.hex);
        if palette_by_key.contains_key(&key) {
            continue;
        }
        let idx = palette_code.len();
        palette_by_key.insert(key.clone(), idx);
        palette_code.push(entry.dmc_code.clone());
        palette_hex.push(entry.hex.clone());
    }

    let mut color_grid = vec![NO_REGION; len];
    for stitch in &payload.stitches {
        if stitch.x >= payload.width
            || stitch.y >= payload.height
            || is_fabric_code(&stitch.dmc_code)
        {
            continue;
        }
        let key = color_key(&stitch.dmc_code, &stitch.hex);
        let color_index = if let Some(idx) = palette_by_key.get(&key) {
            *idx
        } else {
            let idx = palette_code.len();
            palette_by_key.insert(key, idx);
            palette_code.push(stitch.dmc_code.clone());
            palette_hex.push(stitch.hex.clone());
            idx
        };
        let idx = stitch.y as usize * width + stitch.x as usize;
        color_grid[idx] = color_index;
    }

    let mut visited = vec![false; len];
    let mut region_id_grid = vec![NO_REGION; len];
    let mut regions = Vec::<PatternRegion>::new();
    let mut queue = VecDeque::<usize>::new();

    for start in 0..len {
        let color_index = color_grid[start];
        if color_index == NO_REGION || visited[start] {
            continue;
        }

        let raw_id = regions.len();
        visited[start] = true;
        queue.push_back(start);

        let mut cells = Vec::<usize>::new();
        let mut sum_x = 0.0f64;
        let mut sum_y = 0.0f64;
        let mut min_x = width;
        let mut min_y = height;

        while let Some(idx) = queue.pop_front() {
            region_id_grid[idx] = raw_id;
            cells.push(idx);

            let x = idx % width;
            let y = idx / width;
            sum_x += x as f64 + 0.5;
            sum_y += y as f64 + 0.5;
            min_x = min_x.min(x);
            min_y = min_y.min(y);

            if x > 0 {
                let n = idx - 1;
                if !visited[n] && color_grid[n] == color_index {
                    visited[n] = true;
                    queue.push_back(n);
                }
            }
            if x + 1 < width {
                let n = idx + 1;
                if !visited[n] && color_grid[n] == color_index {
                    visited[n] = true;
                    queue.push_back(n);
                }
            }
            if y > 0 {
                let n = idx - width;
                if !visited[n] && color_grid[n] == color_index {
                    visited[n] = true;
                    queue.push_back(n);
                }
            }
            if y + 1 < height {
                let n = idx + width;
                if !visited[n] && color_grid[n] == color_index {
                    visited[n] = true;
                    queue.push_back(n);
                }
            }
        }

        if cells.is_empty() {
            continue;
        }

        let area = cells.len();
        let (centroid_x, centroid_y) = pick_region_centroid(width, &cells, sum_x, sum_y);
        let loops = build_region_loops(width, height, &region_id_grid, raw_id);

        if loops.is_empty() {
            continue;
        }

        let dmc_code = palette_code[color_index].clone();
        let hex = palette_hex[color_index].clone();
        let color_key = color_key(&dmc_code, &hex);

        regions.push(PatternRegion {
            id: raw_id,
            number: 0,
            color_index,
            color_key,
            dmc_code,
            hex,
            area,
            min_x,
            min_y,
            centroid_x,
            centroid_y,
            loops,
        });
    }

    Ok(regions)
}

fn pick_region_centroid(width: usize, cells: &[usize], sum_x: f64, sum_y: f64) -> (f32, f32) {
    let area = cells.len().max(1) as f64;
    let mean_x = sum_x / area;
    let mean_y = sum_y / area;

    let target_x = mean_x.floor().max(0.0) as usize;
    let target_y = mean_y.floor().max(0.0) as usize;
    let target_idx = target_y.saturating_mul(width).saturating_add(target_x);
    if cells.contains(&target_idx) {
        return (mean_x as f32, mean_y as f32);
    }

    let mut best_idx = cells[0];
    let mut best_dist = f64::MAX;
    for idx in cells {
        let x = *idx % width;
        let y = *idx / width;
        let cx = x as f64 + 0.5;
        let cy = y as f64 + 0.5;
        let dist = (cx - mean_x) * (cx - mean_x) + (cy - mean_y) * (cy - mean_y);
        if dist < best_dist {
            best_dist = dist;
            best_idx = *idx;
        }
    }

    let x = best_idx % width;
    let y = best_idx / width;
    (x as f32 + 0.5, y as f32 + 0.5)
}

fn build_region_loops(
    width: usize,
    height: usize,
    region_id_grid: &[usize],
    region_id: usize,
) -> Vec<Vec<GridPoint>> {
    let mut segments = Vec::<(GridPoint, GridPoint)>::new();

    for idx in 0..region_id_grid.len() {
        if region_id_grid[idx] != region_id {
            continue;
        }

        let x = idx % width;
        let y = idx / width;

        if y == 0 || region_id_grid[idx - width] != region_id {
            segments.push((
                GridPoint {
                    x: x as i32,
                    y: y as i32,
                },
                GridPoint {
                    x: x as i32 + 1,
                    y: y as i32,
                },
            ));
        }
        if x + 1 >= width || region_id_grid[idx + 1] != region_id {
            segments.push((
                GridPoint {
                    x: x as i32 + 1,
                    y: y as i32,
                },
                GridPoint {
                    x: x as i32 + 1,
                    y: y as i32 + 1,
                },
            ));
        }
        if y + 1 >= height || region_id_grid[idx + width] != region_id {
            segments.push((
                GridPoint {
                    x: x as i32 + 1,
                    y: y as i32 + 1,
                },
                GridPoint {
                    x: x as i32,
                    y: y as i32 + 1,
                },
            ));
        }
        if x == 0 || region_id_grid[idx - 1] != region_id {
            segments.push((
                GridPoint {
                    x: x as i32,
                    y: y as i32 + 1,
                },
                GridPoint {
                    x: x as i32,
                    y: y as i32,
                },
            ));
        }
    }

    if segments.is_empty() {
        return Vec::new();
    }

    segments.sort_by(|a, b| {
        a.0.cmp(&b.0)
            .then(a.1.cmp(&b.1))
            .then_with(|| direction_rank(a.0, a.1).cmp(&direction_rank(b.0, b.1)))
    });

    let mut starts = HashMap::<GridPoint, Vec<usize>>::new();
    for (idx, segment) in segments.iter().enumerate() {
        starts.entry(segment.0).or_default().push(idx);
    }

    for outgoing in starts.values_mut() {
        outgoing.sort_by(|a, b| {
            let da = direction_rank(segments[*a].0, segments[*a].1);
            let db = direction_rank(segments[*b].0, segments[*b].1);
            da.cmp(&db).then(a.cmp(b))
        });
    }

    let mut used = vec![false; segments.len()];
    let mut loops = Vec::<Vec<GridPoint>>::new();

    for seg_idx in 0..segments.len() {
        if used[seg_idx] {
            continue;
        }

        let mut loop_points = Vec::<GridPoint>::new();
        let mut current = segments[seg_idx].0;
        let loop_start = current;
        let mut safety = 0usize;

        loop {
            safety += 1;
            if safety > segments.len() + 2 {
                break;
            }

            let Some(outgoing) = starts.get(&current) else {
                break;
            };

            let mut next_segment = None;
            for candidate in outgoing {
                if !used[*candidate] {
                    next_segment = Some(*candidate);
                    break;
                }
            }

            let Some(selected) = next_segment else {
                break;
            };

            used[selected] = true;
            let (start, end) = segments[selected];
            if loop_points.is_empty() {
                loop_points.push(start);
            }
            loop_points.push(end);
            current = end;

            if current == loop_start {
                break;
            }
        }

        if loop_points.len() >= 4 && loop_points.first() == loop_points.last() {
            let simplified = simplify_axis_aligned_loop(loop_points);
            if simplified.len() >= 4 {
                loops.push(simplified);
            }
        }
    }

    loops.sort_by(|a, b| {
        let ak = loop_sort_key(a);
        let bk = loop_sort_key(b);
        ak.cmp(&bk)
    });

    loops
}

fn simplify_axis_aligned_loop(mut loop_points: Vec<GridPoint>) -> Vec<GridPoint> {
    if loop_points.len() < 4 {
        return loop_points;
    }

    if loop_points.first() == loop_points.last() {
        loop_points.pop();
    }

    let len = loop_points.len();
    let mut keep = vec![true; len];

    for i in 0..len {
        let prev = loop_points[(i + len - 1) % len];
        let curr = loop_points[i];
        let next = loop_points[(i + 1) % len];

        let collinear_x = prev.x == curr.x && curr.x == next.x;
        let collinear_y = prev.y == curr.y && curr.y == next.y;
        if collinear_x || collinear_y {
            keep[i] = false;
        }
    }

    let mut simplified = Vec::new();
    for (idx, point) in loop_points.iter().enumerate() {
        if keep[idx] {
            simplified.push(*point);
        }
    }

    if simplified.len() < 3 {
        return Vec::new();
    }

    simplified.push(simplified[0]);
    simplified
}

fn loop_sort_key(loop_points: &[GridPoint]) -> (i32, i32, usize) {
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    for point in loop_points {
        min_x = min_x.min(point.x);
        min_y = min_y.min(point.y);
    }
    (min_y, min_x, loop_points.len())
}

fn direction_rank(from: GridPoint, to: GridPoint) -> i32 {
    match (to.x - from.x, to.y - from.y) {
        (1, 0) => 0,
        (0, 1) => 1,
        (-1, 0) => 2,
        (0, -1) => 3,
        _ => 4,
    }
}

pub fn color_key(code: &str, hex: &str) -> String {
    format!(
        "{}|{}",
        code.trim().to_ascii_uppercase(),
        hex.trim().to_ascii_uppercase()
    )
}

pub fn is_fabric_code(code: &str) -> bool {
    code.eq_ignore_ascii_case("fabric")
}
