import React, { useEffect, useState } from 'react';
import {
  Check,
  Download,
  Image as ImageIcon,
  Layers,
  Sparkles,
  X,
} from 'lucide-react';
import { AUG_PBR_SUITES } from '../data/weapons/augModule';
import { AWM_PBR_SUITES } from '../data/weapons/awmModule';
import { DEAGLE_PBR_SUITES } from '../data/weapons/deagleModule';
import { M4A1_PBR_SUITES } from '../data/weapons/m4a1Module';
import { M82A1_PBR_SUITES } from '../data/weapons/m82a1Module';
import { MP5_PBR_SUITES } from '../data/weapons/mp5Module';
import { P320_PBR_SUITES } from '../data/weapons/p320Module';
import { SCAR_PBR_SUITES } from '../data/weapons/scarModule';
import { useExplodeStore } from '../store/useExplodeStore';

export interface PbrSuiteItem {
  id: string;
  weapon: string;
  titleCn: string;
  partTag: string;
  resolution: string;
  summary: string;
  highlights: string[];
  channels: {
    kind: 'Albedo' | 'Normal' | 'Roughness';
    labelCn: string;
    url: string;
    fileName: string;
    note: string;
  }[];
}

function makeSeamlessInternalSuite(
  weapon: string,
  titleCn: string,
  partTag: string,
  summary: string,
  highlights: string[],
  metalNote: string,
  polymerNote: string
): PbrSuiteItem {
  return {
    id: `${weapon}_seamless_detail`,
    weapon,
    titleCn,
    partTag,
    resolution: '512 × 512 px (Seamless)',
    summary,
    highlights,
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        url: '/textures/metal_detail_normal.png',
        fileName: 'metal_detail_normal.png',
        note: metalNote,
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        url: '/textures/metal_detail_roughness.png',
        fileName: 'metal_detail_roughness.png',
        note: 'Linear · 金属微表面各向异性枪油光泽起伏',
      },
      {
        kind: 'Normal',
        labelCn: '工程聚酰胺皮纹法线 (Seamless)',
        url: '/textures/polymer_detail_normal.png',
        fileName: 'polymer_detail_normal.png',
        note: polymerNote,
      },
    ],
  };
}

