import { useState, type ReactNode } from "react";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { ToastProvider } from "./ui";
import {
IconBook,
IconBox,
IconDashboard,
IconDots,
IconGear,
IconLayers,
IconReceipt,
IconMilkBottle,
IconTag,
} from "./ui";
import { DashboardPage } from "./pages/Dashboard";
import { RecipesPage } from "./pages/Recipes";
import { QuotePage } from "./pages/Quote";
import { IngredientsPage } from "./pages/Ingredients";
import { PackagingPage } from "./pages/Packaging";
import { ComponentsPage } from "./pages/Components";
import { SalesPage } from "./pages/Sales";
import { SettingsPage, type SettingsTab } from "./pages/Settings";
import { MorePage } from "./pages/More";

export type Page =
  | "dashboard"
  | "recipes"
  | "quote"
  | "ingredients"
  | "sales"
  | "more"
  | "packaging"
  | "components"
  | "settings";

interface NavItem {
  page: Page;
  label: string;
  icon: ReactNode;
}

// One flat list — the desktop sidebar shows all eight; the phone bottom
// nav shows the first four (Dashboard, Sales, Quote, Recipes) plus More,
// which holds the rest.
const NAV: NavItem[] = [
  { page: "dashboard", label: "Dashboard", icon: <IconDashboard /> },
  { page: "sales", label: "Sales", icon: <IconReceipt /> },
  { page: "quote", label: "Quote", icon: <IconTag /> },
  { page: "recipes", label: "Recipes", icon: <IconBook /> },
  { page: "ingredients", label: "Ingredients", icon: <IconMilkBottle /> },
  { page: "packaging", label: "Packaging", icon: <IconBox /> },
  { page: "components", label: "Components", icon: <IconLayers /> },
  { page: "settings", label: "Settings", icon: <IconGear /> },
];

const BOTTOM_NAV = NAV.slice(0, 4);

const MORE_PAGES: Page[] = [
  "more",
  "ingredients",
  "packaging",
  "components",
  "settings",
];

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("costs");

  const go = (p: Page) => {
    setPage(p);
    if (p !== "recipes") setOpenRecipeId(null);
  };
  const openRecipe = (id: string) => {
    setOpenRecipeId(id);
    setPage("recipes");
  };
  const goDataSettings = () => {
    setSettingsTab("upload");
    go("settings");
  };

  const navButton = (item: NavItem, layout: "side" | "bottom") => {
    const active =
      item.page === "more"
        ? MORE_PAGES.includes(page)
        : page === item.page ||
          (item.page === "recipes" && page === "recipes" && openRecipeId != null);
    if (layout === "bottom") {
      return (
        <button
          key={item.page}
          type="button"
          onClick={() => go(item.page)}
          aria-current={active ? "page" : undefined}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-14 text-[11px] font-semibold ${
            active ? "text-[#2c1e16]" : "text-[var(--dim)]"
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      );
    }
    return (
      <button
        key={item.page}
        type="button"
        onClick={() => go(item.page)}
        aria-current={active ? "page" : undefined}
        className={`w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
          active
            ? "bg-[#f9ecd7] text-[#2c1e16]"
            : "text-[var(--dim)] hover:bg-[#f9ecd7] hover:text-[#2c1e16]"
        }`}
      >
        {item.icon}
        {item.label}
      </button>
    );
  };

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-[var(--bg)] font-body text-[var(--text)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <div className="lg:flex">
          {/* Desktop sidebar */}
          <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 h-dvh sticky top-0 border-r border-[var(--border)] bg-[var(--bg)] px-3 py-6">
            <p className="mb-6 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-ink)]">
              Pricing Tool
            </p>
            <nav aria-label="Main" className="space-y-1">
              {NAV.map((i) => navButton(i, "side"))}
            </nav>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-6 lg:pt-8 pb-28 lg:pb-12">
              {page === "dashboard" ? (
                <DashboardPage go={go} onImportHistory={goDataSettings} />
              ) : page === "recipes" ? (
                <RecipesPage
                  openId={openRecipeId}
                  onOpen={openRecipe}
                  onCloseDetail={() => setOpenRecipeId(null)}
                />
              ) : page === "quote" ? (
                <QuotePage />
              ) : page === "ingredients" ? (
                <IngredientsPage />
              ) : page === "sales" ? (
                <SalesPage />
              ) : page === "packaging" ? (
                <PackagingPage />
              ) : page === "components" ? (
                <ComponentsPage />
              ) : page === "settings" ? (
                <SettingsPage tab={settingsTab} onTabChange={setSettingsTab} />
              ) : (
                <MorePage go={go} />
              )}
            </div>
          </main>
        </div>

        {/* Mobile bottom nav */}
        <nav
          aria-label="Main"
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg)]/95 backdrop-blur border-t border-[var(--border)] pb-safe"
        >
          <div className="flex">
            {BOTTOM_NAV.map((i) => navButton(i, "bottom"))}
            {navButton(
              { page: "more", label: "More", icon: <IconDots /> },
              "bottom",
            )}
          </div>
        </nav>
      </div>
    </ToastProvider>
  );
}
