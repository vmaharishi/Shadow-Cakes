import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { 
  ArrowLeft, 
  Plus, 
  Trash,
  Clock,
  CurrencyDollar,
  Percent,
  Carrot,
  Package,
  Flask,
  Lightning,
  Fire,
  Warning,
  PencilSimple,
  Check
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RecipeDetailPage() {
  const { recipeId } = useParams();
  const navigate = useNavigate();
  
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [costBreakdown, setCostBreakdown] = useState(null);
  const [sellingPrice, setSellingPrice] = useState("");
  const [costLoading, setCostLoading] = useState(false);
  
  const [ingredients, setIngredients] = useState([]);
  const [ingredientPrices, setIngredientPrices] = useState([]);
  const [packaging, setPackaging] = useState([]);
  const [components, setComponents] = useState([]);
  
  const [addIngredientOpen, setAddIngredientOpen] = useState(false);
  const [addPackagingOpen, setAddPackagingOpen] = useState(false);
  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [addVariantOpen, setAddVariantOpen] = useState(false);
  
  const [newIngredient, setNewIngredient] = useState({ ingredient_id: "", quantity: "", unit: "g" });
  const [newPackaging, setNewPackaging] = useState({ packaging_id: "", quantity: 1 });
  const [newComponent, setNewComponent] = useState({ component_recipe_id: "", quantity: 1, use_gram_costing: false });
  const [newVariant, setNewVariant] = useState({ name: "", prep_time_minutes: 0 });
  const [editingPrepTime, setEditingPrepTime] = useState(false);
  const [tempPrepTime, setTempPrepTime] = useState(0);

  const fetchRecipe = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/recipes/${recipeId}`);
      setRecipe(res.data);
      if (res.data.variants?.length > 0 && !selectedVariantId) {
        setSelectedVariantId(res.data.variants[0].id);
      }
    } catch (error) {
      console.error("Error fetching recipe:", error);
      toast.error("Failed to load recipe");
    } finally {
      setLoading(false);
    }
  }, [recipeId, selectedVariantId]);

  const fetchMasterData = async () => {
    try {
      const [ingredientsRes, pricesRes, packagingRes, componentsRes] = await Promise.all([
        axios.get(`${API}/ingredients`),
        axios.get(`${API}/ingredient-prices`),
        axios.get(`${API}/packaging`),
        axios.get(`${API}/component-recipes`)
      ]);
      setIngredients(ingredientsRes.data);
      setIngredientPrices(pricesRes.data);
      setPackaging(packagingRes.data);
      setComponents(componentsRes.data);
    } catch (error) {
      console.error("Error fetching master data:", error);
    }
  };

  const fetchCostBreakdown = useCallback(async () => {
    if (!selectedVariantId) return;
    setCostLoading(true);
    try {
      const price = sellingPrice ? `?selling_price=${sellingPrice}` : "";
      const res = await axios.get(`${API}/recipes/${recipeId}/variants/${selectedVariantId}/cost${price}`);
      setCostBreakdown(res.data);
    } catch (error) {
      console.error("Error fetching cost breakdown:", error);
    } finally {
      setCostLoading(false);
    }
  }, [recipeId, selectedVariantId, sellingPrice]);

  useEffect(() => {
    fetchRecipe();
    fetchMasterData();
  }, [fetchRecipe]);

  useEffect(() => {
    if (selectedVariantId) {
      fetchCostBreakdown();
    }
  }, [selectedVariantId, fetchCostBreakdown]);

  const selectedVariant = recipe?.variants?.find(v => v.id === selectedVariantId);

  const handleSaveRecipe = async (updatedRecipe) => {
    try {
      await axios.put(`${API}/recipes/${recipeId}`, updatedRecipe);
      toast.success("Recipe updated");
      fetchRecipe();
      fetchCostBreakdown();
    } catch (error) {
      console.error("Error saving recipe:", error);
      toast.error("Failed to save recipe");
    }
  };

  const handleAddIngredient = async () => {
    if (!newIngredient.ingredient_id || !newIngredient.quantity) {
      toast.error("Please select an ingredient and enter quantity");
      return;
    }
    
    const ingredient = ingredients.find(i => i.id === newIngredient.ingredient_id);
    const updatedVariants = recipe.variants.map(v => {
      if (v.id === selectedVariantId) {
        return {
          ...v,
          ingredients: [...v.ingredients, {
            id: crypto.randomUUID(),
            ingredient_id: newIngredient.ingredient_id,
            ingredient_name: ingredient?.name || "",
            quantity: parseFloat(newIngredient.quantity),
            unit: newIngredient.unit,
            store_vendor_override: null
          }]
        };
      }
      return v;
    });
    
    await handleSaveRecipe({ ...recipe, variants: updatedVariants });
    setNewIngredient({ ingredient_id: "", quantity: "", unit: "g" });
    setAddIngredientOpen(false);
  };

  const handleRemoveIngredient = async (ingredientLineId) => {
    const updatedVariants = recipe.variants.map(v => {
      if (v.id === selectedVariantId) {
        return {
          ...v,
          ingredients: v.ingredients.filter(i => i.id !== ingredientLineId)
        };
      }
      return v;
    });
    await handleSaveRecipe({ ...recipe, variants: updatedVariants });
  };

  const handleVendorOverride = async (ingredientLineId, priceId) => {
    const updatedVariants = recipe.variants.map(v => {
      if (v.id === selectedVariantId) {
        return {
          ...v,
          ingredients: v.ingredients.map(i => {
            if (i.id === ingredientLineId) {
              return { ...i, price_id_override: priceId === "default" ? null : priceId };
            }
            return i;
          })
        };
      }
      return v;
    });
    await handleSaveRecipe({ ...recipe, variants: updatedVariants });
  };

  const handleAddPackaging = async () => {
    if (!newPackaging.packaging_id) {
      toast.error("Please select a packaging item");
      return;
    }
    
    const pkg = packaging.find(p => p.id === newPackaging.packaging_id);
    const updatedVariants = recipe.variants.map(v => {
      if (v.id === selectedVariantId) {
        return {
          ...v,
          packaging: [...v.packaging, {
            id: crypto.randomUUID(),
            packaging_id: newPackaging.packaging_id,
            packaging_name: pkg?.name || "",
            quantity: parseFloat(newPackaging.quantity) || 1
          }]
        };
      }
      return v;
    });
    
    await handleSaveRecipe({ ...recipe, variants: updatedVariants });
    setNewPackaging({ packaging_id: "", quantity: 1 });
    setAddPackagingOpen(false);
  };

  const handleRemovePackaging = async (packagingLineId) => {
    const updatedVariants = recipe.variants.map(v => {
      if (v.id === selectedVariantId) {
        return {
          ...v,
          packaging: v.packaging.filter(p => p.id !== packagingLineId)
        };
      }
      return v;
    });
    await handleSaveRecipe({ ...recipe, variants: updatedVariants });
  };

  const handleAddComponent = async () => {
    if (!newComponent.component_recipe_id) {
      toast.error("Please select a component");
      return;
    }
    
    const comp = components.find(c => c.id === newComponent.component_recipe_id);
    const updatedVariants = recipe.variants.map(v => {
      if (v.id === selectedVariantId) {
        return {
          ...v,
          components: [...v.components, {
            id: crypto.randomUUID(),
            component_recipe_id: newComponent.component_recipe_id,
            component_name: comp?.name || "",
            quantity: parseFloat(newComponent.quantity) || 1,
            use_gram_costing: newComponent.use_gram_costing
          }]
        };
      }
      return v;
    });
    
    await handleSaveRecipe({ ...recipe, variants: updatedVariants });
    setNewComponent({ component_recipe_id: "", quantity: 1, use_gram_costing: false });
    setAddComponentOpen(false);
  };

  const handleRemoveComponent = async (componentRefId) => {
    const updatedVariants = recipe.variants.map(v => {
      if (v.id === selectedVariantId) {
        return {
          ...v,
          components: v.components.filter(c => c.id !== componentRefId)
        };
      }
      return v;
    });
    await handleSaveRecipe({ ...recipe, variants: updatedVariants });
  };

  const handleAddVariant = async () => {
    if (!newVariant.name) {
      toast.error("Variant name is required");
      return;
    }
    
    const variant = {
      id: crypto.randomUUID(),
      name: newVariant.name,
      prep_time_minutes: parseFloat(newVariant.prep_time_minutes) || 0,
      ingredients: [],
      packaging: [],
      components: []
    };
    
    await handleSaveRecipe({ ...recipe, variants: [...recipe.variants, variant] });
    setNewVariant({ name: "", prep_time_minutes: 0 });
    setAddVariantOpen(false);
    setSelectedVariantId(variant.id);
  };

  const handleDeleteVariant = async () => {
    if (recipe.variants.length <= 1) {
      toast.error("Recipe must have at least one variant");
      return;
    }
    if (!window.confirm("Delete this variant?")) return;
    
    const updatedVariants = recipe.variants.filter(v => v.id !== selectedVariantId);
    await handleSaveRecipe({ ...recipe, variants: updatedVariants });
    setSelectedVariantId(updatedVariants[0]?.id || null);
  };

  const handleSavePrepTime = async () => {
    const updatedVariants = recipe.variants.map(v => {
      if (v.id === selectedVariantId) {
        return { ...v, prep_time_minutes: parseFloat(tempPrepTime) || 0 };
      }
      return v;
    });
    await handleSaveRecipe({ ...recipe, variants: updatedVariants });
    setEditingPrepTime(false);
  };

  const getPricesForIngredient = (ingredientId) => {
    return ingredientPrices.filter(p => p.ingredient_id === ingredientId);
  };

  const formatPriceOption = (price) => {
    const brand = price.notes ? ` - ${price.notes}` : '';
    return `${price.store_vendor}${brand}`;
  };

  if (loading) {
    return <div className="p-8 text-center text-[#5C554D]">Loading...</div>;
  }

  if (!recipe) {
    return <div className="p-8 text-center text-[#5C554D]">Recipe not found</div>;
  }

  return (
    <div data-testid="recipe-detail-page">
      <header className="page-header">
        <button 
          onClick={() => navigate("/recipes")}
          className="flex items-center gap-2 text-[#5C554D] hover:text-[#2C1E16] mb-4 transition-colors"
          data-testid="back-to-recipes"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Recipes
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">{recipe.name}</h1>
            {recipe.category && (
              <p className="text-sm text-[#5C554D] mt-1">{recipe.category}</p>
            )}
          </div>
        </div>
      </header>
      
      <div className="p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Variant Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Variant Selector */}
            <div className="card-flat p-4">
              <div className="flex items-center justify-between mb-4">
                <label className="form-label mb-0">Recipe Variant</label>
                <Dialog open={addVariantOpen} onOpenChange={setAddVariantOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-[#C57B57]" data-testid="add-variant-btn">
                      <Plus className="w-4 h-4 mr-1" />
                      Add Variant
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-white border-[#E8E3D9]">
                    <DialogHeader>
                      <DialogTitle className="font-outfit">Add Variant</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div>
                        <label className="form-label">Variant Name *</label>
                        <Input
                          value={newVariant.name}
                          onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })}
                          placeholder="e.g., 10-inch"
                          className="form-input"
                          data-testid="new-variant-name"
                        />
                      </div>
                      <div>
                        <label className="form-label">Prep Time (minutes)</label>
                        <Input
                          type="number"
                          value={newVariant.prep_time_minutes}
                          onChange={(e) => setNewVariant({ ...newVariant, prep_time_minutes: e.target.value })}
                          className="form-input"
                          data-testid="new-variant-prep-time"
                        />
                      </div>
                      <Button onClick={handleAddVariant} className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F]" data-testid="confirm-add-variant">
                        Add Variant
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="flex flex-wrap gap-2">
                {recipe.variants?.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      selectedVariantId === variant.id
                        ? "bg-[#2C1E16] text-white"
                        : "bg-[#F4F1EA] text-[#5C554D] hover:bg-[#E8E3D9]"
                    }`}
                    data-testid={`variant-tab-${variant.id}`}
                  >
                    {variant.name}
                  </button>
                ))}
              </div>
            </div>

            {selectedVariant && (
              <>
                {/* Prep Time */}
                <div className="card-flat p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-[#5C554D]" />
                      <span className="text-sm text-[#5C554D]">Prep Time:</span>
                      {editingPrepTime ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={tempPrepTime}
                            onChange={(e) => setTempPrepTime(e.target.value)}
                            className="w-24 form-input py-1"
                            data-testid="edit-prep-time-input"
                          />
                          <span className="text-sm">min</span>
                          <Button size="sm" onClick={handleSavePrepTime} className="bg-[#4A6B53] hover:bg-[#3d5a45]" data-testid="save-prep-time">
                            <Check className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{selectedVariant.prep_time_minutes} min</span>
                          <button 
                            onClick={() => { setEditingPrepTime(true); setTempPrepTime(selectedVariant.prep_time_minutes); }}
                            className="p-1 hover:bg-[#F4F1EA] rounded"
                            data-testid="edit-prep-time-btn"
                          >
                            <PencilSimple className="w-4 h-4 text-[#5C554D]" />
                          </button>
                        </div>
                      )}
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleDeleteVariant}
                      className="text-[#A63C3C] hover:text-[#8B3333] hover:bg-[#A63C3C]/10"
                      data-testid="delete-variant-btn"
                    >
                      <Trash className="w-4 h-4 mr-1" />
                      Delete Variant
                    </Button>
                  </div>
                </div>

                {/* Tabs for Ingredients, Packaging, Components */}
                <Tabs defaultValue="ingredients" className="card-flat">
                  <TabsList className="w-full border-b border-[#E8E3D9] bg-transparent p-0 h-auto">
                    <TabsTrigger 
                      value="ingredients"
                      className="flex-1 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-[#2C1E16] data-[state=active]:bg-transparent"
                      data-testid="tab-ingredients"
                    >
                      <Carrot className="w-4 h-4 mr-2" />
                      Ingredients ({selectedVariant.ingredients?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger 
                      value="packaging"
                      className="flex-1 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-[#2C1E16] data-[state=active]:bg-transparent"
                      data-testid="tab-packaging"
                    >
                      <Package className="w-4 h-4 mr-2" />
                      Packaging ({selectedVariant.packaging?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger 
                      value="components"
                      className="flex-1 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-[#2C1E16] data-[state=active]:bg-transparent"
                      data-testid="tab-components"
                    >
                      <Flask className="w-4 h-4 mr-2" />
                      Components ({selectedVariant.components?.length || 0})
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Ingredients Tab */}
                  <TabsContent value="ingredients" className="p-4">
                    <div className="flex justify-end mb-4">
                      <Dialog open={addIngredientOpen} onOpenChange={setAddIngredientOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="bg-[#2C1E16] hover:bg-[#3E2A1F]" data-testid="add-ingredient-btn">
                            <Plus className="w-4 h-4 mr-1" />
                            Add Ingredient
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-white border-[#E8E3D9]">
                          <DialogHeader>
                            <DialogTitle className="font-outfit">Add Ingredient</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div>
                              <label className="form-label">Ingredient *</label>
                              <Select value={newIngredient.ingredient_id} onValueChange={(v) => setNewIngredient({ ...newIngredient, ingredient_id: v })}>
                                <SelectTrigger className="form-input" data-testid="select-ingredient">
                                  <SelectValue placeholder="Select ingredient" />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-[#E8E3D9]">
                                  {ingredients.map((ing) => (
                                    <SelectItem key={ing.id} value={ing.id}>{ing.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="form-label">Quantity *</label>
                                <Input
                                  type="number"
                                  value={newIngredient.quantity}
                                  onChange={(e) => setNewIngredient({ ...newIngredient, quantity: e.target.value })}
                                  placeholder="100"
                                  className="form-input"
                                  data-testid="ingredient-quantity"
                                />
                              </div>
                              <div>
                                <label className="form-label">Unit</label>
                                <Select value={newIngredient.unit} onValueChange={(v) => setNewIngredient({ ...newIngredient, unit: v })}>
                                  <SelectTrigger className="form-input" data-testid="ingredient-unit">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-white border-[#E8E3D9]">
                                    <SelectItem value="g">g</SelectItem>
                                    <SelectItem value="kg">kg</SelectItem>
                                    <SelectItem value="ml">ml</SelectItem>
                                    <SelectItem value="L">L</SelectItem>
                                    <SelectItem value="piece">piece</SelectItem>
                                    <SelectItem value="tbsp">tbsp</SelectItem>
                                    <SelectItem value="tsp">tsp</SelectItem>
                                    <SelectItem value="cup">cup</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <Button onClick={handleAddIngredient} className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F]" data-testid="confirm-add-ingredient">
                              Add Ingredient
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    
                    {selectedVariant.ingredients?.length === 0 ? (
                      <p className="text-center py-8 text-[#5C554D]">No ingredients added yet</p>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="table-header-cell">Ingredient</th>
                            <th className="table-header-cell text-right">Qty</th>
                            <th className="table-header-cell">Unit</th>
                            <th className="table-header-cell">Vendor</th>
                            <th className="table-header-cell w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedVariant.ingredients?.map((item) => {
                            const prices = getPricesForIngredient(item.ingredient_id);
                            return (
                              <tr key={item.id} className="table-row">
                                <td className="table-cell font-medium">{item.ingredient_name}</td>
                                <td className="table-cell-numeric">{item.quantity}</td>
                                <td className="table-cell">{item.unit}</td>
                                <td className="table-cell">
                                  {prices.length > 0 ? (
                                    <div className="flex items-center gap-2">
                                      <Select 
                                        value={item.price_id_override || "default"} 
                                        onValueChange={(v) => handleVendorOverride(item.id, v)}
                                      >
                                        <SelectTrigger className="h-8 text-xs border-[#E8E3D9] min-w-[180px]" data-testid={`vendor-select-${item.id}`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-[#E8E3D9]">
                                          <SelectItem value="default">Latest Price</SelectItem>
                                          {prices.map((p) => (
                                            <SelectItem key={p.id} value={p.id}>
                                              {formatPriceOption(p)} (${p.unit_cost.toFixed(4)}/{p.unit})
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {item.price_id_override && (
                                        <span className="badge-override">Override</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[#D99441] flex items-center gap-1 text-xs">
                                      <Warning className="w-3 h-3" />
                                      No pricing
                                    </span>
                                  )}
                                </td>
                                <td className="table-cell">
                                  <button 
                                    onClick={() => handleRemoveIngredient(item.id)}
                                    className="p-1 hover:bg-[#A63C3C]/10 rounded text-[#A63C3C]"
                                    data-testid={`remove-ingredient-${item.id}`}
                                  >
                                    <Trash className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </TabsContent>
                  
                  {/* Packaging Tab */}
                  <TabsContent value="packaging" className="p-4">
                    <div className="flex justify-end mb-4">
                      <Dialog open={addPackagingOpen} onOpenChange={setAddPackagingOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="bg-[#2C1E16] hover:bg-[#3E2A1F]" data-testid="add-packaging-btn">
                            <Plus className="w-4 h-4 mr-1" />
                            Add Packaging
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-white border-[#E8E3D9]">
                          <DialogHeader>
                            <DialogTitle className="font-outfit">Add Packaging</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div>
                              <label className="form-label">Packaging Item *</label>
                              <Select value={newPackaging.packaging_id} onValueChange={(v) => setNewPackaging({ ...newPackaging, packaging_id: v })}>
                                <SelectTrigger className="form-input" data-testid="select-packaging">
                                  <SelectValue placeholder="Select packaging" />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-[#E8E3D9]">
                                  {packaging.map((pkg) => (
                                    <SelectItem key={pkg.id} value={pkg.id}>{pkg.name} (${pkg.unit_cost})</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="form-label">Quantity</label>
                              <Input
                                type="number"
                                value={newPackaging.quantity}
                                onChange={(e) => setNewPackaging({ ...newPackaging, quantity: e.target.value })}
                                className="form-input"
                                data-testid="packaging-quantity"
                              />
                            </div>
                            <Button onClick={handleAddPackaging} className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F]" data-testid="confirm-add-packaging">
                              Add Packaging
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    
                    {selectedVariant.packaging?.length === 0 ? (
                      <p className="text-center py-8 text-[#5C554D]">No packaging added yet</p>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="table-header-cell">Item</th>
                            <th className="table-header-cell text-right">Qty</th>
                            <th className="table-header-cell w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedVariant.packaging?.map((item) => (
                            <tr key={item.id} className="table-row">
                              <td className="table-cell font-medium">{item.packaging_name}</td>
                              <td className="table-cell-numeric">{item.quantity}</td>
                              <td className="table-cell">
                                <button 
                                  onClick={() => handleRemovePackaging(item.id)}
                                  className="p-1 hover:bg-[#A63C3C]/10 rounded text-[#A63C3C]"
                                  data-testid={`remove-packaging-${item.id}`}
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </TabsContent>
                  
                  {/* Components Tab */}
                  <TabsContent value="components" className="p-4">
                    <div className="flex justify-end mb-4">
                      <Dialog open={addComponentOpen} onOpenChange={setAddComponentOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="bg-[#2C1E16] hover:bg-[#3E2A1F]" data-testid="add-component-btn">
                            <Plus className="w-4 h-4 mr-1" />
                            Add Component
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-white border-[#E8E3D9]">
                          <DialogHeader>
                            <DialogTitle className="font-outfit">Add Component Recipe</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div>
                              <label className="form-label">Component *</label>
                              <Select value={newComponent.component_recipe_id} onValueChange={(v) => setNewComponent({ ...newComponent, component_recipe_id: v })}>
                                <SelectTrigger className="form-input" data-testid="select-component">
                                  <SelectValue placeholder="Select component" />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-[#E8E3D9]">
                                  {components.map((comp) => (
                                    <SelectItem key={comp.id} value={comp.id}>{comp.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="form-label">Quantity (grams or batch multiplier)</label>
                              <Input
                                type="number"
                                value={newComponent.quantity}
                                onChange={(e) => setNewComponent({ ...newComponent, quantity: e.target.value })}
                                className="form-input"
                                data-testid="component-quantity"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="gramCosting"
                                checked={newComponent.use_gram_costing}
                                onChange={(e) => setNewComponent({ ...newComponent, use_gram_costing: e.target.checked })}
                                className="rounded border-[#E8E3D9]"
                                data-testid="gram-costing-checkbox"
                              />
                              <label htmlFor="gramCosting" className="text-sm text-[#5C554D]">
                                Use gram costing (quantity = grams needed)
                              </label>
                            </div>
                            <Button onClick={handleAddComponent} className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F]" data-testid="confirm-add-component">
                              Add Component
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    
                    {selectedVariant.components?.length === 0 ? (
                      <p className="text-center py-8 text-[#5C554D]">No components added yet</p>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="table-header-cell">Component</th>
                            <th className="table-header-cell text-right">Qty</th>
                            <th className="table-header-cell">Type</th>
                            <th className="table-header-cell w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedVariant.components?.map((item) => (
                            <tr key={item.id} className="table-row">
                              <td className="table-cell font-medium">{item.component_name}</td>
                              <td className="table-cell-numeric">{item.quantity}</td>
                              <td className="table-cell">
                                <span className="text-xs px-2 py-1 rounded bg-[#F4F1EA]">
                                  {item.use_gram_costing ? "grams" : "batch"}
                                </span>
                              </td>
                              <td className="table-cell">
                                <button 
                                  onClick={() => handleRemoveComponent(item.id)}
                                  className="p-1 hover:bg-[#A63C3C]/10 rounded text-[#A63C3C]"
                                  data-testid={`remove-component-${item.id}`}
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
          
          {/* Right Column - Cost Breakdown */}
          <div className="space-y-6">
            <div className="card-flat p-6 sticky top-8">
              <h3 className="font-outfit font-medium text-lg text-[#1A1A1A] mb-4 flex items-center gap-2">
                <CurrencyDollar className="w-5 h-5 text-[#C57B57]" />
                Cost Breakdown
              </h3>
              
              {costLoading ? (
                <div className="text-center py-8 text-[#5C554D]">Calculating...</div>
              ) : costBreakdown ? (
                <div className="space-y-4">
                  {/* Ingredients */}
                  {costBreakdown.breakdown.ingredient_costs.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-2">
                        <Carrot className="w-4 h-4" />
                        Ingredients
                      </div>
                      {costBreakdown.breakdown.ingredient_costs.map((item, idx) => (
                        <div key={idx} className="cost-line text-sm">
                          <div className="flex flex-col">
                            <span>{item.ingredient_name}</span>
                            <span className="text-xs text-[#5C554D]">
                              {item.store_vendor}{item.brand ? ` - ${item.brand}` : ''}
                              {item.is_override && <span className="badge-override ml-1 text-[10px]">Override</span>}
                            </span>
                          </div>
                          <span className="font-mono">${item.cost.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="cost-line font-medium pt-2">
                        <span>Subtotal</span>
                        <span className="font-mono">${costBreakdown.breakdown.total_ingredient_cost.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Packaging */}
                  {costBreakdown.breakdown.packaging_costs.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-2">
                        <Package className="w-4 h-4" />
                        Packaging
                      </div>
                      {costBreakdown.breakdown.packaging_costs.map((item, idx) => (
                        <div key={idx} className="cost-line text-sm">
                          <span>{item.packaging_name} ×{item.quantity}</span>
                          <span className="font-mono">${item.cost.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="cost-line font-medium pt-2">
                        <span>Subtotal</span>
                        <span className="font-mono">${costBreakdown.breakdown.total_packaging_cost.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Components */}
                  {costBreakdown.breakdown.component_costs.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-2">
                        <Flask className="w-4 h-4" />
                        Components
                      </div>
                      {costBreakdown.breakdown.component_costs.map((item, idx) => (
                        <div key={idx} className="cost-line text-sm">
                          <span>{item.component_name}</span>
                          <span className="font-mono">${item.cost.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="cost-line font-medium pt-2">
                        <span>Subtotal</span>
                        <span className="font-mono">${costBreakdown.breakdown.total_component_cost.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Labour & Utilities */}
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-2">
                      <Lightning className="w-4 h-4" />
                      Labour & Utilities
                    </div>
                    <div className="cost-line text-sm">
                      <span className="flex items-center gap-1">
                        <Fire className="w-3 h-3" />
                        Labour ({costBreakdown.prep_time_minutes} min @ ${costBreakdown.settings.labour_rate_per_hour}/hr)
                      </span>
                      <span className="font-mono">${costBreakdown.breakdown.labour_cost.toFixed(2)}</span>
                    </div>
                    <div className="cost-line text-sm">
                      <span className="flex items-center gap-1">
                        <Lightning className="w-3 h-3" />
                        Utilities ({costBreakdown.prep_time_minutes} min @ ${costBreakdown.settings.utility_rate_per_hour}/hr)
                      </span>
                      <span className="font-mono">${costBreakdown.breakdown.utility_cost.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  {/* Total */}
                  <div className="cost-total text-lg">
                    <span>Total Cost</span>
                    <span className="font-mono text-[#2C1E16]">${costBreakdown.breakdown.total_cost.toFixed(2)}</span>
                  </div>
                  
                  {/* Selling Price & Margin */}
                  <div className="pt-4 border-t border-[#E8E3D9]">
                    <label className="form-label">Selling Price (CAD)</label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={sellingPrice}
                        onChange={(e) => setSellingPrice(e.target.value)}
                        placeholder="0.00"
                        className="form-input font-mono"
                        data-testid="selling-price-input"
                      />
                      <Button 
                        onClick={fetchCostBreakdown}
                        className="bg-[#C57B57] hover:bg-[#b06a48] text-white"
                        data-testid="calculate-margin-btn"
                      >
                        <Percent className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    {costBreakdown.breakdown.profit_margin !== null && (
                      <div className="mt-4 p-4 rounded-lg bg-[#F4F1EA]">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-[#5C554D]">Profit Margin</span>
                          <span className={`text-2xl font-outfit font-semibold ${
                            costBreakdown.breakdown.profit_margin >= 0 ? "text-[#4A6B53]" : "text-[#A63C3C]"
                          }`}>
                            {costBreakdown.breakdown.profit_margin.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-2 text-sm">
                          <span className="text-[#5C554D]">Profit</span>
                          <span className={`font-mono font-medium ${
                            costBreakdown.breakdown.profit_margin >= 0 ? "text-[#4A6B53]" : "text-[#A63C3C]"
                          }`}>
                            ${(costBreakdown.breakdown.selling_price - costBreakdown.breakdown.total_cost).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-center py-8 text-[#5C554D]">Select a variant to see costs</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
