import { isArcheryWeapon } from '../engine/physics/armoryPhysics';
import type {
  LanguageCode,
  PartNarrationEntry,
  WeaponNarrationBundle,
} from '../narration/types';
import { getShortWeaponLabel, getWeaponManifest } from '../weapons/manifests';
import type {
  FiringPhaseInfo,
  TimelinePresetItem,
  WeaponId,
  WeaponPartSpec,
} from '../weapons/types';
import { UI_STRINGS } from './uiStrings';

export interface WeaponEnglishFallback {
  shortLabel: string;
  name: string;
  originCountry: string;
  weaponType: string;
  statusLabel: string;
  caliber?: string;
  compactCaliber?: string;
  actionMechanism: string;
  overallLengthMm: string;
  barrelSpec: string;
  weightKg?: string;
  muzzleVelocityMs?: string;
  effectiveRangeM?: string;
  rateOfFire: string;
  description: string;
  highlights: string[];
  workbenchTitle: string;
  workbenchSubtitle: string;
  cutawayLabel: string;
  cutawayTitle: string;
  searchPlaceholder: string;
  firingMilestoneLabel: string;
}

export type FallbackWeaponId = WeaponId;

export const WEAPON_EN_FALLBACKS: Record<
  FallbackWeaponId,
  WeaponEnglishFallback
