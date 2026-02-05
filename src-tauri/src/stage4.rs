use crate::embroidery::{PatternResult, Stitch};
use palette::{color_difference::Ciede2000, white_point::D65, FromColor, Lab, Srgb};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet, VecDeque};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage4Config {
    pub target_region_count: usize,
    pub min_region_area: usize,
    pub simplify_epsilon: f32,
    pub smoothing_strength: f32,
    pub smoothing_passes: u8,
    pub max_merge_passes: u16,
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Stage4Preset {
    Draft,
    Standard,
    HighDetail,
}

impl Stage4Config {
    /// Draft: stronger simplification for quick, bold printable regions.
    pub fn draft(target_region_count: usize, min_region_area: usize) -> Self {
        Self {
            target_region_count,
            min_region_area,
            simplify_epsilon: 0.75,
            smoothing_strength: 0.25,
            smoothing_passes: 1,
            max_merge_passes: 96,
        }
    }

    /// Standard: balanced defaults for everyday embroidery conversion.
    pub fn standard(target_region_count: usize, min_region_area: usize) -> Self {
        Self {
            target_region_count,
            min_region_area,
            simplify_epsilon: 0.42,
            smoothing_strength: 0.45,
            smoothing_passes: 1,
            max_merge_passes: 120,
        }
    }

    /// HighDetail: keeps more contour detail while remaining deterministic.
    pub fn high_detail(target_region_count: usize, min_region_area: usize) -> Self {
        Self {
            target_region_count,
            min_region_area,
            simplify_epsilon: 0.22,
            smoothing_strength: 0.55,
            smoothing_passes: 2,
            max_merge_passes: 160,
        }
    }

    pub fn from_preset(
        preset: Stage4Preset,
        target_region_count: usize,
        min_region_area: usize,
    ) -> Self {
        match preset {
            Stage4Preset::Draft => Self::draft(target_region_count, min_region_area),
            Stage4Preset::Standard => Self::standard(target_region_count, min_region_area),
            Stage4Preset::HighDetail => Self::high_detail(target_region_count, min_region_area),
        }
    }
}

impl Default for Stage4Config {
    fn default() -> Self {
        Self::standard(12, 24)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage4Region {
    pub region_id: String,
    pub dmc_color_id: String,
    pub color: Stage4RegionColor,
    pub area_px: usize,
    pub path_svg: String,
    pub path_offset_x: f32,
    pub path_offset_y: f32,
    pub holes_svg: Vec<String>,
    pub bbox: Stage4RegionBounds,
    pub centroid_x: f32,
    pub centroid_y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage4RegionColor {
    pub rgb: [u8; 3],
    pub hex: String,
    pub dmc_code: Option<String>,
    pub dmc_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage4RegionBounds {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stage4LegendEntry {
    pub dmc_color_id: String,
    pub dmc_code: String,
    pub name: String,
    pub hex: String,
    pub area_px: usize,
    pub region_count: usize,
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Stage4FallbackReason {
    NoStitches,
    NoConnectedRegions,
    TargetExceedsFeasible,
    MergeConvergenceLimit,
    MinAreaConflict,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stage4ContractRegion {
    pub region_id: String,
    pub dmc_color_id: String,
    pub svg_path: String,
    pub holes_svg_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stage4Contract {
    pub regions: Vec<Stage4ContractRegion>,
    pub legend: Vec<Stage4LegendEntry>,
    pub fallback_reason: Option<Stage4FallbackReason>,
    pub preset: Stage4Preset,
    pub target_region_count: usize,
    pub actual_region_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage4BuildResult {
    pub contract: Stage4Contract,
    pub regions: Vec<Stage4Region>,
    pub target_region_count: usize,
    pub actual_region_count: usize,
    pub fallback_reason: Option<Stage4FallbackReason>,
    pub preset: Stage4Preset,
}

#[derive(Debug, Clone)]
struct ColorMeta {
    dmc_code: String,
    dmc_name: String,
    hex: String,
    rgb: [u8; 3],
    lab: Lab<D65, f32>,
}

#[derive(Debug, Clone)]
struct Component {
    id: usize,
    label: usize,
    area: usize,
    min_x: usize,
    min_y: usize,
    max_x: usize,
    max_y: usize,
    sum_x: f64,
    sum_y: f64,
    pixels: Vec<usize>,
    neighbors: Vec<(usize, usize)>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
struct GridPoint {
    x: i32,
    y: i32,
}

#[derive(Debug, Copy, Clone, PartialEq)]
struct FloatPoint {
    x: f32,
    y: f32,
}

struct ComponentAnalysis {
    components: Vec<Component>,
    component_grid: Vec<i32>,
}

pub fn build_stage4_regions(
    pattern: &PatternResult,
    config: &Stage4Config,
    preset: Stage4Preset,
) -> Result<Stage4BuildResult, String> {
    let timing_enabled = stage4_timing_enabled();
    let t_total = Instant::now();
    let width = pattern.width as usize;
    let height = pattern.height as usize;
    if width == 0 || height == 0 {
        return Err("Pattern dimensions must be non-zero".to_string());
    }

    let t_label_map = Instant::now();
    let (mut labels, palette) = build_label_map(pattern, width, height);
    let label_map_ms = t_label_map.elapsed().as_millis();
    if palette.is_empty() {
        return Ok(Stage4BuildResult {
            contract: Stage4Contract {
                regions: Vec::new(),
                legend: Vec::new(),
                fallback_reason: Some(Stage4FallbackReason::NoStitches),
                preset,
                target_region_count: config.target_region_count,
                actual_region_count: 0,
            },
            regions: Vec::new(),
            target_region_count: config.target_region_count,
            actual_region_count: 0,
            fallback_reason: Some(Stage4FallbackReason::NoStitches),
            preset,
        });
    }

    let t_merge = Instant::now();
    let fallback_reason = enforce_region_constraints(&mut labels, width, height, &palette, config);
    let merge_ms = t_merge.elapsed().as_millis();
    let t_contour = Instant::now();
    let analysis = analyze_components(&labels, width, height);
    let mut components = analysis.components;
    components.sort_by(component_sort_key);

    let mut regions = Vec::with_capacity(components.len());

    for (idx, component) in components.iter().enumerate() {
        let label = component.label;
        let Some(meta) = palette.get(label) else {
            continue;
        };

        let loops =
            build_component_loops(width, height, &analysis.component_grid, component.id as i32);
        if loops.is_empty() {
            continue;
        }

        let mut float_loops: Vec<Vec<FloatPoint>> = loops
            .into_iter()
            .map(|loop_points| smooth_and_simplify_loop(loop_points, config))
            .filter(|loop_points| loop_points.len() >= 4)
            .collect();
        if float_loops.is_empty() {
            continue;
        }

        float_loops.sort_by(|a, b| {
            polygon_abs_area(b)
                .partial_cmp(&polygon_abs_area(a))
                .unwrap_or(Ordering::Equal)
        });

        let outer = float_loops[0].clone();
        let holes = float_loops.iter().skip(1).cloned().collect::<Vec<_>>();
        let region_id = format!("r_{}", idx + 1);
        let dmc_color_id = color_id(&meta.dmc_code, &meta.hex);

        regions.push(Stage4Region {
            region_id: region_id.clone(),
            dmc_color_id: dmc_color_id.clone(),
            color: Stage4RegionColor {
                rgb: meta.rgb,
                hex: meta.hex.clone(),
                dmc_code: Some(meta.dmc_code.clone()),
                dmc_name: Some(meta.dmc_name.clone()),
            },
            area_px: component.area,
            path_svg: ensure_closed_svg_path(&loop_to_svg_path(&outer)),
            path_offset_x: 0.0,
            path_offset_y: 0.0,
            holes_svg: holes
                .iter()
                .map(|loop_points| ensure_closed_svg_path(&loop_to_svg_path(loop_points)))
                .collect(),
            bbox: Stage4RegionBounds {
                x: component.min_x as f32,
                y: component.min_y as f32,
                w: (component.max_x + 1 - component.min_x) as f32,
                h: (component.max_y + 1 - component.min_y) as f32,
            },
            centroid_x: (component.sum_x / component.area as f64) as f32,
            centroid_y: (component.sum_y / component.area as f64) as f32,
        });
    }

    let legend = build_color_legend(&regions);
    let actual_region_count = regions.len();
    let fallback_reason = fallback_reason.or_else(|| {
        if actual_region_count < config.target_region_count {
            Some(Stage4FallbackReason::TargetExceedsFeasible)
        } else {
            None
        }
    });
    let contract = Stage4Contract {
        regions: regions
            .iter()
            .map(|region| Stage4ContractRegion {
                region_id: region.region_id.clone(),
                dmc_color_id: region.dmc_color_id.clone(),
                svg_path: ensure_closed_svg_path(&region.path_svg),
                holes_svg_paths: region.holes_svg.clone(),
            })
            .collect(),
        legend,
        fallback_reason,
        preset,
        target_region_count: config.target_region_count,
        actual_region_count,
    };

    let contour_ms = t_contour.elapsed().as_millis();
    let total_ms = t_total.elapsed().as_millis();
    if timing_enabled {
        log::debug!(
            "Stage4 timing preset={:?} target={} actual={} label_map={}ms merge={}ms contour={}ms total={}ms",
            preset,
            config.target_region_count,
            actual_region_count,
            label_map_ms,
            merge_ms,
            contour_ms,
            total_ms
        );
    }

    Ok(Stage4BuildResult {
        contract,
        regions,
        target_region_count: config.target_region_count,
        actual_region_count,
        fallback_reason,
        preset,
    })
}

fn stage4_timing_enabled() -> bool {
    matches!(
        std::env::var("MAGPIE_STAGE4_DEBUG_TIMING").as_deref(),
        Ok("1") | Ok("true") | Ok("TRUE") | Ok("yes") | Ok("YES")
    )
}

fn build_label_map(
    pattern: &PatternResult,
    width: usize,
    height: usize,
) -> (Vec<i32>, Vec<ColorMeta>) {
    let mut labels = vec![-1; width * height];
    let color_name_by_code = build_dmc_name_lookup(pattern);

    let mut unique_keys = HashSet::<String>::new();
    for stitch in &pattern.stitches {
        if is_fabric(stitch) {
            continue;
        }
        unique_keys.insert(color_key(&stitch.dmc_code, &stitch.hex));
    }

    let mut ordered_keys = unique_keys.into_iter().collect::<Vec<_>>();
    ordered_keys.sort();

    let mut palette = Vec::<ColorMeta>::with_capacity(ordered_keys.len());
    let mut label_by_key = HashMap::<String, usize>::new();
    for (idx, key) in ordered_keys.iter().enumerate() {
        let (dmc_code, hex) = split_color_key(key);
        let rgb = hex_to_rgb(&hex).unwrap_or([0, 0, 0]);
        let dmc_name = color_name_by_code
            .get(&dmc_code)
            .cloned()
            .unwrap_or_else(|| "Custom Color".to_string());
        palette.push(ColorMeta {
            dmc_code: dmc_code.clone(),
            dmc_name,
            hex: hex.clone(),
            rgb,
            lab: rgb_to_lab(rgb),
        });
        label_by_key.insert(key.clone(), idx);
    }

    for stitch in &pattern.stitches {
        if is_fabric(stitch) {
            continue;
        }
        let x = stitch.x as usize;
        let y = stitch.y as usize;
        if x >= width || y >= height {
            continue;
        }

        let key = color_key(&stitch.dmc_code, &stitch.hex);
        if let Some(label) = label_by_key.get(&key) {
            labels[y * width + x] = *label as i32;
        }
    }

    (labels, palette)
}

fn build_dmc_name_lookup(pattern: &PatternResult) -> HashMap<String, String> {
    let mut lookup = HashMap::new();
    for mapping in &pattern.color_mappings {
        lookup.insert(
            mapping.dmc.code.trim().to_ascii_uppercase(),
            mapping.dmc.name.clone(),
        );
    }
    lookup
}

fn enforce_region_constraints(
    labels: &mut [i32],
    width: usize,
    height: usize,
    palette: &[ColorMeta],
    config: &Stage4Config,
) -> Option<Stage4FallbackReason> {
    let mut fallback_reason = None;

    for _pass in 0..config.max_merge_passes {
        let analysis = analyze_components(labels, width, height);
        let region_count = analysis.components.len();
        let target = config.target_region_count.max(1);

        let small_count = analysis
            .components
            .iter()
            .filter(|c| c.area < config.min_region_area.max(1))
            .count();
        if region_count <= target && small_count == 0 {
            return fallback_reason;
        }

        if region_count == 0 {
            fallback_reason = Some(Stage4FallbackReason::NoConnectedRegions);
            return fallback_reason;
        }

        let merges_needed_for_target = region_count.saturating_sub(target);
        let mut candidates = analysis
            .components
            .iter()
            .map(|component| component.id)
            .collect::<Vec<_>>();
        candidates.sort_by(|a, b| {
            let ca = &analysis.components[*a];
            let cb = &analysis.components[*b];
            merge_priority(ca).cmp(&merge_priority(cb))
        });

        let mut selected = Vec::<usize>::new();
        let mut selected_set = HashSet::<usize>::new();

        for component_id in &candidates {
            let component = &analysis.components[*component_id];
            if component.area < config.min_region_area.max(1) {
                selected.push(*component_id);
                selected_set.insert(*component_id);
            }
        }

        let mut extra_needed = merges_needed_for_target.saturating_sub(selected.len());
        if extra_needed > 0 {
            for component_id in &candidates {
                if extra_needed == 0 {
                    break;
                }
                if selected_set.contains(component_id) {
                    continue;
                }
                selected.push(*component_id);
                selected_set.insert(*component_id);
                extra_needed -= 1;
            }
        }

        if selected.is_empty() {
            break;
        }

        let mut relabels = Vec::<(usize, i32)>::new();
        for source_id in selected {
            let Some(dest_label) = choose_merge_target(
                source_id,
                &analysis.components,
                &selected_set,
                palette,
                false,
            )
            .or_else(|| {
                choose_merge_target(
                    source_id,
                    &analysis.components,
                    &selected_set,
                    palette,
                    true,
                )
            }) else {
                continue;
            };

            relabels.push((source_id, dest_label as i32));
        }

        if relabels.is_empty() {
            break;
        }

        for (source_id, dest_label) in relabels {
            for pixel_idx in &analysis.components[source_id].pixels {
                labels[*pixel_idx] = dest_label;
            }
        }
    }

    let analysis = analyze_components(labels, width, height);
    let region_count = analysis.components.len();
    let target = config.target_region_count.max(1);
    if region_count > target {
        fallback_reason = Some(Stage4FallbackReason::MergeConvergenceLimit);
    } else if region_count < target {
        fallback_reason = Some(Stage4FallbackReason::TargetExceedsFeasible);
    } else if analysis
        .components
        .iter()
        .any(|component| component.area < config.min_region_area.max(1))
    {
        fallback_reason = Some(Stage4FallbackReason::MinAreaConflict);
    }

    fallback_reason
}

fn merge_priority(component: &Component) -> (usize, usize, usize, usize, usize) {
    (
        component.area,
        component.min_y,
        component.min_x,
        component.label,
        component.id,
    )
}

fn choose_merge_target(
    source_id: usize,
    components: &[Component],
    selected_sources: &HashSet<usize>,
    palette: &[ColorMeta],
    allow_source_target: bool,
) -> Option<usize> {
    let source = components.get(source_id)?;
    let mut options = source
        .neighbors
        .iter()
        .filter_map(|(neighbor_id, boundary_len)| {
            if !allow_source_target && selected_sources.contains(neighbor_id) {
                return None;
            }
            let neighbor = components.get(*neighbor_id)?;
            let source_meta = palette.get(source.label)?;
            let neighbor_meta = palette.get(neighbor.label)?;
            let color_distance = source_meta.lab.difference(neighbor_meta.lab);
            Some((
                neighbor.label,
                boundary_len,
                color_distance,
                neighbor.area,
                neighbor.min_y,
                neighbor.min_x,
                neighbor.id,
            ))
        })
        .collect::<Vec<_>>();

    options.sort_by(|a, b| {
        b.1.cmp(a.1)
            .then_with(|| a.2.partial_cmp(&b.2).unwrap_or(Ordering::Equal))
            .then_with(|| b.3.cmp(&a.3))
            .then_with(|| a.4.cmp(&b.4))
            .then_with(|| a.5.cmp(&b.5))
            .then_with(|| a.6.cmp(&b.6))
    });
    options.first().map(|candidate| candidate.0)
}

fn analyze_components(labels: &[i32], width: usize, height: usize) -> ComponentAnalysis {
    let len = width * height;
    let mut visited = vec![false; len];
    let mut component_grid = vec![-1; len];
    let mut components = Vec::<Component>::new();
    let mut queue = VecDeque::<usize>::new();

    for start in 0..len {
        if visited[start] || labels[start] < 0 {
            continue;
        }

        let component_id = components.len();
        let label = labels[start] as usize;
        visited[start] = true;
        queue.push_back(start);

        let mut pixels = Vec::<usize>::new();
        let mut min_x = width;
        let mut min_y = height;
        let mut max_x = 0usize;
        let mut max_y = 0usize;
        let mut sum_x = 0.0f64;
        let mut sum_y = 0.0f64;

        while let Some(idx) = queue.pop_front() {
            if labels[idx] != label as i32 {
                continue;
            }
            component_grid[idx] = component_id as i32;
            pixels.push(idx);

            let x = idx % width;
            let y = idx / width;
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
            sum_x += x as f64 + 0.5;
            sum_y += y as f64 + 0.5;

            if x > 0 {
                let n = idx - 1;
                if !visited[n] && labels[n] == label as i32 {
                    visited[n] = true;
                    queue.push_back(n);
                }
            }
            if x + 1 < width {
                let n = idx + 1;
                if !visited[n] && labels[n] == label as i32 {
                    visited[n] = true;
                    queue.push_back(n);
                }
            }
            if y > 0 {
                let n = idx - width;
                if !visited[n] && labels[n] == label as i32 {
                    visited[n] = true;
                    queue.push_back(n);
                }
            }
            if y + 1 < height {
                let n = idx + width;
                if !visited[n] && labels[n] == label as i32 {
                    visited[n] = true;
                    queue.push_back(n);
                }
            }
        }

        if pixels.is_empty() {
            continue;
        }

        components.push(Component {
            id: component_id,
            label,
            area: pixels.len(),
            min_x,
            min_y,
            max_x,
            max_y,
            sum_x,
            sum_y,
            pixels,
            neighbors: Vec::new(),
        });
    }

    let mut adjacency: Vec<HashMap<usize, usize>> = vec![HashMap::new(); components.len()];
    for y in 0..height {
        for x in 0..width {
            let idx = y * width + x;
            let a = component_grid[idx];
            if a < 0 {
                continue;
            }

            if x + 1 < width {
                let b = component_grid[idx + 1];
                if b >= 0 && a != b {
                    *adjacency[a as usize].entry(b as usize).or_insert(0) += 1;
                    *adjacency[b as usize].entry(a as usize).or_insert(0) += 1;
                }
            }
            if y + 1 < height {
                let b = component_grid[idx + width];
                if b >= 0 && a != b {
                    *adjacency[a as usize].entry(b as usize).or_insert(0) += 1;
                    *adjacency[b as usize].entry(a as usize).or_insert(0) += 1;
                }
            }
        }
    }

    for (component, neighbors) in components.iter_mut().zip(adjacency.into_iter()) {
        let mut neighbor_list = neighbors.into_iter().collect::<Vec<_>>();
        neighbor_list.sort_by(|a, b| a.0.cmp(&b.0));
        component.neighbors = neighbor_list;
    }

    ComponentAnalysis {
        components,
        component_grid,
    }
}

fn build_component_loops(
    width: usize,
    height: usize,
    component_grid: &[i32],
    component_id: i32,
) -> Vec<Vec<GridPoint>> {
    let mut segments = Vec::<(GridPoint, GridPoint)>::new();

    for idx in 0..component_grid.len() {
        if component_grid[idx] != component_id {
            continue;
        }

        let x = idx % width;
        let y = idx / width;

        if y == 0 || component_grid[idx - width] != component_id {
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
        if x + 1 >= width || component_grid[idx + 1] != component_id {
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
        if y + 1 >= height || component_grid[idx + width] != component_id {
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
        if x == 0 || component_grid[idx - 1] != component_id {
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

            let next_segment = outgoing.iter().copied().find(|candidate| !used[*candidate]);
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
                let reduced = reduce_micro_zigzags_loop(simplified);
                if reduced.len() >= 4 {
                    loops.push(reduced);
                }
            }
        }
    }

    loops.sort_by(|a, b| {
        let a_key = loop_sort_key(a);
        let b_key = loop_sort_key(b);
        a_key.cmp(&b_key)
    });
    loops
}

fn simplify_axis_aligned_loop(mut points: Vec<GridPoint>) -> Vec<GridPoint> {
    if points.len() < 4 {
        return points;
    }
    if points.first() == points.last() {
        points.pop();
    }

    let len = points.len();
    let mut keep = vec![true; len];
    for i in 0..len {
        let prev = points[(i + len - 1) % len];
        let curr = points[i];
        let next = points[(i + 1) % len];
        let collinear_x = prev.x == curr.x && curr.x == next.x;
        let collinear_y = prev.y == curr.y && curr.y == next.y;
        if collinear_x || collinear_y {
            keep[i] = false;
        }
    }

    let mut simplified = Vec::new();
    for (idx, point) in points.iter().enumerate() {
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

fn reduce_micro_zigzags_loop(points: Vec<GridPoint>) -> Vec<GridPoint> {
    if points.len() < 6 {
        return points;
    }

    let mut open = points[..points.len() - 1].to_vec();
    let mut changed = true;
    while changed && open.len() >= 4 {
        changed = false;
        let mut keep = vec![true; open.len()];
        for i in 0..open.len() {
            let prev = open[(i + open.len() - 1) % open.len()];
            let curr = open[i];
            let next = open[(i + 1) % open.len()];

            let step_prev = (curr.x - prev.x).abs() + (curr.y - prev.y).abs();
            let step_next = (next.x - curr.x).abs() + (next.y - curr.y).abs();
            let prev_next = (next.x - prev.x).abs() + (next.y - prev.y).abs();
            if step_prev == 1 && step_next == 1 && prev_next == 2 {
                keep[i] = false;
                changed = true;
            }
        }

        if changed {
            let mut next_open = Vec::with_capacity(open.len());
            for (idx, point) in open.iter().enumerate() {
                if keep[idx] {
                    next_open.push(*point);
                }
            }
            if next_open.len() >= 3 {
                open = next_open;
            } else {
                break;
            }
        }
    }

    if open.len() < 3 {
        return Vec::new();
    }
    open.push(open[0]);
    open
}

fn smooth_and_simplify_loop(loop_points: Vec<GridPoint>, config: &Stage4Config) -> Vec<FloatPoint> {
    let mut closed = loop_points
        .iter()
        .map(|point| FloatPoint {
            x: point.x as f32,
            y: point.y as f32,
        })
        .collect::<Vec<_>>();
    if closed.first() != closed.last() {
        if let Some(first) = closed.first().copied() {
            closed.push(first);
        }
    }
    if closed.len() < 4 {
        return Vec::new();
    }

    let mut open = closed[..closed.len() - 1].to_vec();
    open = merge_nearly_collinear_closed(&open, (config.simplify_epsilon * 0.18).max(0.05));
    for _ in 0..config.smoothing_passes {
        open = chaikin_smooth_closed(&open, config.smoothing_strength);
        open = merge_nearly_collinear_closed(&open, (config.simplify_epsilon * 0.12).max(0.035));
        if open.len() < 3 {
            break;
        }
    }
    let mut res = simplify_float_loop(open, config.simplify_epsilon);
    if res.first() != res.last() {
        if let Some(first) = res.first().copied() {
            res.push(first);
        }
    }
    if res.len() < 4 {
        Vec::new()
    } else {
        res
    }
}

fn chaikin_smooth_closed(points: &[FloatPoint], strength: f32) -> Vec<FloatPoint> {
    if points.len() < 3 {
        return points.to_vec();
    }

    let alpha = (0.25 * strength.clamp(0.0, 1.0)).max(0.0);
    if alpha <= 0.0001 {
        return points.to_vec();
    }

    let mut smoothed = Vec::with_capacity(points.len() * 2);
    for i in 0..points.len() {
        let p0 = points[i];
        let p1 = points[(i + 1) % points.len()];
        let q = FloatPoint {
            x: (1.0 - alpha) * p0.x + alpha * p1.x,
            y: (1.0 - alpha) * p0.y + alpha * p1.y,
        };
        let r = FloatPoint {
            x: alpha * p0.x + (1.0 - alpha) * p1.x,
            y: alpha * p0.y + (1.0 - alpha) * p1.y,
        };
        smoothed.push(q);
        smoothed.push(r);
    }
    smoothed
}

fn merge_nearly_collinear_closed(points: &[FloatPoint], tolerance: f32) -> Vec<FloatPoint> {
    if points.len() < 4 {
        return points.to_vec();
    }
    let tol_sq = tolerance.max(0.0) * tolerance.max(0.0);
    if tol_sq <= 0.0 {
        return points.to_vec();
    }

    let mut reduced = Vec::with_capacity(points.len());
    for i in 0..points.len() {
        let prev = points[(i + points.len() - 1) % points.len()];
        let curr = points[i];
        let next = points[(i + 1) % points.len()];
        let dist_sq = point_to_segment_distance_sq(curr, prev, next);
        if dist_sq > tol_sq || is_corner(prev, curr, next) {
            reduced.push(curr);
        }
    }

    if reduced.len() < 3 {
        points.to_vec()
    } else {
        reduced
    }
}

fn simplify_float_loop(points: Vec<FloatPoint>, epsilon: f32) -> Vec<FloatPoint> {
    if points.len() < 3 {
        return points;
    }
    let threshold = epsilon.max(0.0);
    if threshold <= 0.0001 {
        return points;
    }

    let mut simplified = Vec::new();
    for i in 0..points.len() {
        let prev = points[(i + points.len() - 1) % points.len()];
        let current = points[i];
        let next = points[(i + 1) % points.len()];
        let corner = is_corner(prev, current, next);
        let dist_prev = squared_distance(prev, current).sqrt();
        if corner || dist_prev >= threshold {
            simplified.push(current);
        }
    }

    if simplified.len() < 3 {
        points
    } else {
        simplified
    }
}

fn is_corner(a: FloatPoint, b: FloatPoint, c: FloatPoint) -> bool {
    let abx = b.x - a.x;
    let aby = b.y - a.y;
    let bcx = c.x - b.x;
    let bcy = c.y - b.y;
    (abx * bcy - aby * bcx).abs() > 0.0001
}

fn squared_distance(a: FloatPoint, b: FloatPoint) -> f32 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    dx * dx + dy * dy
}

fn point_to_segment_distance_sq(p: FloatPoint, a: FloatPoint, b: FloatPoint) -> f32 {
    let abx = b.x - a.x;
    let aby = b.y - a.y;
    let apx = p.x - a.x;
    let apy = p.y - a.y;
    let ab_len_sq = abx * abx + aby * aby;
    if ab_len_sq <= 1e-8 {
        return squared_distance(p, a);
    }
    let t = ((apx * abx + apy * aby) / ab_len_sq).clamp(0.0, 1.0);
    let closest = FloatPoint {
        x: a.x + abx * t,
        y: a.y + aby * t,
    };
    squared_distance(p, closest)
}

fn polygon_abs_area(points: &[FloatPoint]) -> f32 {
    polygon_signed_area(points).abs()
}

fn polygon_signed_area(points: &[FloatPoint]) -> f32 {
    if points.len() < 3 {
        return 0.0;
    }
    let mut area = 0.0f32;
    for i in 0..points.len() {
        let a = points[i];
        let b = points[(i + 1) % points.len()];
        area += a.x * b.y - b.x * a.y;
    }
    area * 0.5
}

fn component_sort_key(a: &Component, b: &Component) -> Ordering {
    a.label
        .cmp(&b.label)
        .then(a.min_y.cmp(&b.min_y))
        .then(a.min_x.cmp(&b.min_x))
        .then(b.area.cmp(&a.area))
        .then(a.id.cmp(&b.id))
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

fn loop_sort_key(points: &[GridPoint]) -> (i32, i32, usize) {
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    for point in points {
        min_x = min_x.min(point.x);
        min_y = min_y.min(point.y);
    }
    (min_y, min_x, points.len())
}

fn loop_to_svg_path(points: &[FloatPoint]) -> String {
    if points.len() < 4 {
        return String::new();
    }
    let mut path = String::new();
    for (idx, point) in points.iter().enumerate() {
        if idx == 0 {
            path.push_str(&format!("M{:.2},{:.2}", point.x, point.y));
        } else {
            path.push_str(&format!(" L{:.2},{:.2}", point.x, point.y));
        }
    }
    path.push_str(" Z");
    path
}

fn ensure_closed_svg_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return "M0,0 Z".to_string();
    }

    let mut out = trimmed.to_string();
    if !out.starts_with('M') {
        out = format!("M0,0 {}", out);
    }
    if !out.ends_with('Z') {
        out.push_str(" Z");
    }
    out
}

fn build_color_legend(regions: &[Stage4Region]) -> Vec<Stage4LegendEntry> {
    let mut by_color = HashMap::<String, Stage4LegendEntry>::new();
    for region in regions {
        let entry = by_color
            .entry(region.dmc_color_id.clone())
            .or_insert_with(|| Stage4LegendEntry {
                dmc_color_id: region.dmc_color_id.clone(),
                dmc_code: region
                    .color
                    .dmc_code
                    .clone()
                    .unwrap_or_else(|| "CUSTOM".to_string()),
                name: region
                    .color
                    .dmc_name
                    .clone()
                    .unwrap_or_else(|| "Custom Color".to_string()),
                hex: region.color.hex.clone(),
                area_px: 0,
                region_count: 0,
            });
        entry.area_px += region.area_px;
        entry.region_count += 1;
    }

    let mut legend = by_color.into_values().collect::<Vec<_>>();
    legend.sort_by(|a, b| {
        a.dmc_color_id
            .cmp(&b.dmc_color_id)
            .then(b.area_px.cmp(&a.area_px))
    });
    legend
}

fn color_id(dmc_code: &str, hex: &str) -> String {
    format!(
        "{}:{}",
        dmc_code.trim().to_ascii_uppercase(),
        normalize_hex(hex)
    )
}

fn color_key(code: &str, hex: &str) -> String {
    format!(
        "{}|{}",
        code.trim().to_ascii_uppercase(),
        normalize_hex(hex)
    )
}

fn split_color_key(value: &str) -> (String, String) {
    let mut parts = value.splitn(2, '|');
    let code = parts.next().unwrap_or_default().to_string();
    let hex = parts.next().unwrap_or("#000000").to_string();
    (code, hex)
}

fn normalize_hex(hex: &str) -> String {
    let value = hex.trim().trim_start_matches('#').to_ascii_uppercase();
    if value.len() == 6 {
        format!("#{}", value)
    } else {
        "#000000".to_string()
    }
}

fn is_fabric(stitch: &Stitch) -> bool {
    stitch.dmc_code.eq_ignore_ascii_case("fabric")
}

fn hex_to_rgb(hex: &str) -> Option<[u8; 3]> {
    let trimmed = hex.trim_start_matches('#');
    if trimmed.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&trimmed[0..2], 16).ok()?;
    let g = u8::from_str_radix(&trimmed[2..4], 16).ok()?;
    let b = u8::from_str_radix(&trimmed[4..6], 16).ok()?;
    Some([r, g, b])
}

fn rgb_to_lab(rgb: [u8; 3]) -> Lab<D65, f32> {
    let srgb = Srgb::new(
        rgb[0] as f32 / 255.0,
        rgb[1] as f32 / 255.0,
        rgb[2] as f32 / 255.0,
    );
    Lab::from_color(srgb)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(feature = "stage4-fixtures")]
    use crate::embroidery::process_pattern;
    use crate::embroidery::{ColorMapping, DmcMetadata, LegendEntry, PatternResult};
    #[cfg(feature = "stage4-fixtures")]
    use image::{ImageBuffer, Rgba};
    #[cfg(feature = "stage4-fixtures")]
    use std::fs;
    #[cfg(feature = "stage4-fixtures")]
    use std::io::Write;
    #[cfg(feature = "stage4-fixtures")]
    use std::path::Path;

    fn make_test_pattern(label_rows: &[&[(&str, &str)]]) -> PatternResult {
        let height = label_rows.len() as u32;
        let width = label_rows.first().map(|row| row.len()).unwrap_or(0) as u32;
        let mut stitches = Vec::new();
        let mut mappings = HashMap::<String, ColorMapping>::new();

        for (y, row) in label_rows.iter().enumerate() {
            for (x, (code, hex)) in row.iter().enumerate() {
                stitches.push(Stitch {
                    x: x as u32,
                    y: y as u32,
                    dmc_code: (*code).to_string(),
                    marker: String::new(),
                    hex: (*hex).to_string(),
                });
                if code.eq_ignore_ascii_case("fabric") {
                    continue;
                }
                let key = color_key(code, hex);
                mappings.entry(key).or_insert_with(|| ColorMapping {
                    original_hex: (*hex).to_string(),
                    mapped_hex: (*hex).to_string(),
                    dmc: DmcMetadata {
                        code: (*code).to_string(),
                        name: format!("Color {}", code),
                        hex: (*hex).to_string(),
                    },
                });
            }
        }

        PatternResult {
            width,
            height,
            stitches,
            palette: mappings.values().map(|m| m.mapped_hex.clone()).collect(),
            dmc_palette: mappings.values().map(|m| m.dmc.hex.clone()).collect(),
            legend: vec![LegendEntry {
                dmc_code: "X".to_string(),
                name: "X".to_string(),
                hex: "#000000".to_string(),
                stitch_count: 1,
                coverage: 1.0,
            }],
            color_mappings: mappings.into_values().collect(),
            total_stitches: (width * height) as u32,
            processing_time_ms: 0,
        }
    }

    fn test_config(target_region_count: usize, min_region_area: usize) -> Stage4Config {
        Stage4Config {
            target_region_count,
            min_region_area,
            simplify_epsilon: 0.0,
            smoothing_strength: 0.0,
            smoothing_passes: 0,
            max_merge_passes: 128,
        }
    }

    #[test]
    fn stage4_output_is_deterministic_for_fixed_input() {
        let pattern = make_test_pattern(&[
            &[
                ("310", "#000000"),
                ("310", "#000000"),
                ("321", "#CE1938"),
                ("321", "#CE1938"),
            ],
            &[
                ("310", "#000000"),
                ("310", "#000000"),
                ("321", "#CE1938"),
                ("321", "#CE1938"),
            ],
            &[
                ("444", "#FFE00B"),
                ("444", "#FFE00B"),
                ("321", "#CE1938"),
                ("321", "#CE1938"),
            ],
            &[
                ("444", "#FFE00B"),
                ("444", "#FFE00B"),
                ("321", "#CE1938"),
                ("321", "#CE1938"),
            ],
        ]);
        let config = test_config(3, 1);

        let first = build_stage4_regions(&pattern, &config, Stage4Preset::Standard)
            .expect("first run should succeed");
        let second = build_stage4_regions(&pattern, &config, Stage4Preset::Standard)
            .expect("second run should succeed");

        assert_eq!(first.actual_region_count, second.actual_region_count);
        assert_eq!(first.contract.legend, second.contract.legend);
        assert_eq!(
            first.contract.fallback_reason,
            second.contract.fallback_reason
        );

        let first_paths = first
            .regions
            .iter()
            .map(|region| (&region.region_id, &region.path_svg, &region.color.dmc_code))
            .collect::<Vec<_>>();
        let second_paths = second
            .regions
            .iter()
            .map(|region| (&region.region_id, &region.path_svg, &region.color.dmc_code))
            .collect::<Vec<_>>();
        assert_eq!(first_paths, second_paths);
    }

    #[test]
    fn stage4_regions_have_closed_paths() {
        let pattern = make_test_pattern(&[
            &[("310", "#000000"), ("310", "#000000"), ("310", "#000000")],
            &[("310", "#000000"), ("310", "#000000"), ("310", "#000000")],
            &[("310", "#000000"), ("310", "#000000"), ("310", "#000000")],
        ]);
        let result = build_stage4_regions(&pattern, &test_config(1, 1), Stage4Preset::Standard)
            .expect("stage4 should build");
        assert_eq!(result.regions.len(), 1);

        for region in result.regions {
            assert!(region.path_svg.ends_with('Z'));
            assert!(region.path_svg.starts_with('M'));
        }
    }

    #[test]
    fn stage4_enforces_target_region_count_when_merge_is_possible() {
        let pattern = make_test_pattern(&[
            &[
                ("310", "#000000"),
                ("321", "#CE1938"),
                ("444", "#FFE00B"),
                ("700", "#2E7D09"),
            ],
            &[
                ("321", "#CE1938"),
                ("310", "#000000"),
                ("700", "#2E7D09"),
                ("444", "#FFE00B"),
            ],
            &[
                ("444", "#FFE00B"),
                ("700", "#2E7D09"),
                ("310", "#000000"),
                ("321", "#CE1938"),
            ],
            &[
                ("700", "#2E7D09"),
                ("444", "#FFE00B"),
                ("321", "#CE1938"),
                ("310", "#000000"),
            ],
        ]);

        let result = build_stage4_regions(&pattern, &test_config(3, 1), Stage4Preset::Standard)
            .expect("stage4 should build");
        assert_eq!(result.actual_region_count, 3);
        assert!(result.fallback_reason.is_none());
    }

    #[test]
    fn stage4_handles_target_one_deterministically() {
        let pattern = make_test_pattern(&[
            &[("310", "#000000"), ("310", "#000000"), ("321", "#CE1938")],
            &[("310", "#000000"), ("321", "#CE1938"), ("321", "#CE1938")],
            &[("310", "#000000"), ("310", "#000000"), ("321", "#CE1938")],
        ]);
        let result = build_stage4_regions(&pattern, &test_config(1, 1), Stage4Preset::Standard)
            .expect("stage4 should build");
        assert_eq!(result.actual_region_count, 1);
        assert!(result.fallback_reason.is_none());
    }

    #[test]
    fn stage4_reports_fallback_when_target_cannot_be_reached() {
        let pattern = make_test_pattern(&[
            &[("310", "#000000"), ("310", "#000000")],
            &[("310", "#000000"), ("310", "#000000")],
        ]);

        let result = build_stage4_regions(&pattern, &test_config(5, 1), Stage4Preset::Standard)
            .expect("stage4 should build");
        assert_eq!(result.actual_region_count, 1);
        assert_eq!(
            result.fallback_reason,
            Some(Stage4FallbackReason::TargetExceedsFeasible)
        );
    }

    #[test]
    fn stage4_legend_maps_each_region_exactly_once() {
        let pattern = make_test_pattern(&[
            &[
                ("310", "#000000"),
                ("310", "#000000"),
                ("321", "#CE1938"),
                ("321", "#CE1938"),
            ],
            &[
                ("310", "#000000"),
                ("310", "#000000"),
                ("321", "#CE1938"),
                ("321", "#CE1938"),
            ],
            &[
                ("700", "#2E7D09"),
                ("700", "#2E7D09"),
                ("444", "#FFE00B"),
                ("444", "#FFE00B"),
            ],
            &[
                ("700", "#2E7D09"),
                ("700", "#2E7D09"),
                ("444", "#FFE00B"),
                ("444", "#FFE00B"),
            ],
        ]);

        let result = build_stage4_regions(&pattern, &test_config(4, 1), Stage4Preset::Standard)
            .expect("stage4 should build");
        assert!(!result.contract.legend.is_empty());

        let mut unique = HashSet::new();
        for region in &result.contract.regions {
            assert!(unique.insert(region.region_id.clone()));
            let legend = result
                .contract
                .legend
                .iter()
                .find(|entry| entry.dmc_color_id == region.dmc_color_id)
                .expect("region color id should exist in legend");
            let region = result
                .regions
                .iter()
                .find(|candidate| candidate.region_id == region.region_id)
                .expect("contract region should match expanded region");
            assert_eq!(region.dmc_color_id, legend.dmc_color_id);
        }
    }

    #[test]
    fn stage4_reduces_micro_zigzags_before_smoothing() {
        let loop_points = vec![
            GridPoint { x: 0, y: 0 },
            GridPoint { x: 1, y: 0 },
            GridPoint { x: 1, y: 1 },
            GridPoint { x: 2, y: 1 },
            GridPoint { x: 2, y: 2 },
            GridPoint { x: 0, y: 2 },
            GridPoint { x: 0, y: 0 },
        ];
        let reduced = reduce_micro_zigzags_loop(loop_points);
        assert!(reduced.len() < 7);
        assert_eq!(reduced.first(), reduced.last());
    }

    #[test]
    fn stage4_merges_tiny_border_regions() {
        let pattern = make_test_pattern(&[
            &[("321", "#CE1938"), ("310", "#000000"), ("310", "#000000")],
            &[("310", "#000000"), ("310", "#000000"), ("310", "#000000")],
            &[("310", "#000000"), ("310", "#000000"), ("310", "#000000")],
        ]);
        let result = build_stage4_regions(&pattern, &test_config(2, 2), Stage4Preset::Standard)
            .expect("stage4 should build");

        assert_eq!(result.actual_region_count, 1);
        assert_eq!(result.contract.legend.len(), 1);
        assert_eq!(result.contract.legend[0].dmc_code, "310");
    }

    #[test]
    fn stage4_emits_hole_paths_for_donut_regions() {
        let pattern = make_test_pattern(&[
            &[
                ("310", "#000000"),
                ("310", "#000000"),
                ("310", "#000000"),
                ("310", "#000000"),
                ("310", "#000000"),
            ],
            &[
                ("310", "#000000"),
                ("444", "#FFE00B"),
                ("444", "#FFE00B"),
                ("444", "#FFE00B"),
                ("310", "#000000"),
            ],
            &[
                ("310", "#000000"),
                ("444", "#FFE00B"),
                ("321", "#CE1938"),
                ("444", "#FFE00B"),
                ("310", "#000000"),
            ],
            &[
                ("310", "#000000"),
                ("444", "#FFE00B"),
                ("444", "#FFE00B"),
                ("444", "#FFE00B"),
                ("310", "#000000"),
            ],
            &[
                ("310", "#000000"),
                ("310", "#000000"),
                ("310", "#000000"),
                ("310", "#000000"),
                ("310", "#000000"),
            ],
        ]);

        let result = build_stage4_regions(&pattern, &test_config(3, 1), Stage4Preset::Standard)
            .expect("stage4 should build");
        let ring_region = result
            .regions
            .iter()
            .find(|region| region.color.dmc_code.as_deref() == Some("444"))
            .expect("ring region should exist");

        assert!(!ring_region.holes_svg.is_empty());
        assert!(ring_region.path_svg.ends_with('Z'));
        assert!(ring_region.holes_svg.iter().all(|hole| hole.ends_with('Z')));
        assert!(result
            .contract
            .regions
            .iter()
            .all(|region| region.svg_path.ends_with('Z')));
    }

    #[cfg(feature = "stage4-fixtures")]
    #[test]
    #[ignore = "Requires local fixture images under src-tauri/tests/fixtures/stage4"]
    fn stage4_fixture_export_harness() {
        let fixture_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("stage4");
        let mut files = fs::read_dir(&fixture_dir)
            .expect("fixture directory missing")
            .filter_map(|entry| entry.ok().map(|e| e.path()))
            .filter(|path| {
                path.extension()
                    .and_then(|v| v.to_str())
                    .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg"))
                    .unwrap_or(false)
            })
            .collect::<Vec<_>>();
        files.sort();
        assert!(
            !files.is_empty(),
            "No fixture images found in {}",
            fixture_dir.display()
        );

        let output_root = std::env::temp_dir().join("magpie-stage4-fixtures");
        fs::create_dir_all(&output_root).expect("failed to create output root");

        let presets = [
            Stage4Preset::Draft,
            Stage4Preset::Standard,
            Stage4Preset::HighDetail,
        ];

        for fixture_path in files {
            let image_bytes = fs::read(&fixture_path).expect("failed to read fixture image");
            let stem = fixture_path
                .file_stem()
                .and_then(|v| v.to_str())
                .unwrap_or("fixture");
            for preset in presets {
                let processing = crate::embroidery::ProcessingConfig {
                    color_count: 18,
                    use_dmc_palette: true,
                    smoothing_amount: 0.45,
                    simplify_amount: 0.25,
                    min_region_size: 10,
                };
                let pattern = process_pattern(&image_bytes, &processing, None)
                    .expect("pattern processing failed");
                let stage4_config = Stage4Config::from_preset(preset, 18, 10);
                let result =
                    build_stage4_regions(&pattern, &stage4_config, preset).expect("stage4 failed");

                let dir = output_root
                    .join(stem)
                    .join(format!("{:?}", preset).to_ascii_lowercase());
                fs::create_dir_all(&dir).expect("failed to create fixture output dir");

                write_stage4_svg(
                    &dir.join("stage4.svg"),
                    pattern.width,
                    pattern.height,
                    &result.contract,
                )
                .expect("failed to write stage4 svg");
                write_legend_json(&dir.join("legend.json"), &result.contract)
                    .expect("failed to write legend json");
                write_preview_png(&dir.join("preview.png"), &pattern)
                    .expect("failed to write preview png");
            }
        }

        eprintln!(
            "Stage 4 fixture artifacts written to {}",
            output_root.display()
        );
    }

    #[cfg(feature = "stage4-fixtures")]
    fn write_stage4_svg(
        path: &Path,
        width: u32,
        height: u32,
        contract: &Stage4Contract,
    ) -> Result<(), String> {
        let mut fill_by_color = HashMap::<String, String>::new();
        for entry in &contract.legend {
            fill_by_color.insert(entry.dmc_color_id.clone(), entry.hex.clone());
        }

        let mut svg = String::new();
        svg.push_str(&format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {} {}\" width=\"{}\" height=\"{}\">",
            width, height, width, height
        ));
        svg.push_str("<rect width=\"100%\" height=\"100%\" fill=\"#FFFFFF\"/>");
        for region in &contract.regions {
            let fill = fill_by_color
                .get(&region.dmc_color_id)
                .cloned()
                .unwrap_or_else(|| "#CCCCCC".to_string());
            svg.push_str(&format!(
                "<path d=\"{}\" fill=\"{}\" stroke=\"#202020\" stroke-width=\"0.25\"/>",
                region.svg_path, fill
            ));
            for hole in &region.holes_svg_paths {
                svg.push_str(&format!(
                    "<path d=\"{}\" fill=\"#FFFFFF\" stroke=\"#202020\" stroke-width=\"0.20\"/>",
                    hole
                ));
            }
        }
        svg.push_str("</svg>");
        fs::write(path, svg).map_err(|e| e.to_string())
    }

    #[cfg(feature = "stage4-fixtures")]
    fn write_legend_json(path: &Path, contract: &Stage4Contract) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(&contract.legend).map_err(|e| e.to_string())?;
        fs::write(path, bytes).map_err(|e| e.to_string())
    }

    #[cfg(feature = "stage4-fixtures")]
    fn write_preview_png(path: &Path, pattern: &PatternResult) -> Result<(), String> {
        let mut preview = ImageBuffer::<Rgba<u8>, Vec<u8>>::new(pattern.width, pattern.height);
        for stitch in &pattern.stitches {
            let rgb = hex_to_rgb(&stitch.hex).unwrap_or([255, 255, 255]);
            preview.put_pixel(stitch.x, stitch.y, Rgba([rgb[0], rgb[1], rgb[2], 255]));
        }

        let mut file = fs::File::create(path).map_err(|e| e.to_string())?;
        let dyn_img = image::DynamicImage::ImageRgba8(preview);
        dyn_img
            .write_to(&mut file, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        file.flush().map_err(|e| e.to_string())
    }
}
