use serde::Deserialize;
use std::collections::{HashMap, VecDeque};

const A4_WIDTH_PT: f32 = 595.0;
const A4_HEIGHT_PT: f32 = 842.0;
const LETTER_WIDTH_PT: f32 = 612.0;
const LETTER_HEIGHT_PT: f32 = 792.0;
const NO_REGION: usize = usize::MAX;

#[derive(Debug, Deserialize, Copy, Clone)]
#[serde(rename_all = "lowercase")]
pub enum PdfPageSize {
    A4,
    Letter,
}

#[derive(Debug, Deserialize, Copy, Clone)]
#[serde(rename_all = "lowercase")]
pub enum PdfExportMode {
    Blueprint,
    Outline,
}

#[derive(Debug, Deserialize, Copy, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PdfTemplateStyle {
    Minimal,
    Studio,
}

#[derive(Debug, Deserialize)]
pub struct PdfExportPayload {
    pub title: String,
    #[serde(default)]
    pub mode: Option<PdfExportMode>,
    #[serde(default)]
    pub page_size: Option<PdfPageSize>,
    #[serde(default)]
    pub template_style: Option<PdfTemplateStyle>,
    pub width: u32,
    pub height: u32,
    pub stitches: Vec<PdfExportStitch>,
    pub legend: Vec<PdfExportLegendEntry>,
}

#[derive(Debug, Deserialize)]
pub struct PdfExportStitch {
    pub x: u32,
    pub y: u32,
    pub dmc_code: String,
    pub marker: String,
    pub hex: String,
}

#[derive(Debug, Deserialize)]
pub struct PdfExportLegendEntry {
    pub dmc_code: String,
    pub name: String,
    pub hex: String,
    pub stitch_count: u32,
    pub coverage: f32,
}

pub fn export_pattern_pdf(payload: &PdfExportPayload) -> Result<Vec<u8>, String> {
    if payload.width == 0 || payload.height == 0 {
        return Err("Pattern dimensions must be greater than 0.".to_string());
    }

    let mode = payload.mode.unwrap_or(PdfExportMode::Blueprint);
    match mode {
        PdfExportMode::Blueprint => export_blueprint_pdf(payload),
        PdfExportMode::Outline => export_outline_pdf(payload),
    }
}

fn export_blueprint_pdf(payload: &PdfExportPayload) -> Result<Vec<u8>, String> {
    let page_size = payload.page_size.unwrap_or(PdfPageSize::A4);
    let (page_width, page_height) = page_dimensions(page_size);
    let layout = GridLayout::new(payload.width, payload.height, page_width, page_height);
    let page_one = build_stitch_grid_page(payload, &layout);
    let page_two = build_manifest_page(payload, page_width, page_height);
    Ok(write_pdf_document(
        &[page_one, page_two],
        page_width,
        page_height,
    ))
}

fn export_outline_pdf(payload: &PdfExportPayload) -> Result<Vec<u8>, String> {
    let page_size = payload.page_size.unwrap_or(PdfPageSize::A4);
    let (page_width, page_height) = page_dimensions(page_size);
    let template_style = payload.template_style.unwrap_or(PdfTemplateStyle::Studio);
    let mut regions = extract_outline_regions(payload)?;
    if regions.is_empty() {
        return Err("No stitch regions were found for outline export.".to_string());
    }

    regions.sort_by(|a, b| {
        a.color_index
            .cmp(&b.color_index)
            .then(b.area.cmp(&a.area))
            .then(a.min_y.cmp(&b.min_y))
            .then(a.min_x.cmp(&b.min_x))
    });

    for (idx, region) in regions.iter_mut().enumerate() {
        region.number = idx + 1;
    }

    let layout = OutlineLayout::new(
        payload.width,
        payload.height,
        page_width,
        page_height,
        template_style,
    );
    let page_one = build_outline_page(payload, &regions, &layout, true, template_style);
    let page_two = build_outline_page(payload, &regions, &layout, false, template_style);
    let page_three =
        build_outline_legend_page(payload, &regions, page_width, page_height, template_style);

    Ok(write_pdf_document(
        &[page_one, page_two, page_three],
        page_width,
        page_height,
    ))
}

