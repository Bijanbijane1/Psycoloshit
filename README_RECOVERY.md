# PsychoMaster — Phase 6G Recovery and Mac Transfer Package

## 1. Repository & Checkpoint Metadata
- **Source Workspace**: `/app/applet` (note: `/app/applet` does not contain a `.git` directory)
- **Verified Base Git Repository**: `/tmp/phase-6f-staging` (cloned from `phase-6f-backend-checkpoint.gitbundle`)
- **Base Branch Name**: `main`
- **Base HEAD Commit (Phase 6F)**: `d1d1aa9f8d4a9c42bfcc8db9616650b64b657b27`
- **Parent Commit (Phase 5C)**: `18386b79785d6dbb9d446102e64f7a0aa22fc474`
- **Phase 6F Bundle Included**: `phase-6f-backend-checkpoint.gitbundle` (`1432411` bytes, SHA-256: `25bd6b81fd114a41f29c0d82b7f6e4afbdf59caf78b3f2c944b463b0fe71d086`)
- **Phase 6G Working-Tree Patch Included**: `patches/phase-6f-to-6g.patch` (`53409` bytes, SHA-256: `e22c7b671757608e369c7a8b24351ac2a5f4ae3793c1d8d8f68134689bbe6ba3`)
- **Full Lossless Phase 6G Project Snapshot**: `snapshot/` (all 88 project files at exact Phase 6G state)
- **Verification Baseline**: 245 passing assertions (`npx tsx tests/d1-integrity.test.ts`), clean `npm run lint`, clean `npm run build`, clean `npx wrangler deploy --dry-run`, and clean local D1 migrations `0001`–`0005`.

---

## 2. Exact Recovery Instructions for macOS

### Step 1: Extract and Verify Package Integrity
```bash
mkdir -p ~/psychomaster-phase-6g-transfer
unzip phase-6g-mac-recovery-package.zip -d ~/psychomaster-phase-6g-transfer
cd ~/psychomaster-phase-6g-transfer
shasum -a 256 -c SHA256SUMS.txt
git bundle verify phase-6f-backend-checkpoint.gitbundle
```

### Step 2: Reconstruct Full Git History + Exact Phase 6G Working Tree (Recommended)
This method clones the full Git commit history through Phase 6F (`d1d1aa9f8d4a9c42bfcc8db9616650b64b657b27`) and overlays the lossless `snapshot/` directory so your working tree is byte-for-byte identical to the verified Phase 6G state without relying on `git apply` alone:
```bash
git clone phase-6f-backend-checkpoint.gitbundle psychomaster-repo
cd psychomaster-repo
git checkout -B main d1d1aa9f8d4a9c42bfcc8db9616650b64b657b27
rsync -a ../snapshot/ ./
git status --short
```

*(Alternative: if you prefer to apply the unified diff patch instead of copying `snapshot/`, run `git apply --index ../patches/phase-6f-to-6g.patch` inside `psychomaster-repo`.)*

### Step 3: Verify Every File Against SHA256SUMS.txt & Run Local Checks on Mac
```bash
npm ci
npx tsx tests/d1-integrity.test.ts
npm run lint
npm run build
npx wrangler deploy --dry-run
```

---

## 3. Phase 6G Modified Files Inventory (8 Modified Tracked Files, 0 New Source Files, 0 Deleted Files)

