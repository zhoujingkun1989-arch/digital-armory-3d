import type { LanguageCode } from '../narration/types';
import type {
  PbrChannelMeta,
  PbrSuiteItem,
  WeaponId,
} from '../weapons/types';

export interface AtlasChannelTranslation {
  label?: string;
  note: string;
}

export interface AtlasSuiteTranslation {
  title: string;
  tabTitle: string;
  summary: string;
  highlights: readonly string[];
  channels: readonly AtlasChannelTranslation[];
}

export interface AtlasWeaponTranslation {
  heading: string;
  suites: Readonly<Record<string, AtlasSuiteTranslation>>;
}

export interface LocalizedAtlasChannel {
  kind: PbrChannelMeta['kind'];
  fileName: string;
  label: string;
  note: string;
}

export interface LocalizedAtlasSuite {
  id: string;
  weapon: WeaponId;
  title: string;
  tabTitle: string;
  partTag: string;
  resolution: string;
  summary: string;
  highlights: readonly string[];
  channels: readonly LocalizedAtlasChannel[];
}

const CHANNEL_LABEL_EN_MAP: Readonly<Record<string, string>> = {
  'Albedo 漫反射基础色': 'Albedo Base Color',
  'Normal 切线空间法线': 'Normal (Tangent-Space)',
  'Roughness 物理粗糙度': 'Roughness (Packed ORM)',
  'Roughness 物理粗糙度 (Packed ORM)': 'Roughness (Packed ORM)',
  '金属 CNC 拉丝法线 (Seamless)': 'Brushed CNC Metal Normal (Seamless)',
  '金属 CNC 车铣拉丝法线 (Seamless)': 'Turned & Milled CNC Metal Normal (Seamless)',
  '精密白钢推磨拉丝法线 (Seamless)': 'Hand-Stoned Stainless Brushed Normal (Seamless)',
  '金属拉丝油膜粗糙度 (Seamless)': 'Brushed Metal Oil-Film Roughness (Seamless)',
  '金属拉丝与枪油膜粗糙度 (Seamless)': 'Brushed Steel & Oil-Film Roughness (Seamless)',
  '军械金属油膜粗糙度 (Seamless)': 'Ordnance Metal Oil-Film Roughness (Seamless)',
  '工程聚酰胺皮纹法线 (Seamless)': 'Engineered Polyamide Stipple Normal (Seamless)',
  '工程塑料皮纹法线 (Seamless)': 'Engineered Polymer Texture Normal (Seamless)',
  '工程聚合物微皮纹法线 (Seamless)': 'Engineered Polymer Micro-Grain Normal (Seamless)',
  '阳极旋钮微细纹理法线 (Seamless)': 'Anodized Knurled Knob Micro-Normal (Seamless)',
  '微细颗粒基底法线 (Seamless)': 'Micro-Grain Substrate Normal (Seamless)',
  '复合弹性体皮纹法线 (Seamless)': 'Composite Elastomer Grip Normal (Seamless)',
  '工程弹性体皮纹法线 (Seamless)': 'Engineered Elastomer Grip Normal (Seamless)',
};

export type AtlasWeaponId = WeaponId;

export const ALL_ATLAS_EN_STRINGS: Readonly<
  Record<AtlasWeaponId, AtlasWeaponTranslation>
