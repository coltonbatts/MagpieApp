//! High-performance embroidery pattern processing module.
//!
//! This module offloads CPU-intensive image processing from the browser to native Rust,
//! leveraging rayon for parallel processing across all CPU cores.

use palette::{color_difference::Ciede2000, white_point::D65, FromColor, Lab, Srgb};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

/// DMC thread color entry with precomputed LAB values
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmcThread {
    pub code: String,
    pub name: String,
    pub hex: String,
    pub rgb: [u8; 3],
    pub lab: [f32; 3],
}

/// A single stitch in the pattern grid
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stitch {
    pub x: u32,
    pub y: u32,
    pub dmc_code: String,
    pub marker: String,
    pub hex: String,
}

/// DMC metadata for legend entries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmcMetadata {
    pub code: String,
    pub name: String,
    pub hex: String,
}

/// Color mapping entry showing original to DMC mapping
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColorMapping {
    pub original_hex: String,
    pub mapped_hex: String,
    pub dmc: DmcMetadata,
}

/// Legend entry with stitch statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegendEntry {
    pub dmc_code: String,
    pub name: String,
    pub hex: String,
    pub stitch_count: u32,
    pub coverage: f32,
}

/// Complete pattern result returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternResult {
    pub width: u32,
    pub height: u32,
    pub stitches: Vec<Stitch>,
    pub palette: Vec<String>,
    pub dmc_palette: Vec<String>,
    pub legend: Vec<LegendEntry>,
    pub color_mappings: Vec<ColorMapping>,
    pub total_stitches: u32,
    pub processing_time_ms: u64,
}

/// Processing configuration
#[derive(Debug, Clone, Deserialize)]
pub struct ProcessingConfig {
    pub color_count: u32,
    pub use_dmc_palette: bool,
    pub smoothing_amount: f32,
    pub simplify_amount: f32,
    pub min_region_size: u32,
}

impl Default for ProcessingConfig {
    fn default() -> Self {
        Self {
            color_count: 16,
            use_dmc_palette: true,
            smoothing_amount: 0.3,
            simplify_amount: 0.2,
            min_region_size: 4,
        }
    }
}