const AK15_SUITES: PbrSuiteItem[] = [
  {
    id: 'ak_receiver',
    weapon: 'ak15',
    titleCn: '伊热夫斯克冲压钢机匣与烤漆铭文贴图组',
    partTag: 'R-01 / B-01 RECEIVER',
    resolution: '2048 × 1024 px',
    summary:
      '参考卡拉什尼科夫集团 6П71М (AK-15M1) 真铁实拍：还原俄式磷化底漆黑色苯胺烤漆 (Нигрозин)、机匣点焊凹坑与铆钉高光、右侧西里尔字母 ПР/АВ/ОД 档位钢印与标志性快慢机圆弧划痕，以及左侧原厂厂徽序列号。',
    highlights: [
      '右侧 ПР / АВ / ОД 钢印与快慢机圆弧划痕',
      '左侧 [КК] АК-15 7,62×39 · 6П71М 铭文',
      '1.5mm 冲压钢棱边露白与点焊凹坑法线',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        url: '/textures/ak_receiver_albedo.png',
        fileName: 'ak_receiver_albedo.png',
        note: 'sRGB · 俄式黑烤漆 / 西里尔白字铭文 / 快慢机划痕露白',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        url: '/textures/ak_receiver_normal.png',
        fileName: 'ak_receiver_normal.png',
        note: 'Linear · 冲压点焊凹坑 + 档位压印凹槽 + 划痕法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        url: '/textures/ak_receiver_roughness.png',
        fileName: 'ak_receiver_roughness.png',
        note: 'Linear · 烤漆半亚光底面 vs 导轨/棱边摩擦低粗糙度',
      },
    ],
  },
  {
    id: 'ak_mag',
    weapon: 'ak15',
    titleCn: '7.62×39mm 透明观察窗弧形弹匣贴图组',
    partTag: 'M-01 WINDOWED MAG',
    resolution: '1024 × 1024 px',
    summary:
      '专为新一代 AK-15 30 发玻纤聚酰胺 (ПА6С) 大弯弧弹匣制作：包含斜向防滑加强筋、10/15/20/25/30 发余弹白字刻度、烟熏聚碳酸酯透明侧窗内双排黄铜/覆铜 7.62mm 实弹视觉层，以及前后钢衬抱弹口磨损。',
    highlights: [
      '烟熏透明观察窗内 7.62×39mm 实弹叠排细节',
      '侧壁 10 / 15 / 20 / 25 / 30 余弹刻度钢印',
      '透明窗镜面低粗糙度 vs 聚酰胺壳体哑光对比',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        url: '/textures/ak_mag_albedo.png',
        fileName: 'ak_mag_albedo.png',
        note: 'sRGB · 哑光黑聚酰胺 / 观察窗黄铜弹壳 / 余弹数字刻字',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        url: '/textures/ak_mag_normal.png',
        fileName: 'ak_mag_normal.png',
        note: 'Linear · 弹匣斜向防滑凸筋 + 观察窗镶嵌台阶法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        url: '/textures/ak_mag_roughness.png',
        fileName: 'ak_mag_roughness.png',
        note: 'Linear · 聚碳酸酯视窗高光 (0.14) vs 防滑筋哑光 (0.78)',
      },
    ],
  },
  {
    id: 'ak_metal',
    weapon: 'ak15',
    titleCn: '长行程镀铬导气活塞高温烧蚀与枪机贴图组',
    partTag: 'B-03 / R-02 PISTON & BARREL',
    resolution: '1024 × 1024 px',
    summary:
      '刻画长行程活塞自动机特有的射击热力学痕迹：后段黑色机加工枪机框带有导轨纵向往复亮痕，前段硬铬不锈钢活塞杆呈现高温燃气烘烤的金褐/蓝紫回火渐变色，活塞头环槽附着真实火药积碳。',
    highlights: [
      '镀硬铬活塞杆金褐至蓝紫高温回火色渐变',
      '活塞头燃气冲击端面黑色火药积碳层',
      '枪机框导轨与螺旋凸轮槽往复摩擦亮带',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        url: '/textures/ak_metal_albedo.png',
        fileName: 'ak_metal_albedo.png',
        note: 'sRGB · 黑磷化枪机框 / 亮铬活塞杆 / 热回火色与积碳',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        url: '/textures/ak_metal_normal.png',
        fileName: 'ak_metal_normal.png',
        note: 'Linear · 车床精细环形刀纹 + 活塞闭气环槽微凹凸',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        url: '/textures/ak_metal_roughness.png',
        fileName: 'ak_metal_roughness.png',
        note: 'Linear · 镜面硬铬活塞杆 (0.18) vs 积碳端面哑光 (0.86)',
      },
    ],
  },
  {
    id: 'ak_detail',
    weapon: 'ak15',
    titleCn: 'EVO 战术枪托护木与火控内件无缝细节贴图',
    partTag: '22 FURNITURE & FCG PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为 2023 EVO 折叠枪托、高低可调贴腮板、浮置隔热上下护木、一体握把护圈及回转击锤双钩扳机火控组提供无缝平铺的 CNC 金属拉丝与玻纤聚酰胺注塑皮纹细节。',
    highlights: [
      'EVO 枪托与浮置护木玻纤聚酰胺微皮纹',
      '回转击锤、双钩扳机、双突笋枪机 CNC 金属拉丝',
      '覆盖其余全部 22 个战术护木与内部机械节点',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        url: '/textures/metal_detail_normal.png',
        fileName: 'metal_detail_normal.png',
        note: 'Linear · 用于双突笋枪机/击锤/扳机/导气箍/消焰器等',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        url: '/textures/metal_detail_roughness.png',
        fileName: 'metal_detail_roughness.png',
        note: 'Linear · 金属微表面各向异性枪油光泽起伏',
      },
      {
        kind: 'Normal',
        labelCn: '工程聚酰胺皮纹法线 (Seamless)',
        url: '/textures/polymer_detail_normal.png',
        fileName: 'polymer_detail_normal.png',
        note: 'Linear · 用于 EVO 枪托/贴腮板/上下护木/一体握把',
      },
    ],
  },
];

