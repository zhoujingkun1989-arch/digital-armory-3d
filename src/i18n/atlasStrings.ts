import type { LanguageCode } from '../narration/types';
import {
  type PbrChannelMeta,
  type PbrSuiteItem,
  WEAPON_IDS,
  type WeaponId,
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
  '精密机加工金属拉丝法线 (Seamless)':
    'Precision-Machined Brushed Steel Normal (Seamless)',
  '精密白钢推磨拉丝法线 (Seamless)': 'Hand-Stoned Stainless Brushed Normal (Seamless)',
  '金属拉丝油膜粗糙度 (Seamless)': 'Brushed Metal Oil-Film Roughness (Seamless)',
  '金属拉丝与枪油膜粗糙度 (Seamless)': 'Brushed Steel & Oil-Film Roughness (Seamless)',
  '军械金属油膜粗糙度 (Seamless)': 'Ordnance Metal Oil-Film Roughness (Seamless)',
  '工程聚酰胺皮纹法线 (Seamless)': 'Engineered Polyamide Stipple Normal (Seamless)',
  '工程塑料皮纹法线 (Seamless)': 'Engineered Polymer Texture Normal (Seamless)',
  '工程聚合物皮纹法线 (Seamless)':
    'Engineered Polymer Stipple Normal (Seamless)',
  '工程聚合物微皮纹法线 (Seamless)': 'Engineered Polymer Micro-Grain Normal (Seamless)',
  '阳极旋钮微细纹理法线 (Seamless)': 'Anodized Knurled Knob Micro-Normal (Seamless)',
  '微细颗粒基底法线 (Seamless)': 'Micro-Grain Substrate Normal (Seamless)',
  '微细纹理法线 (Seamless)': 'Micro-Grain Surface Relief Normal (Seamless)',
  '复合弹性体皮纹法线 (Seamless)': 'Composite Elastomer Grip Normal (Seamless)',
  '工程弹性体皮纹法线 (Seamless)': 'Engineered Elastomer Grip Normal (Seamless)',
  '弹簧钢拉丝法线 (Seamless)': 'Spring-Steel Drawn Wire Normal (Seamless)',
  '弹簧钢润油粗糙度 (Seamless)': 'Spring-Steel Oiled Roughness (Seamless)',
};

export const CHANNEL_LABEL_EN = CHANNEL_LABEL_EN_MAP;

export type AtlasWeaponId = WeaponId;