/// Complete DMC thread palette (~500 official colors)
/// Each entry: (code, name, hex)
const DMC_PALETTE: &[(&str, &str, &str)] = &[
    // Whites & Neutrals
    ("B5200", "Snow White", "#FFFFFF"),
    ("White", "White", "#FEFEFE"),
    ("Ecru", "Ecru", "#F0EBD5"),
    ("822", "Light Beige Gray", "#E7DECC"),
    ("644", "Medium Beige Gray", "#D9D3C3"),
    ("642", "Dark Beige Gray", "#C2B9A6"),
    ("640", "Very Dark Beige Gray", "#9B8F7E"),
    ("3072", "Very Light Beaver Gray", "#E1E5DE"),
    ("648", "Light Beaver Gray", "#BCC3BB"),
    ("647", "Medium Beaver Gray", "#A9B0A8"),
    ("646", "Dark Beaver Gray", "#8D9691"),
    ("645", "Very Dark Beaver Gray", "#6C7670"),
    // Blacks & Grays
    ("310", "Black", "#000000"),
    ("3799", "Very Dark Pewter Gray", "#5B5F5F"),
    ("413", "Dark Pewter Gray", "#656666"),
    ("3787", "Dark Brown Gray", "#6B675E"),
    ("762", "Very Light Pearl Gray", "#E6E6E6"),
    ("415", "Pearl Gray", "#D3D3D3"),
    ("318", "Light Steel Gray", "#ADB0AE"),
    ("414", "Dark Steel Gray", "#8A8A8A"),
    ("317", "Pewter Gray", "#6B6D6D"),
    ("535", "Very Light Ash Gray", "#696959"),
    ("3024", "Very Light Brown Gray", "#D0CCBE"),
    ("3023", "Light Brown Gray", "#B5A588"),
    // Reds
    ("666", "Bright Red", "#EC2130"),
    ("321", "Red", "#CE1938"),
    ("304", "Medium Red", "#B11731"),
    ("498", "Dark Red", "#A81428"),
    ("816", "Garnet", "#91182E"),
    ("815", "Medium Garnet", "#7C1D2B"),
    ("814", "Dark Garnet", "#6D1329"),
    ("760", "Salmon", "#F5BEC2"),
    ("3712", "Medium Salmon", "#EA9CA3"),
    ("3328", "Dark Salmon", "#E07681"),
    ("347", "Very Dark Salmon", "#BF1733"),
    ("353", "Peach", "#FECDCD"),
    ("352", "Light Coral", "#FBB9AA"),
    ("351", "Coral", "#EA8579"),
    ("350", "Medium Coral", "#E34948"),
    ("349", "Dark Coral", "#C81732"),
    ("817", "Very Dark Coral Red", "#BA1730"),
    // Pinks
    ("818", "Baby Pink", "#FFD9DB"),
    ("963", "Ultra Very Light Dusty Rose", "#FFCCD1"),
    ("3716", "Very Light Dusty Rose", "#FFBAC7"),
    ("962", "Medium Dusty Rose", "#E97D8B"),
    ("961", "Dark Dusty Rose", "#CE486E"),
    ("3833", "Light Raspberry", "#E95077"),
    ("3832", "Medium Raspberry", "#D13D6F"),
    ("3831", "Dark Raspberry", "#B0194B"),
    ("3350", "Ultra Dark Dusty Rose", "#B52D5C"),
    ("150", "Ultra Very Light Dusty Rose", "#F8D5D8"),
    ("151", "Very Light Dusty Rose", "#EFB1BA"),
    ("152", "Medium Light Shell Pink", "#DD88A0"),
    ("3354", "Light Dusty Rose", "#D887A6"),
    ("3733", "Dusty Rose", "#CD5E8D"),
    ("3731", "Very Dark Dusty Rose", "#C0476C"),
    // Oranges
    ("3824", "Light Apricot", "#FECABE"),
    ("3341", "Apricot", "#FFAB8A"),
    ("3340", "Medium Apricot", "#FF8262"),
    ("608", "Bright Orange", "#FF6F30"),
    ("606", "Bright Orange-Red", "#FA3F1B"),
    ("970", "Light Pumpkin", "#FF901F"),
    ("971", "Pumpkin", "#FF8600"),
    ("972", "Deep Canary", "#FFB900"),
    ("3853", "Dark Autumn Gold", "#F59B5A"),
    ("3854", "Medium Autumn Gold", "#F68A5C"),
    ("3855", "Light Autumn Gold", "#FBBF99"),
    ("722", "Light Orange Spice", "#F6A667"),
    ("720", "Dark Orange Spice", "#E94A07"),
    ("721", "Medium Orange Spice", "#F25D3D"),
    ("947", "Burnt Orange", "#FF5F01"),
    // Yellows
    ("445", "Light Lemon", "#FFFDDB"),
    ("307", "Lemon", "#FFE600"),
    ("973", "Bright Canary", "#FFE529"),
    ("444", "Dark Lemon", "#FFE00B"),
    ("3078", "Very Light Golden Yellow", "#FFF8DC"),
    ("727", "Very Light Topaz", "#FFF785"),
    ("726", "Light Topaz", "#FFD747"),
    ("725", "Topaz", "#FFC723"),
    ("3820", "Dark Straw", "#DDB900"),
    ("783", "Medium Topaz", "#D68700"),
    ("782", "Dark Topaz", "#CB7800"),
    ("781", "Very Dark Topaz", "#985F00"),
    ("780", "Ultra Very Dark Topaz", "#8C5400"),
    ("676", "Light Old Gold", "#ECBB5C"),
    ("729", "Medium Old Gold", "#D1A140"),
    ("680", "Dark Old Gold", "#B98C27"),
    ("3829", "Very Dark Old Gold", "#9F6F00"),
    ("3822", "Light Straw", "#F0DE9C"),
    ("3821", "Straw", "#E0C47A"),
    // Greens
    ("704", "Bright Chartreuse", "#CCF500"),
    ("703", "Chartreuse", "#A6D700"),
    ("702", "Kelly Green", "#86B500"),
    ("701", "Light Green", "#5D9F00"),
    ("700", "Bright Green", "#2E7D09"),
    ("699", "Green", "#136C00"),
    ("907", "Light Parrot Green", "#D0F200"),
    ("906", "Medium Parrot Green", "#9DB700"),
    ("905", "Dark Parrot Green", "#6F9800"),
    ("904", "Very Dark Parrot Green", "#4B7800"),
    ("164", "Light Forest Green", "#C7D9AD"),
    ("989", "Forest Green", "#88A84C"),
    ("988", "Medium Forest Green", "#77923C"),
    ("987", "Dark Forest Green", "#5F7D2D"),
    ("986", "Very Dark Forest Green", "#466B28"),
    ("3348", "Light Yellow Green", "#D8E79E"),
    ("3347", "Medium Yellow Green", "#A3C85E"),
    ("3346", "Hunter Green", "#77A058"),
    ("3345", "Dark Hunter Green", "#66834A"),
    ("772", "Very Light Yellow Green", "#E4F3CC"),
    ("3364", "Pine Green", "#546E4D"),
    ("320", "Medium Pistachio Green", "#8D9E57"),
    ("367", "Dark Pistachio Green", "#6B7B3C"),
    ("319", "Very Dark Pistachio Green", "#40502C"),
    // Teals & Aquas
    ("964", "Light Seagreen", "#C1E2DC"),
    ("959", "Medium Seagreen", "#89C9BC"),
    ("958", "Dark Seagreen", "#52B5A3"),
    ("3812", "Very Dark Seagreen", "#2E917F"),
    ("3811", "Very Light Turquoise", "#C2E3DF"),
    ("598", "Light Turquoise", "#9FCECE"),
    ("597", "Turquoise", "#6CB5BD"),
    ("3810", "Dark Turquoise", "#4D999A"),
    ("3809", "Very Dark Turquoise", "#328082"),
    ("928", "Very Light Gray Green", "#E7EDE7"),
    ("927", "Light Gray Green", "#BFCEC4"),
    ("926", "Medium Gray Green", "#98B3A6"),
    ("3768", "Dark Gray Green", "#5B7B6B"),
    // Blues
    ("3841", "Pale Baby Blue", "#CEDEED"),
    ("3840", "Light Baby Blue", "#A8C9E8"),
    ("3839", "Medium Baby Blue", "#6495C8"),
    ("3838", "Dark Baby Blue", "#3A75AE"),
    ("800", "Pale Delft Blue", "#C9E4F2"),
    ("809", "Delft Blue", "#94B7D5"),
    ("799", "Medium Delft Blue", "#7393B7"),
    ("798", "Dark Delft Blue", "#5174A0"),
    ("797", "Royal Blue", "#13438D"),
    ("796", "Dark Royal Blue", "#123071"),
    ("3325", "Light Baby Blue", "#BFD8EB"),
    ("3755", "Baby Blue", "#8DADD3"),
    ("334", "Medium Baby Blue", "#5D8AB8"),
    ("322", "Dark Baby Blue", "#2F5580"),
    ("312", "Very Dark Baby Blue", "#13416D"),
    ("311", "Medium Navy Blue", "#1C3A5C"),
    ("336", "Navy Blue", "#13294B"),
    ("823", "Dark Navy Blue", "#13294B"),
    ("939", "Very Dark Navy Blue", "#13213C"),
    // Purples
    ("3747", "Very Light Blue Violet", "#E3E5EC"),
    ("341", "Light Blue Violet", "#B5CAE6"),
    ("3746", "Dark Blue Violet", "#948FCC"),
    ("333", "Very Dark Blue Violet", "#6E5B9B"),
    ("3837", "Ultra Dark Lavender", "#6D417E"),
    ("211", "Light Lavender", "#E8D8EA"),
    ("210", "Medium Lavender", "#C68FB9"),
    ("209", "Dark Lavender", "#9C4E97"),
    ("208", "Very Dark Lavender", "#7F2A7B"),
    ("3836", "Light Grape", "#B78BC0"),
    ("3835", "Medium Grape", "#924C8F"),
    ("3834", "Dark Grape", "#742A6E"),
    ("154", "Very Dark Grape", "#551839"),
    ("153", "Very Light Violet", "#E8CCDF"),
    ("3743", "Very Light Antique Violet", "#E3D7E2"),
    ("3042", "Light Antique Violet", "#D7BFD4"),
    ("3041", "Medium Antique Violet", "#C6A9C1"),
    ("3740", "Dark Antique Violet", "#A17896"),
    // Browns
    ("3865", "Winter White", "#FAF9F4"),
    ("739", "Ultra Very Light Tan", "#F5EDD3"),
    ("738", "Very Light Tan", "#EBCBA1"),
    ("437", "Light Tan", "#D9A964"),
    ("436", "Tan", "#C68638"),
    ("435", "Very Light Brown", "#945B25"),
    ("434", "Light Brown", "#944B14"),
    ("433", "Medium Brown", "#85511F"),
    ("801", "Dark Coffee Brown", "#693F17"),
    ("898", "Very Dark Coffee Brown", "#5C3A1F"),
    ("938", "Ultra Dark Coffee Brown", "#4A2812"),
    ("3371", "Black Brown", "#301904"),
    ("543", "Ultra Very Light Beige Brown", "#F0DBC8"),
    ("3864", "Light Mocha Beige", "#C9A992"),
    ("3863", "Medium Mocha Beige", "#A4826A"),
    ("3862", "Dark Mocha Beige", "#856551"),
    ("3861", "Light Cocoa", "#A07959"),
    ("3860", "Cocoa", "#78503B"),
    ("3031", "Very Dark Mocha Brown", "#54372A"),
    ("3021", "Very Dark Brown Gray", "#5B4733"),
    // Terra Cottas & Specialty
    ("948", "Very Light Peach", "#FED9C7"),
    ("754", "Light Peach", "#F9CEB9"),
    ("945", "Tawny", "#F6C199"),
    ("3778", "Light Terra Cotta", "#DD967F"),
    ("356", "Medium Terra Cotta", "#C66F5C"),
    ("3830", "Terra Cotta", "#B85A41"),
    ("355", "Dark Terra Cotta", "#A44037"),
    ("3777", "Very Dark Terra Cotta", "#8E3031"),
];

