import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { 
  Cake, 
  Carrot, 
  Package, 
  Flask,
  ArrowRight,
  TrendUp
} from "@phosphor-icons/react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Dashboard() {
  const [stats, setStats] = useState({
    recipes: 0,
    ingredients: 0,
    packaging: 0,
    components: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [recipesRes, ingredientsRes, packagingRes, componentsRes] = await Promise.all([
          axios.get(`${API}/recipes`),
          axios.get(`${API}/ingredients`),
          axios.get(`${API}/packaging`),
          axios.get(`${API}/component-recipes`)
        ]);
        
        setStats({
          recipes: recipesRes.data.length,
          ingredients: ingredientsRes.data.length,
          packaging: packagingRes.data.length,
          components: componentsRes.data.length
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
  }, []);

  const statCards = [
    { 
      label: "Recipes", 
      value: stats.recipes, 
      icon: Cake, 
      link: "/recipes",
      color: "#2C1E16"
    },
    { 
      label: "Ingredients", 
      value: stats.ingredients, 
      icon: Carrot, 
      link: "/ingredients",
      color: "#C57B57"
    },
    { 
      label: "Packaging", 
      value: stats.packaging, 
      icon: Package, 
      link: "/packaging",
      color: "#4A6B53"
    },
    { 
      label: "Components", 
      value: stats.components, 
      icon: Flask, 
      link: "/components",
      color: "#D99441"
    }
  ];

  return (
    <div data-testid="dashboard-page">
      <header className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="text-sm text-[#5C554D] mt-1">
          Welcome to Shadow Cakes Pricing Tool
        </p>
      </header>
      
      <div className="p-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((card, index) => (
            <Link 
              key={card.label}
              to={card.link}
              className={`card-flat p-6 hover:shadow-sm transition-shadow animate-fade-in-up stagger-${index + 1}`}
              data-testid={`stat-card-${card.label.toLowerCase()}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div 
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${card.color}10` }}
                >
                  <card.icon 
                    className="w-6 h-6" 
                    weight="duotone"
                    style={{ color: card.color }}
                  />
                </div>
                <ArrowRight className="w-5 h-5 text-[#E8E3D9]" />
              </div>
              <div>
                <p className="text-3xl font-outfit font-semibold text-[#1A1A1A] mb-1">
                  {loading ? "..." : card.value}
                </p>
                <p className="text-sm text-[#5C554D]">{card.label}</p>
              </div>
            </Link>
          ))}
        </div>
        
        {/* Quick Actions */}
        <div className="card-flat p-6 mb-8 animate-fade-in-up stagger-5">
          <h2 className="font-outfit font-medium text-lg text-[#1A1A1A] mb-4">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link 
              to="/import"
              className="btn-primary inline-flex items-center gap-2"
              data-testid="quick-action-import"
            >
              Import Data
            </Link>
            <Link 
              to="/recipes"
              className="btn-secondary inline-flex items-center gap-2"
              data-testid="quick-action-recipes"
            >
              View Recipes
            </Link>
            <Link 
              to="/settings"
              className="btn-secondary inline-flex items-center gap-2"
              data-testid="quick-action-settings"
            >
              Configure Rates
            </Link>
          </div>
        </div>
        
        {/* Getting Started */}
        {stats.recipes === 0 && !loading && (
          <div className="card-flat p-8 text-center animate-fade-in-up">
            <div className="w-16 h-16 rounded-full bg-[#F4F1EA] flex items-center justify-center mx-auto mb-4">
              <TrendUp className="w-8 h-8 text-[#C57B57]" weight="duotone" />
            </div>
            <h3 className="font-outfit font-medium text-xl text-[#1A1A1A] mb-2">
              Get Started
            </h3>
            <p className="text-[#5C554D] mb-6 max-w-md mx-auto">
              Import your ingredients and recipes from Excel spreadsheets to start calculating accurate recipe costs.
            </p>
            <Link 
              to="/import"
              className="btn-primary inline-flex items-center gap-2"
              data-testid="get-started-import"
            >
              Import Your Data
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