> = {
  ak15: {
    heading:
      'AK-15M1 (6П71М) Physically-Based Texture Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      ak_receiver: {
        title: 'Izhmash Stamped Steel Receiver & Enamel Markings Suite',
        tabTitle: 'Stamped Receiver',
        summary:
          'Modeled after Kalashnikov Concern 6П71М (AK-15M1) reference hardware: authentic Russian phosphate-primed black nigrosine enamel, spot-weld dimples, rivet highlights, right-side Cyrillic ПР/АВ/ОД selector markings with swept scratch arc, and left-side factory crest & serial.',
        highlights: [
          'Right-side ПР / АВ / ОД stamps & classic selector scratch arc',
          'Left-side [КК] АК-15 7,62×39 · 6П71М factory rollmark',
          '1.5 mm stamped receiver edge wear & spot-weld dimple normals',
        ],
        channels: [
          {
            note: 'sRGB · Russian nigrosine black paint / Cyrillic white rollmarks / selector arc wear',
          },
          {
            note: 'Linear · Stamped spot-weld dimples + stamped selector detents + scratch normals',
          },
          {
            note: 'Linear · Semi-matte enamel base vs low-roughness rail & edge wear',
          },
        ],
      },
      ak_mag: {
        title: '7.62×39mm Windowed Curved Polymer Magazine Suite',
        tabTitle: 'Windowed 7.62 Mag',
        summary:
          'Custom-baked for the next-gen 30-round fiberglass polyamide (ПА6С) curved AK-15 magazine (independent left/right side panels): angled grip ribs, 10/15/20/25/30 witness numbers, smoked polycarbonate side windows revealing staggered 7.62mm brass/copper cartridges, and steel feed-lip wear.',
        highlights: [
          'Staggered 7.62×39mm brass rounds visible behind smoked polycarbonate window',
          'Molded 10 / 15 / 20 / 25 / 30 witness markings on both flanks',
          'Glossy smoked window (0.14) vs matte fiberglass grip ribs (0.78)',
        ],
        channels: [
          {
            note: 'sRGB · Matte black polyamide / windowed brass cases / round-count markings',
          },
          {
            note: 'Linear · Angled magazine grip ribs + recessed polycarbonate window bezel',
          },
          {
            note: 'Linear · Glossy polycarbonate window (0.14) vs matte ribs (0.78)',
          },
        ],
      },
      ak_metal: {
        title: 'Long-Stroke Chrome Piston Heat Temper & Bolt Carrier Suite',
        tabTitle: 'Piston & Carrier',
        summary:
          'Captures the thermodynamic patina of a long-stroke piston assembly: machined black phosphate bolt carrier with longitudinal rail burnishing, hard-chromed stainless piston rod transitioning through straw-gold and blue-violet heat temper, and carbon fouling across piston gas rings.',
        highlights: [
          'Hard-chrome piston stem heat-temper gradient (straw gold to blue-violet)',
          'Dense powder-carbon fouling along piston face and gas-seal grooves',
          'Reciprocating wear tracks along carrier rails and helical cam slot',
        ],
        channels: [
          {
            note: 'sRGB · Black-phosphated carrier / bright chrome rod / heat temper & carbon soot',
          },
          {
            note: 'Linear · Fine lathe turning marks + piston gas-seal ring grooves',
          },
          {
            note: 'Linear · Mirror hard-chrome stem (0.18) vs matte carbon-fouled head (0.86)',
          },
        ],
      },
      ak_detail: {
        title: 'EVO Stock, Handguard & Fire-Control Seamless Detail Maps',
        tabTitle: 'EVO Furniture & FCG',
        summary:
          'Tileable micro-surface CNC brushed steel normals, gun-oil roughness variation, and fiberglass-reinforced polyamide stippling for the 2023 EVO folding cheek-riser stock, free-float handguard, integral pistol grip, and rotary-hammer FCG.',
        highlights: [
          'Fiberglass polyamide micro-stipple across EVO stock & handguards',
          'CNC brushed steel normals across hammer, double-hook trigger & 2-lug bolt',
          'Shared seamlessly across the remaining 22 furniture & internal FCG parts',
        ],
        channels: [
          {
            note: 'Linear · Applied to 2-lug bolt, hammer, trigger, gas block & flash hider',
          },
          {
            note: 'Linear · Anisotropic gun-oil micro-roughness variation across steel',
          },
          {
            note: 'Linear · Applied to EVO stock, cheek riser, handguards & pistol grip',
          },
        ],
      },
    },
  },
  m4a1: {
    heading:
      'Colt M4A1 RAS Carbine PBR Texture Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      m4a1_receiver: {
        title: 'Colt MIL-A-8625 Hard-Anodized Aluminum Receiver Suite',
        tabTitle: 'Colt Receiver',
        summary:
          'Modeled from USGI Colt Defense (Hartford, Conn.) M4A1 hardware: 7075-T6 forged aluminum in charcoal slate MIL-A-8625 Type III hard anodizing, left-side Prancing Pony crest & "PROPERTY OF U.S. GOVT. M4A1 CARBINE CAL. 5.56 MM." rollmarks, SAFE/SEMI/AUTO selector markings, DoD IUID CAGE 13629 DataMatrix label, and white T2–T12 rail numbers.',
        highlights: [
          'Colt Prancing Pony crest + PROPERTY OF U.S. GOVT. M4A1 CARBINE rollmark',
          'Ambi SAFE / SEMI / AUTO 90° selector markings & detent tracks',
          'Right-side DoD IUID DataMatrix plate & crisp white T-slot rail numbers',
        ],
        channels: [
          {
            note: 'sRGB · Charcoal Type III anodized alloy / Colt USGI rollmarks / white T-slots & IUID plate',
          },
          {
            note: 'Linear · Optically flat forged receiver walls + stamped lettering & Picatinny slot edges',
          },
          {
            note: 'Linear · Semi-matte Type III anodize vs burnished high-contact edges',
          },
        ],
      },
      m4a1_mag: {
        title: 'USGI Dry-Film Gray Aluminum 30-Rd STANAG Magazine Suite',
        tabTitle: 'USGI STANAG Mag',
        summary:
          'Crafted for the issued Colt (CAGE 33710) 30-round curved aluminum STANAG 4179 magazine: Perma-Slik blue-gray dry-film lubricant finish, brushed bare-aluminum insertion wear along the upper magwell collar, five longitudinal stiffening ribs, insertion stop rib, and spot-welded spine dimples.',
        highlights: [
          'Perma-Slik dry-film gray finish with upper magwell insertion wear',
          'Five stamped stiffening ribs + magwell stop rib smooth heightfield normals',
          'CAGE 33710 COLT’S MFG. CO. 5.56 MM baseplate & side floor stamp',
        ],
        channels: [
          {
            note: 'sRGB · Mil-spec dry-film gray / upper magwell bare-aluminum rub / CAGE 33710 stamp',
          },
          {
            note: 'Linear · Five stamped ribs + insertion stop rib + spot-weld dimples',
          },
          {
            note: 'Linear · Chalky matte dry-film base vs burnished rib crests & upper body',
          },
        ],
      },
      m4a1_seamless_detail: {
        title: 'DI Carrier, KAC RAS Rail & 6-Pos Waffle Stock Seamless Maps',
        tabTitle: 'BCG & RAS Details',
        summary:
          'Seamless CNC brushed steel and micro-blasted polyamide normals for the staked gas-key BCG, 7-lug rotating bolt, stainless DI gas tube, KAC M4 RAS quad rail, 14.5" stepped barrel, and 6-position waffle stock.',
        highlights: [
          'Precision brushed normals across phosphate BCG, 7-lug bolt & stepped barrel',
          'Micro-blasted polymer texture on KAC RAS rail covers & 6-position stock',
          'Shared seamlessly across the remaining 23 gas, buffer & FCG components',
        ],
        channels: [
          {
            note: 'Linear · Applied to gas-key BCG, 7-lug bolt, gas tube, FSB & H2 buffer',
          },
          {
            note: 'Linear · Anisotropic gun-oil micro-roughness variation across steel',
          },
          {
            note: 'Linear · Applied to 6-pos waffle stock, A2 grip, rail panels & follower',
          },
        ],
      },
    },
  },
  mp5: {
    heading:
      'H&K MP5A3 Roller-Delayed SMG PBR Texture Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      mp5_receiver: {
        title: 'H&K Oberndorf Semi-Gloss Stamped Steel Upper Receiver Suite',
        tabTitle: 'Stamped Receiver',
        summary:
          'Captures Heckler & Koch Oberndorf manganese-phosphate base and semi-gloss black lacquer over sheet steel: distortion-free stamped receiver planes, longitudinal stiffening flutes with bright steel wear tracks for the A3 collapsible stock rails, left-side HK MP5 9mm×19 rollmark, Ulm antler proof mark, and trunnion spot welds.',
        highlights: [
          'Left magwell HK MP5 9mm×19 white rollmark & 62- prefix serial number',
          'Fluted stamping transitions & A3 collapsible stock rail burnishing',
          'Noise-free optically flat steel normals + trunnion ring spot-weld dimples',
        ],
        channels: [
          {
            note: 'sRGB · German semi-gloss black lacquer / HK MP5 9mm×19 lettering / rail wear',
          },
          {
            note: 'Linear · Flat stamped sheet normals + flute bevels + spot welds & proof stamps',
          },
          {
            note: 'Linear · Semi-gloss lacquer (0.37) vs burnished stock rail channels (0.20)',
          },
        ],
      },
      mp5_lower: {
        title: 'HK Navy Pictogram Ambi Polymer Trigger Housing Suite',
        tabTitle: 'Navy Trigger Pack',
        summary:
          'Tailored for the MP5A3 Navy ambidextrous polymer grip housing: fine micro-blasted charcoal polyamide molded on both flanks with crisp white-boxed crossed-round Safe, solid-red single-round Semi, and open red-boxed multi-round Auto (800 RPM) pictograms plus rotary selector detent arcs.',
        highlights: [
          'Mirrored left/right white & signal-red HK bullet pictograms (Safe / 1 / Auto)',
          'Rotary selector indexing dots with subtle semicircular lever rub',
          'Matte fiberglass polyamide (0.71) vs glossy enamel pictogram fill (0.38)',
        ],
        channels: [
          {
            note: 'sRGB · Matte charcoal polyamide / signal-red & white HK Navy pictograms',
          },
          {
            note: 'Linear · Fine micro-blasted polymer stipple + recessed pictogram grooves',
          },
          {
            note: 'Linear · High-matte grip texture vs semi-gloss enamel icons & thumb wear',
          },
        ],
      },
      mp5_seamless_detail: {
        title: 'Roller-Delayed Bolt, 3-Lug Barrel & A3 Stock Seamless Maps',
        tabTitle: 'Rollers & A3 Stock',
        summary:
          'Micron-grade ground steel and polyamide injection normals for the dual cylindrical locking rollers, 45° locking piece, bolt head, non-reciprocating cocking handle, rotary diopter drum, collapsible wire stock, and wide tropical handguard.',
        highlights: [
          'Precision ground brushed steel normals on locking rollers & 45° wedge',
          'Oil-film sheen on MP5A3 collapsible stock rails & 30-round curved steel mag',
          'Shared seamlessly across all 24 roller-bolt, sight & FCG internals',
        ],
        channels: [
          {
            note: 'Linear · Applied to locking rollers, 45° wedge, carrier, 3-lug barrel & mag',
          },
          {
            note: 'Linear · Anisotropic gun-oil micro-roughness variation across steel',
          },
          {
            note: 'Linear · Applied to wide tropical handguard, cocking handle & buttpad',
          },
        ],
      },
    },
  },
  g17: {
    heading:
      'Glock 17 Gen3 Service Pistol PBR Texture Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      slide: {
        title: 'Tenifer-Nitrided Steel Slide Suite',
        tabTitle: 'Tenifer Slide',
        summary:
          'Macro-referenced from an Austrian Gen3 Glock 17: fine Tenifer nitride-phosphated steel grain, subtle oil-cloud sheen, silver-polished holster wear along slide shoulders and muzzle bevel, brass deflection scuffs behind the ejection port, and deep-stamped factory rollmarks on both flanks.',
        highlights: [
          'Left-side engraved [G] 17 AUSTRIA 9×19 rollmark',
          'Right-side Austrian proof shield + KPV 892 serial stamp',
          'Holster-burnished shoulder bevels & oil-film roughness variation',
        ],
        channels: [
          {
            note: 'sRGB · Nitrided steel base / recessed rollmark tone / edge wear / brass marks',
          },
          {
            note: 'Linear · Engraved rollmark bevels + lateral CNC machining micro-lines',
          },
          {
            note: 'Linear · Burnished low-roughness edges vs matte phosphate & oil sheen',
          },
        ],
      },
      frame: {
        title: 'Glass-Filled Nylon Frame & Gen3 Stipple Suite',
        tabTitle: 'Gen3 Nylon Frame',
        summary:
          'Reproduces EDM spark-textured Nylon 66 injection molding, -20° angled Gen3 coarse pyramid grip panels on both sides, recessed factory emblem plaques, and the embedded stainless-steel serial plate beneath the accessory rail.',
        highlights: [
          'EDM mold texture + Gen3 pyramid grip stippling',
          'Recessed grip logo plaque with raised G17 / GEN 3 lettering',
          'Under-rail laser-etched KPV 892 US stainless serial plate',
        ],
        channels: [
          {
            note: 'sRGB · Deep charcoal nylon / darker grip stipple panels / stainless rail & plate',
          },
          {
            note: 'Linear · High-frequency pyramid grip dots + raised plaque borders',
          },
          {
            note: 'Linear · High-matte stipple vs subtle palm-oil grip sheen',
          },
        ],
      },
      barrel: {
        title: 'Cold-Hammer-Forged Polygonal Barrel & Hood Suite',
        tabTitle: 'Polygonal Barrel',
        summary:
          'Tailored for ejection-port visibility and field-stripped inspection: right hood engraved with 9×19 caliber, proof mark, and KPV 892 serial; longitudinal lockup burnish across hood crown; and signature circular "Glock Smile" wear rings along the forward barrel.',
        highlights: [
          'Ejection-port 9×19 caliber + proof shield + KPV 892 markings',
          'Signature circular lockup wear ring ("Glock Smile") near muzzle',
          'Mirror-polished feed ramp and recessed barrel crown',
        ],
        channels: [
          {
            note: 'sRGB · Carbonitrided steel tone / polished wear rings / mirror feed ramp',
          },
          {
            note: 'Linear · Fine lathe ring grain + deep chamber-hood stamps',
          },
          {
            note: 'Linear · Low-roughness mirror shine on wear rings & feed ramp',
          },
        ],
      },
      mag: {
        title: 'Double-Stack Magazine Shell & Witness Holes Suite',
        tabTitle: '17-Rd Magazine',
        summary:
          'Precision-aligned 4 / 6 / 8 / 10 / 12 / 17 round markers and 9mm label matching the 6 staggered rear witness ports, right-side [G] 9×19 mold stamp, vertical magwell insertion scuffs, and upper stainless steel liner tint.',
        highlights: [
          'Numbered 4..17 witness markings aligned to staggered rear ports',
          'Right-side factory [G] 9×19 emblem imprint',
          'Subtle vertical magwell insertion scuffs along polymer body',
        ],
        channels: [
          {
            note: 'sRGB · Polymer body / witness-port numerals / stainless feed-lip liner',
          },
          {
            note: 'Linear · Recessed numeral stamps + fine molded polymer grain',
          },
          {
            note: 'Linear · Gloss variation along insertion tracks vs steel liner contrast',
          },
        ],
      },
      detail: {
        title: 'Internal Machined Metal & Molded Polymer Seamless Maps',
        tabTitle: 'Internal Details',
        summary:
          'Repeat-wrapping micron-level CNC brushed metal normals and injection-molded polymer roughness maps shared across the striker, extractor, trigger bar, locking block, recoil assembly, and polymer internals.',
        highlights: [
          'Seamless brushed normals for stamped and milled steel internals',
          'Seamless injection-molded polymer stipple normals & roughness',
          'Shared cleanly across all 24 remaining slide & FCG parts',
        ],
        channels: [
          {
            note: 'Linear · Applied to striker, trigger bar, extractor, locking block & pins',
          },
          {
            note: 'Linear · Anisotropic micro-roughness sheen on steel internals',
          },
          {
            note: 'Linear · Applied to trigger safety, slide cover plate, basepad & follower',
          },
        ],
      },
    },
  },
  m82a1: {
    heading:
      'Barrett M82A1 (.50 BMG) Anti-Materiel Rifle PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      m82a1_body: {
        title: 'Barrett Manganese-Phosphate Steel & Leupold MIL Optic Suite',
        tabTitle: 'Phosphate & Optic',
        summary:
          '2K PBR suite dedicated to the Barrett M82A1 anti-materiel rifle: Tennessee-factory deep charcoal manganese-phosphate Parkerized sheet steel with fine crystalline matte grain, stamped left-receiver rollmarks, red/white FIRE/SAFE selector markings, ribbed 10-round .50 BMG steel box mag, and Leupold Mark 4 optic with white 0–15 MIL turrets and emerald multi-coated lens.',
        highlights: [
          'BARRETT FIREARMS MFG. INC. MURFREESBORO, TN MODEL 82A1 .50 CAL receiver stamp',
          'Leupold Mark 4 gold ring, white 0–15 MIL turret scale & emerald coated glass (0.05)',
          'Flat optically true stamped steel normals + Parkerized steel (0.55) vs Sorbothane pad (0.86)',
        ],
        channels: [
          {
            note: 'sRGB · Manganese-phosphate receiver / FIRE-SAFE / 0–15 MIL dial / emerald coated lens',
          },
          {
            note: 'Linear · Flat steel plate base [128,128,255] + recessed rollmarks & turret knurling',
          },
          {
            note: 'Linear · Coated glass (0.05) / anodized tube (0.34) / Parkerized steel (0.55) / recoil pad (0.86)',
          },
        ],
      },
      m82a1_seamless_detail: {
        title: 'Arrowhead Muzzle Brake, 29" Fluted Barrel & Short-Recoil Maps',
        tabTitle: 'Brake & Short-Recoil',
        summary:
          'Heavy-machined metal brushed normals and oil-film roughness maps for the dual-chamber swept arrowhead tank brake, 29-inch fluted short-recoil barrel, 3-lug rotating bolt, accelerator lever, dual return springs, and spiked bipod.',
        highlights: [
          'Milled tool-path normals on dual-chamber arrowhead brake & fluted barrel',
          'Phosphated oil-film roughness across 3-lug bolt, barrel extension & accelerator',
          'Shared seamlessly across all 20 short-recoil barrel, bolt & bipod nodes',
        ],
        channels: [
          {
            note: 'Linear · Applied to arrowhead brake, 29" fluted barrel, 3-lug bolt & accelerator',
          },
          {
            note: 'Linear · Anisotropic gun-oil micro-roughness variation across steel',
          },
          {
            note: 'Linear · Applied to A2 grip checkering, carry-handle sleeve & rubber buttpad',
          },
        ],
      },
    },
  },
  awm: {
    heading:
      'Accuracy International AWM (.338 LM) PBR Texture Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      awm_chassis: {
        title: 'British OD Polymer Chassis, Flat Steel Action & S&B Turret Suite',
        tabTitle: 'OD Chassis & S&B Optic',
        summary:
          'Modeled from British L115A3 / AWM service rifles: upper half renders British Olive Drab (#3f4e35) glass-reinforced nylon thumbhole skins and countersunk hex chassis screws; lower half renders the flat-sided manganese-phosphate steel receiver with factory engraving, 5-round .338 LM steel mag, and Schmidt & Bender PM II 5-25×56 0–14 MIL turrets with emerald lens coating.',
        highlights: [
          'Authentic British Olive Drab (#3f4e35) polymer grain & countersunk hex fasteners',
          'Left receiver ACCURACY INTERNATIONAL ENGLAND AW .338 LM laser rollmark',
          'S&B PM II dual-turn 0–14 MIL white scale & emerald multi-coated lens (0.06)',
        ],
        channels: [
          {
            note: 'sRGB · British OD skins / black-phosphate steel receiver / S&B MIL scale / coated glass',
          },
          {
            note: 'Linear · Glass-filled nylon stipple + hex sockets + flat steel & knurled turrets',
          },
          {
            note: 'Linear · Matte OD skins (0.64) vs phosphate receiver (0.42) vs coated optic (0.06)',
          },
        ],
      },
      awm_seamless_detail: {
        title: '27" Fluted Stainless Match Barrel, 60° Bolt & Spine Seamless Maps',
        tabTitle: '60° Bolt & Spine',
        summary:
          'Precision turned metal and polymer surface normals for the full-length CNC aluminum chassis spine, 27-inch six-flute free-floated stainless match barrel, twin-baffle brake, anti-icing 60° 6-lug bolt, and two-stage trigger pack.',
        highlights: [
          'Fine brushed steel normals across 27" fluted barrel & anti-icing 6-lug bolt',
          'Anodized aerospace aluminum texture across full chassis spine & Parker-Hale bipod',
          'Shared seamlessly across all 19 remaining bolt, brake & two-stage trigger parts',
        ],
        channels: [
          {
            note: 'Linear · Applied to stainless fluted barrel, 6-lug bolt, aluminum spine & sear',
          },
          {
            note: 'Linear · Anisotropic gun-oil micro-roughness variation across steel',
          },
          {
            note: 'Linear · Applied to adjustable cheek piece, rubber buttpad & bolt knob',
          },
        ],
      },
    },
  },
  scar: {
    heading:
      'FN SCAR-L Mk 16 "50 Shades of FDE" PBR Texture Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      scar_fde: {
        title: 'Belgian FN "50 Shades of FDE" Multi-Material Finish Suite',
        tabTitle: '50 Shades of FDE',
        summary:
          'Reproduces FN Herstal’s iconic "50 Shades of FDE" multi-material tonal palette arising from combining hard-anodized extruded champagne-gold aluminum upper, matte fiberglass polyamide lower, warm-sand folding Ugg-boot stock, bright-sand cheek riser, and dry-film FDE STANAG magazine over noise-free anodized normals.',
        highlights: [
          'Left upper [FN] FN HERSTAL BELGIUM SCAR-L CAL. 5.56MM rollmark & T-slot numbers',
          'Matte coyote lower with crisp black/red S - 1 - A selector markings on both sides',
          'Anodized champagne upper (0.33) vs matte polymer lower & stock (0.69) contrast',
        ],
        channels: [
          {
            note: 'sRGB · Champagne anodized upper / coyote lower / red-black S-1-A / FDE ribbed mag',
          },
          {
            note: 'Linear · Optically flat extruded aluminum + recessed lettering + polymer stipple',
          },
          {
            note: 'Linear · Semi-gloss champagne anodize vs matte molded polymer & diamond checkering',
          },
        ],
      },
      scar_seamless_detail: {
        title: 'Short-Stroke Tappet, Monolithic BCG & CHF Barrel Seamless Maps',
        tabTitle: 'Tappet & Monolithic BCG',
        summary:
          'CNC milled steel and elastomer detail normals for the stainless short-stroke gas tappet piston, heavy rectangular bolt carrier, 7-lug rotating bolt, 6-bolt quick-change CHF barrel, three-prong flash hider, and folding backup iron sights.',
        highlights: [
          'Ground metal normals on stainless short-stroke tappet & heavy rectangular carrier',
          'Phosphated oil-film finish on quick-change CHF barrel, gas regulator & flash hider',
          'Shared seamlessly across all 19 remaining piston, bolt & FCG components',
        ],
        channels: [
          {
            note: 'Linear · Applied to short-stroke piston, monolithic BCG, 7-lug bolt & flash hider',
          },
          {
            note: 'Linear · Anisotropic gun-oil micro-roughness variation across steel',
          },
          {
            note: 'Linear · Applied to folding stock buttpad, ranger pull loop & orange follower',
          },
        ],
      },
    },
  },
  deagle: {
    heading:
      'Desert Eagle Mark XIX (.50 AE) Mirror Chrome PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      deagle_chrome: {
        title: 'Mark XIX Brushed Platinum Chrome & Rubber Grip Suite',
        tabTitle: 'Platinum Chrome',
        summary:
          '2K platinum brushed hard-chrome and rubber grip atlas engineered for the Desert Eagle Mark XIX .50 AE: platinum chrome (#b4c0ce, Metalness 0.82, Roughness 0.20) with chamfer AO accents, engraved rollmarks DESERT EAGLE PISTOL / MAGNUM RESEARCH INC. / IMI MADE IN ISRAEL .50 AE, red-dot safety indicator, and matte-black IMI/MRI rubber wraparound grip.',
        highlights: [
          'Brushed platinum hard-chrome (#b4c0ce, M 0.82 / R 0.20) + chamfer AO shadow',
          'Deep-engraved DESERT EAGLE PISTOL / IMI MADE IN ISRAEL .50 AE rollmarks',
          'Red safety dot enamel + matte black IMI/MRI textured rubber grip panel',
        ],
        channels: [
          {
            note: 'sRGB · Brushed mirror chrome / dark engraved rollmarks / red safety dot / black grip',
          },
          {
            note: 'Linear · Smooth CNC brushed grain + engraved rollmark bevels + rubber grip texture',
          },
          {
            note: 'Linear · Mirror hard-chrome low roughness (0.14) vs matte rubber grip (0.73)',
          },
        ],
      },
      deagle_detail: {
        title: '4-Lug Rotating Bolt, Twin Recoil Springs & Single-Action Seamless Maps',
        tabTitle: '4-Lug Bolt & FCG',
        summary:
          'Tileable CNC machining normals and oil-film roughness maps for the rifle-style 4-lug rotating bolt, cam pin, long firing pin, ambi teardrop safety, dual parallel recoil assembly, exposed spur hammer, and 7-round blued .50 AE magazine.',
        highlights: [
          'Precision ground brushed steel normals on 4-lug bolt & twin guide rods',
          'Micro-crystalline oil sheen across spur hammer, single-action sear & blued mag',
          'Shared seamlessly across all 20 remaining gas-piston, FCG & magazine nodes',
        ],
        channels: [
          {
            note: 'Linear · Applied to 4-lug bolt, hammer, twin guide rods, safety & steel mag',
          },
          {
            note: 'Linear · Anisotropic gun-oil micro-roughness variation across steel',
          },
          {
            note: 'Linear · Applied to flush finger-rest floorplate & curved follower',
          },
        ],
      },
    },
  },
  aug: {
    heading:
      'Steyr AUG A1 (StG 77) Bullpup Rifle PBR Texture Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      aug_stock: {
        title: 'Austrian OD Polyamide Bullpup Stock & Swarovski Optic Receiver Suite',
        tabTitle: 'OD Bullpup & Optic',
        summary:
          'Faithfully captures the Austrian Army StG 77 (Steyr AUG A1) RAL 7013 olive-drab (#4b5841) glass-reinforced polyamide stock texture and factory target emblem; lower half integrates the charcoal anodized aluminum receiver, Swarovski Optik Tirol 1.5×14 optic housing laser markings, and emerald-cyan multi-coated lens.',
        highlights: [
          'OD green stock stamped STEYR MANNLICHER AUSTRIA · StG 77 target crest',
          'Flat charcoal anodized receiver with SWAROVSKI OPTIK TIROL 1.5× lettering',
          'Swarovski emerald-cyan coated lens gloss (0.06) vs matte polyamide stock',
        ],
        channels: [
          {
            note: 'sRGB · Austrian OD green stock / charcoal anodized receiver / cyan-coated lens',
          },
          {
            note: 'Linear · EDM mold micro-stipple + recessed factory plaques + flat metal normals',
          },
          {
            note: 'Linear · Coated optic glass (0.06) / anodized aluminum (0.41) / grip stipple (0.70)',
          },
        ],
      },
      aug_mag: {
        title: '30-Rd Translucent Honey-Amber Waffle Polycarbonate Magazine Suite',
        tabTitle: 'Amber Waffle Mag',
        summary:
          'Crafted for the iconic Steyr AUG 30-round translucent honey-amber Makrolon polycarbonate magazine: stacked 5.56×45mm NATO brass bottleneck cases, annealed necks, and copper-jacketed tips visible beneath raised waffle-grid stiffening ribs and 10/20/30 witness markings.',
        highlights: [
          'Translucent honey-amber polycarbonate revealing stacked 5.56×45mm brass rounds',
          'High-relief crisscrossing waffle-grid stiffening rib normals',
          'Glossy translucent panes (0.15) vs semi-matte waffle ribs (0.54)',
        ],
        channels: [
          {
            note: 'sRGB · Translucent honey-amber shell / visible internal brass 5.56mm cartridge stack',
          },
          {
            note: 'Linear · High-relief waffle-grid rib bevels + STEYR 5.56×45 witness numerals',
          },
          {
            note: 'Linear · Glossy polycarbonate windows (0.15) vs matte molded stiffening ribs',
          },
        ],
      },
      aug_seamless_detail: {
        title: '20" Quick-Change Barrel, Dual-Rod Carrier & Polymer Hammer Pack Maps',
        tabTitle: 'Dual-Rod & Hammer Pack',
        summary:
          'Turned steel and polyamide surface details for the 20-inch quick-change CHF barrel, tulip flash hider, canted gas block, dual guide-rod carrier, 7-lug rotating bolt, dual transfer-bar progressive trigger, and rear all-polymer hammer pack.',
        highlights: [
          'Precision brushed steel normals on dual guide-rod BCG, short piston & 7-lug bolt',
          'Molded polymer grain across rear hammer pack & folding vertical foregrip',
          'Shared seamlessly across all 22 bullpup barrel, linkage & FCG nodes',
        ],
        channels: [
          {
            note: 'Linear · Applied to 20" barrel, tulip flash hider, dual-rod carrier & linkages',
          },
          {
            note: 'Linear · Anisotropic gun-oil micro-roughness variation across steel',
          },
          {
            note: 'Linear · Applied to polymer hammer pack, progressive trigger, foregrip & buttpad',
          },
        ],
      },
    },
  },
  p320: {
    heading:
      'SIG Sauer P320 M17 Modular Pistol PBR Texture Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      p320_m17: {
        title: 'P320 M17 Coyote PVD Slide, FDE Grip & Serialized FCU Suite',
        tabTitle: 'Coyote PVD & FCU',
        summary:
          '2K composite PBR atlas dedicated to the US Army SIG Sauer P320-M17: upper panel renders silky Coyote Tan (#9d8363) PVD stainless slide with recessed SIG SAUER P320 / M17 rollmarks and military UID DataMatrix; lower panel renders Coyote FDE (#8d7251) laser-stippled grip module and exposed 17-4 PH brushed stainless FCU serial plate (TF004912).',
        highlights: [
          'Left-side SIG SAUER P320 [M17] & right-side military UID DataMatrix mark',
          'Coyote FDE laser-stippled grip panels with embossed factory medallion',
          'Brushed stainless FCU frame with laser-etched serial number TF004912',
        ],
        channels: [
          {
            note: 'sRGB · Coyote PVD slide / FDE grip module / brushed stainless FCU serial plate',
          },
          {
            note: 'Linear · Smooth CNC flats + engraved slide lettering + laser stipple normals',
          },
          {
            note: 'Linear · Silky PVD slide (0.27) vs matte laser grip (0.82) vs stainless FCU (0.20)',
          },
        ],
      },
      p320_seamless_detail: {
        title: '4.7" Nitrided Barrel, Flat-Wire Recoil & Ambi Safety Seamless Maps',
        tabTitle: 'Barrel & FCU Details',
        summary:
          'Fine brushed steel and molded polyamide details for the 4.7-inch carbonitrided barrel, removable optic cover / night sight, striker assembly, flat-wire recoil spring, M17 ambi thumb safety, and 17-round phosphated steel magazine.',
        highlights: [
          'Brushed steel normals on 4.7" tilting barrel, dual-sear striker & trigger bar',
          'Micro-crystalline sheen on M17 ambi thumb safety, takedown lever & 17-rd mag',
          'Shared seamlessly across all 20 slide, FCU & magazine components',
        ],
        channels: [
          {
            note: 'Linear · Applied to 4.7" barrel, striker assembly, sear, trigger bar & steel mag',
          },
          {
            note: 'Linear · Anisotropic gun-oil micro-roughness variation across steel',
          },
          {
            note: 'Linear · Applied to striker sleeve, optic cover plate & high-vis follower',
          },
        ],
      },
    },
  },
  p90: {
    heading:
      'FN Herstal P90 5.7×28mm PDW PBR Texture Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      p90_stock: {
        title: 'FN Thumbhole Polymer Body, Alloy Optic Bridge & MC-10-80 Sight Suite',
        tabTitle: 'Bullpup & Ring Sight',
        summary:
          '2K 5-channel ORM atlas built for the streamlined FN Herstal P90: lower panel shows charcoal fiberglass polyamide frame with EDM spark-eroded grip panels and molded FN HERSTAL BELGIUM · P90 CAL 5.7×28 / FN084912 serial marks; upper panel isolates dark-gray hard-anodized alloy optic bridge, CNC Picatinny teeth, and sapphire-cyan Ring Sight MC-10-80 optic.',
        highlights: [
          'Flank-stamped FN HERSTAL BELGIUM · P90 CAL 5.7×28 & VDI-27 grip stippling',
          'Hard-anodized aluminum optic bridge with CNC rail chamfers & 5.7×28 mark',
          'Ring Sight MC-10-80 housing & sapphire-cyan coated glass (0.07) material contrast',
        ],
        channels: [
          {
            note: 'sRGB · Charcoal polyamide body / dark-gray anodized bridge / sapphire-cyan optic lens',
          },
          {
            note: 'Linear · VDI-27 spark grip texture + factory mold plaques + milled rail & sight edges',
          },
          {
            note: 'Linear · R:Height AO / G:Glass(0.07)-Anodized(0.39)-Polymer(0.68) / B:Per-texel metalness',
          },
        ],
      },
      p90_mag: {
        title: 'Top 50-Rd Smoked Translucent Mag & 90° Helical Feed Ramp Suite',
        tabTitle: '50-Rd Mag & 90° Ramp',
        summary:
          'Reproduces the P90’s signature top-mounted horizontal 50-round smoked-amber polycarbonate magazine and rear 90° helical rotary ramp: transverse double-stacked 5.7×28mm SS190 brass rounds clearly visible under molded cross-ribs and 50 / 25 / 10 witness numerals, paired with polished brass feed-track wear and hardened steel feed lips.',
        highlights: [
          'Smoked translucent shell revealing 50 transverse 5.7×28mm cartridges',
          'Molded "50 · 25 · 10" round-count markers & transverse grip rib relief',
          'Self-lubricating 90° helical feed ramp with burnished brass rotation tracks',
        ],
        channels: [
          {
            note: 'sRGB · Smoked translucent top shell revealing transverse 5.7×28mm stack + 90° ramp',
          },
          {
            note: 'Linear · Transverse polycarbonate ribs + raised 50/25/10 numerals + 90° ramp helix',
          },
          {
            note: 'Linear · Glossy sight panes (0.18) vs metallic steel feed lips & helical wear path',
          },
        ],
      },
      p90_seamless_detail: {
        title: '10.4" CHF Barrel, Dual-Rod Blowback Bolt & Hammer Pack Seamless Maps',
        tabTitle: 'Bolt & PDW Details',
        summary:
          'Turned metal and self-lubricating polymer surface details for the 264mm cold-hammer-forged chrome-lined barrel, angle-cut muzzle compensator, heavy straight-blowback bolt, dual parallel recoil rods, twin steel trigger bars, and rear all-polymer hammer pack.',
        highlights: [
          'Milled flats on heavy blowback bolt, centerless-ground rods & muzzle compensator',
          'Molded polyamide grain on rear hammer pack, progressive trigger & twin feed rollers',
          'Shared seamlessly across all 20 remaining PDW internal action nodes',
        ],
        channels: [
          {
            note: 'Linear · Applied to 10.4" barrel, angle-cut brake, blowback bolt, twin rods & bars',
          },
          {
            note: 'Linear · Micro-roughness oil sheen across phosphated and chrome-lined steel',
          },
          {
            note: 'Linear · Applied to polymer hammer pack, progressive trigger, selector & buttplate',
          },
        ],
      },
    },
  },
  lift33: {
    heading:
      'Mathews LIFT 33 SwitchWeight-X Compound Bow PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      lift33_riser: {
        title: 'CNC 7075-T6 Bridged Truss Riser, Limb Pockets & Bridge-Lock Sight Suite',
        tabTitle: 'Truss Riser & Sight',
        summary:
          '2K 5-channel ORM atlas baked for the 5-axis machined 7075-T6 aluminum truss riser and Bridge-Lock optical accessories: upper strip captures granite-gray hard anodizing with fine ball-endmill CNC toolpaths, silver chamfer wear, and MATHEWS LIFT 33 · BRIDGE-LOCK · SWITCHWEIGHT-X laser markings; lower strips isolate pivoting limb pockets, 17-4 PH weight bolts, QAD Integrate MX rest, and 5-pin yardage scale.',
        highlights: [
          'Granite-gray 7075-T6 hard anodizing + anisotropic 5-axis ball-endmill sheen',
          'Dual-side MATHEWS LIFT 33 · 33" ATA / 6.5" BH engraving & Bridge-Lock dovetail ticks',
          'Precision layered QAD Integrate MX drop-away rest & 5-pin vernier sight graduations',
        ],
        channels: [
          {
            note: 'sRGB · Granite-gray anodized aluminum / bright CNC edge wear / white laser marks',
          },
          {
            note: 'Linear · 5-axis toolpath micro-scallops + engraved plaques + vernier sight grooves',
          },
          {
            note: 'Linear · R:Height AO / G:Stainless bolts(0.20)-Anodized(0.38)-Matte slots(0.62) / B:Metalness',
          },
        ],
      },
      lift33_limbs: {
        title: '3K Twill Carbon Quad Limbs, Bronze Binary Cams & BCY-X String Suite',
        tabTitle: 'Carbon Limbs & Cams',
        summary:
          '2K 5-channel ORM atlas capturing the LIFT 33 composite & woven drive train: upper strip maps high-density 2×2 3K twill carbon weave anisotropy; center strip renders bronze-anodized SwitchWeight-X binary cams with "85% LET-OFF · MOD-F" radial turning lines and 10" carbon stabilizer; lower strip weaves two-tone BCY-X bowstring twist, serving wraps, and LowPro quiver foam hood.',
        highlights: [
          '2×2 3K twill carbon-fiber weave normals & anisotropic clear-epoxy sheen',
          'Bronze hard-anodized SwitchWeight-X binary cams with radial turning & 85% badge',
          'Two-tone twisted BCY-X bowstring, center serving & micro-cell dampening foam hood',
        ],
        channels: [
          {
            note: 'sRGB · 3K twill carbon / bronze SwitchWeight-X cams / two-tone BCY-X bowstring',
          },
          {
            note: 'Linear · Carbon warp-weft weave + concentric cam turning + twisted string strands & foam',
          },
          {
            note: 'Linear · R:Height AO / G:Carbon epoxy(0.28)-Bronze cams(0.24)-Foam(0.84) / B:Metalness',
          },
        ],
      },
      lift33_seamless_detail: {
        title: 'Titanium Cam Axles, 3-Blade Broadhead & Carbon Arrow Seamless Maps',
        tabTitle: 'Axles & Arrow Details',
        summary:
          'Micron-grade brushed alloy and elastomer grip surface details for Ti-6Al-4V titanium cam axles, ABEC-7 bearing races, CNC 3-blade mechanical broadhead, V-fork drop-away launcher, carbon cable rod, and Engage overmolded grip.',
        highlights: [
          'Precision turned highlights across titanium cam spindles & 3-blade broadhead',
          'Micro-matte elastomer grain across Engage grip, QAD V-fork pad & limb dampeners',
          'Shared seamlessly across all 11 remaining precision bow & quiver nodes',
        ],
        channels: [
          {
            note: 'Linear · Applied to titanium cam axles, V-fork launcher, 3-blade broadhead & rollers',
          },
          {
            note: 'Linear · Hardened stainless steel & titanium micro-roughness sheen',
          },
          {
            note: 'Linear · Applied to Engage grip, micro-diameter carbon arrow shaft & dampeners',
          },
        ],
      },
    },
  },
  r500: {
    heading:
      'Ravin R500 HexCoil Helical-Cam Crossbow PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      r500_chassis: {
        title: 'CNC 7075-T6 Bullpup Mainframe, Zero-Rail Bridge & Stainless Stirrup Suite',
        tabTitle: 'CNC Mainframe & TTFS',
        summary:
          '2K 5-channel ORM atlas baked for the Ravin R500 billet-aluminum bullpup architecture: dark gunmetal hard-anodized directional CNC milling marks, side laser markings "RAVIN CROSSBOWS · R500 HEXCOIL" and "500 FPS · 15" POWER STROKE", burnished MIL-STD-1913 cantilevered optic rail chamfers, Trac-Trigger floating carriage markings, and knurled 17-4 PH stainless foot stirrup.',
        highlights: [
          '7075-T6 billet mainframe laser rollmarks, serial RV-500-04819 & sled rail wear',
          'Cantilevered zero-rail MIL-STD-1913 Picatinny teeth with precision edge chamfers',
          'Trac-Trigger floating carriage laser badge & diamond-knurled 17-4 PH stirrup',
        ],
        channels: [
          {
            note: 'sRGB · Hard-anodized gunmetal / bright Picatinny chamfers / 17-4 PH brushed stirrup',
          },
          {
            note: 'Linear · Directional CNC endmill marks + TTFS engraved badge + knurled foot stirrup',
          },
          {
            note: 'Linear · R:Height AO / G:Burnished rail(0.24)-Anodized frame(0.37) / B:Per-texel metalness',
          },
        ],
      },
      r500_limbs: {
        title: '3K Twill Quad Carbon Limbs, Bronze HexCoil Cams & 1–8×24 BDC Scope Suite',
        tabTitle: 'HexCoil Cams & Scope',
        summary:
          '2K 5-channel ORM atlas capturing the R500 propulsion & optics stack: lower strip maps 3K 2×2 twill carbon quad limbs with "7.6" → 3.6"" width callout; middle strip maps bronze-anodized HexCoil 360° helical cam grooves with "0°–310°" timing ticks; upper strip integrates the 1–8×24 BDC scope emerald sapphire-coated objective lens, VDI-27 grip texture, and 3-bolt quiver.',
        highlights: [
          '3K 2×2 twill carbon weave relief with high-gloss resin clearcoat normals',
          'Bronze-anodized HexCoil helical cam spiral cable tracks & 310° timing marks',
          '1–8×24 100-yd BDC scope multi-coated emerald glass (0.065) & EDM grip stippling',
        ],
        channels: [
          {
            note: 'sRGB · 3K twill carbon / bronze HexCoil cams / emerald sapphire lens / graphite grip',
          },
          {
            note: 'Linear · 3K weave relief + recessed cam helical tracks + VDI-27 grip texture',
          },
          {
            note: 'Linear · R:Height AO / G:Optic(0.065)-Cams(0.25)-Carbon(0.32)-Grip(0.70) / B:Metalness',
          },
        ],
      },
      r500_seamless_detail: {
        title: 'VersaDrive Leadscrew, Titanium Axles, ADF Latch & 500 FPS Bolt Maps',
        tabTitle: 'VersaDrive & Bolt',
        summary:
          'Micron-grade brushed alloy and low-friction composite normals for the VersaDrive stainless Acme leadscrew, dual-ratchet clutch gears, dual string catch jaws, copper Anti-Dry-Fire pawl, 3.5 lb match trigger linkage, music-wire return spring, arrow retention arm, and 20-inch 500 FPS carbon bolt with 100-gr 3-blade broadhead.',
        highlights: [
          'Precision turned metal brushed normals on VersaDrive Acme screw & titanium axles',
          'Contact-burnished surfaces on dual catch jaws, match trigger bar & copper ADF pawl',
          'Shared seamlessly across all 12 core internal & carbon bolt components',
        ],
        channels: [
          {
            note: 'Linear · Applied to VersaDrive screw, titanium axles, catch jaws, ADF pawl & sear',
          },
          {
            note: 'Linear · Stainless & anodized-bronze micro-roughness oil sheen variation',
          },
          {
            note: 'Linear · Applied to high-vis safety paddles, retention roller & polymer guards',
          },
        ],
      },
    },
  },
  python: {
    heading:
      'Colt Python 6" (.357 Magnum) Royal Blue PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      python_frame: {
        title:
          'Hartford Royal Blue Mirror Steel, Ventilated Rib & 6-Rd Fluted Cylinder Suite',
        tabTitle: 'Royal Blue & Cylinder',
        summary:
          '2K 5-channel ORM atlas baked for the 1955 Hartford-built Colt Python 6-inch revolver: reproduces multi-wheel hand-buffed midnight Prussian hot-salt bluing (Colt Royal Blue, Roughness G≈0.15, Metalness B≈0.96) contrasted against the matte bead-blasted anti-glare top rib (G≈0.56); features crisp left-barrel "PYTHON .357 / * .357 MAGNUM CTG. *" and right-barrel Hartford address rollmarks, left-frame Rampant Colt + VP proof stamp, and circumferential cylinder stop turn-line wear.',
        highlights: [
          'Hand-buffed Hartford Royal Blue mirror flats vs matte anti-glare serrated top rib',
          'Dual-flank PYTHON .357 & HARTFORD, CONN. U.S.A. serif rollmarks + Rampant Colt stamp',
          'C6 symmetric cylinder bolt turn-line burnishing & subtle flute edge silver wear',
        ],
        channels: [
          {
            note: 'sRGB · Deep midnight Royal Blue mirror steel / bright rollmarks / cylinder turn line',
          },
          {
            note: 'Linear · Top-rib anti-glare serrations + recessed serif rollmarks + fine hand-buffed grain',
          },
          {
            note: 'Linear · R:Rollmark & notch AO / G:Mirror blue(0.15)-Matte rib(0.56) / B:Forged steel(0.96)',
          },
        ],
      },
      python_walnut: {
        title:
          'American Black Walnut Target Grips, 22-LPI Checkering & 24K Gold Medallion Suite',
        tabTitle: 'Walnut & Gold Medallion',
        summary:
          'Captures the warmth of first-generation Colt Python flared target grips: linseed-oiled American black walnut burl heartwood (Metalness B=0.0, satin oil sheen G≈0.58), bordered 22-LPI hand-cut diamond checkering pyramids (G≈0.72 with deep valley AO), flush-inlaid 24K gold-plated Rampant Colt medallions (Metalness B=0.92, polished gold G≈0.24), and brass grip-screw escutcheons.',
        highlights: [
          'Linseed-oiled American black walnut burl pores, cathedral grain & double-line border',
          '22-LPI sharp hand-cut diamond checkering pyramid normals & valley AO shadows',
          'Flush 24K gold Rampant Colt medallion (B:0.92 / G:0.24) cleanly separated from wood (B:0.0)',
        ],
        channels: [
          {
            note: 'sRGB · Warm black walnut burl grain + matte checkered shield + 24K gold Colt medallion',
          },
          {
            note: 'Linear · Longitudinal walnut vessel pores + 22-LPI diamond pyramids + high-relief medallion',
          },
          {
            note: 'Linear · R:Checkering AO / G:Gold(0.24)-Oiled walnut(0.58)-Checkering(0.72) / B:Gold(0.92) vs Wood(0.0)',
          },
        ],
      },
      python_seamless_detail: {
        title:
          'Hand-Stoned DA/SA Clockwork, Folded V-Mainspring & Speedloader Seamless Maps',
        tabTitle: 'DA/SA Clockwork',
        summary:
          'Provides micron-scale hand-stoned stainless brushed normals and gun-oil sheen variation for the wide target spur hammer, hammer stirrup, Colt positive rebound safety lever, two-step indexing hand, 6-point ratchet extractor star, tapered folded V-leaf mainspring, knurled ejector rod, and HKS rotary speedloader.',
        highlights: [
          'Hand-stoned stainless flats across target hammer flanks, two-step hand & 6-tooth ratchet star',
          'Tempered spring-steel oil sheen on the folded V-leaf mainspring & center extractor spring',
          'Shared seamlessly across all 19 precision revolver lockwork & cylinder components',
        ],
        channels: [
          {
            note: 'Linear · Applied to target hammer, rebound lever, two-step hand, ratchet star & ejector rod',
          },
          {
            note: 'Linear · Micro-roughness oil sheen across blued steel, white steel & .357 brass',
          },
          {
            note: 'Linear · Applied to front-sight red insert & rotary speedloader knurled knob',
          },
        ],
      },
    },
  },
  benellim4: {
    heading:
      'Benelli M4 Super 90 / U.S. M1014 (12 Gauge) PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      benellim4_receiver: {
        title:
          'Urbino Hard-Anodized Receiver, MIL-STD-1913 Rail & Parkerized ARGO Barrel Suite',
        tabTitle: 'Receiver & ARGO Barrel',
        summary:
          '2K 5-channel Packed ORM atlas engineered for the Benelli M4 Super 90 (U.S. Marine Corps M1014): lower panel renders matte charcoal MIL-STD-8625 Type-III anodized 7075-T6 receiver flanks laser-etched with "BENELLI ARMI S.P.A. URBINO MADE IN ITALY · M4 SUPER 90" and "U.S. M1014 JOINT SERVICE COMBAT SHOTGUN" plus CNC edge silvering; middle strip isolates T2–T14 Picatinny slot numbers and LPA ghost-ring ticks; upper strip contrasts gray-green manganese-phosphated 18.5" barrel & dual ARGO gas block against the hard-chrome barrel extension.',
        highlights: [
          'Dual-flank Urbino factory & U.S. M1014 military laser markings with CNC edge wear',
          'MIL-STD-1913 top rail T2..T14 slot indices & LPA ghost-ring windage graduations',
          'Gray-green Parkerized 18.5" barrel / twin ARGO block (0.48) vs hard-chrome extension (0.18)',
        ],
        channels: [
          {
            note: 'sRGB · Charcoal anodized alloy receiver / Parkerized barrel & mag tube / hard-chrome extension',
          },
          {
            note: 'Linear · Micro-blasted anodize grain + laser-etched lettering + knurled ARGO end-caps',
          },
          {
            note: 'Linear · R:Multi-scale AO / G:Hard-chrome(0.18)-Anodize(0.42)-Phosphate(0.48) / B:Metalness',
          },
        ],
      },
      benellim4_furniture: {
        title:
          'Ribbed Polymer Forend, M1014 Skeletonized Telestock & Crimson 12ga 00 Buck Hull Suite',
        tabTitle: 'M1014 Stock & 12ga Hull',
        summary:
          'Combines tactical glass-filled polymer ergonomics with iconic 12-gauge combat shotshell materials in a 2K 5-channel ORM atlas: lower strip maps 2-piece ribbed nylon forend heat shields, laser-stippled M1014 pistol grip, and 3-position notched steel recoil tube; middle strip isolates the skeletonized buttstock, elastomer cheekpiece comb, and ribbed rubber recoil pad; top strip renders extruded crimson ribbed "12 GA 70mm 00 BUCK" polyethylene hulls and C26000 high-brass headstamps.',
        highlights: [
          'Two-piece heat-shield forend ribs & M1014 pistol grip high-density laser stippling',
          'Skeletonized telestock comb cheekpiece, ribbed rubber pad & 3-notch steel recoil tube',
          'Crimson ribbed 12 GA 70mm 00 BUCK polymer hull (0.04 metalness) vs C26000 brass cup (0.94)',
        ],
        channels: [
          {
            note: 'sRGB · Matte black glass-nylon furniture / crimson 12ga 00 Buck hull / C26000 high-brass base',
          },
          {
            note: 'Linear · VDI-27 mold grain + forend ribs + grip stipple + longitudinal hull extrusion flutes',
          },
          {
            note: 'Linear · Rubber pad(0.80) / Glass-nylon(0.64) / Crimson PE hull(0.35) / Brass head(0.23)',
          },
        ],
      },
      benellim4_seamless_detail: {
        title:
          'Twin Stainless ARGO Pistons, Hard-Chrome 2-Lug Bolt & Shell Elevator Seamless Maps',
        tabTitle: 'ARGO & Bolt Internals',
        summary:
          'Delivers micron-level CNC turning/milling normals and CLP oil-film roughness variation across the twin symmetrical 17-4PH stainless fluted short-stroke ARGO pistons, heavy machined bolt carrier, hard-chrome 2-lug rotating bolt head, floating firing pin, forged rotary hammer, three music-wire helical springs, and stamped stainless forked shell elevator.',
        highlights: [
          'Precision ground brushed normals on twin stainless ARGO tappets & hard-chrome 2-lug bolt',
          'CLP gun-oil micro-roughness across stamped stainless shell elevator, carrier & knurled handle',
          'Shared seamlessly across all 14 internal action nodes & high-vis orange fluted follower',
        ],
        channels: [
          {
            note: 'Linear · Applied to twin ARGO pistons, heavy bolt carrier, 2-lug bolt head & shell elevator',
          },
          {
            note: 'Linear · Micro-surface gun-oil sheen variation across stainless, hard-chrome & spring steel',
          },
          {
            note: 'Linear · Applied to high-visibility anodized/polymer fluted cup follower surface',
          },
        ],
      },
    },
  },
  garand: {
    heading:
      'U.S. Rifle Cal. .30 M1 Garand (Springfield 1944) PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      garand_walnut: {
        title:
          'WWII Linseed-Oiled American Black Walnut Stock, Handguards & DAS Cartouche Suite',
        tabTitle: 'Black Walnut & DAS Stamp',
        summary:
          '2K 5-channel Packed ORM atlas crafted for a 1944 Springfield Armory M1 Garand walnut stock set: captures kiln-dried American black walnut (Juglans nigra) cathedral grain, longitudinal vessel-pore normals, and warm raw-linseed-oil satin patina (Roughness ≈ 0.52, dielectric wood 0.02 vs Parkerized ferrules 0.78); crisply embosses the WWII Defense Eagle "DAS" acceptance box, Springfield crossed-cannons ordnance wheel on the left wrist, and circled "[P]" proof firing stamp.',
        highlights: [
          'American black walnut cathedral heartwood grain, vessel pores & linseed-oil patina (0.52)',
          'Left-cheek WWII Springfield crossed-cannons wheel & boxed DAS Defense Eagle cartouche',
          'Pistol-grip wrist circled "[P]" high-pressure proof mark & Parkerized ferrule separation',
        ],
        channels: [
          {
            note: 'sRGB · Linseed-oiled American black walnut / DAS & crossed-cannons cartouches / steel ferrules',
          },
          {
            note: 'Linear · Longitudinal walnut pores + recessed DAS & [P] wood stamps + ferrule steps',
          },
          {
            note: 'Linear · R:Pore & stamp AO / G:Oiled walnut(0.52) / B:Wood(0.02)-Parkerized ferrule(0.78)',
          },
        ],
      },
      garand_parkerized: {
        title:
          'Springfield Manganese-Phosphate Receiver, T105 Sight & 8-Rd En-Bloc Clip Suite',
        tabTitle: 'Parkerized & En-Bloc Clip',
        summary:
          'Faithfully reproduces WWII olive-slate manganese-phosphate Parkerizing crystals soaked in Cosmoline/gun oil: upper band deep-stamps the heeled receiver bridge with five-line "U.S. RIFLE / CAL. .30 M1 / SPRINGFIELD ARMORY / 2841944" markings alongside white 200–1200 yd T105 elevation drum graduations; middle band contrasts the bright centerless-ground stainless op-rod piston against burnished 2-lug bolt wear; lower band renders the 8-round spring-steel en-bloc clip "SA" stamp, retention nibs, and .30-06 brass rub tracks.',
        highlights: [
          'Deep-stamped receiver heel U.S. RIFLE CAL. .30 M1 SPRINGFIELD ARMORY 2841944 rollmark',
          'WWII olive-slate manganese-phosphate grain, T105 yardage scale & bright stainless gas piston',
          '8-round spring-steel en-bloc clip SA stamp, worn side nibs & .30-06 brass friction streaks',
        ],
        channels: [
          {
            note: 'sRGB · WWII olive-slate Parkerized steel / Springfield heel stamp / bright stainless piston & lugs',
          },
          {
            note: 'Linear · Manganese-phosphate crystal grain + deep receiver stamp + T105 knurling & clip ribs',
          },
          {
            note: 'Linear · Oil-retaining Parkerizing (0.43) vs centerless-ground piston & burnished lugs (0.19)',
          },
        ],
      },
      garand_seamless_detail: {
        title:
          '24" .30-06 Stepped Barrel, Stainless Gas Cylinder & Trigger-Group Seamless Maps',
        tabTitle: '24" Barrel & FCG Internals',
        summary:
          'Provides micron-grade lathe turning rings and ordnance oil-film roughness across all 17 internal steel components, including the 24-inch 4-groove .30-06 stepped barrel, 410 stainless muzzle gas cylinder, cross-valve lock screw, tang-blocked firing pin, dual-purpose op-rod spring, checkered steel trapdoor buttplate, dual-hook hammer, two-stage trigger, and follower arm linkage.',
        highlights: [
          'Lathe-turned ring grain, muzzle 3-spline grooves & 4-groove rifling highlights on 24" barrel',
          'Milled brushed steel normals on 410 stainless gas cylinder, checkered buttplate & trigger guard',
          'Shared seamlessly across all 17 WWII standard-issue rifle pressure & fire-control parts',
        ],
        channels: [
          {
            note: 'Linear · Applied to 24" barrel, stainless gas cylinder, firing pin, trigger, follower arm & buttplate',
          },
          {
            note: 'Linear · Retained ordnance gun-oil micro-roughness sheen on Parkerized & stainless steel',
          },
          {
            note: 'Linear · Micro-grain anti-glare contact surface relief on sight & buttplate checkering',
          },
        ],
      },
    },
  },
};

