import { NavLink, Outlet } from "react-router-dom";
import { 
  Cake, 
  Carrot, 
  Package, 
  Flask, 
  Upload, 
  Gear,
  Receipt,
  WifiSlash,
  ArrowsClockwise
} from "@phosphor-icons/react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

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
  const { isOnline, pendingCount } = useOnlineStatus();

  return (
    <div className="app-container flex" data-testid="app-layout">
      {/* Offline Banner */}
      {!isOnline && (
        <div 
          className="fixed top-0 left-0 right-0 z-50 bg-[#D99441] text-white text-center py-2 text-sm font-medium flex items-center justify-center gap-2"
          data-testid="offline-banner"
        >
          <WifiSlash className="w-4 h-4" />
          You're offline — changes will sync when you reconnect
          {pendingCount > 0 && (
            <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
              <ArrowsClockwise className="w-3 h-3 inline mr-1" />
              {pendingCount} pending
            </span>
          )}
        </div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar w-64 flex-shrink-0 fixed h-full ${!isOnline ? 'pt-10' : ''}`} data-testid="sidebar">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <img 
              src="/icon-96x96.png" 
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
      <main className={`flex-1 ml-64 min-h-screen ${!isOnline ? 'pt-10' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