const G17_SUITES: PbrSuiteItem[] = [
  {
    id: 'slide',
    weapon: 'g17',
    titleCn: '套筒 Tenifer 氮化钢贴图组',
    partTag: 'U-01 SLIDE',
    resolution: '2048 × 1024 px',
    summary:
      '参考真铁 Gen3 G17 实拍微距制作：还原 Tenifer 氮化磷化钢微晶颗粒、枪油暗云斑、套筒肩棱与枪口快拔银亮磨损、抛壳口后沿黄铜擦痕，以及双侧凹刻原厂铭文。',
    highlights: [
      '左侧凹刻 [G] 17 AUSTRIA 9×19',
      '右侧钢印检验盾徽 + KPV 892',
      '肩棱快拔银色露白与油膜粗糙度变化',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        url: '/textures/slide_albedo.png',
        fileName: 'slide_albedo.png',
        note: 'sRGB · 氮化钢底色 / 刻字色差 / 棱边露白 / 黄铜擦痕',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        url: '/textures/slide_normal.png',
        fileName: 'slide_normal.png',
        note: 'Linear · 凹刻铭文深度斜坡 + CNC 横向拉丝微凹凸',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        url: '/textures/slide_roughness.png',
        fileName: 'slide_roughness.png',
        note: 'Linear · 棱边抛光低粗糙度 vs 磷化亚光与油斑对比',
      },
    ],
  },
  {
    id: 'frame',
    weapon: 'g17',
    titleCn: '下机匣玻纤尼龙与 Gen3 防滑纹贴图组',
    partTag: 'F-01 RECEIVER',
    resolution: '1536 × 1536 px',
    summary:
      '还原玻纤增强尼龙 66 注塑模具 EDM 电火花皮纹、握把双侧 -20° 倾角 Gen3 粗颗粒金字塔防滑区、凹槽原厂徽标铭牌，以及导轨下方嵌入式不锈钢序列号牌。',
    highlights: [
      'EDM 注塑细皮纹 + Gen3 金字塔防滑凸点',
      '握把凹框浮雕 G17 / GEN 3 铭牌',
      '导轨底部 KPV 892 US 激光蚀刻钢牌',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        url: '/textures/frame_albedo.png',
        fileName: 'frame_albedo.png',
        note: 'sRGB · 深炭黑尼龙 / 握把防滑深色嵌块 / 不锈钢导轨与铭牌',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        url: '/textures/frame_normal.png',
        fileName: 'frame_normal.png',
        note: 'Linear · 高频金字塔防滑颗粒凸起 + 浮雕铭牌边缘',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        url: '/textures/frame_roughness.png',
        fileName: 'frame_roughness.png',
        note: 'Linear · 防滑区高漫反射哑光 vs 手握处微油脂光泽',
      },
    ],
  },
  {
    id: 'barrel',
    weapon: 'g17',
    titleCn: '冷锻多边形枪管与闭锁节套贴图组',
    partTag: 'U-04 BARREL',
    resolution: '1024 × 1024 px',
    summary:
      '针对抛壳窗外露区域与分解态定制：节套右侧雕刻 9×19 口径与 KPV 892 序列号，节套顶面带有开闭锁纵向摩擦亮带，管身前段还原标志性的环形咬合磨损纹 (Glock Smile)。',
    highlights: [
      '抛壳窗可见 9×19 + 检验徽 + KPV 892',
      '管身前段环形摩擦亮圈 (Glock Smile)',
      '高光镜面抛光供弹坡与枪口冠面色块',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        url: '/textures/barrel_albedo.png',
        fileName: 'barrel_albedo.png',
        note: 'sRGB · 碳氮共渗钢色 / 环形磨白亮圈 / 镜面供弹坡',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        url: '/textures/barrel_normal.png',
        fileName: 'barrel_normal.png',
        note: 'Linear · 车削环纹细节 + 弹膛右侧深压钢印法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        url: '/textures/barrel_roughness.png',
        fileName: 'barrel_roughness.png',
        note: 'Linear · 摩擦咬合圈与供弹坡呈低粗糙度镜面反射',
      },
    ],
  },
  {
    id: 'mag',
    weapon: 'g17',
    titleCn: '双排弹匣壳体与余弹刻度贴图组',
    partTag: 'M-01 MAGAZINE',
    resolution: '1024 × 1024 px',
    summary:
      '对应弹匣背面 6 个交错余弹观察孔精准排布 4 / 6 / 8 / 10 / 12 / 17 发刻度与 9mm 标识，右侧压印 [G] 9×19 徽标，并包含插拔纵向擦痕与顶部不锈钢内衬色块。',
    highlights: [
      '背面 4..17 发观察孔对齐数字钢印',
      '右侧压印原厂 [G] 9×19 标识',
      '弹匣井反复插拔纵向轻微擦痕',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        url: '/textures/mag_albedo.png',
        fileName: 'mag_albedo.png',
        note: 'sRGB · 聚合物壳体 / 余弹数字刻字 / 钢制抱弹口色块',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        url: '/textures/mag_normal.png',
        fileName: 'mag_normal.png',
        note: 'Linear · 数字压痕凹陷 + 聚合物注塑微颗粒法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        url: '/textures/mag_roughness.png',
        fileName: 'mag_roughness.png',
        note: 'Linear · 插拔摩擦滑道光泽变化与钢制内衬对比',
      },
    ],
  },
  {
    id: 'detail',
    weapon: 'g17',
    titleCn: '内部精密机加工金属与注塑件无缝细节贴图',
    partTag: '24 INTERNAL PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为击针、抽壳钩、扳机连杆、闭锁块、复进簧组件及聚合物内件提供可无缝平铺 (Repeat Wrapping) 的微米级 CNC 金属拉丝法线与注塑皮纹粗糙度贴图。',
    highlights: [
      '精密冲压/铣削金属拉丝无缝法线',
      '注塑工程塑料皮纹无缝法线与粗糙度',
      '覆盖其余全部 24 个火控与套筒内件',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        url: '/textures/metal_detail_normal.png',
        fileName: 'metal_detail_normal.png',
        note: 'Linear · 用于击针/连杆/抽壳钩/闭锁块等金属内件',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        url: '/textures/metal_detail_roughness.png',
        fileName: 'metal_detail_roughness.png',
        note: 'Linear · 金属微表面各向异性光泽起伏',
      },
      {
        kind: 'Normal',
        labelCn: '工程塑料皮纹法线 (Seamless)',
        url: '/textures/polymer_detail_normal.png',
        fileName: 'polymer_detail_normal.png',
        note: 'Linear · 用于扳机护圈内件/背板/底盖/托弹板等',
      },
    ],
  },
];