export const ALL_ATLAS_EN_STRINGS: Readonly<
  Partial<Record<AtlasWeaponId, AtlasWeaponTranslation>>
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
  m249: {
    heading:
      'FN M249 SAW Squad Automatic Weapon PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      m249_receiver: {
        title: 'Stamped Steel Receiver, Heatshield & Quick-Change Barrel Suite',
        tabTitle: 'Receiver & Barrel',
        summary:
          'Custom-baked 2K 5-channel PBR suite for the FN M249 Squad Automatic Weapon: captures matte dark manganese-phosphate Parkerized stamped steel receiver walls, riveted internal steel guide rails, U.S. M249 SAW 5.56MM FN MFG LLC COLUMBIA SC rollmarks, ventilated 7-slot barrel heatshield wear, and high-temperature gas-cylinder carbon toning.',
        highlights: [
          'Matte manganese-phosphate stamped steel & rivet boss wear',
          'Engraved U.S. 5.56MM M249 FN MFG LLC Columbia SC rollmark',
          'Perforated barrel heatshield & gas regulator thermal patina',
        ],
        channels: [
          {
            note: 'sRGB · Matte manganese-phosphate steel / bright rail wear / muzzle & gas carbon toning',
          },
          {
            note: 'Linear · Stamped reinforcement ribs, spot-weld dimples & FN Columbia rollmark normals',
          },
          {
            note: 'Linear · R: Vent-slot & rivet AO | G: Parkerized crystal roughness (0.52–0.64) | B: Forged/stamped steel metalness',
          },
        ],
      },
      m249_beltbox: {
        title: 'OD-Green 200-Rd Polymer Belt Box, PIP Furniture & M27 Belt Suite',
        tabTitle: '200-Rd Box & M27 Belt',
        summary:
          'Covers the iconic 200-round olive-drab glass-filled nylon assault drum box with structural reinforcement ribs and LOT stenciling, matte black PIP buttstock/forend/pistol grip checkering, and C26000 cartridge brass paired with copper-jacketed M855 green-tip projectiles held in black-phosphate M27 disintegrating steel links.',
        highlights: [
          '200-round OD-green polymer assault box w/ structural ribs & stenciling',
          'Matte glass-filled polyamide PIP stock, pistol grip & forend stipple',
          'C26000 brass 5.56 NATO cases, M855 tips & M27 steel belt links',
        ],
        channels: [
          {
            note: 'sRGB · OD-green 200-rd polymer box, matte black PIP furniture & M27 linked brass zones',
          },
          {
            note: 'Linear · Molded box reinforcement ribs, grip checkering & disintegrating link seam relief',
          },
          {
            note: 'Linear · R: Rib & belt-pocket AO | G: Matte nylon (0.72–0.82) vs polished brass (0.24) | B: Non-metallic polymer vs metallic brass/links',
          },
        ],
      },
      m249_seamless_detail: {
        title: '2K Seamless Micro-Surface Detail Maps (Machined Steel & Polymer)',
        tabTitle: 'Seamless Detail',
        summary:
          'Three shared seamless micro-detail maps tiled across M249 bolt lugs, dual-rod piston carrier, quick-change barrel chrome, and polyamide furniture so close-up cutaway inspection preserves crisp machining toolmarks and oil-sheen variation.',
        highlights: [
          'Directional lathe/mill toolmarks on quick-change barrel & bolt lugs',
          'Ordnance CLP oil-film micro-roughness breakup across carrier rails',
          'Isotropic glass-fiber polyamide grain on PIP stock & belt box',
        ],
        channels: [
          {
            note: 'Linear · Seamless CNC lathe & end-mill toolmark micro-normal',
          },
          {
            note: 'Linear · Ordnance steel CLP oil-film & belt-track friction roughness modulation',
          },
          {
            note: 'Linear · Isotropic glass-filled polymer & phosphate crystal micro-normal',
          },
        ],
      },
    },
  },
  p08: {
    heading:
      'DWM Luger P08 Parabellum Rust-Blued, Straw Steel & Walnut PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      p08_blued: {
        title: 'Imperial DWM Rust-Blued Forged Steel & 240°C Straw-Tempered Suite',
        tabTitle: 'Rust-Blued & Straw',
        summary:
          'Recreates pre-war Deutsche Waffen- und Munitionsfabriken (DWM) Berlin old-world craftsmanship: deep charcoal-navy rust bluing (Streichbrunierung) across the tapered barrel, forked receiver, and articulated knee-joint toggle assembly, contrasted against authentic 240°C golden straw-tempered (Gelbangelassen) trigger, takedown lever, thumb safety, and ejector—complete with 1917 chamber date, intertwined DWM scroll monogram, Gesichert engraving, and knurled toggle ears.',
        highlights: [
          'Deep charcoal-navy Streichbrunierung rust bluing w/ holstered muzzle edge wear',
          'Authentic 240°C golden straw-tempered trigger, takedown lever, safety & ejector',
          'Engraved 1917 chamber date, DWM scroll monogram, Gesichert mark & toggle knurling',
        ],
        channels: [
          {
            note: 'sRGB · Deep charcoal-navy rust blue, 240°C golden straw temper & silvered edge wear',
          },
          {
            note: 'Linear · Diamond-checkered toggle ears, DWM scroll monogram & Gesichert safety relief',
          },
          {
            note: 'Linear · R: Toggle-hinge & serration AO | G: Hand-polished rust blue (0.24–0.34) | B: Forged ordnance steel metalness (0.92)',
          },
        ],
      },
      p08_walnut: {
        title: '20-LPI Checkered European Walnut Grips & Sheet-Steel Magazine Suite',
        tabTitle: 'European Walnut & Mag',
        summary:
          'Physically-based 2K suite for the P08’s hand-checkered 55° European walnut grip panels (Juglans regia) steeped in boiled linseed oil, paired with the nickel-plated folded sheet-steel 8-round box magazine and CNC-machined concentric-ring aluminum/wood twin-ear base knob.',
        highlights: [
          'Warm boiled-linseed-oiled European walnut figure & pore absorption',
          'Crisp 20-LPI hand-cut pyramidal diamond checkering & border bevels',
          'Bright nickel-finished magazine tube & concentric-ring twin-ear base knob',
        ],
        channels: [
          {
            note: 'sRGB · Warm European walnut heartwood grain, dark pore figure & bright magazine steel',
          },
          {
            note: 'Linear · Crisp 20-LPI pyramidal diamond checkering & concentric base-knob grooves',
          },
          {
            note: 'Linear · R: Checkering valley AO | G: Satin oil-rubbed walnut (0.48–0.64) | B: Non-metallic hardwood (0.0) vs metallic mag body',
          },
        ],
      },
      p08_seamless_detail: {
        title: '2K Seamless Micro-Surface Detail Maps (Hand-Honed Steel & Oil Film)',
        tabTitle: 'Seamless Detail',
        summary:
          'High-frequency seamless detail normals and oil-film roughness maps tiled across the P08’s hand-fitted forked receiver rails, breechblock flats, and toggle link pins for macro-distance museum inspection.',
        highlights: [
          'Fine longitudinal draw-filing & honing lines on receiver ways',
          'Subtle gun-oil sheen variation across rust-blued & straw-tempered steel',
          'Fine micro-grain contact texture on checkered controls & grip borders',
        ],
        channels: [
          {
            note: 'Linear · Fine German toolroom draw-filed & honed steel micro-normal',
          },
          {
            note: 'Linear · Light ordnance oil-film specular breakup across blued flats',
          },
          {
            note: 'Linear · Fine micro-grain contact surface relief normal',
          },
        ],
      },
    },
  },
  vector: {
    heading:
      'KRISS Vector Gen II Two-Tone FDE & Super V Mechanism PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      vector_housing: {
        title: 'Two-Tone FDE / Matte Black Polymer Housing & Picatinny Rail Suite',
        tabTitle: 'FDE / Black Housing',
        summary:
          'Dedicated 2K PBR suite for the iconic two-tone KRISS Vector Gen II SDP-SB silhouette: Flat Dark Earth (FDE) glass-reinforced polymer upper housing with full-length hardcoat-anodized Picatinny top rail, paired with the matte obsidian-black Super V lower receiver shell, molded KRISS USA VIRGINIA rollmarks, diagonal grip texturing, and extended 25-round .45 ACP MagEx2 sleeve.',
        highlights: [
          'Signature two-tone Flat Dark Earth upper & matte black Super V lower shell',
          'Molded KRISS USA · VECTOR .45 ACP markings, chevron ribs & grip stippling',
          'Extended 25-round MagEx2 .45 ACP magazine body with witness-hole accents',
        ],
        channels: [
          {
            note: 'sRGB · Two-tone FDE / matte black glass-filled polymer, anodized rail & white T-slot numbers',
          },
          {
            note: 'Linear · Molded KRISS rollmarks, Super V housing ribs & ergonomic grip stipple normals',
          },
          {
            note: 'Linear · R: Recess & rail-slot AO | G: Matte tactical polymer (0.68–0.80) | B: Non-metallic composite vs anodized rail',
          },
        ],
      },
      vector_internals: {
        title: 'Nitride Super V Articulated Bolt, 110° Tungsten Slider & Brass Pivot Suite',
        tabTitle: 'Super V Internals',
        summary:
          'Captures the heart of Renaud Kerbrat’s off-axis delayed-blowback mechanism: black QPQ salt-bath nitrided articulated .45 ACP breech bolt with polished lateral cam lugs, precision-ground 110° angled steel guide rails, heavy tungsten-steel counterweight slider with bright track burnishing, low-bore 5.5" barrel, and golden C36000 brass folding charging-handle pivot.',
        highlights: [
          'QPQ black-nitrided articulated bolt w/ bright burnished Super V cam lugs',
          '110° off-axis steel guide rails & heavy counterweight slider wear tracks',
          '5.5" .45 ACP barrel, 4-prong flash hider & brass charging-handle pivot accent',
        ],
        channels: [
          {
            note: 'sRGB · Black QPQ nitride steel, bright cam-track polish, C36000 brass pivot & .45 ACP copper/brass',
          },
          {
            note: 'Linear · Precision CNC cam-slot bevels, bolt extractor cut & barrel shoulder relief',
          },
          {
            note: 'Linear · R: Cam-slot & rail-channel AO | G: Burnished cam ways (0.18) vs QPQ nitride (0.42) | B: High-metalness ordnance steel & brass',
          },
        ],
      },
      vector_seamless_detail: {
        title: '2K Seamless Micro-Surface Detail Maps (CNC Nitride & Polymer Stipple)',
        tabTitle: 'Seamless Detail',
        summary:
          'Tiled micro-surface normal and roughness maps ensuring razor-sharp CNC milling marks on the Super V slider and realistic injection-molded glass-fiber texture across the FDE/black polymer shells during close-up cutaway zoom.',
        highlights: [
          'High-speed 5-axis CNC end-mill marks on articulated bolt & slider flats',
          'Synthetic lubricant sheen along 110° off-axis slider guide tracks',
          'Injection-molded glass-reinforced polymer micro-stipple relief',
        ],
        channels: [
          {
            note: 'Linear · Seamless 5-axis CNC machined steel micro-normal',
          },
          {
            note: 'Linear · Synthetic CLP film & high-cadence slider track roughness map',
          },
          {
            note: 'Linear · Seamless glass-filled polymer micro-stipple normal',
          },
        ],
      },
    },
  },
  g11: {
    heading:
      'German H&K G11 K2 Caseless Clockwork & Olive-Charcoal Monocoque PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      g11_v3_housing: {
        title:
          'Bundeswehr Olive-Charcoal Monocoque Shell, Hensoldt 1x/3.5x Optic & 4-Mode Controls Suite',
        tabTitle: 'Monocoque & Hensoldt Optic',
        summary:
          'Blender 5.2 Cycles GPU-baked 2K 5-channel Packed ORM suite for the H&K G11 K2 outer casing: renders Bundeswehr olive-charcoal glass-filled polyamide texture, Oberndorf red-boxed "[HK] G11 K2 · CAL. 4.73x33 DM11 / HECKLER & KOCH GMBH OBERNDORF" markings, Ulm antler federal eagle proof stamps, dual-flank red/white "S / 1 / 3 / A" 4-position selector icons, pop-out winding crank markings, and UV-firewalled emerald-sapphire multi-coated Hensoldt optic lenses.',
        highlights: [
          'Bundeswehr olive-charcoal polyamide grain, Oberndorf [HK] red-box plate & Ulm antler proof mark',
          'High-contrast dual-flank red/white "S / 1 / 3 / A" 4-position selector icons (2,100 RPM 3-rd / 460 RPM Auto)',
          'UV-firewalled emerald-sapphire Hensoldt 1x/3.5x multi-coated objective and ocular lenses',
        ],
        channels: [
          {
            note: 'sRGB · Olive-charcoal polymer casing / red-white S-1-3-A markings / Ulm proof / emerald-blue lenses',
          },
          {
            note: 'Linear · Molded stiffening ribs + cooling louvers + recessed Oberndorf rollmarks & grip texture',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Optic coating(0.08)-Nitride(0.30)-Polymer(0.60)-Buttpad(0.78) / B:Metalness',
          },
        ],
      },
      g11_v3_clockwork: {
        title:
          '90-Deg Chrome Rotary Breech, Swiss-Watch Gear Train & Floating Steel Receiver Suite',
        tabTitle: 'Rotary Breech & Clockwork',
        summary:
          'Dedicated 2K 5-channel Packed ORM suite for the H&K G11 K2 cutaway clockwork heart: showcases the radially brushed hard-chrome 90-degree rotating cylindrical breech (with rectangular caseless chamber bore and proof etchings), high-contrast CNC stainless steel and C36000 self-lubricating brass planetary spur gear train, 14-tooth gas driving rack, vertical loading rammer, coaxial striker rod, and 3-round burst escapement pack with anisotropic toolmarks and oil sheen.',
        highlights: [
          'Radially brushed hard-chrome 90-deg rotary breech cylinder with rectangular 4.73x33mm caseless chamber patina',
          'Swiss-watch metallic contrast between CNC stainless 26-tooth main gears & C36000 brass planetary cams/ratchet',
          'Floating steel inner chassis rail wear tracks, nitrided receiver flats & polyurethane hydraulic buffer separation',
        ],
        channels: [
          {
            note: 'sRGB · Hard-chrome rotary breech / stainless & C36000 brass clockwork gears / floating steel chassis',
          },
          {
            note: 'Linear · Radial lathe turning marks + meshing gear flank micro-wear + inner chassis laser serials',
          },
          {
            note: 'Linear · R:Cycles AO / G:Chrome breech(0.16)-Brass gears(0.22)-Nitrided chassis(0.32) / B:Pure metalness',
          },
        ],
      },
      g11_v3_barrel_mag: {
        title:
          '540mm Floating CHF Barrel, Overhead 45-Rd DM11 Caseless Mag & Safety-Orange Follower Suite',
        tabTitle: '540mm Barrel & DM11 Mag',
        summary:
          '2K 5-channel ORM atlas covering the 540 mm chrome-lined floating cold-hammer-forged barrel (with burst-fire heat tempering and six-slot flash-hider carbon fouling) and overhead 45-round caseless magazine: smoked translucent walls reveal 45 tightly stacked ochre-tan 4.73x33mm DM11 rectangular caseless propellant blocks with flush copper-jacketed spitzer tips and crisp white "15 / 30 / 45" markings, while the safety-orange follower stays strictly UV-firewalled (>= 50 px) with zero color bleed.',
        highlights: [
          'Overhead smoked magazine walls revealing 45 stacked ochre-tan DM11 caseless blocks, copper tips & 15/30/45 ticks',
          '540 mm floating CHF barrel "4.73x33 DM11" laser markings & blue-bronze heat-tempered slotted flash hider',
          'High-visibility safety-orange horizontal anti-tilt follower (M-02) strictly UV-firewalled for zero color bleed',
        ],
        channels: [
          {
            note: 'sRGB · 45 ochre-tan DM11 caseless blocks / 15-30-45 witness ticks / orange follower / tempered flash hider',
          },
          {
            note: 'Linear · Rotary-forged barrel grain + molded magazine ribs & ticks + flash-hider carbon micro-relief',
          },
          {
            note: 'Linear · R:Cycles AO / G:Smoked window(0.26)-Nitrided barrel(0.28)-DM11 block(0.68) / B:Metalness mask',
          },
        ],
      },
      g11_seamless_springs: {
        title:
          'Floating-Action Recoil Mainspring & Overhead Feed Spring Seamless Detail Maps',
        tabTitle: 'Helical Springs Detail',
        summary:
          'Tileable high-fatigue music-wire drawn steel normals and oiled micro-roughness maps dedicated to the two GPU-compressed aSpringParam helical springs (floating inner receiver long-stroke mainspring and overhead 45-round horizontal feed spring).',
        highlights: [
          'Preserves aSpringParam real-time GPU constant-wire-diameter compression across the 42 mm floating stroke',
          'High-fatigue music-wire drawn-steel micro-normals & gun-oil roughness modulation',
        ],
        channels: [
          {
            note: 'Linear · Applied to g11_recoil_spring and g11_mag_spring music-wire coil surfaces',
          },
          {
            note: 'Linear · Spring-steel oil sheen & micro-gloss variation across helical coils',
          },
        ],
      },
    },
  },
  vss: {
    heading:
      'Soviet Tula VSS Vintorez 6-Stage Baffle Core, Laminated Birch Stock & PSO-1 PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      vss_v3_receiver_supp: {
        title:
          'Tula Arsenal CNC-Milled Blued Receiver, 414mm Integral Suppressor & Dark-Plum Forend Suite',
        tabTitle: 'Milled Receiver & Suppressor',
        summary:
          'Offline Blender 5.2 Cycles GPU-baked 2K 5-channel Packed ORM suite: renders Tula Arms Plant (TOZ) CNC-milled forged receiver satin bluing with silvered edge wear, crisp Cyrillic stamp "VSS VINTOREZ · 9x39 · No. 87412" and triangular star crest, 414 mm matte-blued integral suppressor outer tube with 100-400m tangent sight markings, stamped 3-rib dust cover, and Soviet dark-plum fiberglass ribbed forend.',
        highlights: [
          'Tula Arsenal TOZ triangle-star emblem & Cyrillic VSS Vintorez 9x39 serial #87412 distortion-free Hero UV',
          'AgX-calibrated satin blued steel (sRGB 0.21-0.27, M=0.86, R=0.30-0.38) separated from dark-plum polymer forend',
          '400m subsonic tangent leaf numerals "1 · 2 · 3 · 4" & right dust-shield safety / cross-bolt selector marks',
        ],
        channels: [
          {
            note: 'sRGB · Satin Soviet blued milled receiver / integral suppressor tube / TOZ markings / dark-plum ribbed forend',
          },
          {
            note: 'Linear · Cycles high-poly bevels + CNC toolmarks + recessed Cyrillic rollmarks & 400m sight ticks',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Blued steel(0.32)-Matte suppressor(0.38)-Polymer(0.62) / B:Metalness',
          },
        ],
      },
      vss_v3_wood_optic: {
        title:
          'Russian Laminated Birchwood Skeleton Stock, PSO-1M2-1 4x24 Optic & Plum Waffle Mag Suite',
        tabTitle: 'Laminated Birch & PSO-1',
        summary:
          'Unites the VSS’s iconic visual landmarks: 3D-procedural multi-ply Russian laminated birchwood thumbhole stock in hand-rubbed honey-amber (alternating light/dark ply laminations, wood pores, and ribbed rubber buttpad); hammer-tone gray enameled PSO-1M2-1 side-mount scope stamped "PSO-1M2-1 · 9x39" with 1-4 subsonic BDC turret; plus >= 50 px UV-firewalled emerald-sapphire coated lenses and safety-orange anti-tilt magazine follower.',
        highlights: [
          'Honey-amber Russian laminated birchwood thumbhole stock with alternating diagonal plies, linseed patina & rubber pad',
          'Hammer-tone gray PSO-1M2-1 cast magnesium body, Cyrillic 9x39 markings & 1-4 subsonic elevation drum',
          '>= 50 px UV-firewalled zero-bleed emerald-sapphire multi-coated lenses & safety-orange anti-tilt follower',
        ],
        channels: [
          {
            note: 'sRGB · Honey-amber laminated birch stock / hammer-gray PSO-1 optic / emerald lenses / plum waffle mag & orange follower',
          },
          {
            note: 'Linear · Birchwood ply pores + hammer-tone enamel grain + waffle magazine ribs & accordion eyecup folds',
          },
          {
            note: 'Linear · R:Cycles AO / G:Coated glass(0.05)-Oiled birch(0.42)-Rubber(0.84) / B:Per-texel metalness',
          },
        ],
      },
      vss_v3_metal: {
        title:
          '6-Stage Slanted Acoustic Baffle Core, 200mm Ported Barrel, 6-Lug Bolt & Linear Striker Suite',
        tabTitle: 'Baffles, 6-Lug Bolt & Striker',
        summary:
          'Engineered for live CT-Scan cutaway ([C]) and exploded teardown inspection: showcases the gleaming CNC brushed-stainless 6-stage asymmetric slanted acoustic baffle stack (layered with subsonic propellant heat tint and carbon soot gradient), 3-row radial-ported chrome-lined barrel, bright 6-lug precision rotating bolt, long-stroke chromed piston, hammerless linear striker, sear pack, and steel magazine spring/floorplate.',
        highlights: [
          'CNC brushed-stainless 6-stage asymmetric slanted baffle stack with realistic subsonic carbon-soot gradient',
          '200mm 3-row radial-ported chrome-lined barrel turning marks & bright brushed 6-lug precision rotating bolt',
          'Specular contrast across hammerless linear striker, coaxial firing pin, sear linkage & steel mag floorplate',
        ],
        channels: [
          {
            note: 'sRGB · Brushed stainless 6-stage baffle core / soot gradient / bright 6-lug bolt / blued carrier & ported barrel',
          },
          {
            note: 'Linear · Lathe turning rings + CNC milling marks + 6-stage slanted baffle high-poly chamfers',
          },
          {
            note: 'Linear · R:Cycles AO / G:Precision 6-lug bolt(0.18)-Baffle core(0.24)-Carbon soot(0.76) / B:High metalness',
          },
        ],
      },
    },
  },
  m134: {
    heading:
      'U.S. GE / Dillon Aero M134D 6-Barrel Gatling Sinusoidal Cam & 28V Electric Drive PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      m134_v3_housing_motor: {
        title:
          'M134D Ribbed Mainframe Stencils, 360-Deg Cam Sleeve, 28V Copper-Wound Motor & Spade Grip Suite',
        tabTitle: 'Housing, Cam & 28V Motor',
        summary:
          'Blender 5.2 Cycles GPU-baked 2K 5-channel Packed ORM suite for the M134D mainframe and electric drive: renders crisp white military stenciling "GUN, AUTOMATIC, 7.62MM, M134D · DILLON AERO · GENERAL ELECTRIC · CAGE 1U2T4 · 3,000 RPM" and 16x16 ECC200 MIL-STD-130 UID DataMatrix on both housing flanks, burnished steel tracks inside the 360-degree sinusoidal cam sleeve, top 28V DC 3.2-HP motor brushed aluminum nameplate and warm enameled copper armature coils, plus UV-firewalled crimson master arm switch on the spade grip.',
        highlights: [
          'Dual-flank HD 1:1 white military stencils & 16x16 MIL-STD-130 UID DataMatrix on ribbed mainframe',
          '28V DC 3.2-HP aerospace motor cooling fins, brushed nameplate & cutaway enameled copper armature coils',
          'Burnished 360-deg hardened sinusoidal cam path & crimson master arm toggle (>= 50 px UV firewall)',
        ],
        channels: [
          {
            note: 'sRGB · Manganese-phosphate housing white stencils & UID / warm copper windings / crimson master arm',
          },
          {
            note: 'Linear · Cast sand-grain micro-relief + motor fin bevels + cam track wear + spade grip knurling',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Burnished cam(0.18)-Phosphate steel(0.35)-Rubber grip(0.76) / B:Metalness',
          },
        ],
      },
      m134_v3_barrels_rotor: {
        title:
          'Six 22" Fluted Barrels, Heat-Tempered Rotary Flash Cage, Star-Rotor & Safing Sector Suite',
        tabTitle: '6 Barrels & Star-Rotor',
        summary:
          '2K 5-channel Packed ORM suite dedicated to the M134D rotating heart and six-barrel cluster: renders lathe-turned toolmarks and caliber rollmarks across all six 22-inch fluted barrels, gold-bronze to blue-violet thermal tempering and velvet soot on the 3,000 RPM six-tube rotary flash cage, anisotropic 5-axis CNC sheen on the six-flute central star-rotor and 28-tooth main spur gear, plus a strictly UV-firewalled high-contrast yellow/crimson "SAFE / ARMED" safing sector plate.',
        highlights: [
          'Sustained-fire gold-bronze to blue-violet heat-temper bands & matte carbon soot on 6-tube flash cage',
          'Anisotropic CNC milled highlights across the 6-flute central star-rotor & 28-tooth involute spur gear',
          'Zero-bleed high-contrast military yellow/crimson "SAFE / ARMED" laser warning plate on safing sector',
        ],
        channels: [
          {
            note: 'sRGB · Fluted barrel steel / blue-violet-gold tempered flash cage / CNC rotor / yellow-red safing plate',
          },
          {
            note: 'Linear · Barrel turning rings + star-rotor CNC toolpaths + 28-tooth spur gear chamfers & stamps',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Star-rotor(0.20)-Barrels(0.32)-Carbon soot(0.84) / B:Metalness',
          },
        ],
      },
      m134_v3_delinker_bolts: {
        title:
          'Six Hard-Chrome Rotary Bolts, Dillon Delinker, Stainless Feed Chute & 7.62 NATO Belt Suite',
        tabTitle: '6 Bolts & Dillon Delinker',
        summary:
          '2K 5-channel Packed ORM suite highlighting the M134D 6-bolt sinusoidal wave and Dillon Aero feed system: mirror-brushed hard-chrome across all six roller bolts and the six-pocket star-wheel sprocket, white laser-etched Dillon Aero delinker markings, quadruple UV-firewalled 7.62x51mm NATO M80 rounds inside the flexible ribbed stainless feed chute (annealed C26000 brass, copper FMJ tips, silver Boxer primers, and dark manganese-phosphate M13 links), plus brass-kiss ejection scuffs inside the lower-right chute.',
        highlights: [
          'Precision bearing-grade brushed hard-chrome finish across all 6 rotary bolts & 6-pocket star-wheel',
          'Quadruple UV-firewalled 7.62x51mm annealed brass, copper FMJ tips, silver primers & black M13 steel links',
          'White laser-etched Dillon Aero delinker nameplate & authentic brass-kiss impact scuffs in ejection chute',
        ],
        channels: [
          {
            note: 'sRGB · Hard-chrome 6-bolt set / Dillon stencil / annealed brass 7.62 belt & copper FMJ tips',
          },
          {
            note: 'Linear · CNC bolt grinding marks + ribbed stainless feed chute segments + M13 links & laser text',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Chrome bolts & brass(0.18)-Phosphated M13 links(0.40) / B:Full metal',
          },
        ],
      },
    },
  },
  an94: {
    heading:
      'Russian Nikonov AN-94 "Abakan" Pulley-Cable Pre-Feed, Figure-8 Brake & 15-Deg Mag PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      an94_v3_receiver_stock: {
        title:
          'Izhmash Charcoal Polyamide Outer Housing, Star-Wheel Diopter & Right-Folding Stock Suite (V3)',
        tabTitle: 'Polyamide Shell & Stock',
        summary:
          'Blender 5.2 Cycles GPU-baked 2K 5-channel Packed ORM suite for the AN-94 outer chassis: faithfully reproduces Izhmash 35% glass-filled charcoal polyamide matte grain (sRGB 0.17-0.22, M=0.0, R=0.60), distortion-free left-flank Hero UV carrying the Izhmash arrow-in-triangle crest, Cyrillic rollmark "AN-94 ABAKAN · 5.45x39 · IZHMASH · No. 940218", GIS proof stamp, crisp red/white fire-control dots, right-flank "6P33 · 1997 · MADE IN RUSSIA" markings, and ejection-port brass kisses.',
        highlights: [
          'Left Hero flank Izhmash arrow-triangle factory crest & Cyrillic AN-94 Abakan 5.45x39 serial #940218',
          'High-contrast red/white independent safety & 3-mode selector enamel fills plus checkered grip stippling',
          '5-position star-wheel diopter edge wear, right-folding ribbed stock & vulcanized rubber buttpad separation',
        ],
        channels: [
          {
            note: 'sRGB · Charcoal glass-filled polyamide housing / white Izhmash Cyrillic rollmarks / red-white fire dots',
          },
          {
            note: 'Linear · Cycles high-poly bevels + RNM recessed markings + diamond grip checkering & forend ribs',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Enamel dust cover(0.28)-Polyamide shell(0.62)-Rubber pad(0.84) / B:Metal',
          },
        ],
      },
      an94_v3_pulley_metal: {
        title:
          'Floating Steel Sub-Receiver, CNC Cable Pulley & 2-Stage Bronze Pre-Feed Rammer Suite (V3)',
        tabTitle: 'Pulley-Cable Heart',
        summary:
          '2K 5-channel ORM suite tailored to the "Clockwork Kalashnikov" blowback-shifted core: highlights bright burnished slide rails along the floating phosphated steel sub-receiver, mirror-brushed CNC V-groove transmission pulley with bronze bushing, multi-strand reflective braided stainless drive cable with crimped brass ferrules, bronze/chromed two-stage pre-feed rammer shuttle, 2-lug stainless rotating bolt, and 2-round hyperburst hammer ratchet.',
        highlights: [
          'Specular material contrast across CNC V-groove pulley, bronze bushing & multi-strand braided steel cable',
          'Anisotropic CNC milling micro-normals on bronze 2-stage pre-feed rammer & 2-lug stainless rotating bolt',
          'Bright 42 mm reciprocating rail wear bands on floating inner receiver & 2-round burst hammer ratchet',
        ],
        channels: [
          {
            note: 'sRGB · Phosphated steel sub-receiver / bright pulley & braided cable / bronze pre-feed rammer & bolt',
          },
          {
            note: 'Linear · Lathe turning rings + helical braided-cable strand normals + longitudinal slide rail streaks',
          },
          {
            note: 'Linear · R:Internal cavity AO / G:Bright cable(0.16)-Bronze rammer(0.24)-Phosphated sub-chassis(0.32) / B:Metal',
          },
        ],
      },
      an94_v3_barrel_mag: {
        title:
          '405mm Floating Barrel, Figure-8 Whistling Brake & 15-Deg Plum-Black Magazine Suite (V3)',
        tabTitle: 'Figure-8 Brake & 15-Deg Mag',
        summary:
          '2K 5-channel ORM suite capturing the AN-94’s twin silhouette signatures: forward half renders the 405 mm floating CHF chrome-lined barrel, upper gas cylinder, and iconic asymmetrical figure-8 dual-chamber self-cleaning whistling muzzle brake (layered with straw-gold/steel-blue thermal temper and bore carbon fouling); aft half maps both flanks of the 15-degree right-canted 30-round Izhmash plum-black 5.45x39mm magazine ("5.45x39 · IZHMASH") with a >= 50 px UV-firewalled safety-orange anti-tilt follower.',
        highlights: [
          'Asymmetrical figure-8 dual-chamber whistling brake with gold-brown/steel-blue temper & chamber soot',
          '15-degree right-canted Izhmash plum-black 5.45x39mm polymer magazine with molded arrow crest',
          'Strictly >= 50 px UV-firewalled high-visibility safety-orange anti-tilt follower (zero color bleed)',
        ],
        channels: [
          {
            note: 'sRGB · Heat-tempered fouled figure-8 brake / 405mm barrel / plum-black 5.45 mag & orange follower',
          },
          {
            note: 'Linear · Barrel lathe rings + figure-8 vortex chamber bevels + molded mag logos & steel floorplate',
          },
          {
            note: 'Linear · R:Contact AO / G:Blued barrel(0.28)-Fouled muzzle(0.84)-Plum mag(0.56) / B:Metalness mask',
          },
        ],
      },
    },
  },
  ztz99a: {
    heading:
      'PLA ZTZ-99A Main Battle Tank (125mm ZPT-98) 2K PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      ztz99a_v3_armor_hull: {
        title:
          'Hollow Composite Hull, Upper Glacis FY-4 ERA, Tracks & Rear Powerpack Deck Suite (V3)',
        tabTitle: 'Hull, FY-4 ERA & Tracks',
        summary:
          'Blender 5.2 Cycles GPU-baked 2K 5-channel Packed ORM suite for the ZTZ-99A armored hull and running gear: reproduces modern PLA three-tone pixelated digital camouflage (olive green / desert sand / deep pine-charcoal) in matte anti-glare finish, distortion-free dual-flank Hero UV carrying the white PLA August-1st star emblem and tactical hull number "99A-108", plus crisp physical roughness separation across burnished double-pin steel track tips, vulcanized road-wheel rubber rims, twin 200L rear fuel drums, and precision-ground turret race ring teeth.',
        highlights: [
          'Modern PLA 3-tone pixelated digital camouflage with crisp white "99A-108" hull serial & August-1st star',
          'Upper glacis FY-4 dual-purpose ERA weld beads, bolt relief normals & ballistic rubber-steel skirt layering',
          'Burnished double-pin track cleats, 670mm road-wheel vulcanized rims & machined turret race steel sheen',
        ],
        channels: [
          {
            note: 'sRGB · PLA 3-tone digital camo / white "99A-108" markings / rubber-padded tracks & ground turret ring',
          },
          {
            note: 'Linear · Rolled armor grain & weld beads + glacis FY-4 ERA bolts + engine louvers & track tread relief',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Turret ring(0.22)-Matte camo(0.58)-Wheel rubber(0.82) / B:Metalness',
          },
        ],
      },
      ztz99a_v3_turret_gun: {
        title:
          'Hollow Welded Turret, Arrowhead FY-4 ERA, 125mm ZPT-98 Cannon & JD-3 Optics Suite (V3)',
        tabTitle: 'Turret, 125mm Gun & JD-3',
        summary:
          'Dedicated 2K 5-channel Packed ORM suite for the ZTZ-99A signature arrowhead turret and 125mm firepower: renders non-mirrored dual-flank Hero UV red-bordered August-1st star emblems and crisp white "ZTZ-99A / 108" turret numbers, the 6.25-meter ZPT-98 L/50 smoothbore barrel with camouflaged thermal shroud, stainless bands, and subtle muzzle soot, internal mirror-chrome twin hydraulic recoil rods and CNC vertical sliding-wedge breechblock, plus strictly >= 50 px UV-firewalled emerald-sapphire optical coatings on the gunner thermal sight, CITV, and JD-3 active laser dazzler.',
        highlights: [
          'Dual-flank non-mirrored Hero UV red-bordered star emblems & crisp "ZTZ-99A / 108" tactical stencils',
          'Strict >= 50 px UV-firewalled emerald-sapphire multi-coated lenses on CITV, gunner sight & JD-3 dazzler',
          'Mirror-chrome twin hydraulic recoil rods, CNC vertical sliding breech & subtle 125mm muzzle soot patina',
        ],
        channels: [
          {
            note: 'sRGB · Digital camo arrowhead turret & "ZTZ-99A / 108" / mirror-chrome recoil rods / emerald optics',
          },
          {
            note: 'Linear · Arrowhead FY-4 ERA chamfers & welds + barrel thermal-shroud clamps + breech CNC toolmarks',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Optics & chrome(0.12)-Breech(0.24)-Matte armor(0.58) / B:Metalness',
          },
        ],
      },
      ztz99a_v3_interior_power: {
        title:
          '22-Rd Floor Carousel Autoloader, 150HB V12 Twin-Turbo Diesel & Digital Crew Suite (V3)',
        tabTitle: 'Carousel Autoloader & V12',
        summary:
          'Museum-grade cutaway 2K 5-channel Packed ORM suite crafted for live CT-Scan ([C]) inspection: separates four strictly UV-firewalled materials across the 22-round floor carousel (dark tungsten DTC10-125 APFSDS penetrators, amber semi-combustible propellant charges, and gleaming C26000 brass stub bases); aft hull showcases the 1,500-HP 150HB V12 twin-turbo diesel cast-aluminum block, bright silver turbocharger scrolls, bronze exhaust manifolds, copper CH-1000 radiator cores, safety-yellow service caps, and glowing cyan-green digital tactical MFD consoles.',
        highlights: [
          'Strict UV-firewalled 22-round carousel separating tungsten APFSDS darts, amber charges & C26000 brass stubs',
          '1,500-HP 150HB V12 twin silver turbochargers, bronze exhaust manifolds, copper radiators & safety-yellow caps',
          'Glowing cyan-green digital fire-control MFDs across 3 crew stations & 12 transverse steel torsion bars',
        ],
        channels: [
          {
            note: 'sRGB · 22-rd brass stubs & APFSDS darts / silver-turbo V12 & safety-yellow caps / cyan-green digital MFDs',
          },
          {
            note: 'Linear · Cast engine block & cooling fins + carousel rivets & gears + rigid rammer-chain micro-normals',
          },
          {
            note: 'Linear · R:Interior lifted AO / G:Polished brass & turbos(0.18)-Block(0.36)-Seat fabric(0.84) / B:Metalness',
          },
        ],
      },
    },
  },
  m1a2: {
    heading:
      'M1A2 SEP v3 Abrams Main Battle Tank (120mm M256) 2K PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      m1a2_v3_hull_armor: {
        title:
          'Desert CARC Tan Hull, Modular Ballistic Side Skirts, Jet-Blast Deck & T158 Tracks Suite (V3)',
        tabTitle: 'CARC Hull & T158 Tracks',
        summary:
          'Blender 5.2 Cycles GPU-baked 2K 5-channel Packed ORM suite for the M1A2 SEP v3 hull and running gear: faithfully renders authentic U.S. Army Desert CARC Tan anti-chemical coating (sRGB 0.62, 0.54, 0.40) with matte anti-slip grit, sharp black bumper codes "3-69 AR / B-21", signature black tactical side-skirt chevron "^" over desert weathering, high-contrast red/yellow rear "DANGER - JET BLAST / EXHAUST" warning stencils, plus calibrated roughness separation across T158 rubber-padded tracks and hardened turret race teeth.',
        highlights: [
          'Desert CARC Tan coating with planar 1:1 Hero UV "3-69 AR / B-21" bumper code & black tactical "^" chevron',
          'High-contrast red/yellow "DANGER JET BLAST / EXHAUST" rear turbine louvers (>= 50 px UV firewall)',
          'Roughness separation across T158 rubber pads, 7-pair dual road wheels, 14 torsion bars & 2.16m race ring',
        ],
        channels: [
          {
            note: 'sRGB · Desert CARC Tan hull / 3-69 AR B-21 & "^" tactical chevron / red-yellow JET BLAST stencils',
          },
          {
            note: 'Linear · Cycles armor welds & anti-slip grit + skirt seams & deck louvers + T158 track pad relief',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Race gear(0.22)-CARC anti-slip(0.68)-Track rubber(0.82) / B:Metalness',
          },
        ],
      },
      m1a2_v3_turret_gun: {
        title:
          'Faceted Turret, Chobham/DU NERA Cheek Armor, 120mm M256 Gun & CROWS-LP Optics Suite (V3)',
        tabTitle: 'Turret, Chobham & M256',
        summary:
          '2K 5-channel Packed ORM suite capturing the M1A2 SEP v3 offensive and defensive core: high-resolution dual-flank Hero UV turret panels carry crisp black "B-21" and "^" tactical markings alongside louvered CIP identification panels; inside the front cheeks, 7-layer Chobham/Depleted-Uranium (DU) NERA composite armor reveals alternating steel, ceramic, DU mesh, and copper energy-absorbing strata; paired with the 120mm M256 barrel thermal shroud, muzzle carbon patina, and >= 50 px UV-firewalled emerald-sapphire coated lenses on CROWS-LP, CITV, and GPS sights.',
        highlights: [
          'Distortion-free dual-flank black "B-21" / "^" turret markings, louvered CIP panels & roof blow-off vents',
          'Cutaway 7-layer Chobham/Depleted-Uranium (DU) NERA cheek sandwich separating ceramic, DU & copper strata',
          'Strict >= 50 px UV-firewalled emerald-sapphire multi-coated lenses across CROWS-LP, CITV & GPS optics',
        ],
        channels: [
          {
            note: 'sRGB · Desert CARC turret B-21 / Chobham-DU cheek layers / 120mm M256 gun / emerald optical coatings',
          },
          {
            note: 'Linear · Armor plate welds + thermal-shroud clamps + M256 vertical breech CNC toolmarks & CIP louvers',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Coated optics(0.08)-Breech steel(0.24)-CARC armor(0.66) / B:Metalness',
          },
        ],
      },
      m1a2_v3_turbine_bustle: {
        title:
          'Honeywell AGT1500 Gas Turbine, Blast Doors, 36-Rd M829A4 Bustle & SEP v3 Crew Suite (V3)',
        tabTitle: 'AGT1500 & Ammo Bustle',
        summary:
          'Cutaway-showpiece 2K 5-channel Packed ORM interior suite for the M1A2 SEP v3: spotlights the Honeywell AGT1500 gas turbine 5-stage gleaming titanium axial compressor blades and corrugated warm copper-bronze annular exhaust recuperator, heavy sliding armored blast doors stenciled with yellow-black "BLAST DOOR - KEEP CLOSED" stripes, 36-round honeycombed bustle packed with 120mm M829A4 DU APFSDS rounds (four-material split across brass stub bases, olive-tan combustible cases, bright aluminum sabots, and dark DU penetrators), plus cyan-green SEP v3 tactical LCDs.',
        highlights: [
          'Honeywell AGT1500 gleaming titanium multi-stage compressor blades & warm copper-bronze annular recuperator',
          'Yellow-black "BLAST DOOR - KEEP CLOSED" sliding armor bulkhead & 36-round M829A4 honeycombed bustle',
          'Strict >= 50 px UV-firewalled cyan-green SEP v3 tactical LCD displays & corrugated copper heat exchanger',
        ],
        channels: [
          {
            note: 'sRGB · Titanium compressor / warm copper recuperator / yellow-black blast doors / M829A4 / cyan LCDs',
          },
          {
            note: 'Linear · Compressor blade chamfers + pleated recuperator fins + gearbox ribs & honeycomb tube turning',
          },
          {
            note: 'Linear · R:Interior AO / G:Titanium & copper(0.18)-Brass stubs(0.20)-Combustible case(0.62) / B:Metalness',
          },
        ],
      },
    },
  },
  leopard2a7: {
    heading:
      'KMW Leopard 2A7V Main Battle Tank (120mm L/55A1) 2K PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      leopard2a7_v3_hull_camo: {
        title:
          'NATO 3-Tone Camo 2A7V Hull, Heavy Skirts, 7-Pair Road Wheels & Diehl 570FT Tracks Suite (V3)',
        tabTitle: 'NATO Camo Hull & Tracks',
        summary:
          'Blender 5.2 Cycles GPU-baked 2K 5-channel Packed ORM suite for the Leopard 2A7V hull and mobility group: faithfully reproduces Bundeswehr matte CARC NATO 3-tone camouflage (Bronze Green RAL 6031, Leather Brown RAL 8027, and calibrated Tar Black RAL 9021), sharp 1:1 planar Hero UV black-and-white Iron Cross (Balkenkreuz) insignia, Bundeswehr license plate "Y-482 917", and high-visibility yellow "MLC 70" bridge-classification disc, paired with distinct surface physics for 7-pair dished road wheels, worn Diehl 570FT double-pin tracks, and the machined turret race ring.',
        highlights: [
          'Bundeswehr NATO 3-tone CARC camouflage (RAL 6031/8027/9021) with anti-slip grit coating micro-normals',
          'Crisp 1:1 planar Bundeswehr Iron Cross, license plate "Y-482 917" & high-vis yellow "MLC 70" bridge disc',
          'Material separation across 7-pair rubber wheel rims, worn Diehl 570FT track teeth & 14 forged torsion bars',
        ],
        channels: [
          {
            note: 'sRGB · NATO 3-tone camo hull / Iron Cross & "Y-482 917" / yellow "MLC 70" / road wheels & Diehl tracks',
          },
          {
            note: 'Linear · Hull weld beads & chamfers + anti-slip grit + twin round fan grilles & track pad relief',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Race ring(0.22)-Matte CARC camo(0.66)-Track pads(0.80) / B:Metalness',
          },
        ],
      },
      leopard2a7_v3_turret_gun: {
        title:
          'Hollow Arrowhead Turret, 6.6m Rh-120 L/55A1 Smoothbore & PERI/EMES Optics Suite (V3)',
        tabTitle: 'Arrowhead & L/55A1 Gun',
        summary:
          '2K 5-channel Packed ORM suite built for the Leopard 2A7V turret and high-pressure firepower: non-mirrored dual-flank Hero UV cheeks display NATO 3-tone camouflage, crisp Bundeswehr Iron Crosses, and "2A7V / 312" tactical stencils; details the spaced NERA internal plates inside the hinged hollow Arrowhead wedges, 6.6-meter Rh-120 L/55A1 fiberglass thermal shroud and stainless clamps, mirror hard-chrome hydraulic recoil cylinders, CNC 700 MPa vertical falling-wedge breechblock, and >= 50 px UV-firewalled green-blue multi-coated lenses on PERI R17A3 and EMES-15 optics.',
        highlights: [
          'Dual-flank non-mirrored Bundeswehr Iron Cross & "2A7V · 312" tactical stencils over NATO 3-tone camo',
          'PERI R17A3 panoramic thermal sight & EMES-15 main optic green-blue AR coatings (>= 50 px UV firewall)',
          '6.6m Rh-120 L/55A1 fiberglass thermal shroud, hard-chrome recoil brakes & CNC 700 MPa vertical breech',
        ],
        channels: [
          {
            note: 'sRGB · Arrowhead 3-tone turret & Iron Cross 2A7V / 6.6m L/55A1 / chrome brakes / green-blue optics',
          },
          {
            note: 'Linear · Arrowhead bolted seams + thermal shroud bands + milled breech toolmarks & smoke launchers',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Optic glass(0.08)-Hard chrome(0.16)-Camo turret(0.65) / B:Metalness',
          },
        ],
      },
      leopard2a7_v3_powerpack_int: {
        title:
          'MTU MB 873 V12 EuroPowerpack, RENK Gearbox, Blast Door & 120mm DM63A1 Ammo Suite (V3)',
        tabTitle: 'MTU V12 & DM63A1 Bustle',
        summary:
          'Cutaway mechanical centerpiece 2K 5-channel Packed ORM suite for the Leopard 2A7V: captures silver-gray cast-aluminum MTU MB 873 Ka-501 47.6L V12 cylinder heads and twin turbocharger scrolls, warm copper intercooler piping and copper-fin radiator cores, gunmetal-gray RENK HSWL 354 cross-drive transmission, 14-blade aluminum radial cooling impeller, strictly UV-firewalled German yellow-black "ACHTUNG · MUNITION" bustle blast-door stripes, glowing cyan IFIS battle-management displays, and four-material 120mm DM63A1 tungsten APFSDS rounds.',
        highlights: [
          'Silver-gray cast-aluminum MTU MB 873 V12 diesel, warm copper intercooler pipes & RENK HSWL 354 gearbox',
          'Strict >= 50 px UV-firewalled German yellow-black blast-door warning stripes & glowing cyan IFIS terminals',
          'Four-material 120mm DM63A1 APFSDS separation across brass stubs, combustible cases, aluminum sabots & tungsten darts',
        ],
        channels: [
          {
            note: 'sRGB · Silver-gray MTU V12 / warm copper pipes & radiators / yellow-black blast door / DM63A1 & IFIS',
          },
          {
            note: 'Linear · V12 cooling ribs & head bolts + fine copper radiator louver ripples + transmission casing ribs',
          },
          {
            note: 'Linear · R:Interior self-shadow AO / G:Fan & copper(0.20)-V12 alloy(0.32)-Crew seats(0.76) / B:Metalness',
          },
        ],
      },
    },
  },
  tiger1: {
    heading:
      'WWII German Tiger I Ausf. E "Tiger 131" (88mm KwK 36) 2K PBR Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      tiger1_v3_hull_zimmerit: {
        title:
          '1943 Dunkelgelb Hull, Zimmerit Paste Relief, Balkenkreuz, Interleaved Wheels & 725mm Tracks Suite',
        tabTitle: 'Dunkelgelb, Zimmerit & Wheels',
        summary:
          'Blender 5.2 Cycles GPU-baked 2K 5-channel Packed ORM suite for the Tiger 131 hull and Schachtellaufwerk running gear: reproduces 1943 Dunkelgelb (RAL 7028) base lacquer with olive-green and red-brown ambush stripes, horizontal combed Zimmerit anti-magnetic paste tangent-space normal relief, crisp non-mirrored white-bordered Wehrmacht Balkenkreuz crosses on both flanks, authentic Elfenbein ivory-white interior walls, heat-rusted cast-iron twin exhaust stacks, rubber-rimmed interleaved road wheels, and burnished 725mm manganese-steel combat tracks.',
        highlights: [
          '1943 Dunkelgelb RAL 7028 camo, horizontal combed Zimmerit paste normal relief & interlocking dovetail welds',
          'Non-mirrored dual-flank white-bordered Wehrmacht Balkenkreuz emblems & Elfenbein ivory fighting compartment',
          'Material split across 3-row rubber-rimmed Schachtellaufwerk wheels, rusted exhausts & 725mm steel tracks',
        ],
        channels: [
          {
            note: 'sRGB · Dunkelgelb camo & Balkenkreuz / Elfenbein ivory interior / rusted exhausts / interleaved wheels & tracks',
          },
          {
            note: 'Linear · Horizontal combed Zimmerit grooves + interlocking armor welds + rolled steel grain & track cleats',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Burnished teeth(0.24)-Dunkelgelb paint(0.62)-Wheel rubber(0.76) / B:Metalness',
          },
        ],
      },
      tiger1_v3_turret_88mm: {
        title:
          'Horseshoe "#131" Turret, 88mm KwK 36 Twin-Baffle Brake, Krupp Breech & TZF 9b Optics Suite',
        tabTitle: 'Turret #131 & 88mm KwK 36',
        summary:
          '2K 5-channel Packed ORM suite centered on the horseshoe-curved Tiger 131 turret and Krupp 88mm KwK 36 L/56 main gun: renders Bovington Museum’s iconic white-outlined black tactical number "131" and combed Zimmerit relief across distortion-free Hero UV turret flanks, thermal oxidation and muzzle soot across the twin-baffle conical 88mm muzzle brake, CNC-milled Krupp horizontal sliding-wedge breechblock, chrome hydraulic recoil cylinders, slatted brass shell catcher basket, and >= 55 px UV-firewalled sapphire-cyan Leitz TZF 9b binocular lenses.',
        highlights: [
          'Non-mirrored Bovington "131" white-outlined tactical numbers on horseshoe turret flanks & ivory interior',
          '88mm KwK 36 L/56 conical twin-baffle muzzle brake heat tint & soot gradient + chrome recoil cylinders',
          'Leitz TZF 9b binocular gun-sight sapphire-cyan multi-coated objectives (>= 55 px zero-bleed UV firewall)',
        ],
        channels: [
          {
            note: 'sRGB · Horseshoe "#131" turret / carbon-fouled 88mm muzzle brake / milled Krupp breech / sapphire TZF 9b',
          },
          {
            note: 'Linear · Turret Zimmerit grooves + 120mm cast mantlet grain + milled breech toolmarks & cupola welds',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:Sapphire glass(0.08)-Chrome recoil(0.18)-Muzzle soot(0.84) / B:Metalness',
          },
        ],
      },
      tiger1_v3_drivetrain_int: {
        title:
          'Maybach HL230 V12 Engine, Front Olvar 8-Speed Gearbox & 88x571mmR PzGr. 39 Brass Ammo Suite',
        tabTitle: 'Maybach V12 & 88mm Ammo',
        summary:
          'Cutaway-showcase 2K 5-channel Packed ORM interior suite for Tiger 131: highlights the 23.1-liter Maybach HL230 P45 cast-iron gray V12 engine block, factory metal builder nameplate, four brushed-aluminum Solex downdraft carburetors, heat-baked rust-orange 6-into-1 exhaust manifolds, aluminum side radiator cores, front Olvar 8-speed pre-selector gearbox, and central floor driveshaft—paired with strict triple UV-firewalled 88x571mmR PzGr. 39 cartridges separating gleaming brass casings, copper driving bands, and matte-black APCBC warheads.',
        highlights: [
          'Maybach HL230 P45 cast-iron V12 block, builder nameplate, rust-orange exhaust manifolds & aluminum radiators',
          'Strict triple UV-firewalled 88x571mmR PzGr. 39 gleaming brass cases, copper driving bands & black APCBC shells',
          'Front Olvar 8-speed gearbox, Elfenbein non-slip circular turret basket floor & vintage leather crew seats',
        ],
        channels: [
          {
            note: 'sRGB · Maybach V12 cast-iron & rust manifolds / 88mm brass rounds & black tips / red-oxide tanks & leather',
          },
          {
            note: 'Linear · V12 cylinder-head ribs + dense radiator louvers + basket diamond-plate & cast gearbox grain',
          },
          {
            note: 'Linear · R:Cycles contact AO / G:88mm brass(0.18)-Aluminum radiator(0.26)-Leather(0.62) / B:Metalness',
          },
        ],
      },
    },
  },
  winchester1894: {
    heading:
      'Winchester Model 1894 Carbine 2K 5-Channel Packed ORM Texture Atlas (Albedo / Normal / Roughness)',
    suites: {
      win94_walnut: {
        title: 'American Black Walnut Straight-Grip Stock & Forend Suite',
        tabTitle: 'Walnut Furniture',
        summary:
          'Cycles-baked 2K 5-channel Packed ORM suite for straight-grip American black walnut furniture soaked in hand-rubbed linseed oil with subtle steel-band patina.',
        highlights: [
          'Quarter-sawn straight grain black walnut wood texture across F-04 & F-06',
          'Hand-rubbed satin linseed oil roughness gradient (0.48–0.64)',
          'Clean Cycles contact AO where upper/lower tangs inlet into wood wrist',
        ],
        channels: [
          { note: 'sRGB · Linseed-oiled American black walnut grain & tang patina' },
          { note: 'Linear · Open wood-pore grain normal & edge bevel micro-relief' },
          { note: 'Linear · R:Cycles AO / G:Walnut sheen(0.54) / B:Dielectric' },
        ],
      },
      win94_receiver: {
        title: 'Top-Eject Blued Receiver, Saddle Ring & D-Loop Lever Suite',
        tabTitle: 'Receiver & Lever',
        summary:
          'Deep charcoal-blued New Haven forged receiver, left cavalry saddle ring, D-ring lever & King side spring loading gate with operational edge burnish.',
        highlights: [
          'Charcoal carbon-steel hot bluing with subtle holster/saddle wear highlights',
          'Subtle color-case mottling on forged finger lever & link bridge',
          'Burnished feed bevel along Nelson King 1866 loading gate',
        ],
        channels: [
          { note: 'sRGB · Deep charcoal blue receiver, case-colored lever & saddle ring' },
          { note: 'Linear · Machined mill tracks & pivot chamfer tangent normals' },
          { note: 'Linear · R:Recess AO / G:Blued steel(0.28) / B:Metalness' },
        ],
      },
      win94_metal: {
        title: '20" .30-30 Barrel, H-Locking Block & Brass Carrier Suite',
        tabTitle: 'Barrel & Internals',
        summary:
          'Multisurface 2K metalwork separating the tapered 20" blued round barrel, burnished top-eject bolt, vertical H-locking bolt & machined solid brass shell lifter.',
        highlights: [
          'Burnished stainless cylindrical bolt & two-piece firing pin (0.20)',
          'High-strength blued .30-30 WCF tapered carbine barrel & mag tube',
          'Turned solid C26000 brass follower & pivoting carrier lifter spoon',
        ],
        channels: [
          { note: 'sRGB · Blued barrel/tube, bright bolt, brass front bead & carrier' },
          { note: 'Linear · Turned barrel rings & brushed flat breech guide faces' },
          { note: 'Linear · R:Cycles AO / G:Bolt(0.20)-Brass(0.26)-Blued(0.36) / B:Metalness' },
        ],
      },
      win94_seamless_springs: {
        title: 'Dynamic Helical Music-Wire Springs Micro-Surface Map',
        tabTitle: 'Helical Springs',
        summary:
          'Shared 512x512 seamless steel wire normal & CLP oil-film roughness maps preserving real-time aSpringParam compression along all three springs.',
        highlights: [
          'Full GPU aSpringParam wire-diameter preservation during stroke',
          'Fine drawn music-wire sheen & protective ordnance grease',
        ],
        channels: [
          { note: 'Linear · Seamless brushed music-wire micro-normal' },
          { note: 'Linear · Anti-corrosion oil roughness variation' },
        ],
      },
    },
  },
  rem870: {
    heading:
      'Remington 870 Police Magnum 2K 5-Channel Packed ORM Texture Atlas (Albedo / Normal / Roughness)',
    suites: {
      rem870_walnut: {
        title: 'Corn-Cob Grooved Walnut Forend, Police Stock & Recoil Pad Suite',
        tabTitle: 'Corn-Cob & Stock',
        summary:
          'Cycles-baked 2K 5-channel Packed ORM suite contrasting the 12-ring corn-cob walnut pump forend & straight stock against the matte vented rubber police recoil pad.',
        highlights: [
          'Deeply turned 12-groove corn-cob pump forend with worn grip ridges',
          'Oil-sealed American black walnut semi-pistol police buttstock',
          'Matte vulcanized vented solid rubber recoil pad (0.82 roughness)',
        ],
        channels: [
          { note: 'sRGB · Oiled American walnut corn-cob forend, stock & rubber pad' },
          { note: 'Linear · Deep forend rib relief & micro-stippled rubber pad' },
          { note: 'Linear · R:AO / G:Walnut(0.54) vs Rubber(0.82) / B:Dielectric' },
        ],
      },
      rem870_receiver: {
        title: 'Solid Billet Parkerized Receiver, Action Bars & Police FCG Suite',
        tabTitle: 'Billet Receiver',
        summary:
          'Military/police dark zinc-manganese Parkerized phosphate crystalline texture across the solid-billet steel receiver, twin action bars & anodized aluminum trigger plate.',
        highlights: [
          'Granular phosphate crystal grain holding protective CLP gun oil',
          'Burnished dual parallel steel action bars where bars cycle frame rails',
          'Matte anodized aluminum Police Magnum trigger plate contrast',
        ],
        channels: [
          { note: 'sRGB · Matte manganese-parkerized billet steel & aluminum FCG' },
          { note: 'Linear · Fine crystalline Parkerized grain & knurled mag cap pattern' },
          { note: 'Linear · R:Cycles AO / G:Parkerized(0.48) / B:Metalness' },
        ],
      },
      rem870_metal: {
        title: '18" Heavy Barrel, Hard-Chrome Bolt & High-Vis Orange Follower',
        tabTitle: 'Chrome Bolt & Barrel',
        summary:
          'Contrasts the heavy 18" Parkerized smoothbore barrel with mirror-bright hard-chrome bolt & Flexitab carrier plus the safety-orange polymer magazine follower.',
        highlights: [
          'Mirror hard-chrome Model 870 breech bolt & Flexitab carrier (0.16)',
          'Heavy-wall 18" improved-cylinder barrel & tritium white-dot front post',
          'Non-metallic safety-orange self-lubricating follower cup (0.04 metalness)',
        ],
        channels: [
          { note: 'sRGB · Parkerized 18" barrel, bright chrome bolt & orange follower' },
          { note: 'Linear · Lathe bore concentric finish & slick chrome bolt tracks' },
          { note: 'Linear · R:AO / G:Chrome(0.16)-Barrel(0.46)-Polymer(0.38) / B:Metalness' },
        ],
      },
      rem870_seamless_springs: {
        title: 'Heavy-Duty Police Helical Springs Micro-Surface Map',
        tabTitle: 'Helical Springs',
        summary:
          'Shared 512x512 seamless steel wire detail suite driving the extra-power Police hammer spring, firing pin return spring & 34-coil tubular mag spring.',
        highlights: [
          'Preserves real-time aSpringParam deformation across all 3 springs',
          'High-tensile stainless & music-wire oil sheen',
        ],
        channels: [
          { note: 'Linear · Seamless drawn steel wire micro-normal' },
          { note: 'Linear · Protective oil roughness film variation' },
        ],
      },
    },
  },
  m1911: {
    heading:
      'Colt M1911A1 U.S. Army (.45 ACP) 2K 5-Ch Packed ORM Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      m1911_walnut: {
        title: 'Double-Diamond 20-LPI Checkered American Walnut Grip Atlas',
        tabTitle: 'Walnut Grips',
        summary:
          'Offline Cycles-baked 2K 5-channel ORM atlas for both grip panels featuring crisp pyramidal double-diamond checkering, linseed-oiled walnut pores, and UV-firewalled brass slotted screws.',
        highlights: [
          'Dedicated Hero UV outer faces with deep 20-LPI double-diamond checkering',
          'Warm linseed-oiled American walnut grain & hand-worn border bevels',
          'Zero-bleed UV firewall separating brass grip screws from wood',
        ],
        channels: [
          { note: 'sRGB · Oiled American walnut & double-diamond ridge highlights' },
          { note: 'Linear · Pyramidal checkering valleys & slotted screw normals' },
          { note: 'Linear · R:Cycles AO / G:Walnut sheen(0.36-0.72) / B:Metalness' },
        ],
      },
      m1911_slide: {
        title: '1943 Hartford Parkerized Slide, Forged Frame & U.S. Army Rollmarks',
        tabTitle: 'Slide & Frame',
        summary:
          'Wartime manganese-phosphate Parkerized ordnance steel 2K ORM suite with non-mirrored flat Hero UV rollmarks for Browning patents, Colt Hartford address, UNITED STATES PROPERTY & G.H.D. cartouche.',
        highlights: [
          'AgX-calibrated matte manganese-phosphate steel (sRGB 0.22-0.27, zero black crush)',
          'Razor-sharp Hero UV rollmarks on all four slide and frame flanks',
          'Sculpted rear cocking serrations & A1 arched mainspring housing AO',
        ],
        channels: [
          { note: 'sRGB · 1943 Parkerized ordnance gray steel & bright stamped markings' },
          { note: 'Linear · Deep engraved rollmark recesses & crystalline phosphate grain' },
          { note: 'Linear · R:Contact AO / G:Parkerized satin(0.35) / B:Metalness' },
        ],
      },
      m1911_metal: {
        title: '5" Dual-Rib Barrel, Swinging Link, Fire Control & Two-Tone Magazine',
        tabTitle: 'Barrel & Action',
        summary:
          '2K ORM metal atlas uniting the polished chamber hood (COLT .45 AUTO), swinging link, blued controls, straight trigger bow, and classic WWII two-tone tempered 7-round magazine.',
        highlights: [
          'Chamber top Hero UV stamped COLT .45 AUTO / P PROOF TESTED',
          '>= 80px UV firewall separating bright stainless/polished parts from blued steel',
          'Authentic two-tone heat-treated feed lips on the 7-round single-stack mag',
        ],
        channels: [
          { note: 'sRGB · Polished stainless barrel/link vs deep blued steel controls' },
          { note: 'Linear · Lathe machining marks, rifling lands & chamber rollmark' },
          { note: 'Linear · R:AO / G:Polished(0.18)-Blued(0.27) / B:Metalness(0.90-0.96)' },
        ],
      },
      m1911_seamless_springs: {
        title: 'Three Dynamic Music-Wire Helical Springs Micro-Surface Map',
        tabTitle: 'Helical Springs',
        summary:
          'Shared 512x512 seamless steel wire detail textures driving the real-time GPU-compressed 16-lb recoil spring, 23-lb hammer mainspring, and 7-round single-stack mag spring.',
        highlights: [
          'Preserves real-time aSpringParam helical deformation on all 3 springs',
          'Fine drawn high-carbon wire sheen and protective oil film variation',
        ],
        channels: [
          { note: 'Linear · Seamless drawn steel wire micro-normal' },
          { note: 'Linear · Protective oil film roughness variation' },
        ],
      },
    },
  },
  mg42: {
    heading:
      'MG 42 General-Purpose Machine Gun 2K 5-Channel Packed ORM Texture Atlas (Albedo / Normal / Roughness)',
    suites: {
      mg42_shroud: {
        title: 'Stamped Perforated Shroud, cra 1943 Rollmarks & AA Spider Sight Suite',
        tabTitle: 'Shroud & Sights',
        summary:
          'Cycles-baked 2K 5-channel Packed ORM suite for cold-stamped phosphated sheet steel with crisp non-mirrored cra 1943 Berlin rollmarks, cooling vents, and conical muzzle recoil booster.',
        highlights: [
          'AgX-calibrated satin dark phosphate stamped steel with metallic crease wear',
          'Flat non-mirrored Hero UV left flank: MG 42 · cra 1943 · 4812 d · WaA 749',
          'True assembled Cycles contact AO across barrel latch, top cover, and bipod',
        ],
        channels: [
          { note: 'sRGB · Stamped phosphated sheet steel & cra 1943 factory rollmarks' },
          { note: 'Linear · Stamped bend bevels, deeply struck legends & booster knurling' },
          { note: 'Linear · R:Cycles AO / G:Satin phosphate(0.32) / B:Steel metalness(0.88)' },
        ],
      },
      mg42_furniture: {
        title: 'Marbled Bakelite Buttstock, Grip Scales & 50-Rd Gurttrommel 34 Suite',
        tabTitle: 'Bakelite & Drum',
        summary:
          'Rich reddish-brown marbled phenolic Bakelite buttstock and grip panels paired with a Feldgrau painted 50-round Gurttrommel 34 drum featuring white ordnance stencils.',
        highlights: [
          'Dielectric marbled phenolic Bakelite with organic satin sheen (M=0.0, R=0.34–0.46)',
          'Feldgrau Gurttrommel 34 drum with crisp GURTTROMMEL 34 · 50 PATR. 7,92 stencil',
          'High-contrast burnished S-cam feed pawls and stamped feed tray wear tracks',
        ],
        channels: [
          { note: 'sRGB · Marbled phenolic Bakelite & Feldgrau 50-rd drum stencil' },
          { note: 'Linear · Ribbed grip scales, Bakelite pores & drum reinforcing beads' },
          { note: 'Linear · R:Contact AO / G:Bakelite & enamel roughness / B:Dielectric vs steel' },
        ],
      },
      mg42_metal: {
        title: '530mm Barrel, Twin Hardened Locking Rollers & Gurt 34 Brass Belt Suite',
        tabTitle: 'Rollers & Belt',
        summary:
          'Precision internal ordnance suite separating blued CHF barrel, mirror-ground twin locking rollers, and a >=74px UV-firewalled quadrant for C26000 brass 7.92×57mm Mauser belt rounds.',
        highlights: [
          'Mirror-ground high-chrome locking rollers & firing-pin wedge (R=0.15–0.20)',
          '>=74px UV firewall preventing brass/copper color bleed into steel internals',
          'Lathe-turned barrel cooling taper and forged barrel extension micro-detail',
        ],
        channels: [
          { note: 'sRGB · Blued 530mm barrel, chrome rollers & firewalled 7.92mm brass belt' },
          { note: 'Linear · Turning grooves, roller chamfers & Gurt 34 spring-steel links' },
          { note: 'Linear · R:Internal AO / G:Chrome(0.15)–Phosphate(0.32) / B:Pure metal' },
        ],
      },
    },
  },
  k98k: {
    heading:
      'Mauser Karabiner 98k (byf 43) 2K 5-Ch Packed ORM Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      k98k_stock: {
        title: 'Laminated Beechwood Stock (Schichtholz) & Upper Handguard Suite',
        tabTitle: 'Laminated Beechwood',
        summary:
          'Cycles-baked 2K 5-channel Packed ORM atlas for wartime phenolic-bonded laminated beechwood furniture: crisp alternating horizontal veneer layers, buttstock sling cutout edge wear, inset steel takedown disk isolation, and satin military lacquer roughness.',
        highlights: [
          'Authentic alternating light/dark horizontal laminated beechwood plies',
          'Buttstock sling pass-through slot, steel takedown disk & recoil cross-bolt AO',
          'Satin military protective oil roughness (0.44-0.62) & fine beech ray pores',
        ],
        channels: [
          { note: 'sRGB · Phenolic laminated beechwood layers & right-flank ordnance cartouche' },
          { note: 'Linear · Laminate seam micro-relief, wood pores & chamfered inletting normals' },
          { note: 'Linear · R:Cycles AO / G:Satin wood roughness / B:Isolated steel disk metalness' },
        ],
      },
      k98k_receiver: {
        title: 'Oberndorf byf 43 Large-Ring Receiver, Bottom Metal & Barrel Bands Suite',
        tabTitle: 'byf 43 Receiver',
        summary:
          'AgX-calibrated deep German blued steel 2K Packed ORM suite featuring distortion-free Hero UV engravings: left rail Mod. 98, front receiver ring byf 43, serial 6842 b, and WaA135 inspection stamps alongside H-band and cupped buttplate edge wear.',
        highlights: [
          'AgX-calibrated deep German blued steel (sRGB 0.19-0.28, R = 0.28-0.36)',
          '1:1 non-mirrored Mod. 98, byf 43, 6842 b & WaA135 Oberndorf rollmarks',
          'Milled trigger guard, H-pattern front bayonet band & cupped steel buttplate',
        ],
        channels: [
          { note: 'sRGB · Deep German blued receiver, parkerized bands & crisp factory markings' },
          { note: 'Linear · Milled machining grain, stamped rollmark depth & bevel normals' },
          { note: 'Linear · R:Contact AO / G:Satin blued steel (0.25-0.38) / B:High metalness' },
        ],
      },
      k98k_metal: {
        title: '600mm Stepped Barrel, 2000m Tangent Sight, Bright Bolt & Brass Clip Suite',
        tabTitle: 'Barrel, Bolt & Clip',
        summary:
          'Multi-material 2K Packed ORM atlas spanning the stepped 600 mm barrel, 1-20 graduated tangent rear sight leaf, ground bright Mauser 98 bolt body, spring-tempered blue claw extractor, and UV-firewalled 5-round brass stripper clip.',
        highlights: [
          'Crisp 1-20 hundred-meter tangent sight leaf graduations on positive-Jacobian UV band',
          'Bright polished bolt steel vs deep blued spring-steel claw extractor contrast',
          'Dedicated >=70px UV firewall isolating the 5-round brass stripper clip with zero bleed',
        ],
        channels: [
          { note: 'sRGB · Stepped blued barrel, graduated sight leaf, bright bolt & brass clip' },
          { note: 'Linear · Engraved 1-20 sight numerals, lathe grain & bolt-lug chamfers' },
          { note: 'Linear · Bright steel (0.19) vs brass clip (0.23) vs German blued (0.29)' },
        ],
      },
      k98k_seamless_springs: {
        title: 'Three Dynamic Helical Music-Wire Springs Seamless Detail Suite',
        tabTitle: 'Dynamic Springs',
        summary:
          'Seamless 512x512 brushed music-wire normal and oiled roughness maps shared by the 24-coil firing pin mainspring, vertical sear return spring, and internal 5-round magazine spring.',
        highlights: [
          'Preserves GPU constant-wire-diameter compression via aSpringParam (w = 1)',
          'High-frequency drawn spring-wire micro-grain & protective military gun oil film',
        ],
        channels: [
          { note: 'Linear · Drawn music-wire micro-normal for all 3 dynamic helical springs' },
          { note: 'Linear · Oiled spring-steel roughness variation' },
        ],
      },
    },
  },
  thompson: {
    heading:
      'Thompson M1928A1 Submachine Gun 2K 5-Channel Packed ORM Texture Atlas (Albedo / Normal / Roughness)',
    suites: {
      thompson_walnut: {
        title: 'American Black Walnut Vertical Foregrip, Pistol Grip & Detachable Stock',
        tabTitle: 'Walnut Furniture',
        summary:
          'Cycles-baked 2K 5-channel Packed ORM suite for contoured quarter-sawn American black walnut finished in hand-rubbed linseed oil with subtle GEG and WB inspection cartouches.',
        highlights: [
          'Rich cathedral-grain black walnut with warm chestnut linseed-oil sheen',
          'Crisp GEG & WB ordnance cartouche stamps along the right buttstock wrist',
          'Natural wood-pore bump and assembled contact AO against steel slide mounts',
        ],
        channels: [
          { note: 'sRGB · Hand-rubbed American black walnut grain & GEG cartouche' },
          { note: 'Linear · Open wood-pore normal relief & contoured grip bevels' },
          { note: 'Linear · R:Cycles AO / G:Oiled satin walnut(0.36–0.48) / B:Dielectric wood' },
        ],
      },
      thompson_receiver: {
        title: 'Milled Du-Lite Blued Receiver, Bridgeport Rollmarks & Lyman Sight Suite',
        tabTitle: 'Receiver & FCG',
        summary:
          'Solid milled Du-Lite deep blued steel upper and lower receivers carrying razor-sharp flat Hero UV rollmarks for Thompson Submachine Gun Model of 1928A1 and Auto-Ordnance Bridgeport.',
        highlights: [
          'AgX-calibrated pre-war Du-Lite deep blued steel sheen (R=0.25, M=0.90)',
          'Flat non-mirrored Hero UV flanks with Model of 1928A1 & Auto-Ordnance legends',
          'Machined horizontal milling striations across receiver, Lyman sight & paddles',
        ],
        channels: [
          { note: 'sRGB · Du-Lite deep blued steel & silvered factory rollmarks' },
          { note: 'Linear · Horizontal milling grain & deeply struck receiver engravings' },
          { note: 'Linear · R:Contact AO / G:Satin blue(0.25) / B:Forged billet steel(0.90)' },
        ],
      },
      thompson_metal: {
        title: '28-Fin Barrel, Bronze Blish H-Lock & 50-Rd Type L Clockwork Drum Suite',
        tabTitle: 'Blish & Drum',
        summary:
          'Flagship internal and ordnance atlas featuring circular Type L drum Hero stamping plus twin >=80px UV firewalls isolating the cast-bronze Blish H-piece and .45 ACP brass spiral rounds.',
        highlights: [
          'Dedicated >=80px UV firewall for gleaming cast phosphor-bronze Blish H-lock',
          'Circular Hero UV faceplate stamping on the 50-round Type L clockwork drum',
          'Second >=80px UV firewall isolating golden .45 ACP brass & copper spiral rounds',
        ],
        channels: [
          { note: 'sRGB · 28-fin blued barrel, phosphor bronze Blish lock & 50-rd drum rounds' },
          { note: 'Linear · Radial fin turning marks, drum beads & circular stamped legends' },
          { note: 'Linear · R:Internal AO / G:Bronze(0.23)–Steel(0.17–0.27) / B:Metalness' },
        ],
      },
    },
  },
  gau8: {
    heading:
      'GE GAU-8/A Avenger 30mm Rotary Autocannon 2K 5-Ch Packed ORM Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      gau8_v3_exterior: {
        title: '7-Barrel 2.3m Cluster, Heat-Blued Muzzle Clamp, USAF Housing & Twin Hydraulics',
        tabTitle: 'Exterior & Hydraulics',
        summary:
          'Cycles Metal GPU-baked 2K 5-channel Packed ORM atlas capturing the 2.3 m seven-barrel rotary cluster, heat-tempered bronze/blue perforated muzzle clamp, non-mirrored USAF housing stencils with MIL-STD-130 UID matrix, twin 3,000 PSI hydraulic warning plaques, and SAFE/ARMED clearing sector.',
        highlights: [
          'Dual-flank 1:1 USAF GAU-8/A AVENGER 30MM CAGE 05606 stencils & 16×16 UID code',
          'Twin 3,000 PSI hydraulic hazard placards & UV-firewalled SAFE/ARMED clearing gate',
          '3,900 RPM thermal-blued titanium muzzle clamp & machined A-10 recoil cradle',
        ],
        channels: [
          { note: 'sRGB · Aerospace primer housing, USAF stencils, heat-blued clamp & anodized hydraulics' },
          { note: 'Linear · Forged housing ribs, barrel turning rings, fasteners & stencil relief' },
          { note: 'Linear · R:Cycles AO / G:Chrome(0.16)-Phosphate(0.32)-Primer(0.46) / B:Metalness' },
        ],
      },
      gau8_v3_internal: {
        title: '360° Hardened Helical Cam Sleeve, 7-Flute Star-Rotor & 7 Titanium Bolts',
        tabTitle: 'Cam Track & 7 Bolts',
        summary:
          'Purpose-built 2K Packed ORM internal suite engineered for live CT sectioning ([C]): showcases the mirror-burnished 360° sinusoidal cam groove with lifted cavity AO, 5-axis CNC 7-flute star-rotor with 28-tooth bull gear, and all seven hard-chromed titanium rotary bolts.',
        highlights: [
          'Mirror-honed 360° elliptical sinusoidal cam track with cavity-lifted AO for CT views',
          '5-axis CNC 7-flute central star-rotor and hardened 28-tooth main drive gear grain',
          'Unified lubricated hard-chrome roughness across all seven orbiting titanium bolts',
        ],
        channels: [
          { note: 'sRGB · Honed sinusoidal cam groove, CNC star-rotor & 7 chrome-titanium bolts' },
          { note: 'Linear · Roller wear tracks, 5-axis rotor toolpaths & 3-lug bolt chamfers' },
          { note: 'Linear · R:Cavity-lifted AO / G:Chrome(0.17)-Carburized(0.34) / B:High metalness' },
        ],
      },
      gau8_v3_drum: {
        title: '1,150-Rd Helical Ammo Drum, 14-Blade Rotor, 30mm PGU-14/B API & Chutes',
        tabTitle: 'Helical Drum & 30mm API',
        summary:
          '2K 5-channel Packed ORM atlas for the Ø876mm aerospace olive-primer helical drum carrying high-visibility USAF ordnance stencils and chevron hazard bands, plus four-way >=50px UV-firewalled 30×173mm PGU-14/B API rounds separating brushed aluminum cases, charcoal penetrators, crimson incendiary bands, and copper driving bands.',
        highlights: [
          'Dual-flank USAF HELICAL AMMUNITION DRUM 1,150 RDS PGU-14/B API stencils & hazard stripes',
          'Four-zone >=50px UV firewall isolating aluminum shell, black ogive, crimson band & copper band',
          'Ribbed linkless aluminum feed/return chutes & 14-blade stainless helical conveyor rotor',
        ],
        channels: [
          { note: 'sRGB · Aerospace olive drum stencils, hazard stripes & brushed-aluminum 30mm rounds' },
          { note: 'Linear · Drum stiffening ribs, rivets, spun aluminum grain & linkless chute corrugations' },
          { note: 'Linear · R:Contact AO / G:Aluminum(0.20)-Olive primer(0.50)-Rubber(0.80) / B:Metalness' },
        ],
      },
    },
  },
};

export const ATLAS_EN_STRINGS: Readonly<
  Partial<Record<WeaponId, AtlasWeaponTranslation>>
> = Object.fromEntries(
  WEAPON_IDS.filter((id) => Boolean(ALL_ATLAS_EN_STRINGS[id])).map((id) => [
    id,
    ALL_ATLAS_EN_STRINGS[id],
  ])
) as Partial<Record<WeaponId, AtlasWeaponTranslation>>;

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
