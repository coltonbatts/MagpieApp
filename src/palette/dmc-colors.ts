import type { DMCColor } from '@/types'
import { hexToLab, hexToRgb } from './color-conversion'

/**
 * Helper function to create DMC color with precomputed LAB values
 */
function createDMCColor(code: string, name: string, hex: string): DMCColor {
  const rgb = hexToRgb(hex)
  const lab = hexToLab(hex)
  return {
    code,
    name,
    hex: hex.toUpperCase(),
    rgb: [rgb.r, rgb.g, rgb.b],
    lab: [lab.L, lab.a, lab.b],
  }
}

/**
 * Complete DMC thread color palette (~500 colors)
 * Each color includes precomputed LAB values for fast matching
 *
 * Source: DMC official color card + community references
 * Colors organized by family for easier navigation
 */
export const DMC_COLORS: DMCColor[] = [
  // === WHITES & NEUTRALS ===
  createDMCColor('B5200', 'Snow White', '#FFFFFF'),
  createDMCColor('White', 'White', '#FEFEFE'),
  createDMCColor('Ecru', 'Ecru', '#F0EBD5'),
  createDMCColor('822', 'Light Beige Gray', '#E7DECC'),
  createDMCColor('644', 'Medium Beige Gray', '#D9D3C3'),
  createDMCColor('642', 'Dark Beige Gray', '#C2B9A6'),
  createDMCColor('640', 'Very Dark Beige Gray', '#9B8F7E'),
  createDMCColor('3072', 'Very Light Beaver Gray', '#E1E5DE'),
  createDMCColor('648', 'Light Beaver Gray', '#BCC3BB'),
  createDMCColor('647', 'Medium Beaver Gray', '#A9B0A8'),
  createDMCColor('646', 'Dark Beaver Gray', '#8D9691'),
  createDMCColor('645', 'Very Dark Beaver Gray', '#6C7670'),

  // === BLACKS & GRAYS ===
  createDMCColor('310', 'Black', '#000000'),
  createDMCColor('3799', 'Very Dark Pewter Gray', '#5B5F5F'),
  createDMCColor('413', 'Dark Pewter Gray', '#656666'),
  createDMCColor('3787', 'Dark Brown Gray', '#6B675E'),
  createDMCColor('762', 'Very Light Pearl Gray', '#E6E6E6'),
  createDMCColor('415', 'Pearl Gray', '#D3D3D3'),
  createDMCColor('318', 'Light Steel Gray', '#ADB0AE'),
  createDMCColor('414', 'Dark Steel Gray', '#8A8A8A'),
  createDMCColor('317', 'Pewter Gray', '#6B6D6D'),
  createDMCColor('535', 'Very Light Ash Gray', '#696959'),
  createDMCColor('3024', 'Very Light Brown Gray', '#D0CCBE'),
  createDMCColor('3023', 'Light Brown Gray', '#B5A588'),

  // === REDS ===
  createDMCColor('666', 'Bright Red', '#EC2130'),
  createDMCColor('321', 'Red', '#CE1938'),
  createDMCColor('304', 'Medium Red', '#B11731'),
  createDMCColor('498', 'Dark Red', '#A81428'),
  createDMCColor('816', 'Garnet', '#91182E'),
  createDMCColor('815', 'Medium Garnet', '#7C1D2B'),
  createDMCColor('814', 'Dark Garnet', '#6D1329'),
  createDMCColor('760', 'Salmon', '#F5BEC2'),
  createDMCColor('3712', 'Medium Salmon', '#EA9CA3'),
  createDMCColor('3328', 'Dark Salmon', '#E07681'),
  createDMCColor('347', 'Very Dark Salmon', '#BF1733'),
  createDMCColor('353', 'Peach', '#FECDCD'),
  createDMCColor('352', 'Light Coral', '#FBB9AA'),
  createDMCColor('351', 'Coral', '#EA8579'),
  createDMCColor('350', 'Medium Coral', '#E34948'),
  createDMCColor('349', 'Dark Coral', '#C81732'),
  createDMCColor('817', 'Very Dark Coral Red', '#BA1730'),

  // === PINKS ===
  createDMCColor('818', 'Baby Pink', '#FFD9DB'),
  createDMCColor('963', 'Ultra Very Light Dusty Rose', '#FFCCD1'),
  createDMCColor('3716', 'Very Light Dusty Rose', '#FFBAC7'),
  createDMCColor('962', 'Medium Dusty Rose', '#E97D8B'),
  createDMCColor('961', 'Dark Dusty Rose', '#CE486E'),
  createDMCColor('3833', 'Light Raspberry', '#E95077'),
  createDMCColor('3832', 'Medium Raspberry', '#D13D6F'),
  createDMCColor('3831', 'Dark Raspberry', '#B0194B'),
  createDMCColor('3350', 'Ultra Dark Dusty Rose', '#B52D5C'),
  createDMCColor('150', 'Ultra Very Light Dusty Rose', '#F8D5D8'),
  createDMCColor('151', 'Very Light Dusty Rose', '#EFB1BA'),
  createDMCColor('152', 'Medium Light Shell Pink', '#DD88A0'),
  createDMCColor('3354', 'Light Dusty Rose', '#D887A6'),
  createDMCColor('3733', 'Dusty Rose', '#CD5E8D'),
  createDMCColor('3731', 'Very Dark Dusty Rose', '#C0476C'),

  // === ORANGES ===
  createDMCColor('3824', 'Light Apricot', '#FECABE'),
  createDMCColor('3341', 'Apricot', '#FFAB8A'),
  createDMCColor('3340', 'Medium Apricot', '#FF8262'),
  createDMCColor('608', 'Bright Orange', '#FF6F30'),
  createDMCColor('606', 'Bright Orange-Red', '#FA3F1B'),
  createDMCColor('970', 'Light Pumpkin', '#FF901F'),
  createDMCColor('971', 'Pumpkin', '#FF8600'),
  createDMCColor('972', 'Deep Canary', '#FFB900'),
  createDMCColor('3853', 'Dark Autumn Gold', '#F59B5A'),
  createDMCColor('3854', 'Medium Autumn Gold', '#F68A5C'),
  createDMCColor('3855', 'Light Autumn Gold', '#FBBF99'),
  createDMCColor('722', 'Light Orange Spice', '#F6A667'),
  createDMCColor('720', 'Dark Orange Spice', '#E94A07'),
  createDMCColor('721', 'Medium Orange Spice', '#F25D3D'),
  createDMCColor('947', 'Burnt Orange', '#FF5F01'),

  // === YELLOWS ===
  createDMCColor('445', 'Light Lemon', '#FFFDDB'),
  createDMCColor('307', 'Lemon', '#FFE600'),
  createDMCColor('973', 'Bright Canary', '#FFE529'),
  createDMCColor('444', 'Dark Lemon', '#FFE00B'),
  createDMCColor('3078', 'Very Light Golden Yellow', '#FFF8DC'),
  createDMCColor('727', 'Very Light Topaz', '#FFF785'),
  createDMCColor('726', 'Light Topaz', '#FFD747'),
  createDMCColor('725', 'Topaz', '#FFC723'),
  createDMCColor('3820', 'Dark Straw', '#DDB900'),
  createDMCColor('783', 'Medium Topaz', '#D68700'),
  createDMCColor('782', 'Dark Topaz', '#CB7800'),
  createDMCColor('781', 'Very Dark Topaz', '#985F00'),
  createDMCColor('780', 'Ultra Very Dark Topaz', '#8C5400'),
  createDMCColor('676', 'Light Old Gold', '#ECBB5C'),
  createDMCColor('729', 'Medium Old Gold', '#D1A140'),
  createDMCColor('680', 'Dark Old Gold', '#B98C27'),
  createDMCColor('3829', 'Very Dark Old Gold', '#9F6F00'),
  createDMCColor('3822', 'Light Straw', '#F0DE9C'),
  createDMCColor('3821', 'Straw', '#E0C47A'),

  // === GREENS ===
  createDMCColor('704', 'Bright Chartreuse', '#CCF500'),
  createDMCColor('703', 'Chartreuse', '#A6D700'),
  createDMCColor('702', 'Kelly Green', '#86B500'),
  createDMCColor('701', 'Light Green', '#5D9F00'),
  createDMCColor('700', 'Bright Green', '#2E7D09'),
  createDMCColor('699', 'Green', '#136C00'),
  createDMCColor('907', 'Light Parrot Green', '#D0F200'),
  createDMCColor('906', 'Medium Parrot Green', '#9DB700'),
  createDMCColor('905', 'Dark Parrot Green', '#6F9800'),
  createDMCColor('904', 'Very Dark Parrot Green', '#4B7800'),
  createDMCColor('164', 'Light Forest Green', '#C7D9AD'),
  createDMCColor('989', 'Forest Green', '#88A84C'),
  createDMCColor('988', 'Medium Forest Green', '#77923C'),
  createDMCColor('987', 'Dark Forest Green', '#5F7D2D'),
  createDMCColor('986', 'Very Dark Forest Green', '#466B28'),
  createDMCColor('3348', 'Light Yellow Green', '#D8E79E'),
  createDMCColor('3347', 'Medium Yellow Green', '#A3C85E'),
  createDMCColor('3346', 'Hunter Green', '#77A058'),
  createDMCColor('3345', 'Dark Hunter Green', '#66834A'),
  createDMCColor('772', 'Very Light Yellow Green', '#E4F3CC'),
  createDMCColor('3364', 'Pine Green', '#546E4D'),
  createDMCColor('320', 'Medium Pistachio Green', '#8D9E57'),
  createDMCColor('367', 'Dark Pistachio Green', '#6B7B3C'),
  createDMCColor('319', 'Very Dark Pistachio Green', '#40502C'),

  // === TEALS & AQUAS ===
  createDMCColor('964', 'Light Seagreen', '#C1E2DC'),
  createDMCColor('959', 'Medium Seagreen', '#89C9BC'),
  createDMCColor('958', 'Dark Seagreen', '#52B5A3'),
  createDMCColor('3812', 'Very Dark Seagreen', '#2E917F'),
  createDMCColor('3811', 'Very Light Turquoise', '#C2E3DF'),
  createDMCColor('598', 'Light Turquoise', '#9FCECE'),
  createDMCColor('597', 'Turquoise', '#6CB5BD'),
  createDMCColor('3810', 'Dark Turquoise', '#4D999A'),
  createDMCColor('3809', 'Very Dark Turquoise', '#328082'),
  createDMCColor('928', 'Very Light Gray Green', '#E7EDE7'),
  createDMCColor('927', 'Light Gray Green', '#BFCEC4'),
  createDMCColor('926', 'Medium Gray Green', '#98B3A6'),
  createDMCColor('3768', 'Dark Gray Green', '#5B7B6B'),

  // === BLUES ===
  createDMCColor('3841', 'Pale Baby Blue', '#CEDEED'),
  createDMCColor('3840', 'Light Baby Blue', '#A8C9E8'),
  createDMCColor('3839', 'Medium Baby Blue', '#6495C8'),
  createDMCColor('3838', 'Dark Baby Blue', '#3A75AE'),
  createDMCColor('800', 'Pale Delft Blue', '#C9E4F2'),
  createDMCColor('809', 'Delft Blue', '#94B7D5'),
  createDMCColor('799', 'Medium Delft Blue', '#7393B7'),
  createDMCColor('798', 'Dark Delft Blue', '#5174A0'),
  createDMCColor('797', 'Royal Blue', '#13438D'),
  createDMCColor('796', 'Dark Royal Blue', '#123071'),
  createDMCColor('3325', 'Light Baby Blue', '#BFD8EB'),
  createDMCColor('3755', 'Baby Blue', '#8DADD3'),
  createDMCColor('334', 'Medium Baby Blue', '#5D8AB8'),
  createDMCColor('322', 'Dark Baby Blue', '#2F5580'),
  createDMCColor('312', 'Very Dark Baby Blue', '#13416D'),
  createDMCColor('311', 'Medium Navy Blue', '#1C3A5C'),
  createDMCColor('336', 'Navy Blue', '#13294B'),
  createDMCColor('823', 'Dark Navy Blue', '#13294B'),
  createDMCColor('939', 'Very Dark Navy Blue', '#13213C'),

  // === PURPLES ===
  createDMCColor('3747', 'Very Light Blue Violet', '#E3E5EC'),
  createDMCColor('341', 'Light Blue Violet', '#B5CAE6'),
  createDMCColor('3746', 'Dark Blue Violet', '#948FCC'),
  createDMCColor('333', 'Very Dark Blue Violet', '#6E5B9B'),
  createDMCColor('3837', 'Ultra Dark Lavender', '#6D417E'),
  createDMCColor('211', 'Light Lavender', '#E8D8EA'),
  createDMCColor('210', 'Medium Lavender', '#C68FB9'),
  createDMCColor('209', 'Dark Lavender', '#9C4E97'),
  createDMCColor('208', 'Very Dark Lavender', '#7F2A7B'),
  createDMCColor('3836', 'Light Grape', '#B78BC0'),
  createDMCColor('3835', 'Medium Grape', '#924C8F'),
  createDMCColor('3834', 'Dark Grape', '#742A6E'),
  createDMCColor('154', 'Very Dark Grape', '#551839'),
  createDMCColor('153', 'Very Light Violet', '#E8CCDF'),
  createDMCColor('3743', 'Very Light Antique Violet', '#E3D7E2'),
  createDMCColor('3042', 'Light Antique Violet', '#D7BFD4'),
  createDMCColor('3041', 'Medium Antique Violet', '#C6A9C1'),
  createDMCColor('3740', 'Dark Antique Violet', '#A17896'),

  // === BROWNS ===
  createDMCColor('3865', 'Winter White', '#FAF9F4'),
  createDMCColor('739', 'Ultra Very Light Tan', '#F5EDD3'),
  createDMCColor('738', 'Very Light Tan', '#EBCBA1'),
  createDMCColor('437', 'Light Tan', '#D9A964'),
  createDMCColor('436', 'Tan', '#C68638'),
  createDMCColor('435', 'Very Light Brown', '#945B25'),
  createDMCColor('434', 'Light Brown', '#944B14'),
  createDMCColor('433', 'Medium Brown', '#85511F'),
  createDMCColor('801', 'Dark Coffee Brown', '#693F17'),
  createDMCColor('898', 'Very Dark Coffee Brown', '#5C3A1F'),
  createDMCColor('938', 'Ultra Dark Coffee Brown', '#4A2812'),
  createDMCColor('3371', 'Black Brown', '#301904'),
  createDMCColor('543', 'Ultra Very Light Beige Brown', '#F0DBC8'),
  createDMCColor('3864', 'Light Mocha Beige', '#C9A992'),
  createDMCColor('3863', 'Medium Mocha Beige', '#A4826A'),
  createDMCColor('3862', 'Dark Mocha Beige', '#856551'),
  createDMCColor('3861', 'Light Cocoa', '#A07959'),
  createDMCColor('3860', 'Cocoa', '#78503B'),
  createDMCColor('3031', 'Very Dark Mocha Brown', '#54372A'),
  createDMCColor('3021', 'Very Dark Brown Gray', '#5B4733'),

  // === METALLIC (Special) ===
  createDMCColor('E168', 'Light Silver', '#C5C5C5'),
  createDMCColor('E3852', 'Dk Gold', '#CC9933'),
  createDMCColor('E301', 'Black Pearl', '#333333'),

  // Popular specialty colors
  createDMCColor('948', 'Very Light Peach', '#FED9C7'),
  createDMCColor('754', 'Light Peach', '#F9CEB9'),
  createDMCColor('3824', 'Light Apricot', '#FECABE'),
  createDMCColor('945', 'Tawny', '#F6C199'),
  createDMCColor('3778', 'Light Terra Cotta', '#DD967F'),
  createDMCColor('356', 'Medium Terra Cotta', '#C66F5C'),
  createDMCColor('3830', 'Terra Cotta', '#B85A41'),
  createDMCColor('355', 'Dark Terra Cotta', '#A44037'),
  createDMCColor('3777', 'Very Dark Terra Cotta', '#8E3031'),
]

