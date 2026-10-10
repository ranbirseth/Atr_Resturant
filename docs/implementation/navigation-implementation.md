# Gola Restaurant — Phase 2 Step 4: Hamburger Navigation Redesign Report

> Implementation report for the React Native (Expo) admin navigation shell. Scope limited to `gola-expo-preview/` (plus this `docs/` index). No backend, database, `AdminDashbord/`, `client/`, `print-service/`, or `react native frontend/` files were modified. No API calls were made; no records changed.

- **Date:** 2026-10-09
- **Target:** `gola-expo-preview/` (Expo Go on a physical Android tablet)
- **Supersedes:** the bottom-tab shell from Phase 2 Step 1

---

## 1. Files added or modified

### Added
| File | Purpose |
|---|---|
| `gola-expo-preview/src/navigation/AppDrawerContent.js` | Custom drawer body: brand header, the 7 sections (via `DrawerItemList`), footer. |
| `gola-expo-preview/src/screens/MenuCategories/MenuCategoriesScreen.js` | Combined "Menu & Categories" placeholder. |

### Modified
| File | Change |
|---|---|
| `gola-expo-preview/src/navigation/RootNavigator.js` | Replaced the 8-item bottom-tab navigator with a 7-section `createDrawerNavigator`. |
| `gola-expo-preview/App.js` | Wrapped the app in `GestureHandlerRootView` + `SafeAreaProvider`; status bar set to `light-content` over the dark header. |
| `gola-expo-preview/index.js` | Added `import 'react-native-gesture-handler'` at the very top of the entry file. |
| `gola-expo-preview/src/components/ConnectionStatus.js` | Added a `compact` header pill (used as `headerRight`); fixed its pre-existing `react-hooks/set-state-in-effect` lint error. |
| `gola-expo-preview/package.json` / `package-lock.json` | Added the drawer + support dependencies (see section 2). |

### Removed
- The bottom tab bar is no longer rendered (`@react-navigation/bottom-tabs` remains installed but unused).

### Unchanged placeholders
- `src/screens/Menu/MenuScreen.js` and `src/screens/Category/CategoryScreen.js` are kept (not deleted) per "do not remove feature code just because a screen is a placeholder"; they are simply no longer routed.

---

## 2. Dependencies added

Installed with `npx expo install`; `npx expo install --check` reported "Dependencies are up to date".

| Package | Version | Why |
|---|---|---|
| `@react-navigation/drawer` | `^7.14.3` | Drawer navigator (matches existing `@react-navigation/native` v7). |
| `react-native-gesture-handler` | `~2.32.0` | Required by the drawer; bundled in Expo Go. |
| `react-native-reanimated` | `4.5.1` | Required by the drawer; bundled in Expo Go. |
| `react-native-worklets` | `0.10.1` | Required by Reanimated 4; bundled in Expo Go. |
| `@expo/vector-icons` | `^15.0.2` (15.1.1) | Ionicons for the drawer section icons. |

`react-native-reanimated` and `react-native-gesture-handler` are documented as included in Expo Go for SDK 57, and `babel-preset-expo` auto-configures the Reanimated Babel plugin (no `babel.config.js` needed). No other versions were changed and the Expo SDK was not upgraded.

---

## 3. Navigation structure (7 sections)

| # | Route name | Drawer label / header title | Icon (Ionicons) | Screen |
|---|---|---|---|---|
| 1 | `Dashboard` | Dashboard | `grid-outline` | `DashboardScreen` (implemented) |
| 2 | `Orders` | Orders | `receipt-outline` | `OrdersScreen` (implemented) |
| 3 | `MenuCategories` | Menu & Categories | `restaurant-outline` | `MenuCategoriesScreen` (placeholder) |
| 4 | `UserCoupons` | Users & Coupons | `people-outline` | `UserCouponsScreen` (placeholder) |
| 5 | `ReviewsAnalytics` | Reviews & Analytics | `stats-chart-outline` | `ReviewsAnalyticsScreen` (placeholder) |
| 6 | `Billing` | Billing | `card-outline` | `BillingScreen` (placeholder) |
| 7 | `Settings` | Settings | `settings-outline` | `SettingsScreen` (placeholder) |

- **Initial route:** `Dashboard`.
- The drawer's default header provides the **hamburger** (`DrawerToggleButton`) on the left; the title is the route `title`.
- The **connection indicator** is rendered in `headerRight` as a compact pill (`<ConnectionStatus compact />`), so it never overlaps the title or the hamburger.

---

## 4. Drawer behavior

- Opens from the header hamburger; opens via edge swipe (gesture-handler).
- Active section is highlighted (`drawerActiveBackgroundColor: '#2c3e50'`, white label/icon); inactive items are `#33475b`.
- Tapping an item navigates and the drawer closes automatically (standard Drawer behavior).
- On Android, the hardware back button closes the drawer when it is open before leaving the screen.
- `DrawerContentScrollView` keeps the brand header and the 7 items (scrollable), and insets are respected on tablet.

---

## 5. Preserved behavior

- `DashboardScreen` and `OrdersScreen` are untouched; both still subscribe/unsubscribe via `useFocusEffect`, so focus-driven refreshes and the Socket.IO lifecycle keep working (navigation state is real, not simulated).
- `src/api/*` (including the LAN `getSocketUrl()`), `src/utils/*`, and all Orders components are unchanged.
- No backend, DB, print, KOT, PDF, or WhatsApp code was touched.

---

## 6. Verification

| Check | Command | Result |
|---|---|---|
| Lint | `npx expo lint` | **0 errors**, 7 warnings (all pre-existing: `apiClient.js` unused `e`, six `*Screen.js` BOM warnings — none in new/changed files) |
| Unit tests | `node --test src/utils/orderUtils.test.js src/utils/dashboardMetrics.test.js` | **34 / 34 pass** |
| Bundle | `npx expo export --platform android` | **OK** — `Android Bundled ... index.js (1412 modules)` |
| Dependency compatibility | `npx expo install --check` | **"Dependencies are up to date"** |

- The export confirms the drawer, Reanimated worklets, gesture-handler, and Ionicons fonts all resolve in the production bundle.
- No API/DB requests were made during this step.

---

## 7. Pending / not done (by design)

- **Tablet visual check** (not performed here): confirm the hamburger opens the drawer, all 7 items highlight/route, edge-swipe + Android back behave, and the compact connection pill fits the header.
- Feature work for the placeholder sections (Menu & Categories, Users & Coupons, Reviews & Analytics, Billing, Settings) was intentionally not started.