fn page_dimensions(size: PdfPageSize) -> (f32, f32) {
    match size {
        PdfPageSize::A4 => (A4_WIDTH_PT, A4_HEIGHT_PT),
        PdfPageSize::Letter => (LETTER_WIDTH_PT, LETTER_HEIGHT_PT),
    }
}

struct GridLayout {
    page_height: f32,
    cell: f32,
    origin_x: f32,
    origin_y: f32,
    grid_width: f32,
    grid_height: f32,
}

impl GridLayout {
    fn new(pattern_width: u32, pattern_height: u32, page_width: f32, page_height: f32) -> Self {
        let top = page_height - 110.0;
        let bottom = 56.0;
        let usable_h = top - bottom;
        let usable_w = page_width - 80.0;
        let cell = (usable_w / pattern_width as f32)
            .min(usable_h / pattern_height as f32)
            .max(0.8);
        let grid_width = cell * pattern_width as f32;
        let grid_height = cell * pattern_height as f32;
        let origin_x = ((page_width - grid_width) * 0.5).max(20.0);
        let origin_y = bottom + ((usable_h - grid_height) * 0.5).max(0.0);

        Self {
            page_height,
            cell,
            origin_x,
            origin_y,
            grid_width,
            grid_height,
        }
    }

    fn cell_bottom_left(&self, x: u32, y: u32, pattern_height: u32) -> (f32, f32) {
        let px = self.origin_x + x as f32 * self.cell;
        let py = self.origin_y + (pattern_height.saturating_sub(1) - y) as f32 * self.cell;
        (px, py)
    }
}

struct OutlineLayout {
    page_height: f32,
    pattern_height: u32,
    scale: f32,
    origin_x: f32,
    origin_y: f32,
    draw_width: f32,
    draw_height: f32,
}

impl OutlineLayout {
    fn new(
        pattern_width: u32,
        pattern_height: u32,
        page_width: f32,
        page_height: f32,
        template_style: PdfTemplateStyle,
    ) -> Self {
        let left = 42.0;
        let right = 42.0;
        let (top, bottom) = if template_style == PdfTemplateStyle::Minimal {
            (page_height - 28.0, 28.0)
        } else {
            (page_height - 92.0, 58.0)
        };
        let usable_w = (page_width - left - right).max(1.0);
        let usable_h = (top - bottom).max(1.0);
        let scale = (usable_w / pattern_width as f32)
            .min(usable_h / pattern_height as f32)
            .max(0.2);
        let draw_width = pattern_width as f32 * scale;
        let draw_height = pattern_height as f32 * scale;
        let origin_x = left + (usable_w - draw_width) * 0.5;
        let origin_y = bottom + (usable_h - draw_height) * 0.5;

        Self {
            page_height,
            pattern_height,
            scale,
            origin_x,
            origin_y,
            draw_width,
            draw_height,
        }
    }

    fn point_to_pdf(&self, point: GridPoint) -> (f32, f32) {
        let px = self.origin_x + point.x as f32 * self.scale;
        let py = self.origin_y + (self.pattern_height as f32 - point.y as f32) * self.scale;
        (px, py)
    }

