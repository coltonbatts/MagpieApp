use serde::Deserialize;

const PAGE_WIDTH_PT: f32 = 595.0;
const PAGE_HEIGHT_PT: f32 = 842.0;

#[derive(Debug, Deserialize)]
pub struct PdfExportPayload {
    pub title: String,
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

    let page_one = build_stitch_grid_page(payload);
    let page_two = build_manifest_page(payload);
    Ok(write_pdf_document(&page_one, &page_two))
}

fn build_stitch_grid_page(payload: &PdfExportPayload) -> String {
    let mut stream = String::new();

    let title = sanitize_text(&payload.title);
    let subtitle = format!("{} x {} stitches", payload.width, payload.height);

    stream.push_str("0 0 0 rg\n");
    stream.push_str(&text_cmd(40.0, PAGE_HEIGHT_PT - 56.0, 20.0, &title));
    stream.push_str(&text_cmd(
        40.0,
        PAGE_HEIGHT_PT - 76.0,
        10.0,
        &format!("Swiss blueprint grid | {}", subtitle),
    ));

    let top = PAGE_HEIGHT_PT - 110.0;
    let bottom = 56.0;
    let usable_h = top - bottom;
    let usable_w = PAGE_WIDTH_PT - 80.0;
    let cell = (usable_w / payload.width as f32)
        .min(usable_h / payload.height as f32)
        .max(0.8);
    let grid_w = cell * payload.width as f32;
    let grid_h = cell * payload.height as f32;
    let origin_x = ((PAGE_WIDTH_PT - grid_w) * 0.5).max(20.0);
    let origin_y = bottom + ((usable_h - grid_h) * 0.5).max(0.0);

    stream.push_str("0.18 0.18 0.18 RG 0.8 w\n");
    stream.push_str(&format!(
        "{:.3} {:.3} {:.3} {:.3} re S\n",
        origin_x, origin_y, grid_w, grid_h
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
        let x_pos = origin_x + x as f32 * cell;
        stream.push_str(&format!(
            "{:.3} {:.3} m {:.3} {:.3} l S\n",
            x_pos,
            origin_y,
            x_pos,
            origin_y + grid_h
        ));
    }
    for y in 0..=payload.height as usize {
        let step = if y % major_step == 0 { 1 } else { 0 };
        if step == 0 && payload.height > 220 && y % 2 != 0 {
            continue;
        }
        let y_pos = origin_y + y as f32 * cell;
        stream.push_str(&format!(
            "{:.3} {:.3} m {:.3} {:.3} l S\n",
            origin_x,
            y_pos,
            origin_x + grid_w,
            y_pos
        ));
    }

    stream.push_str("0.62 0.62 0.62 RG 0.35 w\n");
    for x in (0..=payload.width as usize).step_by(major_step) {
        let x_pos = origin_x + x as f32 * cell;
        stream.push_str(&format!(
            "{:.3} {:.3} m {:.3} {:.3} l S\n",
            x_pos,
            origin_y,
            x_pos,
            origin_y + grid_h
        ));
    }
    for y in (0..=payload.height as usize).step_by(major_step) {
        let y_pos = origin_y + y as f32 * cell;
        stream.push_str(&format!(
            "{:.3} {:.3} m {:.3} {:.3} l S\n",
            origin_x,
            y_pos,
            origin_x + grid_w,
            y_pos
        ));
    }

    let symbol_size = (cell * 0.56).clamp(2.5, 8.5);
    for stitch in &payload.stitches {
        if stitch.x >= payload.width || stitch.y >= payload.height {
            continue;
        }
        let x = origin_x + stitch.x as f32 * cell;
        let y = origin_y + (payload.height.saturating_sub(1) - stitch.y) as f32 * cell;

        if stitch.dmc_code != "Fabric" {
            let (r, g, b) = parse_hex(&stitch.hex);
            let tint_r = 1.0 - (1.0 - r) * 0.16;
            let tint_g = 1.0 - (1.0 - g) * 0.16;
            let tint_b = 1.0 - (1.0 - b) * 0.16;
            stream.push_str(&format!(
                "{:.3} {:.3} {:.3} rg {:.3} {:.3} {:.3} {:.3} re f\n",
                tint_r, tint_g, tint_b, x, y, cell, cell
            ));
        }

        let marker = stitch.marker.chars().next().unwrap_or(' ');
        if marker.is_ascii_whitespace() || stitch.dmc_code == "Fabric" {
            continue;
        }
        let marker_str = sanitize_text(&marker.to_string());
        let text_x = x + (cell * 0.5) - (symbol_size * 0.23);
        let text_y = y + (cell * 0.5) - (symbol_size * 0.32);
        stream.push_str("0 0 0 rg\n");
        stream.push_str(&text_cmd(text_x, text_y, symbol_size, &marker_str));
    }

    stream.push_str(&text_cmd(
        40.0,
        28.0,
        8.0,
        "Magpie Artisan Studio | Page 1 of 2",
    ));

    stream
}

fn build_manifest_page(payload: &PdfExportPayload) -> String {
    let mut stream = String::new();

    stream.push_str("0 0 0 rg\n");
    stream.push_str(&text_cmd(
        40.0,
        PAGE_HEIGHT_PT - 56.0,
        20.0,
        "Thread Manifest",
    ));
    stream.push_str(&text_cmd(
        40.0,
        PAGE_HEIGHT_PT - 76.0,
        10.0,
        "Color swatches, DMC metadata, and stitch counts",
    ));

    let top = PAGE_HEIGHT_PT - 108.0;
    let bottom = 52.0;
    let row_h = 16.0;
    let columns = 2usize;
    let gutter = 24.0;
    let col_w = (PAGE_WIDTH_PT - 80.0 - gutter) / columns as f32;
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

fn text_cmd(x: f32, y: f32, size: f32, text: &str) -> String {
    format!(
        "BT /F1 {:.2} Tf 1 0 0 1 {:.3} {:.3} Tm ({}) Tj ET\n",
        size,
        x,
        y,
        escape_pdf_text(text)
    )
}

fn write_pdf_document(page_one: &str, page_two: &str) -> Vec<u8> {
    let objects: Vec<Vec<u8>> = vec![
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
        b"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>".to_vec(),
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>".to_vec(),
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>".to_vec(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_vec(),
        stream_object(page_one),
        stream_object(page_two),
    ];

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
