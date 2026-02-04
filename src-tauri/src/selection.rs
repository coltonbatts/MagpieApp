use palette::{white_point::D65, FromColor, Lab, Srgb};
use rayon::prelude::*;
use serde::Deserialize;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex, OnceLock};

/// Selection workspace for caching precomputed data
pub struct SelectionWorkspace {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub lab_pixels: Vec<Lab<D65, f32>>,
    pub gradient_map: Vec<f32>,
}

static WORKSPACE_CACHE: OnceLock<Arc<Mutex<Option<SelectionWorkspace>>>> = OnceLock::new();

fn get_cache() -> Arc<Mutex<Option<SelectionWorkspace>>> {
    WORKSPACE_CACHE
        .get_or_init(|| Arc::new(Mutex::new(None)))
        .clone()
}

#[derive(Debug, Clone, Deserialize)]
pub struct MagicWandParams {
    pub seed_x: u32,
    pub seed_y: u32,
    pub tolerance: f32,
    pub edge_stop: f32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RefinementParams {
    pub min_island_area: u32,
    pub hole_fill_area: u32,
    pub smoothing_passes: u32,
}

/// Initialize the selection workspace from RGBA bytes
pub fn init_workspace(
    image_rgba: &[u8],
    width: u32,
    height: u32,
    workspace_id: String,
) -> Result<(u32, u32), String> {
    let n = (width * height) as usize;
    if image_rgba.len() != n * 4 {
        return Err("Buffer size mismatch".to_string());
    }

    // Convert to LAB
    let lab_pixels: Vec<Lab<D65, f32>> = image_rgba
        .par_chunks_exact(4)
        .map(|p| {
            let a = p[3] as f32 / 255.0;
            let r = (p[0] as f32 * a + 255.0 * (1.0 - a)) as u8;
            let g = (p[1] as f32 * a + 255.0 * (1.0 - a)) as u8;
            let b = (p[2] as f32 * a + 255.0 * (1.0 - a)) as u8;

            let srgb = Srgb::new(r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
            Lab::from_color(srgb)
        })
        .collect();

    // Compute gradients
    let gradient_map: Vec<f32> = (0..n)
        .into_par_iter()
        .map(|i| {
            let x = (i as u32) % width;
            let y = (i as u32) / width;
            if x == 0 || x == width - 1 || y == 0 || y == height - 1 {
                return 0.0;
            }
            let left = lab_pixels[(i - 1) as usize].l;
            let right = lab_pixels[(i + 1) as usize].l;
            let top = lab_pixels[(i - width as usize) as usize].l;
            let bottom = lab_pixels[(i + width as usize) as usize].l;
            let dx = right - left;
            let dy = bottom - top;
            (dx * dx + dy * dy).sqrt()
        })
        .collect();

    let workspace = SelectionWorkspace {
        id: workspace_id,
        width,
        height,
        lab_pixels,
        gradient_map,
    };

    let cache = get_cache();
    let mut lock = cache.lock().map_err(|_| "Mutex poisoned")?;
    *lock = Some(workspace);

    Ok((width, height))
}

pub fn magic_wand_click(workspace_id: &str, params: &MagicWandParams) -> Result<Vec<u8>, String> {
    let cache = get_cache();
    let lock = cache.lock().map_err(|_| "Mutex poisoned")?;

    let ws = match &*lock {
        Some(ws) if ws.id == workspace_id => ws,
        _ => return Err("Workspace not found or ID mismatch".to_string()),
    };

    let width = ws.width;
    let height = ws.height;
    let n = (width * height) as usize;

    if params.seed_x >= width || params.seed_y >= height {
        return Err("Seed out of bounds".to_string());
    }

    let seed_idx = (params.seed_y * width + params.seed_x) as usize;
    let seed_color = ws.lab_pixels[seed_idx];
    let mut mask = vec![0u8; n];
    let mut visited = vec![false; n];
    let mut queue = VecDeque::new();

    queue.push_back(seed_idx);
    visited[seed_idx] = true;
    mask[seed_idx] = 1;

    let tol_sq = params.tolerance * params.tolerance;

    while let Some(idx) = queue.pop_front() {
        let x = (idx as u32) % width;
        let y = (idx as u32) / width;

        for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;

            if nx < 0 || nx >= width as i32 || ny < 0 || ny >= height as i32 {
                continue;
            }

            let nidx = (ny as u32 * width + nx as u32) as usize;
            if visited[nidx] {
                continue;
            }
            visited[nidx] = true;

            if ws.gradient_map[nidx] > params.edge_stop {
                continue;
            }

            let dl = seed_color.l - ws.lab_pixels[nidx].l;
            let da = seed_color.a - ws.lab_pixels[nidx].a;
            let db = seed_color.b - ws.lab_pixels[nidx].b;
            let dist_sq = dl * dl + da * da + db * db;

            if dist_sq < tol_sq {
                mask[nidx] = 1;
                queue.push_back(nidx);
            }
        }
    }

    // Default post-process
    let final_mask = post_process_mask(
        &mask,
        width,
        height,
        &RefinementParams {
            min_island_area: 16,
            hole_fill_area: 16,
            smoothing_passes: 1,
        },
    );

    Ok(final_mask)
}

pub fn refine_mask(mask: &[u8], width: u32, height: u32, params: &RefinementParams) -> Vec<u8> {
    post_process_mask(mask, width, height, params)
}

fn post_process_mask(mask: &[u8], width: u32, height: u32, params: &RefinementParams) -> Vec<u8> {
    let mut result = mask.to_vec();
    let n = (width * height) as usize;

    // 1. Remove islands
    if params.min_island_area > 0 {
        let mut visited = vec![false; n];
        for i in 0..n {
            if result[i] == 1 && !visited[i] {
                let mut region = Vec::new();
                let mut q = VecDeque::new();
                q.push_back(i);
                visited[i] = true;
                region.push(i);

                while let Some(idx) = q.pop_front() {
                    let x = (idx as u32) % width;
                    let y = (idx as u32) / width;
                    for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                        let nx = x as i32 + dx;
                        let ny = y as i32 + dy;
                        if nx >= 0 && nx < width as i32 && ny >= 0 && ny < height as i32 {
                            let nidx = (ny as u32 * width + nx as u32) as usize;
                            if result[nidx] == 1 && !visited[nidx] {
                                visited[nidx] = true;
                                q.push_back(nidx);
                                region.push(nidx);
                            }
                        }
                    }
                }
                if (region.len() as u32) < params.min_island_area {
                    for &idx in &region {
                        result[idx] = 0;
                    }
                }
            }
        }
    }

