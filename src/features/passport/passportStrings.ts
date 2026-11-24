import type { LanguageCode } from '../../narration/types';
import { MUSEUM_EXHIBIT_COUNT } from '../../weapons/museumMetrics';
import type { ArmoryCategory } from '../../weapons/types';

export interface PassportLocaleStrings {
  badge: string;
  title: string;
  subtitle: string;
  close: string;
  overallProgress: string;
  certifiedCount: string;
  dualCertifiedCount: string;
  detailCertifiedCount: string;
  hallBreakdownTitle: string;
  hallBreakdownAria: string;
  halls: Readonly<Record<ArmoryCategory, string>>;
  filterGroupAria: string;
  filterAll: (count: number) => string;
  filterCertified: (count: number) => string;
  filterPending: (count: number) => string;
  emptyFilterTitle: string;
  resetFilterBtn: string;
  exportBtn: string;
  importBtn: string;
  clearBtn: string;
  importSuccess: (count: number) => string;
  importError: string;
  exportedNotice: string;
  tableCols: {
    exhibit: string;
    fieldStrip: string;
    detailStrip: string;
    triage: string;
    bestTime: string;
    overall: string;
  };
  uncertified: string;
  inspectBtn: string;
  launchDrillBtn: string;
}

export const PASSPORT_STRINGS: Record<LanguageCode, PassportLocaleStrings> = {
  zh: {
    badge: '军械师资格认证 · PASSPORT',
    title: `全馆 ${MUSEUM_EXHIBIT_COUNT} 款展品机械资质护照与履历档案`,
    subtitle:
      '汇总全部名枪、复合弓弩、主战坦克与航空重武的野战盲拆、军械所全拆与故障盲考 S/A/B/C 等级，支持 JSON 离线导出与跨设备恢复',
    close: '关闭护照档案',
    overallProgress: '全馆认证进度',
    certifiedCount: '已取证展品',
    dualCertifiedCount: '双料认证（快拆+排障）',
    detailCertifiedCount: '军械所全拆取证',
    hallBreakdownTitle: '10 大展厅精通分布',
    hallBreakdownAria: '按十大展厅筛选展品认证进度',
    halls: {
      all: '全部 10 展厅',
      assault: '步枪/无托',
      lmg: '轻重机枪',
      smg: '冲锋枪',
      sniper: '狙击/反器材',
      shotgun: '霰弹枪',
      pistol: '手枪/左轮',
      archery: '复合弓弩',
      armor: '重装甲大厅',
      ordnance: '航空重武',
    },
    filterGroupAria: '按认证状态筛选展品',
    filterAll: (count) => `全部 ${count} 款`,
    filterCertified: (count) => `已取证 (${count})`,
    filterPending: (count) => `待考核 (${count})`,
    emptyFilterTitle: '当前筛选条件下暂无匹配展品记录',
    resetFilterBtn: `显示全部 ${MUSEUM_EXHIBIT_COUNT} 款展品`,
    exportBtn: '导出护照 JSON',
    importBtn: '导入恢复护照',
    clearBtn: '清空本地记录',
    importSuccess: (count) => `已成功校验并导入 ${count} 条展品认证记录！`,
    importError: '护照 JSON 格式校验失败，请确认文件来源于 Digital Armory 3D。',
    exportedNotice: '已下载军械师认证护照 JSON 备份文件。',
    tableCols: {
      exhibit: '展品编号 / 型号',
      fieldStrip: '野战快拆',
      detailStrip: '全拆精修',
      triage: '故障盲考',
      bestTime: '最快拆装用时',
      overall: '综合评级',
    },
    uncertified: '待考核',
    inspectBtn: '开始实操考核',
    launchDrillBtn: '开始实操考核',
  },
  en: {
    badge: 'ARMORER CERTIFICATION · PASSPORT',
    title: `${MUSEUM_EXHIBIT_COUNT}-Exhibit Armorer Certification Ledger & Passport`,
    subtitle:
      `Unified S/A/B/C mastery matrix spanning Service Field-Strip, Detail Strip, and Blind Triage across all ${MUSEUM_EXHIBIT_COUNT} exhibits with portable JSON backup`,
    close: 'Close Armorer Passport',
    overallProgress: 'Museum Certification Progress',
    certifiedCount: 'Certified Exhibits',
    dualCertifiedCount: 'Dual Certified',
    detailCertifiedCount: 'Detail Overhaul Certified',
    hallBreakdownTitle: '10-Hall Mastery Breakdown',
    hallBreakdownAria: 'Filter certification ledger across museum halls',
    halls: {
      all: 'All 10 Halls',
      assault: 'Assault',
      lmg: 'LMG',
      smg: 'SMG',
      sniper: 'Sniper',
      shotgun: 'Shotgun',
      pistol: 'Pistol',
      archery: 'Archery',
      armor: 'Heavy Armor',
      ordnance: 'Heavy Ordnance',
    },
    filterGroupAria: 'Filter exhibits by certification status',
    filterAll: (count) => `All ${count}`,
    filterCertified: (count) => `Certified (${count})`,
    filterPending: (count) => `Pending (${count})`,
    emptyFilterTitle: 'No exhibits match the current filter criteria',
    resetFilterBtn: `Show All ${MUSEUM_EXHIBIT_COUNT} Exhibits`,
    exportBtn: 'Export Passport JSON',
    importBtn: 'Import Passport JSON',
    clearBtn: 'Reset Ledger',
    importSuccess: (count) =>
      `Validated and imported certification records for ${count} exhibits.`,
    importError:
      'Invalid passport JSON envelope; ensure file was exported from Digital Armory 3D.',
    exportedNotice: 'Armorer Mastery Passport JSON downloaded.',
    tableCols: {
      exhibit: 'Exhibit / Designation',
      fieldStrip: 'Field Strip',
      detailStrip: 'Detail Overhaul',
      triage: 'Blind Triage',
      bestTime: 'Best Time',
      overall: 'Overall Rank',
    },
    uncertified: 'Pending',
    inspectBtn: 'Launch Drill',
    launchDrillBtn: 'Launch Drill',
  },
};
