import { NavLink, Outlet } from "react-router-dom";
import { 
  Cake, 
  Carrot, 
  Package, 
  Flask, 
  Upload, 
  Gear,
  Receipt
} from "@phosphor-icons/react";

const navItems = [
  { path: "/", label: "Sales Dashboard", icon: Receipt },
  { path: "/recipes", label: "Recipes", icon: Cake },
  { path: "/ingredients", label: "Ingredients", icon: Carrot },
  { path: "/packaging", label: "Packaging", icon: Package },
  { path: "/components", label: "Components", icon: Flask },
  { path: "/import", label: "Import", icon: Upload },
  { path: "/settings", label: "Settings", icon: Gear },
];

export default function Layout() {
  return (
    <div className="app-container flex" data-testid="app-layout">
      {/* Sidebar */}
      <aside className="sidebar w-64 flex-shrink-0 fixed h-full" data-testid="sidebar">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <img 
              src="https://customer-assets.emergentagent.com/job_recipe-costing-19/artifacts/bhoi6cdl_Shadow%20Logo-Cream.jpg" 
              alt="Shadow Cakes" 
              className="w-10 h-10 rounded-lg object-cover"
            />
            <div>
              <h1 className="font-outfit font-semibold text-lg text-[#1A1A1A] tracking-tight">
                Shadow Cakes
              </h1>
              <p className="text-xs text-[#5C554D]">Pricing Tool</p>
            </div>
          </div>
          
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? "active" : ""}`
                }
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="w-5 h-5" weight="duotone" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      
      {/* Main content */}
      <main className="flex-1 ml-64 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
