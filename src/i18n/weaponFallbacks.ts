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

export interface WeaponEnglishFallback {
  shortLabel: string;
  name: string;
  originCountry: string;
  weaponType: string;
  statusLabel: string;
  actionMechanism: string;
  overallLengthMm: string;
  barrelSpec: string;
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

export const WEAPON_EN_FALLBACKS: Record<WeaponId, WeaponEnglishFallback> = {
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
};

export function getLocalizedShortWeaponLabel(
  weaponId: WeaponId,
  lang: LanguageCode
): string {
  if (lang === 'en') {
    return (
      WEAPON_EN_FALLBACKS[weaponId]?.shortLabel ?? getShortWeaponLabel(weaponId)
    );
  }
  return getShortWeaponLabel(weaponId);
}

export function resolveWeaponDisplayMeta(
  weaponId: WeaponId,
  lang: LanguageCode,
  bundle: WeaponNarrationBundle | null
) {
  const manifest = getWeaponManifest(weaponId);
  const cat = manifest.catalog;
  const wb = manifest.workbenchMeta;

  if (lang === 'zh') {
    return {
      shortLabel: manifest.shortLabel,
      name: cat.nameCn,
      originTag: cat.originCountryCn
        ? `${cat.originCountryCn} · ${cat.weaponTypeCn ?? cat.categoryCn}`
        : cat.categoryCn,
      statusLabel: cat.statusLabel,
      actionMechanism: cat.actionMechanism,
      overallLengthMm: cat.specs1To1.overallLengthMm,
      barrelSpec: cat.specs1To1.barrelSpec,
      rateOfFire: cat.specs1To1.rateOfFire,
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
    actionMechanism: uiEn?.actionMechanism ?? fb.actionMechanism,
    overallLengthMm: fb.overallLengthMm,
    barrelSpec: fb.barrelSpec,
    rateOfFire: uiEn?.rateOfFire ?? fb.rateOfFire,
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
      description: phase.description,
    }
  );
}