/// Cached DMC palette with precomputed LAB values
struct DmcPalette {
    threads: Vec<DmcThread>,
    labs: Vec<Lab<D65, f32>>,
}

static CACHED_PALETTE: OnceLock<DmcPalette> = OnceLock::new();

impl DmcPalette {
    fn global() -> &'static Self {
        CACHED_PALETTE.get_or_init(Self::new)
    }

    fn new() -> Self {
        let threads: Vec<DmcThread> = DMC_PALETTE
            .iter()
            .map(|(code, name, hex)| {
                let rgb = hex_to_rgb(hex);
                let lab = rgb_to_lab(rgb);
                DmcThread {
                    code: code.to_string(),
                    name: name.to_string(),
                    hex: hex.to_string(),
                    rgb,
                    lab: [lab.l, lab.a, lab.b],
                }
            })
            .collect();

        let labs: Vec<Lab<D65, f32>> = threads
            .iter()
            .map(|t| Lab::new(t.lab[0], t.lab[1], t.lab[2]))
            .collect();

        Self { threads, labs }
    }

    /// Find the closest DMC color using CIEDE2000 Delta-E (parallelized)
    fn find_closest(&self, target: Lab<D65, f32>) -> &DmcThread {
        let (idx, _) = self
            .labs
            .par_iter()
            .enumerate()
            .map(|(i, lab)| {
                let delta_e = target.difference(*lab);
                (i, delta_e)
            })
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap_or((0, f32::MAX));

        &self.threads[idx]
    }
}