| Status | File Path | Size (Bytes) | Phase 6F SHA-256 | Phase 6G SHA-256 |
|---|---|---|---|---|
| `M` | `src/types/psychology.ts` | 4338 | `0c7b1b3a1bd97b3bc51f4449618c78cc0733217bcd2e6c2df56b243725c7c01c` | `549029162fb1c1f5b8b600aaeffe315be0ae231bd19b400ceb9f28d5506995b9` |
| `M` | `src/worker/ai.ts` | 34388 | `4036570bf80fea21a8acb049f6b55f65c3c8119dfa2cf12a3a734eb79bd3f54c` | `a3fe3bfe631f0e17b4251bf88c4f12255ff85a9ef6ab9e5a845e0a0f0f5d529c` |
| `M` | `src/worker/analytics.ts` | 39351 | `ff272358a8df803c3d20c301fdf8f3b1fb79365791a31e308d2b065c90051421` | `723f64a59b358b098a188ae94fa84f30bbc5fe31aebae9f56ba946ba5d6f5ea7` |
| `M` | `src/worker/db/userRepository.ts` | 40464 | `0b580bae4f74c17e4b780bc29dd6848a7c828f86d4f520f8a88260899b5b0191` | `1032e914b8f255be53489689fad9cb40c4dc8c42921837d22feee53e5fddd502` |
| `M` | `src/worker/index.ts` | 61311 | `846eeca3603ea4c5d7a04401eeedab93e8d00c4bd804d32dd85b3b547a1b1817` | `f959fe5de12ca3ce43484cdd1ae35057760478763e9e2038fba2c59238829ce2` |
| `M` | `src/worker/rateLimiter.ts` | 13197 | `9e2b10e22b7ba2d711da1842477974f0277789405116bfded7ff78c28c24477c` | `3ad27465d21a98ae2dd8f541c73c806e79de30451bc1bc59d30567c5fe891fe6` |
| `M` | `src/worker/rewards.ts` | 22417 | `81b5dc0c2ed32898f19cf4a6c09bfc66dec1238f45bf0da121f969e232b7c5f7` | `67db2cbec29cc4996fe4bd9399232d307e2bdeaf0d9fa5aa36b550d642d17898` |
| `M` | `tests/d1-integrity.test.ts` | 145686 | `08181cdfd283c8288ec27f11fe31c55968cb0ee51047cf2bd47325ca271f833e` | `d9ad4b116e5440c97945321b68e29aaee6b5769140fd103f9b4753bb3ab61962` |

---

## 4. Excluded Files & Directories Inventory (Not Included in `snapshot/`)

| Excluded Path in `/app/applet` | Category / Reason for Exclusion |
|---|---|
| `node_modules/` | Installed npm dependencies (recreated via `npm ci`) |
| `dist/` | Generated Vite production build output (recreated via `npm run build`) |
| `.wrangler/` | Local Wrangler cache and temporary state |
| `.aistudio/` | AI Studio internal session/artifact metadata |
| `data/psychomaster.sqlite` | Local Express runtime SQLite database file (mutable runtime state) |
| `data/sessions_store.json` | Local Express runtime session store (sensitive runtime tokens) |
| `data/site_analytics.json` | Local Express runtime analytics store (mutable runtime state) |
| `data/users_store.json` | Local Express runtime user store (mutable runtime state) |
| `server.js` | Stale transpiled JS file from an earlier phase (`server.ts` is the authoritative source) |
| `phase-5c-auth-security-checkpoint.gitbundle` | Older Phase 5C bundle (superseded by `phase-6f-backend-checkpoint.gitbundle`, which contains full history including Phase 5C commit `18386b79785d6dbb9d446102e64f7a0aa22fc474`) |
| `phase-5c-security-transfer.zip` | Older Phase 5C transfer archive |
| `aistudio-checkpoint-2026-10-16-6ad7dfa.bundle` | Older Phase 5A checkpoint bundle |
| `public/aistudio-checkpoint-2026-10-16-6ad7dfa.bundle` | Duplicate older Phase 5A checkpoint bundle |

*(Note: `data/question_bank.json`, `.env.example`, `wrangler.jsonc`, `package.json`, `bun.lock`, `tsconfig.json`, `vite.config.ts`, `src/worker/db/schema.sql`, and all 5 SQL migrations `migrations/0001_initial_schema.sql` through `migrations/0005_worker_operational_state.sql` ARE included in `snapshot/`.)*

---

## 5. Complete 88-File Snapshot Inventory & SHA-256 Checksums