    fn center_to_pdf(&self, x: f32, y: f32) -> (f32, f32) {
        let px = self.origin_x + x * self.scale;
        let py = self.origin_y + (self.pattern_height as f32 - y) * self.scale;
        (px, py)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
struct GridPoint {
    x: i32,
    y: i32,
}

#[derive(Debug)]
struct OutlineRegion {
    number: usize,
    color_index: usize,
    dmc_code: String,
    hex: String,
    area: usize,
    min_x: usize,
    min_y: usize,
    centroid_x: f32,
    centroid_y: f32,
    loops: Vec<Vec<GridPoint>>,
}

fn build_stitch_grid_page(payload: &PdfExportPayload, layout: &GridLayout) -> String {
    let mut stream = String::new();

    let title = sanitize_text(&payload.title);
    let subtitle = format!("{} x {} stitches", payload.width, payload.height);

    stream.push_str("0 0 0 rg\n");
    stream.push_str(&text_cmd(40.0, layout.page_height - 56.0, 20.0, &title));
    stream.push_str(&text_cmd(
        40.0,
        layout.page_height - 76.0,
        10.0,
        &format!("Swiss blueprint grid | {}", subtitle),
    ));

    stream.push_str("0.18 0.18 0.18 RG 0.8 w\n");
    stream.push_str(&format!(
        "{:.3} {:.3} {:.3} {:.3} re S\n",
        layout.origin_x, layout.origin_y, layout.grid_width, layout.grid_height
    ));

    let major_step = if payload.width.max(payload.height) > 250 {
        10usize
    } else {
        5usize
    };

    stream.push_str("0.86 0.86 0.86 RG 0.25 w\n");
    for x in 0..=payload.width as usize {
        let step = if x % major_step == 0 { 1 } else { 0 };
        if step == 0 && payload.width > 220 && x % 2 != 0 {
            continue;
        }
        let x_pos = layout.origin_x + x as f32 * layout.cell;
        stream.push_str(&format!(
            "{:.3} {:.3} m {:.3} {:.3} l S\n",
            x_pos,
            layout.origin_y,
            x_pos,
            layout.origin_y + layout.grid_height
        ));
    }
    for y in 0..=payload.height as usize {
        let step = if y % major_step == 0 { 1 } else { 0 };
        if step == 0 && payload.height > 220 && y % 2 != 0 {
            continue;
        }
        let y_pos = layout.origin_y + y as f32 * layout.cell;
        stream.push_str(&format!(
            "{:.3} {:.3} m {:.3} {:.3} l S\n",
            layout.origin_x,
            y_pos,
            layout.origin_x + layout.grid_width,
            y_pos
        ));
    }

    stream.push_str("0.62 0.62 0.62 RG 0.35 w\n");
    for x in (0..=payload.width as usize).step_by(major_step) {
        let x_pos = layout.origin_x + x as f32 * layout.cell;
        stream.push_str(&format!(
            "{:.3} {:.3} m {:.3} {:.3} l S\n",
            x_pos,
            layout.origin_y,
            x_pos,
            layout.origin_y + layout.grid_height
        ));
    }
    for y in (0..=payload.height as usize).step_by(major_step) {
        let y_pos = layout.origin_y + y as f32 * layout.cell;
        stream.push_str(&format!(
            "{:.3} {:.3} m {:.3} {:.3} l S\n",
            layout.origin_x,
            y_pos,
            layout.origin_x + layout.grid_width,
            y_pos
        ));
    }

    for stitch in &payload.stitches {
        if stitch.x >= payload.width || stitch.y >= payload.height {
            continue;
        }
        let (x, y) = layout.cell_bottom_left(stitch.x, stitch.y, payload.height);

        if stitch.dmc_code != "Fabric" {
            let (r, g, b) = parse_hex(&stitch.hex);
            let tint_r = 1.0 - (1.0 - r) * 0.16;
            let tint_g = 1.0 - (1.0 - g) * 0.16;
            let tint_b = 1.0 - (1.0 - b) * 0.16;
            stream.push_str(&format!(
                "{:.3} {:.3} {:.3} rg {:.3} {:.3} {:.3} {:.3} re f\n",
                tint_r, tint_g, tint_b, x, y, layout.cell, layout.cell
            ));
        }

        if stitch.dmc_code == "Fabric" {
            continue;
        }
        let marker = stitch
            .marker
            .chars()
            .next()
            .unwrap_or(' ')
            .to_ascii_uppercase();
        stream.push_str(&draw_vector_symbol(marker, x, y, layout.cell));
    }

    stream.push_str(&text_cmd(
        40.0,
        28.0,
        8.0,
        "Magpie Artisan Studio | Page 1 of 2",
    ));

    stream
}

fn build_manifest_page(payload: &PdfExportPayload, page_width: f32, page_height: f32) -> String {
    let mut stream = String::new();

    stream.push_str("0 0 0 rg\n");
    stream.push_str(&text_cmd(40.0, page_height - 56.0, 20.0, "Thread Manifest"));
    stream.push_str(&text_cmd(
        40.0,
        page_height - 76.0,
        10.0,
        "Color swatches, DMC metadata, and stitch counts",
    ));

    let top = page_height - 108.0;
    let bottom = 52.0;
    let row_h = 16.0;
    let columns = 2usize;
    let gutter = 24.0;
    let col_w = (page_width - 80.0 - gutter) / columns as f32;
    let rows_per_col = ((top - bottom) / row_h).floor().max(1.0) as usize;

    for (idx, entry) in payload.legend.iter().enumerate() {
        let col = idx / rows_per_col;
        if col >= columns {
            break;
        }
        let row = idx % rows_per_col;

        let x = 40.0 + col as f32 * (col_w + gutter);
        let y = top - row as f32 * row_h;
        let (r, g, b) = parse_hex(&entry.hex);
        let coverage = (entry.coverage * 100.0).clamp(0.0, 100.0);

        stream.push_str(&format!(
            "{:.3} {:.3} {:.3} rg {:.3} {:.3} 10 10 re f\n",
            r,
            g,
            b,
            x,
            y - 9.0
        ));
        stream.push_str("0.2 0.2 0.2 RG 0.4 w\n");
        stream.push_str(&format!("{:.3} {:.3} 10 10 re S\n", x, y - 9.0));

        let code = sanitize_text(&entry.dmc_code);
        let name = sanitize_text(&entry.name);
        let stat = format!("{} st | {:.1}%", entry.stitch_count, coverage);

        stream.push_str("0 0 0 rg\n");
        stream.push_str(&text_cmd(x + 16.0, y - 1.0, 9.0, &code));
        stream.push_str(&text_cmd(x + 64.0, y - 1.0, 8.0, &name));
        stream.push_str(&text_cmd(x + col_w - 72.0, y - 1.0, 8.0, &stat));
    }

    let truncated = payload.legend.len() > rows_per_col * columns;
    if truncated {
        stream.push_str(&text_cmd(
            40.0,
            38.0,
            8.0,
            "Manifest truncated for page layout. Export CSV for full list.",
        ));
    }

    stream.push_str(&text_cmd(
        40.0,
        24.0,
        8.0,
        "Magpie Artisan Studio | Page 2 of 2",
    ));

    stream
}

fn extract_outline_regions(payload: &PdfExportPayload) -> Result<Vec<OutlineRegion>, String> {
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
        palette_by_key.insert(key, idx);
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
    let mut regions = Vec::<OutlineRegion>::new();
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

        regions.push(OutlineRegion {
            number: 0,
            color_index,
            dmc_code: palette_code[color_index].clone(),
            hex: palette_hex[color_index].clone(),
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

fn build_outline_page(
    payload: &PdfExportPayload,
    regions: &[OutlineRegion],
    layout: &OutlineLayout,
    with_numbers: bool,
    template_style: PdfTemplateStyle,
) -> String {
    let mut stream = String::new();
    if template_style == PdfTemplateStyle::Studio {
        let title = sanitize_text(&payload.title);
        let subtitle = if with_numbers {
            "Paint-by-Numbers outline | Numbered regions"
        } else {
            "Paint-by-Numbers outline | Clean contour"
        };

        stream.push_str("0 0 0 rg\n");
        stream.push_str(&text_cmd(40.0, layout.page_height - 54.0, 18.0, &title));
        stream.push_str(&text_cmd(40.0, layout.page_height - 74.0, 10.0, subtitle));
    }

    stream.push_str("0.84 0.84 0.84 RG 0.3 w\n");
    for region in regions {
        for outline_loop in &region.loops {
            if outline_loop.len() < 4 {
                continue;
            }
            let first = outline_loop[0];
            let (start_x, start_y) = layout.point_to_pdf(first);
            stream.push_str(&format!("{:.3} {:.3} m\n", start_x, start_y));
            for point in outline_loop.iter().skip(1) {
                let (px, py) = layout.point_to_pdf(*point);
                stream.push_str(&format!("{:.3} {:.3} l\n", px, py));
            }
            stream.push_str("S\n");
        }
    }

    stream.push_str("0.70 0.70 0.70 RG 0.35 w\n");
    stream.push_str(&format!(
        "{:.3} {:.3} {:.3} {:.3} re S\n",
        layout.origin_x, layout.origin_y, layout.draw_width, layout.draw_height
    ));

    if with_numbers {
        for region in regions {
            let number_text = region.number.to_string();
            let (cx, cy) = layout.center_to_pdf(region.centroid_x, region.centroid_y);
            stream.push_str(&draw_vector_number(&number_text, cx, cy, 5.2, 0.45));
        }
    }

    if template_style == PdfTemplateStyle::Studio {
        let footer = if with_numbers {
            "Magpie Artisan Studio | Page 1 of 3"
        } else {
            "Magpie Artisan Studio | Page 2 of 3"
        };
        stream.push_str(&text_cmd(40.0, 24.0, 8.0, footer));
    }

    stream
}

fn build_outline_legend_page(
    payload: &PdfExportPayload,
    regions: &[OutlineRegion],
    page_width: f32,
    page_height: f32,
    template_style: PdfTemplateStyle,
) -> String {
    let mut stream = String::new();

    stream.push_str("0 0 0 rg\n");
    if template_style == PdfTemplateStyle::Minimal {
        stream.push_str(&text_cmd(40.0, page_height - 44.0, 12.0, "Legend"));
    } else {
        stream.push_str(&text_cmd(
            40.0,
            page_height - 54.0,
            18.0,
            "Paint-by-Numbers Legend",
        ));
        stream.push_str(&text_cmd(
            40.0,
            page_height - 74.0,
            10.0,
            &format!(
                "{} regions | {} x {} stitches",
                regions.len(),
                payload.width,
                payload.height
            ),
        ));
    }

    let top = if template_style == PdfTemplateStyle::Minimal {
        page_height - 62.0
    } else {
        page_height - 102.0
    };
    let bottom = 34.0;
    let row_h = 16.0;
    let columns = 2usize;
    let gutter = 18.0;
    let col_w = (page_width - 80.0 - gutter * (columns as f32 - 1.0)) / columns as f32;
    let rows_per_col = ((top - bottom) / row_h).floor().max(1.0) as usize;
    let max_rows = rows_per_col * columns;

    for (idx, region) in regions.iter().take(max_rows).enumerate() {
        let col = idx / rows_per_col;
        let row = idx % rows_per_col;

        let x = 40.0 + col as f32 * (col_w + gutter);
        let y = top - row as f32 * row_h;
        let number_cy = y - 5.0;
        stream.push_str(&draw_vector_number(
            &region.number.to_string(),
            x + 11.0,
            number_cy,
            5.4,
            0.35,
        ));

        let swatch_x = x + 22.0;
        let swatch_y = y - 10.0;
        let (r, g, b) = parse_hex(&region.hex);
        stream.push_str(&format!(
            "{:.3} {:.3} {:.3} rg {:.3} {:.3} 10 10 re f\n",
            r, g, b, swatch_x, swatch_y
        ));
        stream.push_str("0.25 0.25 0.25 RG 0.3 w\n");
        stream.push_str(&format!("{:.3} {:.3} 10 10 re S\n", swatch_x, swatch_y));

        let code = if region.dmc_code.starts_with("RAW-") {
            format!("HEX {}", sanitize_text(&region.hex))
        } else {
            format!(
                "{} | {}",
                sanitize_text(&region.dmc_code),
                sanitize_text(&region.hex)
            )
        };
        stream.push_str("0.08 0.08 0.08 rg\n");
        stream.push_str(&text_cmd(x + 36.0, y - 1.0, 8.2, &code));
        stream.push_str("0.45 0.45 0.45 rg\n");
        stream.push_str(&text_cmd(
            x + 36.0,
            y - 10.0,
            7.0,
            &format!("{} st", region.area),
        ));
    }

    if regions.len() > max_rows {
        stream.push_str(&text_cmd(
            40.0,
            34.0,
            8.0,
            "Legend truncated for page layout. Use CSV for full details.",
        ));
    }

    if template_style == PdfTemplateStyle::Studio {
        stream.push_str(&text_cmd(
            40.0,
            22.0,
            8.0,
            "Magpie Artisan Studio | Page 3 of 3",
        ));
    }

    stream
}

fn text_cmd(x: f32, y: f32, size: f32, text: &str) -> String {
    format!(
        "BT /F1 {:.2} Tf 1 0 0 1 {:.3} {:.3} Tm ({}) Tj ET\n",
        size,
        x,
        y,
        escape_pdf_text(text)
    )
}

fn draw_vector_number(value: &str, cx: f32, cy: f32, height: f32, gray: f32) -> String {
    let mut stream = String::new();
    let scale = (height / 5.0).max(0.35);
    let spacing = scale;

    let mut glyphs = Vec::new();
    for ch in value.chars() {
        if let Some(g) = number_glyph(ch) {
            glyphs.push(g);
        }
    }
    if glyphs.is_empty() {
        return stream;
    }

    let total_width =
        glyphs.len() as f32 * 3.0 * scale + (glyphs.len().saturating_sub(1)) as f32 * spacing;
    let mut x_cursor = cx - total_width * 0.5;
    let y_cursor = cy - 2.5 * scale;

    stream.push_str(&format!("{:.3} {:.3} {:.3} rg\n", gray, gray, gray));

    for glyph in glyphs {
        for (row, row_bits) in glyph.iter().enumerate() {
            for (col, bit) in row_bits.as_bytes().iter().enumerate() {
                if *bit != b'1' {
                    continue;
                }
                let px = x_cursor + col as f32 * scale;
                let py = y_cursor + (4 - row) as f32 * scale;
                stream.push_str(&format!(
                    "{:.3} {:.3} {:.3} {:.3} re f\n",
                    px, py, scale, scale
                ));
            }
        }
        x_cursor += 3.0 * scale + spacing;
    }

    stream
}

fn number_glyph(ch: char) -> Option<[&'static str; 5]> {
    let glyph = match ch {
        '0' => ["111", "101", "101", "101", "111"],
        '1' => ["010", "110", "010", "010", "111"],
        '2' => ["111", "001", "111", "100", "111"],
        '3' => ["111", "001", "111", "001", "111"],
        '4' => ["101", "101", "111", "001", "001"],
        '5' => ["111", "100", "111", "001", "111"],
        '6' => ["111", "100", "111", "101", "111"],
        '7' => ["111", "001", "010", "010", "010"],
        '8' => ["111", "101", "111", "101", "111"],
        '9' => ["111", "101", "111", "001", "111"],
        _ => return None,
    };
    Some(glyph)
}

fn draw_vector_symbol(marker: char, x: f32, y: f32, cell: f32) -> String {
    let glyph = match marker_glyph(marker) {
        Some(glyph) => glyph,
        None => return String::new(),
    };

    let scale = (cell * 0.72 / 7.0).max(0.35);
    let glyph_w = 5.0 * scale;
    let glyph_h = 7.0 * scale;
    let offset_x = x + (cell - glyph_w) * 0.5;
    let offset_y = y + (cell - glyph_h) * 0.5;

    let mut stream = String::from("0 0 0 rg\n");
    for (row, row_bits) in glyph.iter().enumerate() {
        for (col, bit) in row_bits.as_bytes().iter().enumerate() {
            if *bit != b'1' {
                continue;
            }
            let px = offset_x + col as f32 * scale;
            let py = offset_y + (6 - row) as f32 * scale;
            stream.push_str(&format!(
                "{:.3} {:.3} {:.3} {:.3} re f\n",
                px, py, scale, scale
            ));
        }
    }
    stream
}

fn marker_glyph(marker: char) -> Option<[&'static str; 7]> {
    let glyph = match marker {
        '0' => [
            "01110", "10001", "10011", "10101", "11001", "10001", "01110",
        ],
        '1' => [
            "00100", "01100", "00100", "00100", "00100", "00100", "01110",
        ],
        '2' => [
            "01110", "10001", "00001", "00010", "00100", "01000", "11111",
        ],
        '3' => [
            "11110", "00001", "00001", "01110", "00001", "00001", "11110",
        ],
        '4' => [
            "00010", "00110", "01010", "10010", "11111", "00010", "00010",
        ],
        'A' => [
            "01110", "10001", "10001", "11111", "10001", "10001", "10001",
        ],
        'B' => [
            "11110", "10001", "10001", "11110", "10001", "10001", "11110",
        ],
        'C' => [
            "01111", "10000", "10000", "10000", "10000", "10000", "01111",
        ],
        'D' => [
            "11110", "10001", "10001", "10001", "10001", "10001", "11110",
        ],
        'E' => [
            "11111", "10000", "10000", "11110", "10000", "10000", "11111",
        ],
        'H' => [
            "10001", "10001", "10001", "11111", "10001", "10001", "10001",
        ],
        'K' => [
            "10001", "10010", "10100", "11000", "10100", "10010", "10001",
        ],
        'M' => [
            "10001", "11011", "10101", "10101", "10001", "10001", "10001",
        ],
        'N' => [
            "10001", "11001", "10101", "10011", "10001", "10001", "10001",
        ],
        'O' => [
            "01110", "10001", "10001", "10001", "10001", "10001", "01110",
        ],
        'P' => [
            "11110", "10001", "10001", "11110", "10000", "10000", "10000",
        ],
        'R' => [
            "11110", "10001", "10001", "11110", "10100", "10010", "10001",
        ],
        'S' => [
            "01111", "10000", "10000", "01110", "00001", "00001", "11110",
        ],
        'T' => [
            "11111", "00100", "00100", "00100", "00100", "00100", "00100",
        ],
        'U' => [
            "10001", "10001", "10001", "10001", "10001", "10001", "01110",
        ],
        'V' => [
            "10001", "10001", "10001", "10001", "10001", "01010", "00100",
        ],
        'W' => [
            "10001", "10001", "10001", "10101", "10101", "10101", "01010",
        ],
        'X' => [
            "10001", "10001", "01010", "00100", "01010", "10001", "10001",
        ],
        'Y' => [
            "10001", "10001", "01010", "00100", "00100", "00100", "00100",
        ],
        'Z' => [
            "11111", "00001", "00010", "00100", "01000", "10000", "11111",
        ],
        '*' => [
            "00100", "10101", "01110", "11111", "01110", "10101", "00100",
        ],
        '+' => [
            "00100", "00100", "00100", "11111", "00100", "00100", "00100",
        ],
        '#' => [
            "01010", "11111", "01010", "01010", "11111", "01010", "01010",
        ],
        '%' => [
            "11001", "11010", "00100", "01000", "10110", "00110", "00000",
        ],
        '@' => [
            "01110", "10001", "10111", "10101", "10111", "10000", "01110",
        ],
        _ => return None,
    };

    Some(glyph)
}

fn write_pdf_document(pages: &[String], page_width: f32, page_height: f32) -> Vec<u8> {
    let page_count = pages.len();
    let first_page_object_id = 3usize;
    let first_content_object_id = first_page_object_id + page_count;
    let font_object_id = first_content_object_id + page_count;

    let kids = (0..page_count)
        .map(|idx| format!("{} 0 R", first_page_object_id + idx))
        .collect::<Vec<_>>()
        .join(" ");

    let mut objects: Vec<Vec<u8>> = vec![
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
        format!("<< /Type /Pages /Kids [{}] /Count {} >>", kids, page_count).into_bytes(),
    ];

    for idx in 0..page_count {
        let content_id = first_content_object_id + idx;
        let page_obj = format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.1} {:.1}] /Resources << /Font << /F1 {} 0 R >> >> /Contents {} 0 R >>",
            page_width, page_height, font_object_id, content_id
        );
        objects.push(page_obj.into_bytes());
    }

    for page in pages {
        objects.push(stream_object(page));
    }

    objects.push(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_vec());

    let mut out = Vec::with_capacity(64 * 1024);
    out.extend_from_slice(b"%PDF-1.4\n");
    out.extend_from_slice(b"%Magpie\n");

    let mut offsets = Vec::with_capacity(objects.len());
    for (idx, object) in objects.iter().enumerate() {
        offsets.push(out.len());
        out.extend_from_slice(format!("{} 0 obj\n", idx + 1).as_bytes());
        out.extend_from_slice(object);
        out.extend_from_slice(b"\nendobj\n");
    }

    let xref_offset = out.len();
    out.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    out.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets {
        out.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes());
    }
    out.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF",
            objects.len() + 1,
            xref_offset
        )
        .as_bytes(),
    );

    out
}