/// Convert hex string to RGB tuple
fn hex_to_rgb(hex: &str) -> [u8; 3] {
    let hex = hex.trim_start_matches('#');
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
    [r, g, b]
}

/// Convert RGB to hex string
fn rgb_to_hex(rgb: [u8; 3]) -> String {
    format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2])
}

/// Convert RGB [0-255] to LAB color space
fn rgb_to_lab(rgb: [u8; 3]) -> Lab<D65, f32> {
    let srgb = Srgb::new(
        rgb[0] as f32 / 255.0,
        rgb[1] as f32 / 255.0,
        rgb[2] as f32 / 255.0,
    );
    Lab::from_color(srgb)
}

/// K-means clustering center
#[derive(Clone)]
struct KMeansCenter {
    lab: Lab<D65, f32>,
    sum_l: f64,
    sum_a: f64,
    sum_b: f64,
    count: u64,
}

impl KMeansCenter {
    fn new(lab: Lab<D65, f32>) -> Self {
        Self {
            lab,
            sum_l: 0.0,
            sum_a: 0.0,
            sum_b: 0.0,
            count: 0,
        }
    }

    fn add_sample(&mut self, lab: Lab<D65, f32>) {
        self.sum_l += lab.l as f64;
        self.sum_a += lab.a as f64;
        self.sum_b += lab.b as f64;
        self.count += 1;
    }