> = {
  ak15: {
    shortLabel: 'AK-15M1',
    name: 'Kalashnikov AK-15M1 Assault Rifle',
    originCountry: 'Russia',
    weaponType: 'Assault Rifle',
    statusLabel: 'New in Vault · Ready',
    actionMechanism: 'Long-Stroke Gas Piston · 2-Lug Rotating Bolt',
    overallLengthMm: '880–940 mm (690 mm folded)',
    barrelSpec: '415 mm · 4-RH 1:240mm',
    rateOfFire: '700 rpm',
    description:
      'Latest 5th-generation 7.62×39mm Russian service rifle (6П71М Obr. 2023): slotted QD suppressor flash hider, 90° gas block/sight combo, free-floated handguard, cross-pinned railed top cover, diopter rear sight, ambidextrous Safe/Auto/Semi selector, EVO cheek-riser stock, and windowed polymer magazine.',
    highlights: [
      'Long-Stroke Piston + 35° 2-Lug Bolt',
      '2023 Ambi Selector & EVO Cheek Stock',
      '7.62×39mm Windowed Curved Magazine',
      '2K Russian Enamel & Gas-Carbon PBR',
    ],
    workbenchTitle: 'AK-15M1 3D Disassembly & Live Firing Simulation',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · Long-Stroke Gas Piston & 7.62×39mm Firing Cycle',
    cutawayLabel: 'Rotating Bolt & Hammer Focus',
    cutawayTitle:
      'Switch to X-Ray cutaway and frame the 2-lug rotating bolt & rotary hammer lockup',
    searchPlaceholder:
      'Search part name / BOM code (e.g. piston, bolt, B-03)...',
    firingMilestoneLabel: 'Gas Unlock',
  },
  m4a1: {
    shortLabel: 'M4A1',
    name: 'Colt M4A1 RAS Carbine',
    originCountry: 'United States',
    weaponType: 'Carbine',
    statusLabel: 'In Vault · Ready',
    actionMechanism: 'Direct Gas Impingement (DI) · 7-Lug Rotating Bolt',
    overallLengthMm: '757–838 mm',
    barrelSpec: '368 mm · 6-RH 1:178mm',
    rateOfFire: '700–950 rpm',
    description:
      'Colt Defense modular Western carbine benchmark built on Eugene Stoner’s inline direct-impingement architecture: 14.5" stepped chrome-lined barrel, A-frame front sight base, detachable A2 carry handle, KAC M4 RAS quad rail, staked gas-key BCG with 7-lug bolt, SAFE/SEMI/AUTO FCG, and 6-position waffle stock.',
    highlights: [
      'Stoner DI Gas Tube + 7-Lug Bolt',
      'KAC M4 RAS Quad Rail + 14.5" Barrel',
      'Detachable A2 Carry Handle & Buffer',
      'Colt Anodized Receiver & STANAG Mag',
    ],
    workbenchTitle: 'Colt M4A1 3D Disassembly & Live Firing Simulation',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · Stoner Direct-Impingement & 5.56×45mm Cycle',
    cutawayLabel: 'DI Gas Key & Buffer Focus',
    cutawayTitle:
      'Switch to X-Ray cutaway and frame the staked gas key, 7-lug bolt & coaxial buffer',
    searchPlaceholder:
      'Search part name / BOM code (e.g. gas tube, bolt, U-05)...',
    firingMilestoneLabel: 'DI Unlock',
  },
  mp5: {
    shortLabel: 'MP5A3',
    name: 'H&K MP5A3 Submachine Gun',
    originCountry: 'Germany',
    weaponType: 'Submachine Gun',
    statusLabel: 'In Vault · Ready',
    actionMechanism: 'Roller-Delayed Blowback · Closed-Bolt Hammer',
    overallLengthMm: '550–700 mm',
    barrelSpec: '225 mm · 6-RH 1:250mm',
    rateOfFire: '800 rpm',
    description:
      'Heckler & Koch’s legendary counter-terror submachine gun inheriting the G3 rifle’s dual cylindrical rollers and 45° locking piece for closed-bolt accuracy and smooth recoil: 8.85" 3-lug fluted-chamber barrel, non-reciprocating HK-Slap cocking handle, rotary diopter drum, Navy pictogram grip, and A3 collapsible stock.',
    highlights: [
      'Dual Rollers + 45° Locking Piece (1:4)',
      'HK-Slap Handle & 3-Lug Fluted Barrel',
      'Navy Ambi Pictogram Trigger Group',
      'MP5A3 Collapsible Stock & 30-Rd Mag',
    ],
    workbenchTitle: 'HK MP5A3 3D Disassembly & Live Firing Simulation',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · Dual-Roller Delayed Blowback & 9×19mm Cycle',
    cutawayLabel: 'Roller-Delayed Lockup Focus',
    cutawayTitle:
      'Switch to X-Ray cutaway and frame the dual locking rollers, 45° wedge & trunnion',
    searchPlaceholder:
      'Search part name / BOM code (e.g. roller, wedge, B-04)...',
    firingMilestoneLabel: 'Roller Unlock',
  },
  g17: {
    shortLabel: 'G17',
    name: 'Glock 17 Gen3 Service Pistol',
    originCountry: 'Austria',
    weaponType: 'Semi-Auto Pistol',
    statusLabel: 'In Vault · Ready',
    actionMechanism: 'Short-Recoil Tilting Barrel · Safe Action Striker',
    overallLengthMm: '202 mm',
    barrelSpec: '114 mm · Hexagonal 1:250mm',
    rateOfFire: 'Semi-Auto',
    description:
      'Archetype of the modern polymer-framed service pistol: tenifer-nitrided steel slide, cold-hammer-forged polygonal barrel, Safe Action triple-passive-safety striker system, and steel-lined double-stack 17-round magazine across 28 precision CAD parts.',
    highlights: [
      'Safe Action Triple Passive Safety',
      '4 Assemblies / 28 CAD Parts Strip',
      'Short-Recoil Tilting Barrel Cam',
      '2K Tenifer Slide & Polymer PBR',
    ],
    workbenchTitle: 'Glock 17 Gen3 3D Disassembly & Live Firing Simulation',
    workbenchSubtitle:
      '4 Assemblies · 28 CAD Parts · Short-Recoil Tilting Barrel & Safe Action Cycle',
    cutawayLabel: 'Safe Action Cruciform Focus',
    cutawayTitle:
      'Switch to X-Ray cutaway and frame the trigger bar cruciform & striker sear interface',
    searchPlaceholder:
      'Search part name / BOM code (e.g. striker, barrel, U-08)...',
    firingMilestoneLabel: 'Tilt Unlock',
  },
  m82a1: {
    shortLabel: 'M82A1',
    name: 'Barrett M82A1 Anti-Materiel Rifle',
    originCountry: 'United States',
    weaponType: 'Anti-Materiel Rifle',
    statusLabel: 'In Vault · Ready',
    actionMechanism: 'Short-Recoil Barrel + Accelerator · 3-Lug Bolt',
    overallLengthMm: '1,448 mm',
    barrelSpec: '737 mm · 8-RH 1:381mm',
    rateOfFire: 'Semi-Auto',
    description:
      'Ronnie Barrett’s iconic .50 BMG (12.7×99mm) semi-automatic anti-materiel rifle (US Military M107 SASR): pairs a dual-chamber swept arrowhead muzzle brake (~65% recoil reduction) with a 29" fluted short-recoil barrel, dual return springs, and an accelerator lever driving a 3-lug rotating bolt.',
    highlights: [
      'Dual-Chamber Arrowhead Brake (-65% Recoil)',
      '29" Fluted Short-Recoil Barrel + Accelerator',
      'Leupold Mark 4 Optic + 27-MOA Top Rail',
      '10-Rd .50 BMG Steel Mag & Spiked Bipod',
    ],
    workbenchTitle: 'Barrett M82A1 3D Disassembly & Live Firing Simulation',
    workbenchSubtitle:
      '4 Assemblies · 24 CAD Parts · Short-Recoil Barrel Accelerator & .50 BMG Cycle',
    cutawayLabel: 'Short-Recoil & Accelerator Focus',
    cutawayTitle:
      'Switch to X-Ray cutaway and frame the 3-lug bolt, barrel extension & accelerator',
    searchPlaceholder:
      'Search part name / BOM code (e.g. brake, bolt, U-01)...',
    firingMilestoneLabel: 'Recoil Unlock',
  },
  awm: {
    shortLabel: 'AWM',
    name: 'Accuracy International AWM Sniper Rifle',
    originCountry: 'United Kingdom',
    weaponType: 'Bolt-Action Sniper',
    statusLabel: 'In Vault · Ready',
    actionMechanism: '60° 6-Lug Bolt-Action · Two-Stage Trigger',
    overallLengthMm: '1,230 mm (990 mm folded)',
    barrelSpec: '686 mm · 6-RH 1:279mm',
    rateOfFire: 'Bolt-Action',
    description:
      'Accuracy International’s legendary Arctic Warfare Magnum sniper rifle (British L115A3) in .338 Lapua Magnum: epoxy-bonded flat-sided steel receiver on a full-length CNC aluminum chassis spine, OD green thumbhole folding skins, 27" fluted free-float barrel, anti-icing 60° 6-lug bolt, and S&B PM II 5-25×56 scope.',
    highlights: [
      'CNC Aluminum Spine + OD Thumbhole Skins',
      '60° 6-Lug Anti-Ice Bolt & 2-Stage Trigger',
      '27" Fluted Barrel + S&B 5-25×56 Scope',
      '7-Stage Manual Bolt Lift, Throw & Lock',
    ],
    workbenchTitle: 'AI AWM (.338 LM) 3D Disassembly & Bolt-Action Cycle',
    workbenchSubtitle:
      '4 Assemblies · 24 CAD Parts · 60° 6-Lug Manual Bolt-Action & .338 LM Simulation',
    cutawayLabel: '60° 6-Lug Bolt & Sear Focus',
    cutawayTitle:
      'Switch to X-Ray cutaway and frame the 60° dual-row 6-lug bolt & two-stage sear',
    searchPlaceholder:
      'Search part name / BOM code (e.g. bolt, scope, S-03)...',
    firingMilestoneLabel: '60° Bolt Lift',
  },
  scar: {
    shortLabel: 'SCAR-L',
    name: 'FN SCAR-L Mk 16 Modular Rifle',
    originCountry: 'Belgium',
    weaponType: 'Modular Assault Rifle',
    statusLabel: 'In Vault · Ready',
    actionMechanism: 'Short-Stroke Tappet Piston · 7-Lug Rotating Bolt',
    overallLengthMm: '635–889 mm',
    barrelSpec: '355 mm · 6-RH 1:178mm',
    rateOfFire: '625 rpm',
    description:
      'FN Herstal’s USSOCOM Mk 16 Mod 0 modular 5.56×45mm rifle: monolithic extruded FDE anodized aluminum upper receiver, clean-running stainless short-stroke gas tappet piston, heavy monolithic bolt carrier, 6-screw quick-change CHF barrel, iconic folding cheek-riser stock, and multi-tone "50 Shades of FDE" finish.',
    highlights: [
      'Monolithic Aluminum Upper + Short Piston',
      'Iconic Folding & Telescoping Cheek Stock',
      'Authentic "50 Shades of FDE" 2K PBR',
      'Quick-Change Barrel & Ranger-Plate Mag',
    ],
    workbenchTitle: 'FN SCAR-L 3D Disassembly & Live Firing Simulation',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · Short-Stroke Gas Piston & 5.56×45mm Cycle',
    cutawayLabel: 'Short-Stroke Piston & Bolt Focus',
    cutawayTitle:
      'Switch to X-Ray cutaway and frame the short-stroke gas tappet & monolithic carrier',
    searchPlaceholder:
      'Search part name / BOM code (e.g. piston, stock, U-04)...',
    firingMilestoneLabel: 'Piston Impulse',
  },
  deagle: {
    shortLabel: 'Desert Eagle',
    name: 'Desert Eagle Mark XIX (.50 AE)',
    originCountry: 'Israel / USA',
    weaponType: 'Magnum Pistol',
    statusLabel: 'In Vault · Ready',
    actionMechanism: 'Gas-Operated Slide · 4-Lug Rotating Bolt',
    overallLengthMm: '273 mm',
    barrelSpec: '152 mm · Polygonal 6-RH 1:470mm',
    rateOfFire: 'Semi-Auto',
    description:
      'Co-developed by Magnum Research (MRI) and IMI, the Mark XIX .50 Action Express pistol replaces conventional pistol recoil actions with a rifle-grade forward gas cylinder, open-top bridge slide, 4-lug rotating bolt, fixed 6" triangular Picatinny barrel, and dual parallel recoil springs in brushed/mirror chrome.',
    highlights: [
      'Mirror/Brushed Chrome & Engraved Rollmarks',
      '6" Fixed Triangular Barrel + Gas Piston',
      'Rifle-Style 4-Lug Bolt + Dual Springs',
      '7-Rd .50 AE Magnum Live Cycle Simulation',
    ],
    workbenchTitle: 'Desert Eagle Mk XIX 3D Disassembly & Firing Simulation',
    workbenchSubtitle:
      '4 Assemblies · 24 CAD Parts · Gas-Operated 4-Lug Rotating Bolt & .50 AE Cycle',
    cutawayLabel: 'Gas Piston & 4-Lug Bolt Focus',
    cutawayTitle:
      'Switch to X-Ray cutaway and frame the forward gas piston & 4-lug rotating bolt',
    searchPlaceholder:
      'Search part name / BOM code (e.g. bolt, piston, B-03)...',
    firingMilestoneLabel: 'Gas Unlock',
  },
  aug: {
    shortLabel: 'AUG A1',
    name: 'Steyr AUG A1 (StG 77) Bullpup',
    originCountry: 'Austria',
    weaponType: 'Bullpup Rifle',
    statusLabel: 'In Vault · Ready',
    actionMechanism: 'Bullpup Short-Stroke Piston · Dual-Rod 7-Lug Bolt',
    overallLengthMm: '790 mm',
    barrelSpec: '508 mm · 6-RH 1:228mm',
    rateOfFire: '680–750 rpm',
    description:
      'Steyr Mannlicher’s revolutionary 1977 modular bullpup service rifle (StG 77): packs a full 20" quick-change barrel inside submachine-gun length, featuring an OD green polyamide stock, integrated 1.5× Swarovski optic handle, folding foregrip, dual guide-rod carrier, polymer hammer pack, and translucent waffle magazine.',
    highlights: [
      'Integrated 1.5× Swarovski Optic Handle',
      '20" Quick-Change Barrel + Folding Grip',
      'Dual Guide-Rod Carrier + Polymer Hammer Pack',
      '30-Rd Translucent Amber Waffle Magazine',
    ],
    workbenchTitle: 'Steyr AUG A1 3D Disassembly & Live Firing Simulation',
    workbenchSubtitle:
      '4 Assemblies · 25 CAD Parts · Bullpup Dual-Rod Carrier & All-Polymer Hammer Pack',
    cutawayLabel: 'Rear Polymer Hammer Pack Focus',
    cutawayTitle:
      'Switch to X-Ray cutaway and frame the rear bullpup chamber & polymer hammer pack',
    searchPlaceholder:
      'Search part name / BOM code (e.g. optic, waffle, U-06)...',
    firingMilestoneLabel: 'Piston Unlock',
  },
  p320: {
    shortLabel: 'P320 M17',
    name: 'SIG Sauer P320-M17 Modular Pistol',
    originCountry: 'USA / Germany',
    weaponType: 'Modular Pistol',
    statusLabel: 'In Vault · Ready',
    actionMechanism: 'Serialized Stainless FCU · Tilting-Barrel Striker',
    overallLengthMm: '203 mm',
    barrelSpec: '119 mm · 6-RH 1:250mm',
    rateOfFire: 'Semi-Auto',
    description:
      'Winner of the US Army Modular Handgun System (MHS) trials: centered around a serialized, tool-free removable stainless steel Fire Control Unit (FCU) housed in a Coyote FDE polymer grip module, paired with a Coyote PVD optic-ready slide, 4.7" nitrided barrel, ambidextrous thumb safety, and 17-round steel magazine.',
    highlights: [
      'Removable Serialized Stainless FCU Chassis',
      'Coyote PVD Slide + Optic Plate Rear Sight',
      'US Army M17 Ambi Safety & Takedown Lever',
      '2K Coyote FDE Laser Stipple & Rollmark PBR',
    ],
    workbenchTitle: 'SIG P320 M17 3D Disassembly & Live Firing Simulation',
    workbenchSubtitle:
      '4 Assemblies · 24 CAD Parts · Modular Stainless FCU Chassis & 9×19mm Cycle',
    cutawayLabel: 'Modular Stainless FCU Focus',
    cutawayTitle:
      'Switch to X-Ray cutaway and frame the serialized stainless FCU & dual-sear striker',
    searchPlaceholder:
      'Search part name / BOM code (e.g. FCU, safety, U-02)...',
    firingMilestoneLabel: 'Tilt Unlock',
  },
  p90: {
    shortLabel: 'FN P90',
    name: 'FN Herstal P90 5.7×28mm PDW',
    originCountry: 'Belgium',
    weaponType: 'Bullpup PDW / SMG',
    statusLabel: 'In Vault · Ready',
    actionMechanism: 'Top 50-Rd 90° Helical Feed · Straight Blowback',
    overallLengthMm: '504 mm',
    barrelSpec: '264 mm · 8-RH 1:228mm',
    rateOfFire: '900 rpm',
    description:
      'FN Herstal’s iconic Personal Defense Weapon engineered for NATO CRISAT requirements: mounts a 50-round translucent polycarbonate magazine flat along the top spine with 5.7×28mm cartridges oriented sideways, rotating each round 90° through a patented helical ramp into a 10.4" barrel—paired with a Ring Sight MC-10-80 optic, polymer hammer pack, and downward brass ejection.',
    highlights: [
      'Top 50-Rd Horizontal Mag + 90° Helical Feed Ramp',
      '5.7×28mm SS190 + Straight-Blowback Dual-Rod Bolt',
      'Ring Sight MC-10-80 Optic + Polymer Hammer Pack',
      'Downward Ejection Chute · 100% Ambidextrous Thumbhole',
    ],
    workbenchTitle: 'FN P90 3D Disassembly & 90° Helical Feed Simulation',
    workbenchSubtitle:
      '4 Assemblies · 25 CAD Parts · Top Horizontal 50-Rd 90° Helical Feed & Downward Ejection',
    cutawayLabel: '90° Helical Feed Ramp Focus',
    cutawayTitle:
      'Switch to cutaway view and frame the patented 90° helical feed ramp & breech bolt',
    searchPlaceholder:
      'Search part name / BOM code (e.g. helical, Ring Sight, M-02)...',
    firingMilestoneLabel: 'Blowback',
  },
  lift33: {
    shortLabel: 'LIFT 33',
    name: 'Mathews LIFT 33 SwitchWeight-X Compound Bow',
    originCountry: 'United States',
    weaponType: 'Binary-Cam Compound Bow',
    statusLabel: 'In Vault · Ready',
    caliber: '400 gr Carbon Arrow (70 lb · 348 FPS)',
    compactCaliber: '400 gr Carbon · 70 lb',
    actionMechanism: 'SwitchWeight-X Binary Cams · 85% Let-Off Split-Limb Storage',
    overallLengthMm: '838 mm (33" ATA · 165.1 mm Brace)',
    barrelSpec: '571.5 mm Power Stroke (29" Draw / 165.1 mm Brace)',
    weightKg: '1.79 kg (3.94 lb Bare Bow)',
    muzzleVelocityMs: '106 m/s (348 FPS IBO)',
    effectiveRangeM: '70 m (Effective Hunting)',
    rateOfFire: '70 lb Draw · 85% Let-Off',
    description:
      'Mathews’ flagship 33-inch axle-to-axle compound hunting bow machined around a bridged aluminum truss riser and SwitchWeight-X synchronized binary cams: draws to a crisp 70 lb peak before collapsing 85% to a 10.5 lb holding valley, propelling a 400 gr micro-diameter carbon arrow at 348 FPS (145.6 J) through an integrated QAD drop-away rest and 10" Bridge-Lock carbon stabilizer.',
    highlights: [
      'SwitchWeight-X Synchronized Binary Cams (85% Let-Off)',
      'Bridged Aluminum Truss Riser + Split Quad Carbon Limbs',
      'QAD Drop-Away Rest, 5-Pin Sight & LowPro 5-Arrow Quiver',
      '348 FPS / 145.6 J Elastic Power-Stroke Kinematics',
    ],
    workbenchTitle: 'Mathews LIFT 33 3D Disassembly & Draw-Cycle Simulation',
    workbenchSubtitle:
      '4 Assemblies · 24 CAD Parts · Binary-Cam 85% Let-Off & Drop-Away Launcher Kinematics',
    cutawayLabel: 'Riser & Cam Track Focus',
    cutawayTitle:
      'Inspect bridged aluminum riser pockets, SwitchWeight-X cam axles & drop-away launcher timing',
    searchPlaceholder:
      'Search part name / BOM code (e.g. cam, riser, C-03)...',
    firingMilestoneLabel: 'Full Draw / Launch',
  },
  r500: {
    shortLabel: 'RAVIN R500',
    name: 'Ravin R500 HexCoil Compound Crossbow',
    originCountry: 'United States',
    weaponType: 'Helical-Cam Bullpup Crossbow',
    statusLabel: 'In Vault · Ready',
    caliber: '400 gr Carbon Bolt (300 lb · 500 FPS)',
    compactCaliber: '400 gr Bolt · 300 lb',
    actionMechanism: 'HexCoil 360° Helical Cams · Frictionless Trac-Trigger Sled',
    overallLengthMm: '711 mm (28" OAL · 91 mm Cocked Width)',
    barrelSpec: '381 mm (15") Zero-Rail Power Stroke',
    weightKg: '3.81 kg (8.40 lb Bare)',
    muzzleVelocityMs: '152.4 m/s (500 FPS)',
    effectiveRangeM: '100+ m (100 yd BDC Optic)',
    rateOfFire: '300 lb Draw · Versa-Drive Crank',
    description:
      'Ravin’s ultra-narrow bullpup crossbow powered by patent-pending HexCoil 360° dual helical cam stacks that coil strings tightly around cam drums—shrinking cocked axle-to-axle width to just 3.6 inches (91 mm). Driven by the enclosed Versa-Drive bidirectional clutch screw and floating Trac-Trigger sled with Anti-Dry-Fire interlock, it launches a 400 gr carbon bolt at 500 FPS (301 J).',
    highlights: [
      'HexCoil 360° Dual Helical Cams (3.6" Cocked Axle Width)',
      'Frictionless Flight Track + Floating Trac-Trigger Sled',
      'Versa-Drive Leadscrew Crank & Copper Anti-Dry-Fire Lock',
      '500 FPS / 301 J Kinetic Power-Stroke with 1–8×24 Optic',
    ],
    workbenchTitle: 'Ravin R500 3D Disassembly & HexCoil Firing Simulation',
    workbenchSubtitle:
      '4 Assemblies · 25 CAD Parts · 360° Helical Cam Storage & Trac-Trigger Release Cycle',
    cutawayLabel: 'Trac-Trigger Sled Cutaway',
    cutawayTitle:
      'Slice the bullpup flight bridge open to reveal the floating Trac-Trigger latch, ADF lock & Versa-Drive screw',
    searchPlaceholder:
      'Search part name / BOM code (e.g. HexCoil, sled, T-01)...',
    firingMilestoneLabel: '500 FPS Launch',
  },
  python: {
    shortLabel: 'Colt Python',
    name: 'Colt Python 6" .357 Magnum Revolver',
    originCountry: 'United States',
    weaponType: 'DA/SA Revolver',
    statusLabel: 'In Vault · Ready',
    caliber: '.357 Magnum (9×33mmR)',
    compactCaliber: '.357 Magnum',
    actionMechanism:
      'Hand-Tuned DA/SA Clockwork · 60° Ratchet & Stop-Bolt Lockup',
    overallLengthMm: '292 mm (6" Barrel)',
    barrelSpec: '152.4 mm (6") · 6-LH 1:356mm (1:14")',
    weightKg: '1.23 kg (43.5 oz)',
    muzzleVelocityMs: '385 m/s (158 gr JSP)',
    effectiveRangeM: '75 m',
    rateOfFire: 'DA / SA (6-Round Cylinder)',
    description:
      'Colt’s 1955 Hartford flagship .357 Magnum revolver built on the forged I-frame in mirror-polished Royal Blue: pairs a 6-inch 3-vent rib barrel and full-length ejector underlug with a swing-out 6-shot fluted cylinder, two-step bank-vault hand/bolt lockup, folded V-leaf mainspring, positive rebound safety lever, and checkered American walnut target grips.',
    highlights: [
      '6" Ventilated-Rib & Full-Underlug Barrel',
      'Swing-Out 6-Rd Cylinder & HKS Speedloader',
      'Folded V-Mainspring + Bank-Vault Lockup',
      '2K Royal Blue Steel & 24K Medallion Walnut PBR',
    ],
    workbenchTitle: 'Colt Python 6" 3D Disassembly & DA/SA Revolving Cycle',
    workbenchSubtitle:
      '4 Assemblies · 25 CAD Parts · 60° Ratchet Indexing, V-Mainspring & .357 Magnum Cycle',
    cutawayLabel: 'DA/SA Clockwork & Ratchet Focus',
    cutawayTitle:
      'Switch to cutaway view and frame the sideplate DA/SA clockwork, V-mainspring & 6-point ratchet star',
    searchPlaceholder:
      'Search part name / BOM code (e.g. cylinder, hand, FC-04)...',
    firingMilestoneLabel: '60° Lock & Ignite',
  },
  benellim4: {
    shortLabel: 'Benelli M4',
    name: 'Benelli M4 Super 90 (M1014) Combat Shotgun',
    originCountry: 'Italy',
    weaponType: 'Combat Shotgun',
    statusLabel: 'In Vault · Ready',
    caliber: '12 Gauge (18.5×70mm / 76mm 00 Buck)',
    compactCaliber: '12 Gauge · 00 Buck',
    actionMechanism:
      'Dual ARGO Short-Stroke Gas Pistons · 2-Lug Rotating Bolt',
    overallLengthMm: '886–1,010 mm (Telestock)',
    barrelSpec: '470 mm (18.5") · Ø18.5mm Chrome Smoothbore',
    weightKg: '3.82 kg',
    muzzleVelocityMs: '404 m/s (9-Pellet 00 Buck)',
    effectiveRangeM: '50 m (Buck) / 125 m (Slug)',
    rateOfFire: 'Semi-Auto (7+1 Rd)',
    description:
      'Benelli Armi’s U.S. Marine Corps M1014 Joint Service Combat Shotgun: departs from recoil inertia in favor of patented dual symmetrical stainless A.R.G.O. (Auto-Regulating Gas-Operated) short-stroke pistons ahead of the chamber, driving a hard-chrome 2-lug rotating bolt, 7-round underbarrel tubular magazine with pivoting stainless shell elevator, LPA ghost-ring sights, and 3-position skeletonized M1014 telestock.',
    highlights: [
      'Dual Stainless ARGO Auto-Regulating Pistons',
      'Hard-Chrome 2-Lug Bolt & Angled Recoil Tube',
      '7-Rd Tube Mag + Pivoting Shell Carrier Elevator',
      'LPA Ghost-Ring Sights & M1014 Collapsible Stock',
    ],
    workbenchTitle: 'Benelli M4 (M1014) 3D Disassembly & ARGO 12ga Simulation',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · Twin ARGO Short-Stroke Pistons & Tubular Shell Elevator Cycle',
    cutawayLabel: 'Twin ARGO & Shell Elevator Focus',
    cutawayTitle:
      'Switch to cutaway view and frame the dual ARGO gas pistons, 2-lug bolt & pivoting shell elevator',
    searchPlaceholder:
      'Search part name / BOM code (e.g. ARGO, elevator, B-02)...',
    firingMilestoneLabel: 'ARGO Unlock',
  },
  garand: {
    shortLabel: 'M1 Garand',
    name: 'U.S. Rifle, Caliber .30, M1 Garand',
    originCountry: 'United States',
    weaponType: 'Semi-Auto Battle Rifle',
    statusLabel: 'In Vault · Ready',
    caliber: '.30-06 Springfield (7.62×63mm M2 Ball)',
    compactCaliber: '.30-06 M2 Ball',
    actionMechanism:
      'Muzzle Gas Cylinder Long-Stroke Op-Rod · 2-Lug Bolt & En-Bloc Clip',
    overallLengthMm: '1,105 mm',
    barrelSpec: '610 mm (24") · 4-RH 1:254mm (1:10")',
    weightKg: '4.31 kg',
    muzzleVelocityMs: '853 m/s',
    effectiveRangeM: '457 m (500 yd)',
    rateOfFire: 'Semi-Auto (40–50 rpm · 8-Rd Clip)',
    description:
      'John Cantius Garand’s Springfield Armory masterpiece—history’s first standard-issue semi-automatic infantry rifle: taps low-pressure muzzle gas inside a stainless cylinder to drive a curved long-stroke operating rod with a 4mm safety dwell cam hump and 2-lug rotating bolt, fed from a reversible 8-round spring-steel en-bloc clip that automatically ejects skyward with an iconic metallic "PING!" on the final shot.',
    highlights: [
      '8-Rd Spring-Steel En-Bloc Clip Auto-Eject ("PING!")',
      '24" Barrel + Muzzle Gas Cylinder & Curved Op-Rod',
      'Dual-Purpose Op-Rod Spring + Follower Arm Linkage',
      'American Black Walnut DAS Stock & T105 Peep Sight',
    ],
    workbenchTitle: 'U.S. M1 Garand 3D Disassembly & .30-06 En-Bloc Simulation',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · Long-Stroke Op-Rod Cam Hump & 8-Rd En-Bloc Clip Cycle',
    cutawayLabel: 'En-Bloc Clip & Op-Rod Cam Focus',
    cutawayTitle:
      'Switch to cutaway view and frame the 8-round en-bloc clip, follower arm & 2-lug rotating bolt',
    searchPlaceholder:
      'Search part name / BOM code (e.g. en-bloc, op-rod, M-01)...',
    firingMilestoneLabel: 'Op-Rod Cam Unlock',
  },
  m249: {
    shortLabel: 'M249 SAW',
    name: 'FN M249 SAW Squad Automatic Weapon',
    originCountry: 'Belgium / USA',
    weaponType: 'Belt-Fed Light Machine Gun',
    statusLabel: 'New in Vault · Ready',
    caliber: '5.56×45mm NATO (M855 / M27 Belt)',
    compactCaliber: '5.56 NATO · M27 Belt',
    actionMechanism:
      'Open-Bolt Long-Stroke Gas Piston · Dual-Lug Bolt & Dual-Pawl Belt/STANAG Feed',
    overallLengthMm: '1,038 mm',
    barrelSpec: '465 mm (18.3") · 6-RH 1:178mm (1:7") Quick-Change',
    weightKg: '7.50 kg (Empty) / 10.02 kg (Loaded 200-Rd Box)',
    muzzleVelocityMs: '915 m/s (62 gr M855)',
    effectiveRangeM: '800 m (Point) / 1,000 m (Area)',
    rateOfFire: '750–850 rpm (Open-Bolt Auto)',
    description:
      'FN Herstal and FN Manufacturing’s U.S. M249 Squad Automatic Weapon (Minimi): fires from an open bolt for sustained air-cooled barrel cooling, combining an under-barrel long-stroke gas piston and dual-lug rotating bolt with a top-cover cam roller driving dual spring-loaded feed pawls to strip M27 disintegrating steel links—plus an emergency left-side STANAG rifle magazine well and 3-second quick-change 18.3" chrome-lined barrel.',
    highlights: [
      'Open-Bolt Long-Stroke Piston + 2-Lug Rotating Bolt',
      'Top-Cover Cam Channel & Dual-Pawl M27 Belt Shuttle',
      'Dual Feed: 200-Rd OD Assault Box + Side STANAG Well',
      '3-Second Quick-Change 18.3" Barrel, Heatshield & Bipod',
    ],
    workbenchTitle: 'FN M249 SAW 3D Disassembly & Belt-Fed Open-Bolt Simulation',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · Open-Bolt Long-Stroke Piston & M27 Disintegrating Belt Shuttle',
    cutawayLabel: 'Top-Cover Cam & Dual-Pawl Belt Focus',
    cutawayTitle:
      'Switch to cutaway view and frame the carrier top roller, S-cam channel, dual feed pawls & M27 belt',
    searchPlaceholder:
      'Search part name / BOM code (e.g. pawl, belt, barrel, M-02)...',
    firingMilestoneLabel: 'Open-Bolt Slam & Belt Index',
  },
  p08: {
    shortLabel: 'Luger P08',
    name: 'Luger P08 Parabellum Toggle-Lock Pistol',
    originCountry: 'Germany',
    weaponType: 'Toggle-Lock Semi-Auto Pistol',
    statusLabel: 'New in Vault · Ready',
    caliber: '9×19mm Parabellum',
    compactCaliber: '9×19mm Parabellum',
    actionMechanism:
      'Short-Recoil Forked Receiver · Over-Center Knee-Joint Toggle Lock',
    overallLengthMm: '222 mm (4" Barrel)',
    barrelSpec: '102 mm (4") · 6-RH 1:250mm',
    weightKg: '0.871 kg (Empty)',
    muzzleVelocityMs: '365 m/s (115–124 gr FMJ)',
    effectiveRangeM: '50 m',
    rateOfFire: 'Semi-Auto (8-Rd Box Mag)',
    description:
      'Georg Luger’s 1908 Deutsche Waffen- und Munitionsfabriken (DWM) mechanical masterpiece that gave the world the 9×19mm Parabellum cartridge: replaces a full-length slide with a short-recoil tapered barrel and forked receiver locked by an articulated two-link knee-joint toggle sitting 1.5 mm below dead-center—until twin frame cam ramps snap the checkered toggle ears skyward at 54° while exposing straw-tempered steel controls and 55° European walnut grips.',
    highlights: [
      'Over-Center Two-Link Knee-Joint Toggle Lock (54° Fold)',
      'Short-Recoil Forked Receiver & S-Curved Toggle Return Ramp',
      'Lateral L-Shaped Trigger Lever & Gesichert Thumb Safety',
      'Rust-Blued Steel, 240°C Straw-Tempered Controls & Walnut Grips',
    ],
    workbenchTitle: 'Luger P08 Parabellum 3D Disassembly & Toggle-Lock Cycle',
    workbenchSubtitle:
      '4 Assemblies · 25 CAD Parts · Over-Center Knee-Joint Toggle Kinematics & 9×19mm Cycle',
    cutawayLabel: 'Knee-Joint Toggle & Striker Focus',
    cutawayTitle:
      'Switch to cutaway view and frame the over-center breechblock, front/rear toggle links & grip mainspring',
    searchPlaceholder:
      'Search part name / BOM code (e.g. toggle, breechblock, B-02)...',
    firingMilestoneLabel: '54° Toggle Break',
  },
  vector: {
    shortLabel: 'KRISS Vector',
    name: 'KRISS Vector Gen II SDP-SB (.45 ACP)',
    originCountry: 'USA / Switzerland',
    weaponType: 'Off-Axis Delayed-Blowback SMG',
    statusLabel: 'New in Vault · Ready',
    caliber: '.45 ACP (11.43×23mm 230 gr FMJ)',
    compactCaliber: '.45 ACP · 230 gr',
    actionMechanism:
      'KRISS Super V Off-Axis Cam-Delayed Blowback · 110° Downward Counterweight Slider',
    overallLengthMm: '425–617 mm (Gen II Folding Stock)',
    barrelSpec: '140 mm (5.5") · 4-RH 1:406mm (1:16") Low-Bore',
    weightKg: '2.72 kg (Empty)',
    muzzleVelocityMs: '260 m/s (230 gr Subsonic FMJ)',
    effectiveRangeM: '100 m',
    rateOfFire: '1,200 rpm (Safe / Semi / 2-Rd / Auto)',
    description:
      'Renaud Kerbrat’s radical re-thinking of submachine gun recoil physics: aligns the 5.5-inch .45 ACP barrel below the shooter’s trigger-finger web to eliminate muzzle-climb leverage, while the patented KRISS Super V articulated bolt cams an angled tungsten-steel slider downward at 110° behind the Glock-pattern MagEx2 magazine well—redirecting 1,200 rpm blowback momentum vertically rather than straight into the shoulder.',
    highlights: [
      'KRISS Super V Articulated Bolt + 110° Off-Axis Slider',
      'Sub-Hand Bore Axis Below Trigger Line (Zero Muzzle Climb)',
      '1,200 RPM .45 ACP w/ Separate Safety & 3-Mode Selector',
      'Two-Tone FDE Upper, Black Super V Lower & 25-Rd MagEx2',
    ],
    workbenchTitle: 'KRISS Vector Gen II 3D Disassembly & Super V .45 Simulation',
    workbenchSubtitle:
      '4 Assemblies · 25 CAD Parts · 110° Off-Axis Downward Slider & 1,200 RPM .45 ACP Cycle',
    cutawayLabel: 'Super V 110° Off-Axis Cam Focus',
    cutawayTitle:
      'Switch to cutaway view and frame the articulated bolt cam lugs & 110° downward counterweight slider',
    searchPlaceholder:
      'Search part name / BOM code (e.g. Super V, slider, B-02)...',
    firingMilestoneLabel: '110° Vector Dive',
  },
  g11: {
    shortLabel: 'H&K G11 K2',
    name: 'H&K G11 K2 Caseless Assault Rifle',
    originCountry: 'West Germany',
    weaponType: 'Caseless Assault Rifle',
    statusLabel: 'New in Vault · Ready',
    caliber: '4.73×33mm DM11 Caseless',
    compactCaliber: '4.73×33 Caseless',
    actionMechanism:
      'Gas-Operated Clockwork 90° Rotary Breech · 42 mm Floating-Action 2,100 RPM Hyperburst',
    overallLengthMm: '750 mm',
    barrelSpec: '540 mm · 6-Groove Floating CHF Chrome-Lined',
    weightKg: '3.60 kg (Empty) / 4.30 kg (3 Loaded Mags)',
    muzzleVelocityMs: '930 m/s',
    effectiveRangeM: '400 m (Point) / 600 m (Area)',
    rateOfFire: '2,100 rpm (3-Rd) / 460 rpm (Auto)',
    description:
      'Engineered by Heckler & Koch with Dynamit Nobel for the Bundeswehr and U.S. ACR trials, the H&K G11 K2 eliminates brass cartridge cases in favor of rectangular 4.73×33mm DM11 HITP caseless propellant blocks fed vertically from an overhead 45-round horizontal magazine. Its Swiss-watch gear train rotates a chrome cylindrical breech 90° to scoop and fire with zero extraction or ejection, while the entire barreled action floats rearward 42 mm during a 2,100 rpm three-round hyperburst.',
    highlights: [
      '90° Chrome Rotating Cylindrical Breech · Zero Brass Ejection',
      'Swiss-Watch Stainless & Brass Gear Train + Pop-Out Winding Crank',
      'Floating Barreled Action (-42 mm) · 2,100 RPM 3-Rd Hyperburst',
      'Overhead 45-Rd DM11 Caseless Mag + Integral Hensoldt 1×/3.5× Optic',
    ],
    workbenchTitle: 'H&K G11 K2 3D Teardown & 90° Rotary-Breech Clockwork',
    workbenchSubtitle:
      '4 Assemblies · 24 CAD Parts · Floating Barreled Action, 90° Rotary Cylinder & Caseless Feed',
    cutawayLabel: '90° Rotary Breech & Clockwork Focus',
    cutawayTitle:
      'Switch to cutaway view and frame the 90° chrome rotary breech cylinder, clockwork gear train & vertical DM11 rammer',
    searchPlaceholder:
      'Search part name / BOM code (e.g. rotary breech, clockwork, DM11, S-04)...',
    firingMilestoneLabel: '90° Breech Cycle',
  },
  vss: {
    shortLabel: 'VSS Vintorez',
    name: 'VSS Vintorez (6P29) Integral Suppressed Sniper',
    originCountry: 'Soviet Union / Russia',
    weaponType: 'Integral Suppressed Sniper',
    statusLabel: 'New in Vault · Ready',
    caliber: '9×39mm SP-5 / SP-6 Subsonic AP',
    compactCaliber: '9×39mm Subsonic',
    actionMechanism:
      'Radial-Ported Integral 6-Baffle Suppressor · Long-Stroke 6-Lug Bolt & Linear Striker',
    overallLengthMm: '894 mm',
    barrelSpec: '200 mm · 4-RH 1:210mm 3-Row Radial-Ported',
    weightKg: '2.60 kg (Empty) / 3.41 kg (w/ PSO-1 & Mag)',
    muzzleVelocityMs: '290 m/s (250 gr Subsonic)',
    effectiveRangeM: '400 m',
    rateOfFire: '800–900 rpm',
    description:
      'Designed by Pyotr Serdyukov at TsNIITochMash and manufactured at Tula Arms Plant (TOZ), the VSS Vintorez ("Thread Cutter", GRAU 6P29) defeats body armor to 400 meters in virtual silence. Firing heavy 250-grain 9×39mm SP-5/SP-6 subsonic armor-piercing rounds, it bleeds gas through three rows of radial barrel ports into a 414 mm integral suppressor with six slanted CNC baffles, paired with a 6-lug rotating bolt, ultra-quiet hammerless linear striker, quick-detach laminated birch stock, and PSO-1M2-1 optic.',
    highlights: [
      '200mm Radial-Ported Barrel + 6-Stage Slanted CNC Acoustic Baffles',
      '6-Lug Symmetric Rotating Bolt + Ultra-Quiet Hammerless Linear Striker',
      'Quick-Detach Laminated Russian Birch Stock & PSO-1M2-1 4×24 Scope',
      'Milled Tula Receiver + Cross-Bolt Selector & 10-Rd Plum Waffle Mag',
    ],
    workbenchTitle: 'VSS Vintorez 3D Teardown & Integral Acoustic Kinematics',
    workbenchSubtitle:
      '4 Assemblies · 24 CAD Parts · Radial-Ported Barrel, 6-Stage Slanted Baffles & Linear Striker',
    cutawayLabel: '6-Stage Baffle & Linear Striker Focus',
    cutawayTitle:
      'Switch to cutaway view and frame the 200mm ported barrel, 6-stage slanted baffles, 6-lug bolt & linear striker',
    searchPlaceholder:
      'Search part name / BOM code (e.g. baffle, striker, PSO-1, S-02)...',
    firingMilestoneLabel: 'Baffle Gas Bleed',
  },
  m134: {
    shortLabel: 'M134D Minigun',
    name: 'GE / Dillon Aero M134D Rotary Minigun',
    originCountry: 'United States',
    weaponType: '6-Barrel Rotary Machine Gun',
    statusLabel: 'New in Vault · Ready',
    caliber: '7.62×51mm NATO (M80 / M13 Belt)',
    compactCaliber: '7.62 NATO · M13 Belt',
    actionMechanism:
      '28V DC Externally Driven 6-Barrel Rotary Gatling · 360° Sinusoidal Cam & Dillon Delinker',
    overallLengthMm: '802 mm',
    barrelSpec: '559 mm (22") × 6 Barrels · 4-RH 1:305mm',
    weightKg: '18.80 kg (Gun) / 30.80 kg (w/ Motor & Feeder)',
    muzzleVelocityMs: '853 m/s',
    effectiveRangeM: '1,000 m',
    rateOfFire: '3,000 rpm (50 rds/sec)',
    description:
      'Scaled down by General Electric from the 20mm M61 Vulcan cannon and perfected by Dillon Aero into the modernized M134D, the Minigun is the apex of externally powered rotary ordnance. A 28V DC 3.2-HP aerospace motor spins a central six-flute star-rotor and six 22-inch barrels through a stationary 360° elliptical sinusoidal cam track, cycling six chrome rotary bolts in a continuous 60° wave fed by a gear-driven Dillon delinker at 3,000 rounds per minute.',
    highlights: [
      '28V DC 3.2-HP Electric Motor Drive · Zero Misfire Stoppage',
      '360° Elliptical Sinusoidal Cam Track Driving 6 Coaxial Rotary Bolts',
      'Six 22" Fluted Rotating Barrels Sharing 3,000 RPM Thermal Load',
      'Dillon Aero Star-Wheel Delinker & Ribbed Stainless M13 Feed Chute',
    ],
    workbenchTitle: 'M134D Minigun 3D Teardown & 3,000 RPM Rotary Kinematics',
    workbenchSubtitle:
      '4 Assemblies · 25 CAD Parts · 6-Barrel Coaxial Rotation, 360° Sinusoidal Cam & Dillon Delinker',
    cutawayLabel: '360° Sinusoidal Cam & 6-Bolt Focus',
    cutawayTitle:
      'Switch to cutaway view and frame the 360° sinusoidal cam sleeve, 6-flute star-rotor & six orbiting bolts',
    searchPlaceholder:
      'Search part name / BOM code (e.g. rotor, cam track, delinker, F-02)...',
    firingMilestoneLabel: 'Cam Extraction',
  },
  an94: {
    shortLabel: 'AN-94 Abakan',
    name: 'Nikonov AN-94 "Abakan" (6P33) Assault Rifle',
    originCountry: 'Russia',
    weaponType: 'Blowback-Shifted Assault Rifle',
    statusLabel: 'New in Vault · Ready',
    caliber: '5.45×39mm (7N6 / 7N10)',
    compactCaliber: '5.45×39mm 7N6',
    actionMechanism:
      '42 mm Floating Barreled Action · Steel Pulley-Cable 2-Stage Pre-Feed & 1,800 RPM 2-Rd Burst',
    overallLengthMm: '943 mm (728 mm folded)',
    barrelSpec: '405 mm · 4-RH 1:195mm Floating CHF Chrome-Lined',
    weightKg: '3.85 kg (Empty)',
    muzzleVelocityMs: '900 m/s (5.45×39mm 7N6)',
    effectiveRangeM: '700 m',
    rateOfFire: '1,800 rpm (2-Rd) / 600 rpm (Auto)',
    description:
      'Designed by Gennady Nikonov to win the Soviet Project Abakan trials, the AN-94 (GRAU 6P33) is the most intricate service rifle ever fielded. Nicknamed the "Clockwork Kalashnikov", its 405 mm cold-hammer-forged barrel and steel sub-receiver float 42 mm rearward inside a stationary polyamide outer shell while a CNC grooved pulley and braided stainless cable whip a bronze two-stage pre-feed rammer forward from a 15° right-canted magazine—firing two 5.45×39mm rounds at 1,800 rpm before recoil hits the shoulder.',
    highlights: [
      '405mm Floating Barrel & Steel Sub-Receiver Recoiling 42mm in Shell',
      'CNC Grooved Pulley, Braided Steel Cable & Bronze 1,800 RPM Rammer',
      '15° Right-Canted 30-Rd 5.45×39mm Mag & 5-Pos Star-Wheel Diopter',
      'Asymmetrical Figure-8 Dual-Chamber Self-Cleaning Whistling Brake',
    ],
    workbenchTitle: 'Nikonov AN-94 3D Teardown & 1,800 RPM Pulley-Cable Hyperburst',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · 42 mm Floating Action, Steel Pulley-Cable Pre-Feed & 15° Canted Mag',
    cutawayLabel: 'Pulley-Cable & Pre-Feed Focus',
    cutawayTitle:
      'Switch to cutaway view and frame the CNC transmission pulley, braided steel cable & bronze pre-feed rammer',
    searchPlaceholder:
      'Search part name / BOM code (e.g. pulley, cable, rammer, S-05)...',
    firingMilestoneLabel: 'Pulley Pre-Feed',
  },
  ztz99a: {
    shortLabel: 'ZTZ-99A',
    name: 'PLA ZTZ-99A Main Battle Tank',
    originCountry: 'China',
    weaponType: 'Main Battle Tank',
    statusLabel: 'Heavy Armor · 1:1 Ready',
    caliber: '125mm ZPT-98 (DTC10-125 APFSDS)',
    compactCaliber: '125mm · DTC10 APFSDS',
    actionMechanism:
      '125mm L/50 Smoothbore · Vertical Sliding-Wedge Breech & 22-Rd Floor Carousel Autoloader',
    overallLengthMm: '10,900 mm (Gun Forward) / 7,600 mm (Hull)',
    barrelSpec: '6,250 mm (125mm ZPT-98 L/50 · ESR Chrome Smoothbore)',
    weightKg: '55,000 kg (Combat Weight)',
    muzzleVelocityMs: '1,780 m/s (DTC10-125 Tungsten APFSDS)',
    effectiveRangeM: '3,000 m (Direct) / 5,000 m (GL-ATGM)',
    rateOfFire: '8 rpm (22-Rd Carousel Autoloader)',
    description:
      'China’s flagship third-generation-plus digitalized main battle tank at true 1:1 scale (10.90 m overall, 55 tonnes combat mass): fuses arrowhead FY-4 dual-purpose explosive reactive armor, a 6.25-meter high-pressure 125mm ZPT-98 L/50 smoothbore cannon with hydro-pneumatic recoil cylinders, a 22-round floor carousel autoloader with vertical hoist and rigid-chain rammer, a 1,500-HP 150HB-2 twin-turbo V12 diesel powerpack, and the signature JD-3 active laser dazzler.',
    highlights: [
      '125mm ZPT-98 L/50 Smoothbore (650 MPa · 1,780 m/s DTC10 APFSDS)',
      '22-Rd Floor Carousel Autoloader, +68cm Hoist & Rigid-Chain Rammer',
      'Arrowhead FY-4 Dual-Purpose ERA Turret & JD-3 Active Laser Dazzler',
      '1,500-HP 150HB-2 V12 Diesel, CH-1000 Drive & 12 Torsion Bars',
    ],
    workbenchTitle: 'PLA ZTZ-99A 1:1 3D Teardown & 125mm Carousel Autoloader',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · 125mm ZPT-98 -320mm Recoil, 22-Rd Floor Carousel & 1,500-HP V12',
    cutawayLabel: 'Carousel & V12 Cutaway',
    cutawayTitle:
      'Switch to cutaway view and frame the 22-round floor carousel autoloader, vertical hoist arm, chain rammer & 125mm vertical breech',
    searchPlaceholder:
      'Search tank assembly / BOM code (e.g. carousel, ZPT-98, FY-4, V12, A-01)...',
    firingMilestoneLabel: 'Carousel Hoist & Ram',
  },
  m1a2: {
    shortLabel: 'M1A2 SEP v3',
    name: 'M1A2 SEP v3 Abrams Main Battle Tank',
    originCountry: 'United States',
    weaponType: 'Main Battle Tank',
    statusLabel: 'Heavy Armor · 1:1 Ready',
    caliber: '120×570mm NATO (M829A4 APFSDS-T)',
    compactCaliber: '120×570mm · M829A4',
    actionMechanism:
      '120mm L/44 M256 Smoothbore · Vertical Falling-Wedge Breech & Blast-Door Bustle',
    overallLengthMm: '9,770 mm (Gun Forward) / 7,930 mm (Hull)',
    barrelSpec: '5,280 mm (120mm L/44 M256 Chrome Smoothbore)',
    weightKg: '66,800 kg (Combat Weight)',
    muzzleVelocityMs: '1,670 m/s (M829A4 DU APFSDS-T)',
    effectiveRangeM: '4,000 m',
    rateOfFire: '8–10 rpm (Manual Bustle Loader)',
    description:
      'The U.S. Army’s flagship heavy main battle tank modeled at true 1:1 scale (9.77 m overall, 66.8 tonnes): combines the aviation-derived 1,500-SHP Honeywell AGT1500 multi-fuel gas turbine and Allison X1100-3B cross-drive transmission with a 36-round compartmentalized rear ammo bustle beneath roof blow-off vent panels, knee-actuated armored sliding blast doors, 7-layer Chobham/Depleted-Uranium (DU) NERA composite cheek armor, and the 120mm L/44 M256 smoothbore cannon.',
    highlights: [
      '120mm L/44 M256 Smoothbore (670 MPa · M829A4 DU Sabot Dart)',
      '36-Rd Isolated Ammo Bustle, Roof Blow-Off Panels & Sliding Blast Doors',
      'Honeywell AGT1500 1,500-SHP Gas Turbine & Allison X1100-3B Drive',
      '7-Layer Chobham/DU NERA Cheek Armor, CROWS-LP & 14 Torsion Bars',
    ],
    workbenchTitle: 'M1A2 SEP v3 Abrams 1:1 3D Teardown & Blast-Door Reload Cycle',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · 120mm M256 Recoil, Sliding Blast Doors & AGT1500 Gas Turbine',
    cutawayLabel: 'AGT1500 & Blast-Door Cutaway',
    cutawayTitle:
      'Switch to cutaway view and frame the Honeywell AGT1500 gas turbine, armored sliding blast doors, 36-rd bustle & M256 breech',
    searchPlaceholder:
      'Search tank module / BOM code (e.g. AGT1500, blast door, Chobham, 120mm, FC-03)...',
    firingMilestoneLabel: 'Blast-Door Reload',
  },
  leopard2a7: {
    shortLabel: 'Leopard 2A7V',
    name: 'KMW Leopard 2A7V Main Battle Tank',
    originCountry: 'Germany',
    weaponType: 'Main Battle Tank',
    statusLabel: 'Heavy Armor · 1:1 Ready',
    caliber: '120×570mm NATO (DM63A1 APFSDS)',
    compactCaliber: '120×570mm · DM63A1',
    actionMechanism:
      '120mm Rh-120 L/55A1 Smoothbore · Vertical Falling-Wedge Breech & Bustle Blast Door',
    overallLengthMm: '10,970 mm (6.6m Gun) / 7,700 mm (Hull)',
    barrelSpec: '6,600 mm (120mm Rh-120 L/55A1 High-Pressure Smoothbore)',
    weightKg: '66,500 kg (Combat Weight)',
    muzzleVelocityMs: '1,750 m/s (DM63A1 Tungsten APFSDS)',
    effectiveRangeM: '4,000 m',
    rateOfFire: '12–15 rpm (Manual Burst Loader)',
    description:
      'Krauss-Maffei Wegmann and Rheinmetall’s modernized Bundeswehr flagship modeled at true 1:1 scale (10.97 m overall, 66.5 tonnes): pairs the 6.60-meter 700 MPa Rh-120 L/55A1 smoothbore cannon and signature hinged hollow spaced Arrowhead composite turret wedges with PERI R17A3 / EMES-15 hunter-killer thermal optics, pneumatic bustle blast door (15 ready rounds + 27 forward hull rounds), and the 15-minute quick-swap 47.6L 1,500-HP MTU MB 873 V12 EuroPowerpack.',
    highlights: [
      '6,600 mm Rheinmetall Rh-120 L/55A1 Smoothbore (700 MPa · 1,750 m/s)',
      '1,500-HP MTU MB 873 V12 Diesel & RENK HSWL 354 Quick-Swap Powerpack',
      'Hinged Hollow Arrowhead Composite Turret Wedges & NATO 3-Tone Camo',
      '15-Rd Bustle Blast Door, 27-Rd Hull Bunker & PERI R17A3 / EMES-15',
    ],
    workbenchTitle: 'KMW Leopard 2A7V 1:1 3D Teardown & MTU V12 / L55A1 Cycle',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · 6.6m L/55A1 Recoil, Hollow Arrowhead Armor & MTU V12 EuroPowerpack',
    cutawayLabel: 'MTU V12 & Bustle Cutaway',
    cutawayTitle:
      'Switch to cutaway view and frame the 47.6L MTU MB 873 V12 diesel, RENK HSWL 354 gearbox, blast door & L/55A1 breech',
    searchPlaceholder:
      'Search tank module / BOM code (e.g. MTU V12, L/55A1, Arrowhead, RENK, FC-04)...',
    firingMilestoneLabel: 'Bustle DM63A1 Ram',
  },
  tiger1: {
    shortLabel: 'Tiger I (131)',
    name: 'Pz.Kpfw. VI Ausf. E "Tiger 131" Heavy Tank',
    originCountry: 'Germany',
    weaponType: 'Heavy Tank',
    statusLabel: 'Heavy Armor · 1:1 Ready',
    caliber: '88×571mmR (PzGr. 39 APCBC)',
    compactCaliber: '88×571mmR · PzGr. 39',
    actionMechanism:
      '88mm KwK 36 L/56 Rifled Cannon · Krupp Semi-Auto Horizontal Sliding-Wedge Breech',
    overallLengthMm: '8,450 mm (Gun Forward) / 6,316 mm (Hull)',
    barrelSpec: '4,930 mm (88mm KwK 36 L/56 · 32-RH Rifled)',
    weightKg: '57,000 kg (Combat Weight)',
    muzzleVelocityMs: '773 m/s (PzGr. 39 APCBC)',
    effectiveRangeM: '2,000 m (Direct Anti-Armor)',
    rateOfFire: '6–8 rpm (Semi-Auto Horizontal Wedge)',
    description:
      'Bovington Tank Museum’s world-famous "Tiger 131"—the planet’s only running original WWII Tiger I—recreated at true 1:1 scale (8.45 m overall, 57 tonnes): features 100 mm interlocking vertical Krupp RHA armor in 1943 Dunkelgelb and combed Zimmerit, horseshoe-curved turret, 48 overlapping Schachtellaufwerk interleaved road wheels on 725 mm tracks, rear 23.1L 700-HP Maybach HL230 V12 driving the front Olvar 8-speed gearbox through a central floor shaft, and the 88mm KwK 36 L/56 rifled cannon.',
    highlights: [
      '88mm KwK 36 L/56 Rifled Cannon, Twin-Baffle Brake & Horizontal Wedge',
      '48 Interleaved Schachtellaufwerk Wheels, 16 Torsion Bars & 725mm Tracks',
      '700-HP Maybach HL230 V12, Central Driveshaft & Front Olvar 8-Speed',
      '1943 Dunkelgelb RAL 7028 Camo, Zimmerit Relief & Elfenbein Interior',
    ],
    workbenchTitle: 'WWII Tiger 131 1:1 3D Teardown & 88mm Horizontal Wedge Cycle',
    workbenchSubtitle:
      '4 Assemblies · 26 CAD Parts · 88mm KwK 36 L/56, Interleaved Wheels, Maybach V12 & Olvar Drive',
    cutawayLabel: 'Maybach V12 & 88mm Cutaway',
    cutawayTitle:
      'Switch to cutaway view and frame the Maybach HL230 V12 engine, central driveshaft, Krupp horizontal breech & 88mm sponson racks',
    searchPlaceholder:
      'Search tank module / BOM code (e.g. 88mm, Maybach, interleaved, breech, FC-04)...',
    firingMilestoneLabel: 'Horizontal Wedge Open',
  },
};