interface WeaponPbrAtlasGroup {
  weaponId: string;
  bayCode: string;
  pillLabel: string;
  headingCn: string;
  suites: PbrSuiteItem[];
}

const WEAPON_PBR_ATLAS_GROUPS: WeaponPbrAtlasGroup[] = [
  {
    weaponId: 'ak15',
    bayCode: 'BAY-01',
    pillLabel: 'AK-15M1',
    headingCn:
      'AK-15M1 (6П71М) 真实物理材质贴图库 (Albedo / Normal / Roughness)',
    suites: AK15_SUITES,
  },
  {
    weaponId: 'm4a1',
    bayCode: 'BAY-02',
    pillLabel: 'M4A1',
    headingCn:
      'Colt M4A1 RAS 卡宾枪物理材质贴图库 (Albedo / Normal / Roughness)',
    suites: [
      ...M4A1_PBR_SUITES,
      makeSeamlessInternalSuite(
        'm4a1',
        '气吹枪机框、KAC RAS 导轨与六档伸缩托无缝细节贴图',
        '23 BCG & FURNITURE PARTS',
        '为铆固气匙枪机框、七突笋回转枪机、不锈钢气吹导气管、KAC RAS 四导轨护木、14.5" 阶梯枪管及华夫格六档伸缩托提供无缝 CNC 拉丝与尼龙皮纹细节。',
        [
          '磷化钢枪机框、七突笋枪机与阶梯枪管精密拉丝法线',
          'KAC M4 RAS 护木与六档华夫格枪托微喷砂注塑皮纹',
          '覆盖其余全部 23 个导气、缓冲与火控内件',
        ],
        'Linear · 用于气匙枪机框/七突笋枪机/导气管/A字准星座/H2缓冲器等',
        'Linear · 用于六档华夫格伸缩托/A2握把/护木隔热片/托弹板等'
      ),
    ],
  },
  {
    weaponId: 'mp5',
    bayCode: 'BAY-03',
    pillLabel: 'MP5A3',
    headingCn:
      'H&K MP5A3 滚柱延迟冲锋枪物理材质贴图库 (Albedo / Normal / Roughness)',
    suites: [
      ...MP5_PBR_SUITES,
      makeSeamlessInternalSuite(
        'mp5',
        '双滚柱闭锁枪机、三突笋枪管与伸缩钢托无缝细节贴图',
        '24 ROLLER-BOLT & STOCK PARTS',
        '为双圆柱闭锁滚柱、45° 闭锁楔铁、机头、非随动拉机柄、旋转鼓式照门、双导轨伸缩钢托与热带宽护木提供微米级金属磨削与聚酰胺注塑法线细节。',
        [
          '双闭锁滚柱与 45° 楔铁高精度磨削金属拉丝法线',
          'MP5A3 双钢轨伸缩托与 30 发弯弧钢弹匣油膜光泽',
          '覆盖其余全部 24 个滚柱枪机、瞄具与火控内件',
        ],
        'Linear · 用于双闭锁滚柱/45°闭锁楔/枪机框/三突笋枪管/弯钢弹匣等',
        'Linear · 用于热带宽体前护木/拉机柄拍柄/伸缩托橡胶缓冲垫等'
      ),
    ],
  },
  {
    weaponId: 'g17',
    bayCode: 'BAY-04',
    pillLabel: 'Glock 17',
    headingCn: 'G17 Gen3 真实物理材质贴图库 (Albedo / Normal / Roughness)',
    suites: G17_SUITES,
  },
  {
    weaponId: 'm82a1',
    bayCode: 'BAY-05',
    pillLabel: 'M82A1',
    headingCn:
      'Barrett M82A1 (.50 BMG) 反器材步枪贴图库 (Albedo / Normal / Roughness)',
    suites: [
      ...M82A1_PBR_SUITES,
      makeSeamlessInternalSuite(
        'm82a1',
        '双室箭头制退器、29吋开槽重枪管与短后坐内件无缝细节贴图',
        '20 HEAVY BARREL & BOLT PARTS',
        '为标志性双室箭头形坦克制退器、29 英寸纵向开槽浮动重枪管、三突笋回转枪机、加速子杠杆、双联复进拉簧与折叠驻锄两脚架提供重机加工金属拉丝细节。',
        [
          '双室箭头坦克制退器与纵向开槽重枪管铣削刀纹法线',
          '三突笋回转枪机、枪管延伸节与加速子磷化油膜粗糙度',
          '覆盖其余全部 20 个短后坐自动机与驻锄两脚架节点',
        ],
        'Linear · 用于箭头制退器/29"开槽枪管/三突笋枪机/加速子/两脚架等',
        'Linear · 用于A2纹路握把/提把包胶护套/后坐缓冲吸能垫等'
      ),
    ],
  },
  {
    weaponId: 'awm',
    bayCode: 'BAY-06',
    pillLabel: 'AWM',
    headingCn:
      '精密国际 AWM (.338 LM) 狙击步枪贴图库 (Albedo / Normal / Roughness)',
    suites: [
      ...AWM_PBR_SUITES,
      makeSeamlessInternalSuite(
        'awm',
        '27吋不锈钢开槽比赛管、60°六突笋枪机与铝主梁无缝贴图',
        '19 MATCH BARREL & ACTION PARTS',
        '为全长 CNC 航空铝底盘大梁、27 英寸纵向六槽不锈钢浮置比赛枪管、双室平板制退器、防冰槽六突笋枪机及两道火扳机组件提供精密车削金属与尼龙细节。',
        [
          '27" 不锈钢开槽比赛枪管与防冰槽六突笋枪机精细拉丝',
          'CNC 航空铝合金全长底盘主梁与前插栓两脚架阳极氧化质感',
          '覆盖其余全部 19 个栓动枪机、制退器与两道火火控节点',
        ],
        'Linear · 用于不锈钢开槽枪管/六突笋枪机/铝主梁/两道火阻铁等',
        'Linear · 用于高低可调贴腮板/尾托橡胶垫/球形拉机柄头等'
      ),
    ],
  },
  {
    weaponId: 'scar',
    bayCode: 'BAY-07',
    pillLabel: 'SCAR-L',
    headingCn:
      'FN SCAR-L Mk 16“五十度沙色”物理材质贴图库 (Albedo / Normal / Roughness)',
    suites: [
      ...SCAR_PBR_SUITES,
      makeSeamlessInternalSuite(
        'scar',
        '短行程导气活塞、重型方砖枪机框与冷锻枪管无缝细节贴图',
        '19 PISTON & BCG PARTS',
        '为不锈钢短行程导气活塞顶杆、重型矩形枪机框、七突笋回转枪机、六栓快拆冷锻枪管、三叉消焰器与折叠机械瞄具提供 CNC 铣削金属与弹性体细节。',
        [
          '不锈钢短行程活塞顶杆与重型方砖枪机框磨削金属法线',
          '六栓快拆冷锻枪管、导气调节箍与三叉消焰器磷化油膜',
          '覆盖其余全部 19 个短活塞自动机与火控内件节点',
        ],
        'Linear · 用于短行程活塞/矩形枪机框/七突笋枪机/六栓锁块/三叉消焰器等',
        'Linear · 用于雪地靴托橡胶肩垫/快拔环底座/橙色托弹板等'
      ),
    ],
  },
  {
    weaponId: 'deagle',
    bayCode: 'BAY-08',
    pillLabel: '沙漠之鹰',
    headingCn:
      '沙漠之鹰 Mark XIX (.50 AE) 镜面银铬贴图库 (Albedo / Normal / Roughness)',
    suites: DEAGLE_PBR_SUITES,
  },
  {
    weaponId: 'aug',
    bayCode: 'BAY-09',
    pillLabel: 'AUG A1',
    headingCn:
      '斯太尔 AUG A1 (StG 77) 无托步枪物理材质贴图库 (Albedo / Normal / Roughness)',
    suites: [
      ...AUG_PBR_SUITES,
      makeSeamlessInternalSuite(
        'aug',
        '20吋快拆枪管、双导杆枪机框与全塑击锤盒无缝细节贴图',
        '22 BULLPUP INTERNAL PARTS',
        '为 20 英寸快拆冷锻枪管、郁金香消焰器、倾斜导气箍、双长导杆枪机框、七突笋回转枪机、双连杆渐进扳机及后置全工程塑料击锤盒提供金属与注塑细节。',
        [
          '双长导杆枪机框、短行程活塞与七突笋枪机精密拉丝法线',
          '后置全工程塑料击锤盒 (Hammer Pack) 与前折叠握把皮纹',
          '覆盖其余全部 22 个无托快拆枪管与联动火控节点',
        ],
        'Linear · 用于20"快拆枪管/郁金香消焰器/双导杆枪机框/双连杆等',
        'Linear · 用于全塑击锤盒/渐进扳机/前置折叠握把/橡胶尾垫等'
      ),
    ],
  },
  {
    weaponId: 'p320',
    bayCode: 'BAY-10',
    pillLabel: 'P320 M17',
    headingCn:
      'SIG Sauer P320 M17 模块化手枪贴图库 (Albedo / Normal / Roughness)',
    suites: [
      ...P320_PBR_SUITES,
      makeSeamlessInternalSuite(
        'p320',
        '4.7吋氮化枪管、扁钢丝复进簧与双侧保险内件无缝细节贴图',
        '20 BARREL & FCU PARTS',
        '为 4.7 英寸碳氮共渗枪管、可拆红点护板兼夜视照门、平移击针组件、扁钢丝复进簧、M17 双侧手动拇指保险及 17 发磷化钢弹匣提供精细拉丝与皮纹细节。',
        [
          '4.7" 偏移闭锁枪管、双阶安全阻铁与扳机连杆金属拉丝',
          'M17 双侧拇指手动保险、快拆分解柄与 17 发钢弹匣微晶光泽',
          '覆盖其余全部 20 个套筒内件、FCU 火控与弹匣节点',
        ],
        'Linear · 用于4.7"枪管/击针组件/双阶阻铁/扳机连杆/17发钢弹匣等',
        'Linear · 用于击针内衬座/防尘护板/高可视托弹板等'
      ),
    ],
  },
];