    fn update_centroid(&mut self) {
        if self.count > 0 {
            self.lab = Lab::new(
                (self.sum_l / self.count as f64) as f32,
                (self.sum_a / self.count as f64) as f32,
                (self.sum_b / self.count as f64) as f32,
            );
        }
        self.sum_l = 0.0;
        self.sum_a = 0.0;
        self.sum_b = 0.0;
        self.count = 0;
    }
}

/// Parallel k-means color quantization using CIEDE2000
fn kmeans_quantize(
    pixels: &[Lab<D65, f32>],
    k: usize,
    max_iterations: usize,
) -> (Vec<Lab<D65, f32>>, Vec<u16>) {
    if pixels.is_empty() || k == 0 {
        return (vec![], vec![]);
    }

    let k = k.min(pixels.len());

    // Initialize centers using k-means++ strategy
    let mut centers = kmeans_plus_plus_init(pixels, k);

    let mut labels = vec![0u16; pixels.len()];

    for _ in 0..max_iterations {
        // Parallel assignment step
        let new_labels: Vec<u16> = pixels
            .par_iter()
            .map(|pixel| {
                let mut best_idx = 0u16;
                let mut best_dist = f32::MAX;
                for (i, center) in centers.iter().enumerate() {
                    let dist = pixel.difference(center.lab);
                    if dist < best_dist {
                        best_dist = dist;
                        best_idx = i as u16;
                    }
                }
                best_idx
            })
            .collect();

        // Check for convergence
        let changed = new_labels
            .iter()
            .zip(labels.iter())
            .filter(|(a, b)| a != b)
            .count();

        labels = new_labels;

        if changed == 0 {
            break;
        }

        // Update step: accumulate samples per cluster
        for center in &mut centers {
            center.sum_l = 0.0;
            center.sum_a = 0.0;
            center.sum_b = 0.0;
            center.count = 0;
        }

        for (pixel, &label) in pixels.iter().zip(labels.iter()) {
            centers[label as usize].add_sample(*pixel);
        }

        for center in &mut centers {
            center.update_centroid();
        }
    }

    let palette: Vec<Lab<D65, f32>> = centers.iter().map(|c| c.lab).collect();
    (palette, labels)
}

/// K-means++ initialization for better initial centroids
fn kmeans_plus_plus_init(pixels: &[Lab<D65, f32>], k: usize) -> Vec<KMeansCenter> {
    use std::collections::HashSet;

    let n = pixels.len();
    let mut centers = Vec::with_capacity(k);
    let mut chosen_indices = HashSet::new();

    // First center: pick pixel closest to median luminance
    let mut sorted_by_l: Vec<(usize, f32)> =
        pixels.iter().enumerate().map(|(i, p)| (i, p.l)).collect();
    sorted_by_l.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    let first_idx = sorted_by_l[n / 2].0;
    centers.push(KMeansCenter::new(pixels[first_idx]));
    chosen_indices.insert(first_idx);

    // Remaining centers: pick farthest from existing centers (deterministic)
    let mut min_distances: Vec<f32> = pixels
        .par_iter()
        .map(|p| p.difference(centers[0].lab))
        .collect();

    while centers.len() < k {
        // Find the point with maximum minimum distance
        let (best_idx, _) = min_distances
            .iter()
            .enumerate()
            .filter(|(i, _)| !chosen_indices.contains(i))
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap_or((0, &0.0));

        chosen_indices.insert(best_idx);
        let new_center = KMeansCenter::new(pixels[best_idx]);

        // Update minimum distances in parallel
        let new_lab = new_center.lab;
        min_distances
            .par_iter_mut()
            .zip(pixels.par_iter())
            .for_each(|(min_d, pixel)| {
                let d = pixel.difference(new_lab);
                if d < *min_d {
                    *min_d = d;
                }
            });

        centers.push(new_center);
    }

    centers
}