export function getLocalizedShortWeaponLabel(
  weaponId: FallbackWeaponId,
  lang: LanguageCode
): string {
  if (lang === 'en') {
    return (
      WEAPON_EN_FALLBACKS[weaponId]?.shortLabel ?? getShortWeaponLabel(weaponId)
    );
  }
  return getShortWeaponLabel(weaponId);
}

const COMPACT_ZH_CALIBER: Partial<Record<FallbackWeaponId, string>> = {
  lift33: '400 gr 碳纤猎箭 · 70 lb',
  r500: '400 gr 碳素弩箭 · 300 lb',
  python: '.357 马格南',
  benellim4: '12号 00鹿弹',
  garand: '.30-06 春田步枪弹',
  m249: '5.56 NATO · M27弹链',
  p08: '9×19mm 帕拉贝鲁姆',
  vector: '.45 ACP · 230 gr',
  g11: '4.73×33 无壳弹',
  vss: '9×39 亚音速',
  m134: '7.62 NATO · 弹链',
  an94: '5.45×39 7N6',
  ztz99a: '125mm 滑膛 · DTC10',
  m1a2: '120×570mm · M829A4',
  leopard2a7: '120×570mm · DM63A1',
  tiger1: '88×571mmR · PzGr. 39',
};

export function getLocalizedCatalogSpecs(
  weaponId: FallbackWeaponId,
  lang: LanguageCode
) {
  const manifest = getWeaponManifest(weaponId);
  const cat = manifest.catalog;
  if (lang === 'zh') {
    return {
      caliber: cat.caliber,
      compactCaliber: COMPACT_ZH_CALIBER[weaponId] ?? cat.caliber,
      overallLengthMm: cat.specs1To1.overallLengthMm,
      barrelSpec: cat.specs1To1.barrelSpec,
      weightKg: cat.specs1To1.emptyWeightKg,
      muzzleVelocityMs: cat.specs1To1.muzzleVelocityMs,
      effectiveRangeM: cat.specs1To1.effectiveRangeM,
      rateOfFire: cat.specs1To1.rateOfFire,
    };
  }
  const fb = WEAPON_EN_FALLBACKS[weaponId];
  const caliber = fb.caliber ?? cat.caliber;
  return {
    caliber,
    compactCaliber: fb.compactCaliber ?? caliber,
    overallLengthMm: fb.overallLengthMm,
    barrelSpec: fb.barrelSpec,
    weightKg: fb.weightKg ?? cat.specs1To1.emptyWeightKg,
    muzzleVelocityMs: fb.muzzleVelocityMs ?? cat.specs1To1.muzzleVelocityMs,
    effectiveRangeM: fb.effectiveRangeM ?? cat.specs1To1.effectiveRangeM,
    rateOfFire: fb.rateOfFire,
  };
}

