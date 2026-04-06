import { useEffect, useState, useCallback, useRef } from "react";
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

export default function ComponentDetailPage() {
  const { componentId } = useParams();
  const navigate = useNavigate();
  
  const [component, setComponent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [costBreakdown, setCostBreakdown] = useState(null);
  const [costLoading, setCostLoading] = useState(false);
  
  const [ingredients, setIngredients] = useState([]);
  const [ingredientPrices, setIngredientPrices] = useState([]);
  const [packagingList, setPackagingList] = useState([]);
  
  const [addIngredientOpen, setAddIngredientOpen] = useState(false);
  const [addPackagingOpen, setAddPackagingOpen] = useState(false);
  const [addVariantOpen, setAddVariantOpen] = useState(false);
  
  const [newIngredient, setNewIngredient] = useState({ ingredient_id: "", quantity: "", unit: "g" });
  const [newPackaging, setNewPackaging] = useState({ packaging_id: "", quantity: 1 });
  const [newVariant, setNewVariant] = useState({ name: "", prep_time_minutes: 0, utility_time_minutes: 0 });
  const [editingPrepTime, setEditingPrepTime] = useState(false);
  const [tempPrepTime, setTempPrepTime] = useState(0);
  const [editingUtilityTime, setEditingUtilityTime] = useState(false);
  const [tempUtilityTime, setTempUtilityTime] = useState(0);
  const [editingBatchYield, setEditingBatchYield] = useState(false);
  const [tempBatchYield, setTempBatchYield] = useState(0);

  const fetchComponent = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/component-recipes/${componentId}`);
      setComponent(res.data);
      if (res.data.variants?.length > 0 && !selectedVariantId) {
        setSelectedVariantId(res.data.variants[0].id);
      }
    } catch (error) {
      console.error("Error fetching component:", error);
      toast.error("Failed to load component");
    } finally {
      setLoading(false);
    }
  }, [componentId, selectedVariantId]);

  const fetchMasterData = async () => {
    try {
      const [ingRes, pricesRes, pkgRes] = await Promise.all([
        axios.get(`${API}/ingredients`),
        axios.get(`${API}/ingredient-prices`),
        axios.get(`${API}/packaging`),
      ]);
      setIngredients(ingRes.data);
      setIngredientPrices(pricesRes.data);
      setPackagingList(pkgRes.data);
    } catch (error) {
      console.error("Error fetching master data:", error);
    }
  };

  useEffect(() => {
    fetchComponent();
    fetchMasterData();
  }, [fetchComponent]);

  const fetchCostBreakdown = useCallback(async () => {
    if (!selectedVariantId) return;
    setCostLoading(true);
    try {
      const res = await axios.get(`${API}/component-recipes/${componentId}/variants/${selectedVariantId}/cost`);
      setCostBreakdown(res.data);
    } catch (error) {
      console.error("Error fetching cost breakdown:", error);
    } finally {
      setCostLoading(false);
    }
  }, [componentId, selectedVariantId]);

  useEffect(() => {
    if (selectedVariantId) {
      fetchCostBreakdown();
    }
  }, [selectedVariantId, fetchCostBreakdown]);

  const handleSaveComponent = async (updatedComponent) => {
    try {
      await axios.put(`${API}/component-recipes/${componentId}`, updatedComponent);
      setComponent(updatedComponent);
      fetchCostBreakdown();
    } catch (error) {
      console.error("Error saving component:", error);
      toast.error("Failed to save component");
    }
  };

  const selectedVariant = component?.variants?.find(v => v.id === selectedVariantId);

  const handleAddIngredient = async () => {
    if (!newIngredient.ingredient_id) {
      toast.error("Please select an ingredient");
      return;
    }
    const ing = ingredients.find(i => i.id === newIngredient.ingredient_id);
    const updatedVariants = component.variants.map(v => {
      if (v.id === selectedVariantId) {
        return {
          ...v,
          ingredients: [...v.ingredients, {
            id: crypto.randomUUID(),
            ingredient_id: newIngredient.ingredient_id,
            ingredient_name: ing?.name || "",
            quantity: parseFloat(newIngredient.quantity) || 0,
            unit: newIngredient.unit
          }]
        };
      }
      return v;
    });
    await handleSaveComponent({ ...component, variants: updatedVariants });
    setNewIngredient({ ingredient_id: "", quantity: "", unit: "g" });
    setAddIngredientOpen(false);
  };

  const handleRemoveIngredient = async (ingredientLineId) => {
    const updatedVariants = component.variants.map(v => {
      if (v.id === selectedVariantId) {
        return { ...v, ingredients: v.ingredients.filter(i => i.id !== ingredientLineId) };
      }
      return v;
    });
    await handleSaveComponent({ ...component, variants: updatedVariants });
  };

  const handleAddPackaging = async () => {
    if (!newPackaging.packaging_id) {
      toast.error("Please select a packaging item");
      return;
    }
    const pkg = packagingList.find(p => p.id === newPackaging.packaging_id);
    const updatedVariants = component.variants.map(v => {
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
    await handleSaveComponent({ ...component, variants: updatedVariants });
    setNewPackaging({ packaging_id: "", quantity: 1 });
    setAddPackagingOpen(false);
  };

  const handleRemovePackaging = async (packagingLineId) => {
    const updatedVariants = component.variants.map(v => {
      if (v.id === selectedVariantId) {
        return { ...v, packaging: v.packaging.filter(p => p.id !== packagingLineId) };
      }
      return v;
    });
    await handleSaveComponent({ ...component, variants: updatedVariants });
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
      utility_time_minutes: parseFloat(newVariant.utility_time_minutes) || 0,
      ingredients: [],
      packaging: [],
      components: []
    };
    await handleSaveComponent({ ...component, variants: [...component.variants, variant] });
    setNewVariant({ name: "", prep_time_minutes: 0, utility_time_minutes: 0 });
    setAddVariantOpen(false);
    setSelectedVariantId(variant.id);
  };

  const handleDeleteVariant = async () => {
    if (component.variants.length <= 1) {
      toast.error("Cannot delete the last variant");
      return;
    }
    if (!window.confirm("Delete this variant?")) return;
    const updatedVariants = component.variants.filter(v => v.id !== selectedVariantId);
    setSelectedVariantId(updatedVariants[0]?.id);
    await handleSaveComponent({ ...component, variants: updatedVariants });
  };

  const handleSavePrepTime = async () => {
    const updatedVariants = component.variants.map(v => {
      if (v.id === selectedVariantId) {
        return { ...v, prep_time_minutes: parseFloat(tempPrepTime) || 0 };
      }
      return v;
    });
    await handleSaveComponent({ ...component, variants: updatedVariants });
    setEditingPrepTime(false);
  };

  const handleSaveUtilityTime = async () => {
    const updatedVariants = component.variants.map(v => {
      if (v.id === selectedVariantId) {
        return { ...v, utility_time_minutes: parseFloat(tempUtilityTime) || 0 };
      }
      return v;
    });
    await handleSaveComponent({ ...component, variants: updatedVariants });
    setEditingUtilityTime(false);
  };

  const handleSaveBatchYield = async () => {
    await handleSaveComponent({ ...component, batch_yield_grams: parseFloat(tempBatchYield) || 0 });
    setEditingBatchYield(false);
  };

  const handleVendorOverride = async (ingredientLineId, priceId) => {
    const updatedVariants = component.variants.map(v => {
      if (v.id === selectedVariantId) {
        return {
          ...v,
          ingredients: v.ingredients.map(item => {
            if (item.id === ingredientLineId) {
              return { ...item, price_id_override: priceId === "default" ? null : priceId };
            }
            return item;
          })
        };
      }
      return v;
    });
    await handleSaveComponent({ ...component, variants: updatedVariants });
  };

  const formatPriceOption = (price) => {
    let label = price.store_vendor || "Unknown";
    if (price.notes) label += ` (${price.notes})`;
    return label;
  };

  if (loading) return <div className="p-8 text-center text-[#5C554D]">Loading...</div>;
  if (!component) return <div className="p-8 text-center text-[#A63C3C]">Component not found</div>;

  return (
    <div data-testid="component-detail-page">
      <header className="page-header">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate("/components")}
            className="text-[#5C554D] hover:text-[#1A1A1A]"
            data-testid="back-to-components"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="page-title">{component.name}</h1>
            <p className="text-sm text-[#5C554D] mt-1">
              {component.category || "Component Recipe"}
              {component.batch_yield_grams > 0 && ` · Yield: ${component.batch_yield_grams}g`}
            </p>
          </div>
        </div>
      </header>
      
      <div className="p-8">
        <div className="grid grid-cols-3 gap-8">
          {/* Left Column - Variant Management & Line Items */}
          <div className="col-span-2 space-y-6">
            {/* Variant Selector */}
            <div className="flex items-center gap-3 flex-wrap">
              {component.variants?.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariantId(variant.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedVariantId === variant.id
                      ? "bg-[#2C1E16] text-white"
                      : "bg-[#F4F1EA] text-[#5C554D] hover:bg-[#E8E3D9]"
                  }`}
                  data-testid={`variant-tab-${variant.id}`}
                >
                  {variant.name}
                </button>
              ))}
              <Dialog open={addVariantOpen} onOpenChange={setAddVariantOpen}>
                <DialogTrigger asChild>
                  <button className="px-4 py-2 rounded-lg text-sm border border-dashed border-[#E8E3D9] text-[#5C554D] hover:border-[#C57B57] hover:text-[#C57B57] transition-all" data-testid="add-variant-btn">
                    <Plus className="w-4 h-4 inline mr-1" />
                    Add Variant
                  </button>
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
                        placeholder="e.g., Small Batch, Full Batch"
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
                    <div>
                      <label className="form-label">Utility Time (minutes)</label>
                      <Input
                        type="number"
                        value={newVariant.utility_time_minutes}
                        onChange={(e) => setNewVariant({ ...newVariant, utility_time_minutes: e.target.value })}
                        className="form-input"
                        data-testid="new-variant-utility-time"
                      />
                    </div>
                    <Button onClick={handleAddVariant} className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F]" data-testid="confirm-add-variant">
                      Add Variant
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {selectedVariant && (
              <>
                {/* Prep Time, Utility Time & Batch Yield */}
                <div className="card-flat p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-[#5C554D]" />
                      <span className="text-sm text-[#5C554D]">Prep Time:</span>
                      {editingPrepTime ? (
                        <div className="flex items-center gap-2">
                          <Input type="number" value={tempPrepTime} onChange={(e) => setTempPrepTime(e.target.value)} className="w-24 form-input py-1" data-testid="edit-prep-time-input" />
                          <span className="text-sm">min</span>
                          <Button size="sm" onClick={handleSavePrepTime} className="bg-[#4A6B53] hover:bg-[#3d5a45]" data-testid="save-prep-time"><Check className="w-4 h-4" /></Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{selectedVariant.prep_time_minutes} min</span>
                          <button onClick={() => { setEditingPrepTime(true); setTempPrepTime(selectedVariant.prep_time_minutes); }} className="p-1 hover:bg-[#F4F1EA] rounded" data-testid="edit-prep-time-btn">
                            <PencilSimple className="w-4 h-4 text-[#5C554D]" />
                          </button>
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleDeleteVariant} className="text-[#A63C3C] hover:text-[#8B3333] hover:bg-[#A63C3C]/10" data-testid="delete-variant-btn">
                      <Trash className="w-4 h-4 mr-1" />
                      Delete Variant
                    </Button>
                  </div>
                  <div className="flex items-center gap-3">
                    <Lightning className="w-5 h-5 text-[#D99441]" />
                    <span className="text-sm text-[#5C554D]">Utility Time:</span>
                    {editingUtilityTime ? (
                      <div className="flex items-center gap-2">
                        <Input type="number" value={tempUtilityTime} onChange={(e) => setTempUtilityTime(e.target.value)} className="w-24 form-input py-1" data-testid="edit-utility-time-input" />
                        <span className="text-sm">min</span>
                        <Button size="sm" onClick={handleSaveUtilityTime} className="bg-[#4A6B53] hover:bg-[#3d5a45]" data-testid="save-utility-time"><Check className="w-4 h-4" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{selectedVariant.utility_time_minutes || 0} min</span>
                        <button onClick={() => { setEditingUtilityTime(true); setTempUtilityTime(selectedVariant.utility_time_minutes || 0); }} className="p-1 hover:bg-[#F4F1EA] rounded" data-testid="edit-utility-time-btn">
                          <PencilSimple className="w-4 h-4 text-[#5C554D]" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Flask className="w-5 h-5 text-[#C57B57]" />
                    <span className="text-sm text-[#5C554D]">Batch Yield:</span>
                    {editingBatchYield ? (
                      <div className="flex items-center gap-2">
                        <Input type="number" value={tempBatchYield} onChange={(e) => setTempBatchYield(e.target.value)} className="w-24 form-input py-1" data-testid="edit-batch-yield-input" />
                        <span className="text-sm">g</span>
                        <Button size="sm" onClick={handleSaveBatchYield} className="bg-[#4A6B53] hover:bg-[#3d5a45]" data-testid="save-batch-yield"><Check className="w-4 h-4" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{component.batch_yield_grams || 0} g</span>
                        <button onClick={() => { setEditingBatchYield(true); setTempBatchYield(component.batch_yield_grams || 0); }} className="p-1 hover:bg-[#F4F1EA] rounded" data-testid="edit-batch-yield-btn">
                          <PencilSimple className="w-4 h-4 text-[#5C554D]" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ingredients & Packaging Tabs */}
                <Tabs defaultValue="ingredients" className="card-flat overflow-hidden">
                  <TabsList className="w-full bg-[#F4F1EA] rounded-none p-1">
                    <TabsTrigger value="ingredients" className="flex-1 data-[state=active]:bg-white rounded-md" data-testid="tab-ingredients">
                      <Carrot className="w-4 h-4 mr-2" />
                      Ingredients ({selectedVariant.ingredients?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="packaging" className="flex-1 data-[state=active]:bg-white rounded-md" data-testid="tab-packaging">
                      <Package className="w-4 h-4 mr-2" />
                      Packaging ({selectedVariant.packaging?.length || 0})
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
                                <SelectContent className="bg-white border-[#E8E3D9] max-h-64">
                                  {ingredients.map((ing) => (
                                    <SelectItem key={ing.id} value={ing.id}>{ing.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="form-label">Quantity</label>
                                <Input type="number" value={newIngredient.quantity} onChange={(e) => setNewIngredient({ ...newIngredient, quantity: e.target.value })} className="form-input" data-testid="ingredient-quantity" />
                              </div>
                              <div>
                                <label className="form-label">Unit</label>
                                <Select value={newIngredient.unit} onValueChange={(v) => setNewIngredient({ ...newIngredient, unit: v })}>
                                  <SelectTrigger className="form-input" data-testid="ingredient-unit">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-white border-[#E8E3D9]">
                                    {["g", "kg", "ml", "L", "oz", "lb", "cup", "tbsp", "tsp", "piece"].map(u => (
                                      <SelectItem key={u} value={u}>{u}</SelectItem>
                                    ))}
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
                            <th className="table-header-cell">Store / Vendor</th>
                            <th className="table-header-cell w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedVariant.ingredients?.map((item) => {
                            const prices = ingredientPrices.filter(p => p.ingredient_name?.toLowerCase() === item.ingredient_name?.toLowerCase());
                            return (
                              <tr key={item.id} className="table-row">
                                <td className="table-cell font-medium">{item.ingredient_name}</td>
                                <td className="table-cell-numeric">{item.quantity}</td>
                                <td className="table-cell">{item.unit}</td>
                                <td className="table-cell">
                                  {prices.length > 0 ? (
                                    <Select value={item.price_id_override || "default"} onValueChange={(v) => handleVendorOverride(item.id, v)}>
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
                                  ) : (
                                    <span className="text-[#D99441] flex items-center gap-1 text-xs">
                                      <Warning className="w-3 h-3" />
                                      No pricing
                                    </span>
                                  )}
                                </td>
                                <td className="table-cell">
                                  <button onClick={() => handleRemoveIngredient(item.id)} className="p-1 hover:bg-[#A63C3C]/10 rounded text-[#A63C3C]" data-testid={`remove-ingredient-${item.id}`}>
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
                                  {packagingList.map((pkg) => (
                                    <SelectItem key={pkg.id} value={pkg.id}>{pkg.name} (${pkg.unit_cost})</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="form-label">Quantity</label>
                              <Input type="number" value={newPackaging.quantity} onChange={(e) => setNewPackaging({ ...newPackaging, quantity: e.target.value })} className="form-input" data-testid="packaging-quantity" />
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
                                <button onClick={() => handleRemovePackaging(item.id)} className="p-1 hover:bg-[#A63C3C]/10 rounded text-[#A63C3C]" data-testid={`remove-packaging-${item.id}`}>
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
              <h3 className="font-outfit font-medium text-lg text-[#1A1A1A] mb-4">
                Cost Breakdown
              </h3>
              
              {costLoading ? (
                <div className="text-center py-8 text-[#5C554D]">Calculating...</div>
              ) : costBreakdown ? (
                <div className="space-y-1">
                  {costBreakdown.breakdown.ingredient_costs.map((item, idx) => (
                    <div key={`ing-${idx}`} className="cost-line text-sm">
                      <div className="flex flex-col">
                        <span>{item.ingredient_name}</span>
                        <span className="text-xs text-[#5C554D]">
                          {item.store_vendor}{item.brand ? ` - ${item.brand}` : ''}
                        </span>
                      </div>
                      <span className="font-mono">${item.cost.toFixed(2)}</span>
                    </div>
                  ))}
                  {costBreakdown.breakdown.packaging_costs.map((item, idx) => (
                    <div key={`pkg-${idx}`} className="cost-line text-sm">
                      <span>{item.packaging_name} x{item.quantity}</span>
                      <span className="font-mono">${item.cost.toFixed(2)}</span>
                    </div>
                  ))}
                  {costBreakdown.breakdown.component_costs.map((item, idx) => (
                    <div key={`comp-${idx}`} className="cost-line text-sm">
                      <span>{item.component_name}</span>
                      <span className="font-mono">${item.cost.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="cost-line text-sm">
                    <span>Labour ({costBreakdown.prep_time_minutes} min @ ${costBreakdown.settings.labour_rate_per_hour}/hr)</span>
                    <span className="font-mono">${costBreakdown.breakdown.labour_cost.toFixed(2)}</span>
                  </div>
                  <div className="cost-line text-sm">
                    <span>Utilities ({costBreakdown.utility_time_minutes || 0} min @ ${costBreakdown.settings.utility_rate_per_hour}/hr)</span>
                    <span className="font-mono">${costBreakdown.breakdown.utility_cost.toFixed(2)}</span>
                  </div>
                  
                  <div className="cost-total text-lg">
                    <span>Total Cost</span>
                    <span className="font-mono text-[#2C1E16]">${costBreakdown.breakdown.total_cost.toFixed(2)}</span>
                  </div>

                  {costBreakdown.batch_yield_grams > 0 && (
                    <div className="pt-3 border-t border-[#E8E3D9]">
                      <div className="cost-line text-sm">
                        <span>Cost per gram</span>
                        <span className="font-mono">${(costBreakdown.breakdown.total_cost / costBreakdown.batch_yield_grams).toFixed(4)}/g</span>
                      </div>
                    </div>
                  )}
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