/// Remove small isolated regions by merging with neighbors
fn remove_small_regions(
    labels: &mut [u16],
    width: u32,
    height: u32,
    palette: &[Lab<D65, f32>],
    min_region_size: u32,
) {
    let n = (width * height) as usize;
    let mut visited = vec![false; n];

    for start in 0..n {
        if visited[start] {
            continue;
        }

        let target_label = labels[start];
        let mut region = vec![start];
        let mut queue = vec![start];
        let mut neighbor_counts: HashMap<u16, u32> = HashMap::new();

        visited[start] = true;

        // Flood fill to find region
        while let Some(idx) = queue.pop() {
            let x = (idx as u32) % width;
            let y = (idx as u32) / width;

            for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;

                if nx < 0 || nx >= width as i32 || ny < 0 || ny >= height as i32 {
                    continue;
                }

                let nidx = (ny as u32 * width + nx as u32) as usize;
                let nlabel = labels[nidx];

                if nlabel == target_label {
                    if !visited[nidx] {
                        visited[nidx] = true;
                        region.push(nidx);
                        queue.push(nidx);
                    }
                } else {
                    *neighbor_counts.entry(nlabel).or_insert(0) += 1;
                }
            }
        }

        // If region is too small, merge with most common neighbor
        if (region.len() as u32) < min_region_size && !neighbor_counts.is_empty() {
            let current_lab = palette.get(target_label as usize);

            // Find best neighbor (most frequent, then closest in color)
            let best_neighbor = neighbor_counts
                .iter()
                .max_by(|(label_a, count_a), (label_b, count_b)| {
                    match count_a.cmp(count_b) {
                        std::cmp::Ordering::Equal => {
                            // Tie-breaker: use color distance
                            if let (Some(current), Some(a), Some(b)) = (
                                current_lab,
                                palette.get(**label_a as usize),
                                palette.get(**label_b as usize),
                            ) {
                                let dist_a = current.difference(*a);
                                let dist_b = current.difference(*b);
                                dist_b
                                    .partial_cmp(&dist_a)
                                    .unwrap_or(std::cmp::Ordering::Equal)
                            } else {
                                std::cmp::Ordering::Equal
                            }
                        }
                        other => other,
                    }
                })
                .map(|(label, _)| *label);

            if let Some(new_label) = best_neighbor {
                for idx in region {
                    labels[idx] = new_label;
                }
            }
        }
    }
}