export function resolveWeaponDisplayMeta(
  weaponId: FallbackWeaponId,
  lang: LanguageCode,
  bundle: WeaponNarrationBundle | null
) {
  const manifest = getWeaponManifest(weaponId);
  const cat = manifest.catalog;
  const wb = manifest.workbenchMeta;
  const specs = getLocalizedCatalogSpecs(weaponId, lang);

  if (lang === 'zh') {
    return {
      shortLabel: manifest.shortLabel,
      name: cat.nameCn,
      originTag: cat.originCountryCn
        ? `${cat.originCountryCn} · ${cat.weaponTypeCn ?? cat.categoryCn}`
        : cat.categoryCn,
      statusLabel: cat.statusLabel,
      caliber: specs.caliber,
      compactCaliber: specs.compactCaliber,
      actionMechanism: cat.actionMechanism,
      overallLengthMm: specs.overallLengthMm,
      barrelSpec: specs.barrelSpec,
      weightKg: specs.weightKg,
      muzzleVelocityMs: specs.muzzleVelocityMs,
      effectiveRangeM: specs.effectiveRangeM,
      rateOfFire: specs.rateOfFire,
      description: cat.description,
      highlights: cat.highlights,
      workbenchTitle: wb.title,
      workbenchSubtitle: wb.subtitle,
      cutawayLabel: wb.cutawayLabel,
      cutawayTitle: wb.cutawayTitle,
      searchPlaceholder: wb.searchPlaceholder,
      firingMilestoneLabel: wb.firingMilestoneLabel ?? '出膛/开锁',
    };
  }

  const fb = WEAPON_EN_FALLBACKS[weaponId];
  const uiEn = bundle?.uiMetaEn;

  return {
    shortLabel: fb.shortLabel,
    name: uiEn?.name ?? fb.name,
    originTag: uiEn
      ? `${uiEn.originCountry} · ${uiEn.weaponType}`
      : `${fb.originCountry} · ${fb.weaponType}`,
    statusLabel: uiEn?.statusLabel ?? fb.statusLabel,
    caliber: specs.caliber,
    compactCaliber: specs.compactCaliber,
    actionMechanism: uiEn?.actionMechanism ?? fb.actionMechanism,
    overallLengthMm: specs.overallLengthMm,
    barrelSpec: specs.barrelSpec,
    weightKg: specs.weightKg,
    muzzleVelocityMs: specs.muzzleVelocityMs,
    effectiveRangeM: specs.effectiveRangeM,
    rateOfFire: uiEn?.rateOfFire ?? specs.rateOfFire,
    description: uiEn?.description ?? fb.description,
    highlights:
      uiEn?.highlights && uiEn.highlights.length > 0
        ? uiEn.highlights
        : fb.highlights,
    workbenchTitle: uiEn?.workbenchTitle ?? fb.workbenchTitle,
    workbenchSubtitle: uiEn?.workbenchSubtitle ?? fb.workbenchSubtitle,
    cutawayLabel: uiEn?.cutawayLabel ?? fb.cutawayLabel,
    cutawayTitle: uiEn?.cutawayTitle ?? fb.cutawayTitle,
    searchPlaceholder: uiEn?.searchPlaceholder ?? fb.searchPlaceholder,
    firingMilestoneLabel: uiEn?.firingMilestoneLabel ?? fb.firingMilestoneLabel,
  };
}

