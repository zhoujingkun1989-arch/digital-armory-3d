## Summary · 变更摘要
<!-- Describe what this PR changes and why. Link related issues (e.g. Closes #123). -->

## Change Type · 变更类型
- [ ] Photorealistic Blender 5.2 `.glb` + 2K ORM Asset / 照片级三维资产升级
- [ ] New Feature / UX Enhancement / 新功能或交互优化
- [ ] Bug Fix / 缺陷修复
- [ ] Physics / Kinematics / Audio / 弹道运动学或声场
- [ ] Docs / Community / CI / 文档与工程规范

## Mandatory 4 Quality Gates · 四大质量门禁自检
Run all four checks locally and verify **0 errors and 0 warnings**:
- [ ] `npm run typecheck` — PASS (0 errors)
- [ ] `npm run lint` — PASS (0 errors, 0 warnings)
- [ ] `npm test` — PASS (all Vitest contract suites green)
- [ ] `npm run build` — PASS (all chunks `< 800 kB`, 0 chunk warnings)

## Architecture & Asset Checklist · 架构与资产契约核验
- [ ] Coordinate invariant preserved (`1 world unit = 1 cm`, `+X` muzzle, `+Y` up, `+Z` right)
- [ ] If adding/updating `.glb`: reproducible MIT script in `scripts/blender/`, watertight meshes (`non_man=0`, `vol > 0`), dynamic `aSpringParam` springs preserved on CSG Worker, 3-channel RGB linear Normal/ORM WebPs, bundle within size budget (`<= 12 MB` rifle / `<= 10 MB` pistol)
- [ ] If adding/updating textures: `glbAssetService.ts`, `uiStrings.ts`, `showcaseStrings.ts`, and `tests/{glbAsset,armoryIntegration,weaponContracts}.test.ts` counts synced
- [ ] 100% EN / ZH bilingual parity (0 CJK characters in English strings)
- [ ] Zero React re-renders on 60Hz animation paths (`playbackClock.ts` only)
- [ ] Subpath-safe URLs via `src/engine/utils/assetUrl.ts` (`/` and `/digital-armory-3d/`)

## Visual Verification · 实机画面截图（3D / UI 变更必填）
<!-- Attach 1920x1080 or side-by-side renders and note `console=0 pageerror=0` browser check. -->

## Educational & Safety Compliance · 开源科普红线确认
- [ ] Strictly educational/schematic visualization — contains **zero** 3D-printable `.stl`/CAD manufacturing files or chambering tolerances, and **zero** ripped/closed-source third-party assets.
