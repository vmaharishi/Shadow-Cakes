import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import RecipesPage from "@/pages/RecipesPage";
import RecipeDetailPage from "@/pages/RecipeDetailPage";
import IngredientsPage from "@/pages/IngredientsPage";
import PackagingPage from "@/pages/PackagingPage";
import ComponentsPage from "@/pages/ComponentsPage";
import ComponentDetailPage from "@/pages/ComponentDetailPage";
import ImportPage from "@/pages/ImportPage";
import SettingsPage from "@/pages/SettingsPage";
import { Toaster } from "@/components/ui/sonner";
import { PWAProvider } from "@/hooks/usePWA";

function App() {
  return (
    <div className="App">
      <PWAProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="recipes" element={<RecipesPage />} />
            <Route path="recipes/:recipeId" element={<RecipeDetailPage />} />
            <Route path="ingredients" element={<IngredientsPage />} />
            <Route path="packaging" element={<PackagingPage />} />
            <Route path="components" element={<ComponentsPage />} />
            <Route path="components/:componentId" element={<ComponentDetailPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </PWAProvider>
      <Toaster position="top-right" />
    </div>
  );
}

export default App;