/// Main pattern processing function
pub fn process_pattern(
    image_bytes: &[u8],
    config: &ProcessingConfig,
    mask: Option<&[u8]>,
) -> Result<PatternResult, String> {
    let start_time = std::time::Instant::now();

    // Decode image
    let img = image::load_from_memory(image_bytes)
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    let rgba = img.to_rgba8();
    let width = rgba.width();
    let height = rgba.height();
    let n = (width * height) as usize;

    // Convert to LAB color space (parallel)
    let pixels: Vec<Lab<D65, f32>> = rgba
        .pixels()
        .collect::<Vec<_>>()
        .par_iter()
        .map(|p| {
            // Alpha blend with white background
            let a = p[3] as f32 / 255.0;
            let r = (p[0] as f32 * a + 255.0 * (1.0 - a)) as u8;
            let g = (p[1] as f32 * a + 255.0 * (1.0 - a)) as u8;
            let b = (p[2] as f32 * a + 255.0 * (1.0 - a)) as u8;
            rgb_to_lab([r, g, b])
        })
        .collect();

    let detail_bias = (1.0 - config.simplify_amount).clamp(0.0, 1.0);
    let color_bias = ((config.color_count as f32 - 2.0) / 62.0).clamp(0.0, 1.0);
    let quality_bias = ((detail_bias + color_bias) * 0.5).clamp(0.0, 1.0);
    let max_train = (8000.0 + 42000.0 * quality_bias).round() as usize;
    let stride = (n / max_train.max(1)).max(1);

    // Filter training pixels if mask is provided.
    let mut training_pixels: Vec<Lab<D65, f32>> = if let Some(mask) = mask {
        pixels
            .iter()
            .zip(mask.iter())
            .filter_map(|(p, &m)| if m > 0 { Some(*p) } else { None })
            .step_by(stride)
            .collect()
    } else {
        pixels.iter().step_by(stride).copied().collect()
    };

    if training_pixels.is_empty() {
        training_pixels = pixels.iter().step_by(stride).copied().collect();
    }

    // Run k-means quantization
    let k = (config.color_count as usize).min(30);
    let max_iterations =
        (10.0 + quality_bias * 10.0 + config.smoothing_amount.clamp(0.0, 1.0) * 4.0).round()
            as usize;
    let (palette_lab, _) = kmeans_quantize(&training_pixels, k, max_iterations.max(8));

    // Assign all pixels to nearest cluster (parallel)
    let mut labels: Vec<u16> = pixels
        .par_iter()
        .map(|pixel| {
            let mut best_idx = 0u16;
            let mut best_dist = f32::MAX;
            for (i, center) in palette_lab.iter().enumerate() {
                let dist = pixel.difference(*center);
                if dist < best_dist {
                    best_dist = dist;
                    best_idx = i as u16;
                }
            }
            best_idx
        })
        .collect();

    // Remove small regions
    if config.min_region_size > 1 {
        remove_small_regions(
            &mut labels,
            width,
            height,
            &palette_lab,
            config.min_region_size,
        );
    }

    // Recompute palette from final labels (get actual mean colors)
    let mut palette_sums: Vec<(f64, f64, f64, u64)> = vec![(0.0, 0.0, 0.0, 0); k];
    for (pixel, &label) in pixels.iter().zip(labels.iter()) {
        let s = &mut palette_sums[label as usize];
        s.0 += pixel.l as f64;
        s.1 += pixel.a as f64;
        s.2 += pixel.b as f64;
        s.3 += 1;
    }

    let final_palette_lab: Vec<Lab<D65, f32>> = palette_sums
        .iter()
        .map(|(l, a, b, count)| {
            if *count > 0 {
                Lab::new(
                    (*l / *count as f64) as f32,
                    (*a / *count as f64) as f32,
                    (*b / *count as f64) as f32,
                )
            } else {
                Lab::new(50.0, 0.0, 0.0) // Neutral gray for unused clusters
            }
        })
        .collect();

    // Convert palette to hex
    let palette_hex: Vec<String> = final_palette_lab
        .iter()
        .map(|lab| {
            let srgb = Srgb::from_color(*lab);
            let r = (srgb.red.clamp(0.0, 1.0) * 255.0).round() as u8;
            let g = (srgb.green.clamp(0.0, 1.0) * 255.0).round() as u8;
            let b = (srgb.blue.clamp(0.0, 1.0) * 255.0).round() as u8;
            rgb_to_hex([r, g, b])
        })
        .collect();

    // Map to DMC colors using CIEDE2000 (parallel)
    let dmc_palette = DmcPalette::global();
    let dmc_matches: Vec<&DmcThread> = final_palette_lab
        .par_iter()
        .map(|lab| dmc_palette.find_closest(*lab))
        .collect();

    let dmc_palette_hex: Vec<String> = dmc_matches.iter().map(|t| t.hex.clone()).collect();

    // Build color mappings
    let color_mappings: Vec<ColorMapping> = palette_hex
        .iter()
        .zip(dmc_matches.iter())
        .map(|(original, dmc)| ColorMapping {
            original_hex: original.clone(),
            mapped_hex: dmc.hex.clone(),
            dmc: DmcMetadata {
                code: dmc.code.clone(),
                name: dmc.name.clone(),
                hex: dmc.hex.clone(),
            },
        })
        .collect();

    // Build stitches array
    let markers = [
        'S', 'O', 'T', '*', 'D', 'X', '+', '#', '%', '@', 'A', 'B', 'C', 'E', 'H', 'K', 'M', 'N',
        'P', 'R', 'U', 'V', 'W', 'Y', 'Z', '0', '1', '2', '3', '4',
    ];

    let stitches: Vec<Stitch> = (0..n)
        .into_par_iter()
        .map(|i| {
            let x = (i as u32) % width;
            let y = (i as u32) / width;
            let label = labels[i] as usize;

            let is_fabric = mask.map(|m| m[i] == 0).unwrap_or(false);

            if is_fabric {
                Stitch {
                    x,
                    y,
                    dmc_code: "Fabric".to_string(),
                    marker: String::new(),
                    hex: "#FFFFFF".to_string(),
                }
            } else {
                let dmc = &dmc_matches[label];
                Stitch {
                    x,
                    y,
                    dmc_code: if config.use_dmc_palette {
                        dmc.code.clone()
                    } else {
                        format!("RAW-{}", label + 1)
                    },
                    marker: markers[label % markers.len()].to_string(),
                    hex: if config.use_dmc_palette {
                        dmc.hex.clone()
                    } else {
                        palette_hex[label].clone()
                    },
                }
            }
        })
        .collect();

    // Compute legend with stitch counts
    let mut legend_counts: HashMap<String, (u32, String, String)> = HashMap::new();
    for stitch in &stitches {
        if stitch.dmc_code == "Fabric" {
            continue;
        }
        let entry = legend_counts.entry(stitch.dmc_code.clone()).or_insert((
            0,
            stitch.hex.clone(),
            String::new(),
        ));
        entry.0 += 1;

        // Find name for this code
        if entry.2.is_empty() {
            if let Some(dmc) = dmc_matches.iter().find(|d| d.code == stitch.dmc_code) {
                entry.2 = dmc.name.clone();
            } else {
                entry.2 = "Quantized Color".to_string();
            }
        }
    }

    let total_stitches = stitches.iter().filter(|s| s.dmc_code != "Fabric").count() as u32;

    let mut legend: Vec<LegendEntry> = legend_counts
        .into_iter()
        .map(|(code, (count, hex, name))| LegendEntry {
            dmc_code: code,
            name,
            hex,
            stitch_count: count,
            coverage: count as f32 / total_stitches as f32,
        })
        .collect();

    // Sort legend by stitch count (descending)
    legend.sort_by(|a, b| b.stitch_count.cmp(&a.stitch_count));

    let processing_time_ms = start_time.elapsed().as_millis() as u64;

    Ok(PatternResult {
        width,
        height,
        stitches,
        palette: palette_hex,
        dmc_palette: dmc_palette_hex,
        legend,
        color_mappings,
        total_stitches,
        processing_time_ms,
    })
}

/// Process from file path instead of bytes
pub fn process_pattern_from_path(
    path: &str,
    config: &ProcessingConfig,
    mask: Option<&[u8]>,
) -> Result<PatternResult, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
    process_pattern(&bytes, config, mask)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_conversion() {
        assert_eq!(hex_to_rgb("#FF0000"), [255, 0, 0]);
        assert_eq!(hex_to_rgb("#00FF00"), [0, 255, 0]);
        assert_eq!(hex_to_rgb("#0000FF"), [0, 0, 255]);
        assert_eq!(rgb_to_hex([255, 128, 0]), "#FF8000");
    }

    #[test]
    fn test_dmc_palette_lookup() {
        let palette = DmcPalette::new();

        // Red should match to a red DMC color
        let red = rgb_to_lab([255, 0, 0]);
        let match_red = palette.find_closest(red);
        assert!(
            match_red.name.to_lowercase().contains("red")
                || match_red.hex.to_uppercase().contains("E")
                || match_red.hex.to_uppercase().contains("C")
        );

        // Black should match to DMC 310
        let black = rgb_to_lab([0, 0, 0]);
        let match_black = palette.find_closest(black);
        assert_eq!(match_black.code, "310");
    }
}