fn stream_object(stream: &str) -> Vec<u8> {
    let bytes = stream.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() + 64);
    out.extend_from_slice(format!("<< /Length {} >>\nstream\n", bytes.len()).as_bytes());
    out.extend_from_slice(bytes);
    out.extend_from_slice(b"endstream");
    out
}

fn parse_hex(hex: &str) -> (f32, f32, f32) {
    let normalized = hex.trim_start_matches('#');
    if normalized.len() < 6 {
        return (0.65, 0.65, 0.65);
    }

    let r = u8::from_str_radix(&normalized[0..2], 16).unwrap_or(166) as f32 / 255.0;
    let g = u8::from_str_radix(&normalized[2..4], 16).unwrap_or(166) as f32 / 255.0;
    let b = u8::from_str_radix(&normalized[4..6], 16).unwrap_or(166) as f32 / 255.0;
    (r, g, b)
}

fn is_fabric_code(code: &str) -> bool {
    code.eq_ignore_ascii_case("fabric")
}

fn color_key(code: &str, hex: &str) -> String {
    format!(
        "{}|{}",
        code.trim().to_ascii_uppercase(),
        hex.trim().to_ascii_uppercase()
    )
}

fn sanitize_text(text: &str) -> String {
    text.chars()
        .map(|ch| {
            if ch.is_ascii() && !ch.is_ascii_control() {
                ch
            } else {
                '?'
            }
        })
        .collect()
}