const WALNUT_HARDWOOD_PART_IDS = new Set<string>([
  'python_grip_left',
  'python_grip_right',
  'garand_walnut_stock',
  'garand_rear_handguard',
  'garand_front_handguard',
]);

const P08_EUROPEAN_WALNUT_PART_IDS = new Set<string>([
  'p08_grip_left',
  'p08_grip_right',
]);

const P08_STRAW_TEMPERED_PART_IDS = new Set<string>([
  'p08_takedown_lever',
  'p08_ejector',
  'p08_trigger',
  'p08_thumb_safety',
]);

/**
 * Resolves the localized engineering material description for a part, rendering
 * historically accurate American Black Walnut / European Walnut hardwood and
 * 240°C straw-tempered steel copy while preserving standard firearm/archery tables.
 */
export function resolvePartMaterialLabel(
  weaponId: WeaponId,
  part: Pick<WeaponPartSpec, 'id' | 'material'>,
  lang: LanguageCode
): string {
  const wid = weaponId as string;
  if (
    (wid === 'python' || wid === 'garand') &&
    part.material === 'polymer_frame' &&
    WALNUT_HARDWOOD_PART_IDS.has(part.id)
  ) {
    return lang === 'zh'
      ? '亚麻籽油浸润北美黑胡桃实木'
      : 'Linseed-Oiled American Black Walnut Hardwood';
  }
  if (
    wid === 'p08' &&
    part.material === 'polymer_frame' &&
    P08_EUROPEAN_WALNUT_PART_IDS.has(part.id)
  ) {
    return lang === 'zh'
      ? '亚麻籽油浸润欧洲胡桃木实木 (20线菱格)'
      : 'Linseed-Oiled European Walnut Hardwood (20-LPI Checkered)';
  }
  if (
    wid === 'p08' &&
    part.material === 'copper_accent' &&
    P08_STRAW_TEMPERED_PART_IDS.has(part.id)
  ) {
    return lang === 'zh'
      ? '240°C 金色麦秆回火军械钢 (Gelbangelassen)'
      : '240°C Straw-Tempered Ordnance Steel (Gelbangelassen)';
  }
  if (wid === 'm249' && part.id === 'm249_m27_belt') {
    return lang === 'zh'
      ? '锰磷化弹簧钢 M27 可散链节与黄铜实弹'
      : 'Manganese-Phosphate M27 Steel Links & Brass Cartridges';
  }
  if (wid === 'g11' && part.id === 'g11_optic_handle') {
    return lang === 'zh'
      ? '玻纤聚酰胺提把与 Hensoldt 1×/3.5× 多层镀膜光学镜组'
      : 'Glass-Filled Polyamide Housing & Hensoldt 1x/3.5x Coated Optics';
  }
  if (wid === 'g11' && part.id === 'g11_clockwork_gears') {
    return lang === 'zh'
      ? '瑞士钟表级 CNC 不锈钢与 C36000 自润滑黄铜行星齿轮'
      : 'Swiss-Watch CNC Stainless & C36000 Self-Lubricating Brass Gears';
  }
  if (wid === 'g11' && part.id === 'g11_mag_tube') {
    return lang === 'zh'
      ? '烟熏半透明强化聚碳酸酯匣体与 HITP 方形无壳药块'
      : 'Smoked Reinforced Polycarbonate Tube & HITP Caseless Propellant Blocks';
  }
  if (wid === 'vss' && part.id === 'vss_wood_stock') {
    return lang === 'zh'
      ? '手擦琥珀俄制桦木层压实木与硫化橡胶托垫'
      : 'Hand-Rubbed Russian Laminated Birchwood & Rubber Buttpad';
  }
  if (wid === 'vss' && part.id === 'vss_pso1_scope') {
    return lang === 'zh'
      ? '锤纹灰烤漆铸造镁铝合金镜体与多层镀膜光学镜片'
      : 'Hammer-Tone Gray Cast Magnesium Alloy & Multi-Coated Optics';
  }
  if (wid === 'm134' && part.id === 'm134_drive_motor') {
    return lang === 'zh'
      ? '航空级阳极氧化散热机壳与 28V 漆包铜电枢绕组'
      : 'Aerospace Anodized Motor Stator & 28V Enameled Copper Windings';
  }
  if (wid === 'm134' && part.id === 'm134_ammo_chute') {
    return lang === 'zh'
      ? '铰接不锈钢波纹输弹槽、M13 磷化钢链与 7.62 NATO 黄铜实弹'
      : 'Articulated Stainless Feed Chute, M13 Steel Links & 7.62 NATO Brass';
  }
  if (wid === 'an94' && part.id === 'an94_steel_cable') {
    return lang === 'zh'
      ? '多股高疲劳编织不锈钢传动钢索与黄铜压接套'
      : 'Multi-Strand Braided Aerospace Stainless Drive Cable & Brass Ferrules';
  }
  if (wid === 'an94' && part.id === 'an94_feed_rammer') {
    return lang === 'zh'
      ? '自润滑青铜与硬铬钢二级预供弹拨弹滑块'
      : 'Self-Lubricating Bronze & Hard-Chrome 2-Stage Pre-Feed Rammer';
  }
  if (wid === 'an94' && part.id === 'an94_mag_body') {
    return lang === 'zh'
      ? '伊热夫斯克李子黑玻纤增强聚酰胺 (ПА66-ГФ)'
      : 'Izhmash Plum-Black Glass-Filled Polyamide (PA66-GF)';
  }
  if (
    wid === 'ztz99a' &&
    (part.id === 'ztz99a_era_wedges' || part.id === 'ztz99a_glacis_era')
  ) {
    return lang === 'zh'
      ? 'FY-4 双防爆炸反应装甲与高硬轧制复合钢板'
      : 'FY-4 Dual-Purpose ERA & High-Hardness Composite Armor Steel';
  }
  if (wid === 'ztz99a' && part.id === 'ztz99a_v12_engine') {
    return lang === 'zh'
      ? '150HB 铸造铝合金 V12 缸体、银铝涡轮与青铜排气歧管'
      : '150HB Cast-Aluminum V12 Block, Alloy Turbos & Bronze Exhaust';
  }
  if (wid === 'm1a2' && part.id === 'm1a2_composite_armor') {
    return lang === 'zh'
      ? '乔巴姆 / 第三代贫铀 (DU) 陶瓷-高硬钢 NERA 多层复合装甲'
      : 'Chobham / 3rd-Gen Depleted-Uranium (DU) Ceramic-Steel NERA Armor';
  }
  if (wid === 'm1a2' && part.id === 'm1a2_agt1500_turbine') {
    return lang === 'zh'
      ? '航空钛合金压气机叶片与暖铜褶皱环形废气回热器'
      : 'Aerospace Titanium Compressor Blades & Copper Annular Recuperator';
  }
  if (wid === 'leopard2a7' && part.id === 'leo_arrowhead_wedges') {
    return lang === 'zh'
      ? '中空间隙 NERA 高硬装甲钢与弹性体复合箭簇模块'
      : 'Spaced Hollow NERA High-Hardness Steel & Elastomer Arrowhead Armor';
  }
  if (wid === 'leopard2a7' && part.id === 'leo_mtu_v12') {
    return lang === 'zh'
      ? 'MTU MB 873 铸造铝合金 V12 缸体、双蜗壳增压与铜中冷管'
      : 'MTU MB 873 Cast-Aluminum V12 Block, Twin Turbos & Copper Intercooler';
  }
  if (
    wid === 'tiger1' &&
    (part.id === 'tiger_hull_box' || part.id === 'tiger_turret_shell')
  ) {
    return lang === 'zh'
      ? '克虏伯 100mm 表面硬化轧制均质钢 (RHA) 与防磁水泥 (Zimmerit)'
      : 'Krupp 100mm Face-Hardened Rolled Homogeneous Steel & Zimmerit Paste';
  }
  if (wid === 'tiger1' && part.id === 'tiger_maybach_v12') {
    return lang === 'zh'
      ? '迈巴赫 HL230 铸铁 V12 缸体、铝制化油器与耐热铸铁歧管'
      : 'Maybach HL230 Cast-Iron V12 Block, Alloy Carburetors & Iron Manifolds';
  }
  const insp = UI_STRINGS[lang].inspector;
  if (isArcheryWeapon(weaponId)) {
    return insp.archery.materials[part.material] ?? insp.materials[part.material];
  }
  return insp.materials[part.material];
}