    // 2. Fill holes
    if params.hole_fill_area > 0 {
        let mut visited = vec![false; n];
        for i in 0..n {
            if result[i] == 0 && !visited[i] {
                let mut region = Vec::new();
                let mut q = VecDeque::new();
                let mut touches_edge = false;
                q.push_back(i);
                visited[i] = true;
                region.push(i);

                while let Some(idx) = q.pop_front() {
                    let x = (idx as u32) % width;
                    let y = (idx as u32) / width;
                    if x == 0 || x == width - 1 || y == 0 || y == height - 1 {
                        touches_edge = true;
                    }
                    for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                        let nx = x as i32 + dx;
                        let ny = y as i32 + dy;
                        if nx >= 0 && nx < width as i32 && ny >= 0 && ny < height as i32 {
                            let nidx = (ny as u32 * width + nx as u32) as usize;
                            if result[nidx] == 0 && !visited[nidx] {
                                visited[nidx] = true;
                                q.push_back(nidx);
                                region.push(nidx);
                            }
                        }
                    }
                }
                if !touches_edge && (region.len() as u32) < params.hole_fill_area {
                    for &idx in &region {
                        result[idx] = 1;
                    }
                }
            }
        }
    }

    // 3. Smoothing passes
    for _ in 0..params.smoothing_passes {
        let mut smoothed = result.clone();
        for y in 1..height - 1 {
            for x in 1..width - 1 {
                let mut count = 0;
                for dy in -1..=1 {
                    for dx in -1..=1 {
                        if result
                            [((y as i32 + dy) as u32 * width + (x as i32 + dx) as u32) as usize]
                            == 1
                        {
                            count += 1;
                        }
                    }
                }
                smoothed[(y * width + x) as usize] = if count >= 5 { 1 } else { 0 };
            }
        }
        result = smoothed;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_init_and_reuse() {
        let rgba = vec![255u8; 100 * 100 * 4];
        let (w, h) = init_workspace(&rgba, 100, 100, "test-ws".to_string()).unwrap();
        assert_eq!(w, 100);
        assert_eq!(h, 100);

        // Verify it's in cache
        {
            let cache = get_cache();
            let lock = cache.lock().unwrap();
            let ws = lock.as_ref().unwrap();
            assert_eq!(ws.id, "test-ws");
            assert_eq!(ws.lab_pixels.len(), 10000);
        }

        // Test magic wand click
        let params = MagicWandParams {
            seed_x: 50,
            seed_y: 50,
            tolerance: 10.0,
            edge_stop: 30.0,
        };
        let mask = magic_wand_click("test-ws", &params).unwrap();
        assert_eq!(mask.len(), 10000);
        // All pixels are same color (white), so the whole thing should be selected
        assert_eq!(mask.iter().map(|&v| v as u32).sum::<u32>(), 10000);
    }

    #[test]
    fn test_coordinate_mapping() {
        // Create a 10x10 image with a 5x5 red square in the top-left
        let mut rgba = vec![255u8; 10 * 10 * 4]; // White
        for y in 0..5 {
            for x in 0..5 {
                let idx = (y * 10 + x) as usize * 4;
                rgba[idx] = 255;
                rgba[idx + 1] = 0;
                rgba[idx + 2] = 0;
            }
        }

        init_workspace(&rgba, 10, 10, "coord-test".to_string()).unwrap();

        // Click inside red square
        let mask = magic_wand_click(
            "coord-test",
            &MagicWandParams {
                seed_x: 2,
                seed_y: 2,
                tolerance: 5.0,
                edge_stop: 100.0,
            },
        )
        .unwrap();

        // Check top-left pixel
        assert_eq!(mask[0], 1);
        // Check middle of square
        assert_eq!(mask[2 * 10 + 2], 1);
        // Check outside square
        assert_eq!(mask[6 * 10 + 6], 0);
    }
}