export const TextureAtlasModal: React.FC = () => {
  const open = useExplodeStore((s) => s.textureModalOpen);
  const setOpen = useExplodeStore((s) => s.setTextureModalOpen);
  const activeWeaponId = useExplodeStore((s) => s.activeWeaponId);
  const pbrEnabled = useExplodeStore((s) => s.pbrTexturesEnabled);
  const togglePbr = useExplodeStore((s) => s.togglePbrTextures);

  const [weaponTab, setWeaponTab] = useState<string>('ak15');
  const [activeId, setActiveId] = useState<string>('ak_receiver');

  useEffect(() => {
    if (open) {
      const matched =
        WEAPON_PBR_ATLAS_GROUPS.find((g) => g.weaponId === activeWeaponId) ??
        WEAPON_PBR_ATLAS_GROUPS[0];
      setWeaponTab(matched.weaponId);
      setActiveId(matched.suites[0].id);
    }
  }, [open, activeWeaponId]);

  if (!open) return null;

  const activeGroup =
    WEAPON_PBR_ATLAS_GROUPS.find((g) => g.weaponId === weaponTab) ??
    WEAPON_PBR_ATLAS_GROUPS[0];
  const suites = activeGroup.suites;
  const current = suites.find((s) => s.id === activeId) ?? suites[0];

  return (
    <div
      className="tex-modal-backdrop"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="PBR 真实贴图图集检视器"
    >
      <div className="tex-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="tex-modal-header">
          <div className="tex-modal-title-wrap">
            <div className="tex-badge-row">
              <span className="tex-modal-badge">
                <ImageIcon size={12} />
                10-WEAPON 2K PBR ATLAS
              </span>
              <div
                className="tex-weapon-switcher"
                role="tablist"
                aria-label="十款枪械 PBR 贴图库切换"
              >
                {WEAPON_PBR_ATLAS_GROUPS.map((grp) => (
                  <button
                    key={grp.weaponId}
                    type="button"
                    className={`tex-weapon-pill ${
                      weaponTab === grp.weaponId ? 'active' : ''
                    }`}
                    onClick={() => {
                      setWeaponTab(grp.weaponId);
                      setActiveId(grp.suites[0].id);
                    }}
                  >
                    {grp.bayCode.replace('BAY-', '#')} {grp.pillLabel}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 className="tex-modal-title">{activeGroup.headingCn}</h2>
              <p className="tex-modal-sub">
                全馆十款名枪共 58 张定制高清物理材质贴图（public/textures/*.png）· 已按三角面 UV 实时绑定至全部 253 个精密零件
              </p>
            </div>
          </div>

          <div className="tex-modal-header-actions">
            <button
              type="button"
              className={`tex-live-toggle ${pbrEnabled ? 'is-on' : ''}`}
              onClick={togglePbr}
            >
              {pbrEnabled ? <Check size={14} /> : <Layers size={14} />}
              <span>
                {pbrEnabled ? '3D 实时贴图：已开启' : '3D 实时贴图：已关闭'}
              </span>
            </button>

            <button
              type="button"
              className="tex-close-btn"
              onClick={() => setOpen(false)}
              aria-label="关闭贴图检视窗口"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Suite Selector Tabs */}
        <div
          className="tex-suite-tabs"
          style={{
            gridTemplateColumns: `repeat(${suites.length}, minmax(0, 1fr))`,
          }}
        >
          {suites.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`tex-suite-tab ${
                s.id === current.id ? 'active' : ''
              }`}
              onClick={() => setActiveId(s.id)}
            >
              <span className="tex-tab-tag">{s.partTag}</span>
              <span className="tex-tab-name">
                {s.titleCn.replace(/贴图组|无缝细节贴图|无缝贴图/, '')}
              </span>
            </button>
          ))}
        </div>

        {/* Suite Metadata Banner */}
        <div className="tex-suite-info">
          <div className="tex-info-main">
            <div className="tex-info-headline">
              <h3>{current.titleCn}</h3>
              <span className="tex-res-pill">{current.resolution}</span>
            </div>
            <p>{current.summary}</p>
          </div>
          <div className="tex-info-chips">
            {current.highlights.map((h) => (
              <span key={h} className="tex-highlight-chip">
                <Sparkles size={11} />
                {h}
              </span>
            ))}
          </div>
        </div>

        {/* 3-Channel Preview Grid */}
        <div className="tex-channels-grid">
          {current.channels.map((ch) => (
            <div key={`${current.id}-${ch.fileName}`} className="tex-channel-card">
              <div className="tex-ch-head">
                <div>
                  <span
                    className={`tex-ch-badge kind-${ch.kind.toLowerCase()}`}
                  >
                    {ch.kind.toUpperCase()}
                  </span>
                  <span className="tex-ch-title">{ch.labelCn}</span>
                </div>
                <a
                  href={ch.url}
                  download={ch.fileName}
                  className="tex-download-link"
                  title={`下载 ${ch.fileName}`}
                >
                  <Download size={12} />
                  <span>PNG</span>
                </a>
              </div>

              <div className="tex-img-frame">
                <img src={ch.url} alt={ch.labelCn} loading="lazy" />
              </div>

              <div className="tex-ch-foot">
                <code>/textures/{ch.fileName}</code>
                <span>{ch.note}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