/**
 * Returns the compact 3D callout label in active `lang`.
 * Uses `narrationPart.calloutLabelEn` if available, else compacts `part.nameEn`.
 */
export function resolvePartCalloutLabel(
  part: WeaponPartSpec,
  lang: LanguageCode,
  narrationPart?: PartNarrationEntry | null
): string {
  if (lang === 'zh') return part.calloutLabel;
  if (narrationPart?.calloutLabelEn) {
    return narrationPart.calloutLabelEn;
  }
  const stripped = part.nameEn.replace(/\s*\([^)]*\)/g, '').trim();
  if (stripped.length <= 25) return stripped;
  const words = stripped.split(/\s+/);
  let acc = '';
  for (let i = 0; i < words.length; i++) {
    const next = acc ? `${acc} ${words[i]}` : words[i];
    if (next.length > 24 && acc.length >= 8) break;
    acc = next;
  }
  return acc || stripped.slice(0, 24);
}

const GENERIC_FIRING_PHASE_EN: Record<
  string,
  { shortLabel: string; title: string; description: string }
> = {
  '01': {
    shortLabel: 'Trigger & Sear',
    title: 'Phase 1 · Trigger Pull & Sear Release',
    description:
      'Pressing the trigger disengages the sear and releases the hammer or striker forward under main-spring tension.',
  },
  '02': {
    shortLabel: 'Primer Ignition',
    title: 'Phase 2 · Firing Pin Impact & Ignition',
    description:
      'With the breech locked in battery, the firing pin indents the primer and ignites the propellant charge inside the case.',
  },
  '03': {
    shortLabel: 'Bore & Gas/Recoil',
    title: 'Phase 3 · Bullet Acceleration & Muzzle Exit',
    description:
      'Expanding gases accelerate the projectile down the rifled bore while initiating gas bleed or short-recoil impulse.',
  },
  '04': {
    shortLabel: 'Breech Unlock',
    title: 'Phase 4 · Pressure Drop & Breech Unlocking',
    description:
      'Once chamber pressure drops to a safe level, the cam geometry unlocks the bolt or barrel hood from the receiver.',
  },
  '05': {
    shortLabel: 'Extract & Eject',
    title: 'Phase 5 · Case Extraction, Cocking & Ejection',
    description:
      'The extractor draws the spent case rearward, recocking the fire-control mechanism and ejecting the brass clear of the port.',
  },
  '06': {
    shortLabel: 'Feed & Lockup',
    title: 'Phase 6 · Magazine Strip, Chambering & Lockup',
    description:
      'Compressed recoil springs drive the action forward, stripping the next cartridge into the chamber and locking into battery.',
  },
  '07': {
    shortLabel: 'Sear Reset',
    title: 'Phase 7 · Trigger Release & Disconnector Reset',
    description:
      'Releasing the trigger transfers engagement from the disconnector back to the primary sear, readying the next shot.',
  },
};