| # | File Path in `snapshot/` | Status vs 6F | Size (Bytes) | SHA-256 Checksum |
|---|---|---|---|---|
| 1 | `.env.example` | `unchanged` | 1027 | `03595a269e8cb9a925e65e67c131249bd046b6dd0a90a825e80f91b60c426f22` |
| 2 | `.gitignore` | `unchanged` | 541 | `781287e0cff05d98fa8b06a3480faa78f4f128916befac4a5bcfa42b8889a743` |
| 3 | `bun.lock` | `unchanged` | 164432 | `8a937f692c1edd0b90062053cc33f9aa3b7e7567a1e6eabf6d5a6580bd34ec47` |
| 4 | `data/question_bank.json` | `unchanged` | 6182 | `3bcf46adc9ab25bb6a90b5233f26a7cfd231ae686c522630bf346e40df012a42` |
| 5 | `index.html` | `unchanged` | 2542 | `5e0a7853d1b660cdaaba3b4f702fe637c2c725f9e8e3d805078cda97e4462234` |
| 6 | `metadata.json` | `unchanged` | 537 | `bf95e5ba526f3d6574f68b24362be86456b97654e89d8dc179a2f9a47ab128a7` |
| 7 | `migrations/0001_initial_schema.sql` | `unchanged` | 2390 | `6950d1799d6102e79c019fcbb529bd1227eed890b5864662e6905ba2088ee114` |
| 8 | `migrations/0002_xp_idempotency.sql` | `unchanged` | 655 | `a8fffe9d6c7cec09d6df7277387c35fbab48efe174b416e9e1890342ac23492e` |
| 9 | `migrations/0003_auth_sessions.sql` | `unchanged` | 1177 | `23f550d4ef6fccbf7ad5ba0c482feae12ee0d36e3daf546f69819fde3333cbe2` |
| 10 | `migrations/0004_auth_nonces.sql` | `unchanged` | 438 | `69fc149754164b07d5e2b138ac65503fcc35c728e1f6032559985e0a3795f7de` |
| 11 | `migrations/0005_worker_operational_state.sql` | `unchanged` | 2194 | `b7f6030567a11cac59e865af9bb444d7ecaea66249d6d7b03833e7449ac2696f` |
| 12 | `package.json` | `unchanged` | 1232 | `7983f244784578a1e126b4a53c13fa4628f1d05c6bcdff05e9734471979eaccb` |
| 13 | `public/apple-touch-icon.png` | `unchanged` | 957 | `5c4c97ef790f574ed1e0b6968591037b083e2934203dbbf066a696d1f5c16ddb` |
| 14 | `public/icon.svg` | `unchanged` | 3172 | `55786687b13739def4c2a72271f9b681e044ca95af9af75070cf5d677b1e512d` |
| 15 | `public/manifest.json` | `unchanged` | 2095 | `06600805aaa8e9069e069400099812a879d64f15a4bd47a9046cf7449fb0c738` |
| 16 | `public/pwa-192x192.png` | `unchanged` | 957 | `5c4c97ef790f574ed1e0b6968591037b083e2934203dbbf066a696d1f5c16ddb` |
| 17 | `public/pwa-512x512.png` | `unchanged` | 4806 | `749c58ab42e1058912369bfe1c336daae0641c2ecc162ee0960eccd9cc37db70` |
| 18 | `public/pwa-maskable-512x512.png` | `unchanged` | 4806 | `749c58ab42e1058912369bfe1c336daae0641c2ecc162ee0960eccd9cc37db70` |
| 19 | `public/sw.js` | `unchanged` | 1969 | `723b83cae3b4ca4ae3bec4e29932e2551afb3db2e8e708e66ab65af1753dc951` |
| 20 | `server.ts` | `unchanged` | 46552 | `b5badc519b71fed5c68c6a76360b13c396af1962d2f63411a4f811015da5256b` |
| 21 | `src/App.tsx` | `unchanged` | 21172 | `d968202bca3baae1ab4564226b863c7369bd488f883a3ba612c64b117886ef57` |
| 22 | `src/assets/images/psychology_mind_hub_1791565558227.jpg` | `unchanged` | 935094 | `5266bb24fe8b5105653bb4f2b4827d5e5aa74a56b3cf1cbfd22d4f0b49c22fa6` |
| 23 | `src/components/AdvancedSearchModal.tsx` | `unchanged` | 6828 | `0a668c62744fafc23bdfec256f44e5b1c64a8efe17ff9eb3aedb79e4e780906f` |
| 24 | `src/components/AnalyticsView.tsx` | `unchanged` | 40243 | `47725c0668667cf2e2e93f04424245ad163591a624a161649f27a82acf57d526` |
| 25 | `src/components/BadgeIcon.tsx` | `unchanged` | 19777 | `70fc4662bb261830fde998adc157cc5e358321bd4e323b3af54bc44f3b8f9559` |
| 26 | `src/components/BadgeUnlockModal.tsx` | `unchanged` | 4874 | `6077be9a8d5076ef90f4f90dfdda024330d5eba29c8d740e3dd21d99b08f9b7a` |
| 27 | `src/components/BadgesView.tsx` | `unchanged` | 19696 | `5931a0e91fb285658a309b633061820054bcab2b5607d532f948e43068ba8bd9` |
| 28 | `src/components/BookReaderView.tsx` | `unchanged` | 33674 | `f1dfc46ff4a56ac36ddba91b76f8f839acd2b4f2df2ee331ed32a5318b994cab` |
| 29 | `src/components/DashboardView.tsx` | `unchanged` | 57451 | `7452035131868026f737f63579082448bc2e2d4949dcf07f7cffa692bf1824c9` |
| 30 | `src/components/DuoMascot.tsx` | `unchanged` | 8199 | `8b4faa2456374cdedc76b0addea3b87a7df53547b7bbd77cb04b7d0606a8daee` |
| 31 | `src/components/DuolingoStageModal.tsx` | `unchanged` | 54814 | `8dbfc1c8bf702827a86df26793ab0dd5cee0a131c2459eb0005ae8550c4f5fe4` |
| 32 | `src/components/GoogleSignInModal.tsx` | `unchanged` | 11683 | `9c5aa7557b4abeaf004cb28d6a40d5f879594bbddd4e00a435477b646260918c` |
| 33 | `src/components/GuestMergeModal.tsx` | `unchanged` | 5206 | `36952cad74eebcee863a7b87198c8b55e3111bd6e8bf76f3fca52ab600b2bfa6` |
| 34 | `src/components/Navbar.tsx` | `unchanged` | 37523 | `5319d165f0c7f09072c23f6d337efc60300150680a89f679e18326b9bd0fabdf` |
| 35 | `src/components/NotebookView.tsx` | `unchanged` | 11914 | `da546036d73d36344b14d013324b7ffbd8401c493e49f5fac9c4622df3597ec1` |
| 36 | `src/components/PWAInstallButton.tsx` | `unchanged` | 5220 | `2e87d28469df9ca9b8e69b264a137e30e6cab9666196e4452df7ad2e1451e1b5` |
| 37 | `src/components/PomodoroTimerModal.tsx` | `unchanged` | 18465 | `1c816ddee35220007282a8b93e4842d77aaa44501363967735cc1345aaac38f1` |
| 38 | `src/components/PrerequisiteInspectorModal.tsx` | `unchanged` | 9851 | `f9d15db2ed2ee840953b16dab4d0c894a23eb7a5e04fd3a44a5ac9b97c4ca39c` |
| 39 | `src/components/QuizCenterView.tsx` | `unchanged` | 48015 | `84eb5e4dc8a4ae721243324eb3dd7c1ad4fadf01b30d12cf9499c67a381840db` |
| 40 | `src/components/ReportExportModal.tsx` | `unchanged` | 15491 | `e2475bd1c7f92f0ca5a8196b51a77f8f0b7c9a8be5e5a90d76577ef7a7ffa809` |
| 41 | `src/components/SettingsModal.tsx` | `unchanged` | 14689 | `5a0b6451c06d1fc4e21fd48ad79cf1e207a5080fd4815f69fe3599dba475eed0` |
| 42 | `src/components/SiteTrafficAnalyticsModal.tsx` | `unchanged` | 34476 | `dac47bf55e82c7271ed5bf87eff9ad213f2654d2bd931e52e7ba166aeacce731` |
| 43 | `src/components/SourceCodeModal.tsx` | `unchanged` | 18569 | `9f9c42e8acc5f95657c9b56ced196b5a3b062135c2828b3ee5428049c572750c` |
| 44 | `src/components/SupportSystemView.tsx` | `unchanged` | 19795 | `bc2aecd4b180bd19ff0976803791e4b36a4a0f8807903cab9084777a691a1f57` |
| 45 | `src/components/UserAccountModal.tsx` | `unchanged` | 23865 | `c58e31645e9060d15669870e4fbe6b5ed1182abfd89369605b5b284c61d357fe` |
| 46 | `src/context/AuthContext.tsx` | `unchanged` | 8765 | `3a17925f9cc27728ef3ae4eec1daaae8e8dd7256d3cc7de03496301f1474d5c9` |
| 47 | `src/context/StageExecutionContext.tsx` | `unchanged` | 5460 | `e1c5e84893627a22a143bf870f2dea85a9071e41f9f311a1bd647ade8bf579ba` |
| 48 | `src/data/academicSources.ts` | `unchanged` | 16281 | `39eb611eeb7b117038b850a9e0d25fba148624d73577c9e8a741ddd8addbe3d7` |
| 49 | `src/data/badgeDefinitions.ts` | `unchanged` | 12159 | `55638e81dc70139df6bddbe0703493ee5bd05c24556904894627679ee8d45e15` |
| 50 | `src/data/curriculumQuestionsBank.ts` | `unchanged` | 134567 | `abf602b419841736cbfdd0bfd506ef4c26b489aa59f7699543bde6a5c6f48502` |
| 51 | `src/data/psychologyCurriculum.ts` | `unchanged` | 130728 | `15a87ef5b3e207fb40c4019951a5dc3da8a0317720d821ab9ccddf25281b2d64` |
| 52 | `src/data/section1Stages.ts` | `unchanged` | 184722 | `b97db5714af54cf8f2a9f20de0980c59ebe93400ea4a2883638f10a889b457a6` |
| 53 | `src/data/stageQuestionsBuilder.ts` | `unchanged` | 58395 | `ee9b769bb10b6129a8b9430186c8edace6f0028f390f5a224ebb4b5cd3313384` |
| 54 | `src/index.css` | `unchanged` | 10826 | `4957904cb1741988a143cf541bcd2f24f768317e8755249144a33ac52af4aada` |
| 55 | `src/main.tsx` | `unchanged` | 159 | `30d02ee59cb6576973dea4368093b2dcae692a40668f288fdbc66a114873fcd3` |
| 56 | `src/server/aiCache.ts` | `unchanged` | 2364 | `4af4a2f8d2431b951efef645cc8f10d51464d04b44734801a9200df434da7452` |
| 57 | `src/server/analyticsStore.ts` | `unchanged` | 18826 | `fde1bc1e8d2a44adc45f2ed7f4621a121b365f1df68ef9112e64d7825d44d860` |
| 58 | `src/server/questionBank.ts` | `unchanged` | 8800 | `70cebe562063307e2747da72852b0e49a5d32de382c7c2ef25aff941f110bfd4` |
| 59 | `src/server/rateLimiter.ts` | `unchanged` | 1746 | `5e0025f2034f5e35bda84325cc208990e3ec5759cd6668f7f94ad181e008c984` |
| 60 | `src/server/userStore.ts` | `unchanged` | 42026 | `6751ec09124030287a198e3530a33f29aae046815713301824a6fb1fc39d8320` |
| 61 | `src/services/authService.ts` | `unchanged` | 6891 | `33f1b376b1c8d984c4e918848d552e30bef8886dbc067875662298bcd5f4f24d` |
| 62 | `src/services/stageExecutionEngine.ts` | `unchanged` | 14473 | `991e9a46d950f091d88f3bf3097d97966c5870f8034d41a2a32552d33c93e6c6` |
| 63 | `src/types/analytics.ts` | `unchanged` | 1902 | `f2377a5081185ed96b193ccbe6bfdcb6a8312387f0bf611a5908773fb65b3d58` |
| 64 | `src/types/badges.ts` | `unchanged` | 929 | `b81b0d5427c6c15e48f8f62af75f22faeb507262bfd749fea6ff21d4db1fe0e4` |
| 65 | `src/types/psychology.ts` | `M` | 4338 | `549029162fb1c1f5b8b600aaeffe315be0ae231bd19b400ceb9f28d5506995b9` |
| 66 | `src/utils/adaptiveEngine.ts` | `unchanged` | 5542 | `a31c4abdac1d2e6094a846cc8e092a30c3253f04fcffe01d547c51462b6e9d03` |
| 67 | `src/utils/cloudSync.ts` | `unchanged` | 5454 | `f2fe38520e937a343c6148d17877e0899fd77ad903da83f5b258d9a60722e80f` |
| 68 | `src/utils/duoAudio.ts` | `unchanged` | 5649 | `c91c0562d6cfaca3bbf499d377f0a24bdfc72d95ac884eab0e6500c68af98ff1` |
| 69 | `src/utils/siteTracker.ts` | `unchanged` | 4895 | `60f9f20164002242df079daf7bc35a631abd1f14ee0e4ff47798a8e343509f94` |
| 70 | `src/utils/storage.ts` | `unchanged` | 3651 | `fb6734a79af5c84d946a64b288df261aa1de69af9a1cf2d5071004c25cb1c69b` |
| 71 | `src/utils/studyNotifications.ts` | `unchanged` | 1730 | `9c484c457e2ae08603db66ba192f57379b98111ec07c2b136416e44ee064b93b` |
| 72 | `src/utils/usePWAInstall.ts` | `unchanged` | 2299 | `f9bd4be59b9a1b8c36cd74b7ed916d407e6db47be68aea05445bb3e0747701d8` |
| 73 | `src/worker/ai.ts` | `M` | 34388 | `a3fe3bfe631f0e17b4251bf88c4f12255ff85a9ef6ab9e5a845e0a0f0f5d529c` |
| 74 | `src/worker/analytics.ts` | `M` | 39351 | `723f64a59b358b098a188ae94fa84f30bbc5fe31aebae9f56ba946ba5d6f5ea7` |
| 75 | `src/worker/auth.ts` | `unchanged` | 12538 | `a2603de9e5272aa1a980527b59f272fb4d8a76083bfa2e960e0bf8013a90cfb0` |
| 76 | `src/worker/db/index.ts` | `unchanged` | 608 | `f7243aaf8c264ad5a914dcdf1bf94075194ce051c8f8ccc6972dc105446b27eb` |
| 77 | `src/worker/db/questionRepository.ts` | `unchanged` | 14964 | `e2227ca87e00912b60308077db77bb18673f3f22d555442c903a5696ad165b82` |
| 78 | `src/worker/db/schema.sql` | `unchanged` | 4847 | `c30b76049761ebff93844a2f088e0e10f59c372527f8ae87dc2bd149e7f543c0` |
| 79 | `src/worker/db/schema.ts` | `unchanged` | 7692 | `c3ea6cb06edcfba113743ac71a2739847c0d6b004cbf7722b9da65847a440e70` |
| 80 | `src/worker/db/userRepository.ts` | `M` | 40464 | `1032e914b8f255be53489689fad9cb40c4dc8c42921837d22feee53e5fddd502` |
| 81 | `src/worker/index.ts` | `M` | 61311 | `f959fe5de12ca3ce43484cdd1ae35057760478763e9e2038fba2c59238829ce2` |
| 82 | `src/worker/rateLimiter.ts` | `M` | 13197 | `3ad27465d21a98ae2dd8f541c73c806e79de30451bc1bc59d30567c5fe891fe6` |
| 83 | `src/worker/rewards.ts` | `M` | 22417 | `67db2cbec29cc4996fe4bd9399232d307e2bdeaf0d9fa5aa36b550d642d17898` |
| 84 | `src/worker/types.ts` | `unchanged` | 2328 | `e569c6421faade6368c140dd756fe04677a5f5b3342cbf5877f361af5b3fa1e0` |
| 85 | `tests/d1-integrity.test.ts` | `M` | 145686 | `d9ad4b116e5440c97945321b68e29aaee6b5769140fd103f9b4753bb3ab61962` |
| 86 | `tsconfig.json` | `unchanged` | 564 | `80a40b629ded69c08d02450526be12d229323c90f543c2be25c59e00bb16622f` |
| 87 | `vite.config.ts` | `unchanged` | 3231 | `af666fe3ec1957611035fdacd45fb6145fb1f3d7c1a8d40a9339abe53307d59f` |
| 88 | `wrangler.jsonc` | `unchanged` | 389 | `ac24b13cf69962eaee043b70b4396e3f93cfb839e46075035043ca9a458ee33e` |