export const ATLAS_EN_STRINGS: Readonly<
  Record<WeaponId, AtlasWeaponTranslation>
> = ALL_ATLAS_EN_STRINGS;

export function getLocalizedAtlasHeading(
  weaponId: AtlasWeaponId,
  lang: LanguageCode,
  fallbackZh: string
): string {
  if (lang === 'zh') return fallbackZh;
  return ALL_ATLAS_EN_STRINGS[weaponId]?.heading ?? fallbackZh;
}

export function getLocalizedAtlasSuite(
  weaponId: AtlasWeaponId,
  suite: PbrSuiteItem,
  lang: LanguageCode,
  suiteIndex = 0
): LocalizedAtlasSuite {
  if (lang === 'zh') {
    return {
      id: suite.id,
      weapon: suite.weapon,
      title: suite.titleCn,
      tabTitle: suite.titleCn.replace(/贴图组|无缝细节贴图|无缝贴图/g, '').trim(),
      partTag: suite.partTag,
      resolution: suite.resolution,
      summary: suite.summary,
      highlights: suite.highlights,
      channels: suite.channels.map((ch) => ({
        kind: ch.kind,
        fileName: ch.fileName,
        label: ch.labelCn,
        note: ch.note,
      })),
    };
  }

  const weaponSuites = ALL_ATLAS_EN_STRINGS[weaponId]?.suites;
  const fallbackByIndex = weaponSuites
    ? Object.values(weaponSuites)[suiteIndex]
    : undefined;
  const translated = weaponSuites?.[suite.id] ?? fallbackByIndex;

  if (!translated) {
    return {
      id: suite.id,
      weapon: suite.weapon,
      title: suite.titleCn,
      tabTitle: suite.partTag,
      partTag: suite.partTag,
      resolution: suite.resolution,
      summary: suite.summary,
      highlights: suite.highlights,
      channels: suite.channels.map((ch) => ({
        kind: ch.kind,
        fileName: ch.fileName,
        label: CHANNEL_LABEL_EN_MAP[ch.labelCn] ?? ch.kind,
        note: ch.note,
      })),
    };
  }

  return {
    id: suite.id,
    weapon: suite.weapon,
    title: translated.title,
    tabTitle: translated.tabTitle,
    partTag: suite.partTag,
    resolution: suite.resolution,
    summary: translated.summary,
    highlights: translated.highlights,
    channels: suite.channels.map((ch, idx) => {
      const chTr = translated.channels[idx];
      return {
        kind: ch.kind,
        fileName: ch.fileName,
        label: chTr?.label ?? CHANNEL_LABEL_EN_MAP[ch.labelCn] ?? ch.kind,
        note: chTr?.note ?? ch.note,
      };
    }),
  };
}