export function resolveTimelinePresetText(
  preset: TimelinePresetItem,
  lang: LanguageCode,
  bundle: WeaponNarrationBundle | null
): { label: string; subLabel: string; desc: string } {
  if (lang === 'zh') {
    return {
      label: preset.label,
      subLabel: preset.subLabel,
      desc: preset.desc,
    };
  }
  const translated = bundle?.uiMetaEn.timelinePresets[preset.id];
  if (translated) return translated;

  const fallbackLabel =
    preset.t <= 0.05
      ? 'Assembled'
      : preset.t <= 0.4
        ? 'Field Strip'
        : preset.t <= 0.75
          ? 'Sub-Strip'
          : 'Full Explode';
  return {
    label: fallbackLabel,
    subLabel: preset.subLabel,
    desc: `${fallbackLabel} (${preset.subLabel})`,
  };
}

export function resolveFiringPhaseText(
  phase: FiringPhaseInfo,
  lang: LanguageCode,
  bundle: WeaponNarrationBundle | null
): { shortLabel: string; title: string; description: string } {
  if (lang === 'zh') {
    return {
      shortLabel: phase.shortLabel,
      title: phase.title,
      description: phase.description,
    };
  }
  const translated = bundle?.uiMetaEn.firingPhases[phase.id];
  if (translated) return translated;
  return (
    GENERIC_FIRING_PHASE_EN[phase.stepNum] ?? {
      shortLabel: `Phase ${phase.stepNum}`,
      title: `Phase ${phase.stepNum}`,
      description: 'Synchronized mechanical operating cycle phase.',
    }
  );
}