fn escape_pdf_text(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outline_fixture(
        page_size: PdfPageSize,
        template_style: Option<PdfTemplateStyle>,
    ) -> PdfExportPayload {
        PdfExportPayload {
            title: "Outline Test".to_string(),
            mode: Some(PdfExportMode::Outline),
            page_size: Some(page_size),
            template_style,
            width: 3,
            height: 2,
            stitches: vec![
                PdfExportStitch {
                    x: 0,
                    y: 0,
                    dmc_code: "DMC-321".to_string(),
                    marker: "A".to_string(),
                    hex: "#C04040".to_string(),
                },
                PdfExportStitch {
                    x: 1,
                    y: 0,
                    dmc_code: "DMC-321".to_string(),
                    marker: "A".to_string(),
                    hex: "#C04040".to_string(),
                },
                PdfExportStitch {
                    x: 2,
                    y: 0,
                    dmc_code: "DMC-444".to_string(),
                    marker: "B".to_string(),
                    hex: "#EEEEEE".to_string(),
                },
                PdfExportStitch {
                    x: 0,
                    y: 1,
                    dmc_code: "DMC-321".to_string(),
                    marker: "A".to_string(),
                    hex: "#C04040".to_string(),
                },
            ],
            legend: vec![
                PdfExportLegendEntry {
                    dmc_code: "DMC-321".to_string(),
                    name: "Red".to_string(),
                    hex: "#C04040".to_string(),
                    stitch_count: 3,
                    coverage: 0.5,
                },
                PdfExportLegendEntry {
                    dmc_code: "DMC-444".to_string(),
                    name: "Gray".to_string(),
                    hex: "#EEEEEE".to_string(),
                    stitch_count: 1,
                    coverage: 0.16,
                },
            ],
        }
    }

    #[test]
    fn pdf_outline_mode_is_vector_only() {
        let payload = outline_fixture(PdfPageSize::Letter, Some(PdfTemplateStyle::Studio));

        let bytes = export_pattern_pdf(&payload).expect("outline PDF should export");
        let text = String::from_utf8_lossy(&bytes);

        assert!(text.starts_with("%PDF-1.4"));
        assert!(text.contains("/Count 3"), "expected 3-page document");
        assert!(
            !text.contains("/Image"),
            "outline PDF should not embed images"
        );
        assert!(
            !text.contains("/Subtype /Image"),
            "outline PDF should stay vector-only"
        );
        assert!(text.contains(" m\n"), "expected vector move commands");
        assert!(text.contains(" l\n"), "expected vector line commands");
    }

    #[test]
    fn outline_respects_page_size() {
        let payload = outline_fixture(PdfPageSize::Letter, Some(PdfTemplateStyle::Studio));
        let bytes = export_pattern_pdf(&payload).expect("outline PDF should export");
        let text = String::from_utf8_lossy(&bytes);

        assert!(text.contains("/MediaBox [0 0 612.0 792.0]"));
        assert!(!text.contains("/MediaBox [0 0 595.0 842.0]"));
    }

    #[test]
    fn minimal_template_has_no_titles() {
        let payload = outline_fixture(PdfPageSize::A4, Some(PdfTemplateStyle::Minimal));
        let bytes = export_pattern_pdf(&payload).expect("outline PDF should export");
        let text = String::from_utf8_lossy(&bytes);

        assert!(!text.contains("Outline Test"));
        assert!(!text.contains("Magpie Artisan Studio | Page"));
        assert!(text.contains(" m\n"), "expected vector move commands");
        assert!(text.contains(" l\n"), "expected vector line commands");
        assert!(!text.contains("/Subtype /Image"));
    }
}
