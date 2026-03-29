import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { 
  CookingPot, 
  Plus, 
  MagnifyingGlass,
  DotsThreeVertical,
  Trash,
  PencilSimple
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RecipesPage() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ name: "", category: "", notes: "" });
  const [newVariant, setNewVariant] = useState({ name: "", prep_time_minutes: 0 });

  const fetchRecipes = async () => {
    try {
      const res = await axios.get(`${API}/recipes`);
      setRecipes(res.data);
    } catch (error) {
      console.error("Error fetching recipes:", error);
      toast.error("Failed to load recipes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  const handleCreateRecipe = async () => {
    if (!newRecipe.name.trim()) {
      toast.error("Recipe name is required");
      return;
    }
    
    try {
      const recipeData = {
        ...newRecipe,
        variants: newVariant.name ? [{ 
          name: newVariant.name,
          prep_time_minutes: parseFloat(newVariant.prep_time_minutes) || 0,
          ingredients: [],
          packaging: [],
          components: []
        }] : []
      };
      
      await axios.post(`${API}/recipes`, recipeData);
      toast.success("Recipe created successfully");
      setDialogOpen(false);
      setNewRecipe({ name: "", category: "", notes: "" });
      setNewVariant({ name: "", prep_time_minutes: 0 });
      fetchRecipes();
    } catch (error) {
      console.error("Error creating recipe:", error);
      toast.error("Failed to create recipe");
    }
  };

  const handleDeleteRecipe = async (recipeId) => {
    if (!window.confirm("Are you sure you want to delete this recipe?")) return;
    
    try {
      await axios.delete(`${API}/recipes/${recipeId}`);
      toast.success("Recipe deleted");
      fetchRecipes();
    } catch (error) {
      console.error("Error deleting recipe:", error);
      toast.error("Failed to delete recipe");
    }
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.name.toLowerCase().includes(search.toLowerCase()) ||
    recipe.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div data-testid="recipes-page">
      <header className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Recipes</h1>
          <p className="text-sm text-[#5C554D] mt-1">
            {recipes.length} recipe{recipes.length !== 1 ? "s" : ""} in your library
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              className="bg-[#2C1E16] hover:bg-[#3E2A1F] text-white"
              data-testid="add-recipe-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Recipe
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-[#E8E3D9]">
            <DialogHeader>
              <DialogTitle className="font-outfit">Create New Recipe</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="form-label">Recipe Name *</label>
                <Input
                  value={newRecipe.name}
                  onChange={(e) => setNewRecipe({ ...newRecipe, name: e.target.value })}
                  placeholder="e.g., Chocolate Cake"
                  className="form-input"
                  data-testid="recipe-name-input"
                />
              </div>
              <div>
                <label className="form-label">Category</label>
                <Input
                  value={newRecipe.category}
                  onChange={(e) => setNewRecipe({ ...newRecipe, category: e.target.value })}
                  placeholder="e.g., Cakes, Cookies"
                  className="form-input"
                  data-testid="recipe-category-input"
                />
              </div>
              <div>
                <label className="form-label">First Variant Name</label>
                <Input
                  value={newVariant.name}
                  onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })}
                  placeholder="e.g., 6-inch, 8-inch"
                  className="form-input"
                  data-testid="variant-name-input"
                />
              </div>
              <div>
                <label className="form-label">Prep Time (minutes)</label>
                <Input
                  type="number"
                  value={newVariant.prep_time_minutes}
                  onChange={(e) => setNewVariant({ ...newVariant, prep_time_minutes: e.target.value })}
                  placeholder="60"
                  className="form-input"
                  data-testid="prep-time-input"
                />
              </div>
              <div>
                <label className="form-label">Notes</label>
                <Input
                  value={newRecipe.notes}
                  onChange={(e) => setNewRecipe({ ...newRecipe, notes: e.target.value })}
                  placeholder="Optional notes..."
                  className="form-input"
                  data-testid="recipe-notes-input"
                />
              </div>
              <Button 
                onClick={handleCreateRecipe}
                className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F] text-white"
                data-testid="create-recipe-btn"
              >
                Create Recipe
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>
      
      <div className="p-8">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5C554D]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="pl-10 form-input"
              data-testid="search-recipes-input"
            />
          </div>
        </div>
        
        {/* Recipes Grid */}
        {loading ? (
          <div className="text-center py-12 text-[#5C554D]">Loading...</div>
        ) : filteredRecipes.length === 0 ? (
          <div className="empty-state">
            <CookingPot className="empty-state-icon" weight="duotone" />
            <h3 className="empty-state-title">No recipes yet</h3>
            <p className="empty-state-description">
              Create your first recipe or import recipes from an Excel spreadsheet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecipes.map((recipe, index) => (
              <div 
                key={recipe.id}
                className={`card-flat p-6 hover:shadow-sm transition-all cursor-pointer animate-fade-in-up stagger-${(index % 5) + 1}`}
                onClick={() => navigate(`/recipes/${recipe.id}`)}
                data-testid={`recipe-card-${recipe.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-[#2C1E16]/10 flex items-center justify-center">
                    <CookingPot className="w-6 h-6 text-[#2C1E16]" weight="duotone" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <button className="p-1 rounded hover:bg-[#F4F1EA]" data-testid={`recipe-menu-${recipe.id}`}>
                        <DotsThreeVertical className="w-5 h-5 text-[#5C554D]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white border-[#E8E3D9]">
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/recipes/${recipe.id}`);
                        }}
                        className="cursor-pointer"
                      >
                        <PencilSimple className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRecipe(recipe.id);
                        }}
                        className="cursor-pointer text-[#A63C3C]"
                      >
                        <Trash className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <h3 className="font-outfit font-medium text-lg text-[#1A1A1A] mb-1">
                  {recipe.name}
                </h3>
                {recipe.category && (
                  <p className="text-sm text-[#5C554D] mb-2">{recipe.category}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  {recipe.variants?.slice(0, 3).map((variant) => (
                    <span 
                      key={variant.id}
                      className="text-xs px-2 py-1 rounded bg-[#F4F1EA] text-[#5C554D]"
                    >
                      {variant.name}
                    </span>
                  ))}
                  {recipe.variants?.length > 3 && (
                    <span className="text-xs px-2 py-1 rounded bg-[#F4F1EA] text-[#5C554D]">
                      +{recipe.variants.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