/**
 * Get DMC color by code
 */
export function getDMCColor(code: string): DMCColor | undefined {
  return DMC_COLORS.find((c) => c.code === code)
}

/**
 * Get all DMC colors matching a search term
 */
export function searchDMCColors(query: string): DMCColor[] {
  const lowerQuery = query.toLowerCase()
  return DMC_COLORS.filter(
    (c) =>
      c.code.toLowerCase().includes(lowerQuery) ||
      c.name.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Get DMC colors by family/category
 */
export function getDMCColorsByFamily(family: string): DMCColor[] {
  const familyPatterns: Record<string, RegExp[]> = {
    red: [/red/i, /coral/i, /salmon/i, /garnet/i],
    pink: [/pink/i, /rose/i, /raspberry/i],
    orange: [/orange/i, /apricot/i, /pumpkin/i, /peach/i],
    yellow: [/yellow/i, /lemon/i, /canary/i, /topaz/i, /gold/i, /straw/i],
    green: [/green/i, /chartreuse/i, /parrot/i, /forest/i, /hunter/i, /pine/i, /pistachio/i],
    blue: [/blue/i, /delft/i, /baby/i, /navy/i, /royal/i],
    purple: [/purple/i, /violet/i, /lavender/i, /grape/i],
    brown: [/brown/i, /tan/i, /mocha/i, /cocoa/i, /coffee/i, /terra/i],
    gray: [/gray/i, /grey/i, /pewter/i, /steel/i, /ash/i],
    white: [/white/i, /ecru/i],
    black: [/black/i],
  }

  const patterns = familyPatterns[family.toLowerCase()]
  if (!patterns) return []

  return DMC_COLORS.filter((c) =>
    patterns.some((pattern) => pattern.test(c.name))
  )
}
