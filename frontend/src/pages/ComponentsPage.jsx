import { useEffect, useState } from "react";
import axios from "axios";
import { 
  Flask, 
  Plus, 
  MagnifyingGlass,
  Trash,
  PencilSimple,
  Carrot,
  Clock,
  CheckSquare,
  X,
  Export
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ComponentsPage() {
  const [components, setComponents] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [newComponent, setNewComponent] = useState({ 
    name: "", 
    batch_yield_grams: "", 
    prep_time_minutes: "",
    notes: "" 
  });
  const [newIngredient, setNewIngredient] = useState({ ingredient_id: "", quantity: "", unit: "g" });
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const fetchData = async () => {
    try {
      const [componentsRes, ingredientsRes] = await Promise.all([
        axios.get(`${API}/component-recipes`),
        axios.get(`${API}/ingredients`)
      ]);
      setComponents(componentsRes.data);
      setIngredients(ingredientsRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateComponent = async () => {
    if (!newComponent.name.trim()) {
      toast.error("Component name is required");
      return;
    }
    
    try {
      await axios.post(`${API}/component-recipes`, {
        name: newComponent.name,
        batch_yield_grams: parseFloat(newComponent.batch_yield_grams) || 0,
        prep_time_minutes: parseFloat(newComponent.prep_time_minutes) || 0,
        notes: newComponent.notes,
        ingredients: [],
        packaging: []
      });
      toast.success("Component recipe created");
      setDialogOpen(false);
      setNewComponent({ name: "", batch_yield_grams: "", prep_time_minutes: "", notes: "" });
      fetchData();
    } catch (error) {
      console.error("Error creating component:", error);
      toast.error("Failed to create component");
    }
  };

  const handleUpdateComponent = async () => {
    if (!selectedComponent.name.trim()) {
      toast.error("Component name is required");
      return;
    }
    
    try {
      await axios.put(`${API}/component-recipes/${selectedComponent.id}`, selectedComponent);
      toast.success("Component updated");
      setEditDialogOpen(false);
      setSelectedComponent(null);
      fetchData();
    } catch (error) {
      console.error("Error updating component:", error);
      toast.error("Failed to update component");
    }
  };

  const handleDeleteComponent = async (componentId) => {
    if (!window.confirm("Delete this component recipe?")) return;
    
    try {
      await axios.delete(`${API}/component-recipes/${componentId}`);
      toast.success("Component deleted");
      fetchData();
    } catch (error) {
      console.error("Error deleting component:", error);
      toast.error("Failed to delete component");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected component(s)?`)) return;
    
    try {
      await axios.post(`${API}/component-recipes/bulk-delete`, { ids: Array.from(selectedIds) });
      toast.success(`Deleted ${selectedIds.size} component(s)`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      fetchData();
    } catch (error) {
      console.error("Error bulk deleting:", error);
      toast.error("Failed to delete components");
    }
  };

  const handleExport = () => {
    if (components.length === 0) {
      toast.error("No components to export");
      return;
    }
    
    const headers = ["Component Name", "Batch Yield (g)", "Prep Time (min)", "Ingredients", "Notes"];
    const rows = components.map(comp => [
      comp.name,
      comp.batch_yield_grams || 0,
      comp.prep_time_minutes || 0,
      comp.ingredients?.map(i => `${i.ingredient_name} (${i.quantity} ${i.unit})`).join("; ") || "",
      (comp.notes || "").replace(/,/g, ";")
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `components_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success("Components exported");
  };

  const toggleSelection = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredComponents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredComponents.map(c => c.id)));
    }
  };

  const cancelSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleAddIngredientToComponent = () => {
    if (!newIngredient.ingredient_id || !newIngredient.quantity) {
      toast.error("Please select an ingredient and enter quantity");
      return;
    }
    
    const ingredient = ingredients.find(i => i.id === newIngredient.ingredient_id);
    const updatedComponent = {
      ...selectedComponent,
      ingredients: [...selectedComponent.ingredients, {
        id: crypto.randomUUID(),
        ingredient_id: newIngredient.ingredient_id,
        ingredient_name: ingredient?.name || "",
        quantity: parseFloat(newIngredient.quantity),
        unit: newIngredient.unit
      }]
    };
    setSelectedComponent(updatedComponent);
    setNewIngredient({ ingredient_id: "", quantity: "", unit: "g" });
  };

  const handleRemoveIngredientFromComponent = (ingredientLineId) => {
    const updatedComponent = {
      ...selectedComponent,
      ingredients: selectedComponent.ingredients.filter(i => i.id !== ingredientLineId)
    };
    setSelectedComponent(updatedComponent);
  };

  const filteredComponents = components.filter(comp =>
    comp.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div data-testid="components-page">
      <header className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Component Recipes</h1>
          <p className="text-sm text-[#5C554D] mt-1">
            {components.length} component{components.length !== 1 ? "s" : ""} (frostings, ganaches, fillings...)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSelectionMode ? (
            <>
              <span className="text-sm text-[#5C554D] mr-2">
                {selectedIds.size} selected
              </span>
              <Button 
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0}
                className="bg-[#A63C3C] hover:bg-[#8B3333] text-white"
                data-testid="bulk-delete-btn"
              >
                <Trash className="w-4 h-4 mr-2" />
                Delete Selected
              </Button>
              <Button 
                onClick={cancelSelection}
                variant="outline"
                className="border-[#E8E3D9]"
                data-testid="cancel-selection-btn"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button 
                onClick={handleExport}
                variant="outline"
                className="border-[#E8E3D9]"
                data-testid="export-components-btn"
              >
                <Export className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button 
                onClick={() => setIsSelectionMode(true)}
                variant="outline"
                className="border-[#E8E3D9]"
                data-testid="select-mode-btn"
              >
                <CheckSquare className="w-4 h-4 mr-2" />
                Select
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-[#2C1E16] hover:bg-[#3E2A1F] text-white" data-testid="add-component-btn">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Component
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white border-[#E8E3D9]">
                  <DialogHeader>
                    <DialogTitle className="font-outfit">Create Component Recipe</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <label className="form-label">Component Name *</label>
                      <Input
                        value={newComponent.name}
                        onChange={(e) => setNewComponent({ ...newComponent, name: e.target.value })}
                        placeholder="e.g., Chocolate Ganache"
                        className="form-input"
                        data-testid="component-name-input"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="form-label">Batch Yield (grams)</label>
                        <Input
                          type="number"
                          value={newComponent.batch_yield_grams}
                          onChange={(e) => setNewComponent({ ...newComponent, batch_yield_grams: e.target.value })}
                          placeholder="500"
                          className="form-input"
                          data-testid="component-yield-input"
                        />
                      </div>
                      <div>
                        <label className="form-label">Prep Time (minutes)</label>
                        <Input
                          type="number"
                          value={newComponent.prep_time_minutes}
                          onChange={(e) => setNewComponent({ ...newComponent, prep_time_minutes: e.target.value })}
                          placeholder="30"
                          className="form-input"
                          data-testid="component-time-input"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="form-label">Notes</label>
                      <Input
                        value={newComponent.notes}
                        onChange={(e) => setNewComponent({ ...newComponent, notes: e.target.value })}
                        placeholder="Optional notes..."
                        className="form-input"
                        data-testid="component-notes-input"
                      />
                    </div>
                    <Button 
                      onClick={handleCreateComponent}
                      className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F] text-white"
                      data-testid="confirm-create-component"
                    >
                      Create Component
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </header>
      
      <div className="p-8">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5C554D]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder=""
              className="pl-10 form-input"
              data-testid="search-components-input"
            />
          </div>
        </div>
        
        {/* Components Grid */}
        {loading ? (
          <div className="text-center py-12 text-[#5C554D]">Loading...</div>
        ) : filteredComponents.length === 0 ? (
          <div className="empty-state">
            <Flask className="empty-state-icon" weight="duotone" />
            <h3 className="empty-state-title">No component recipes yet</h3>
            <p className="empty-state-description">
              Create reusable components like frostings, ganaches, jams, and fillings.
            </p>
          </div>
        ) : (
          <>
            {/* Select All in Selection Mode */}
            {isSelectionMode && (
              <div className="mb-4 flex items-center gap-3">
                <Checkbox
                  checked={selectedIds.size === filteredComponents.length && filteredComponents.length > 0}
                  onCheckedChange={toggleSelectAll}
                  data-testid="select-all-checkbox"
                />
                <span className="text-sm text-[#5C554D]">Select All</span>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredComponents.map((component, index) => (
                <div 
                  key={component.id}
                  className={`card-flat p-6 animate-fade-in-up stagger-${(index % 5) + 1} ${
                    selectedIds.has(component.id) ? 'ring-2 ring-[#C57B57] bg-[#C57B57]/5' : ''
                  } ${isSelectionMode ? 'cursor-pointer' : ''}`}
                  onClick={() => isSelectionMode && toggleSelection(component.id)}
                  data-testid={`component-card-${component.id}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {isSelectionMode && (
                        <Checkbox
                          checked={selectedIds.has(component.id)}
                          onCheckedChange={() => toggleSelection(component.id)}
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`select-component-${component.id}`}
                        />
                      )}
                      <div className="w-12 h-12 rounded-lg bg-[#D99441]/10 flex items-center justify-center">
                        <Flask className="w-6 h-6 text-[#D99441]" weight="duotone" />
                      </div>
                    </div>
                    {!isSelectionMode && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setSelectedComponent(component); setEditDialogOpen(true); }}
                          className="h-8 w-8 p-0 hover:bg-[#F4F1EA]"
                          data-testid={`edit-component-${component.id}`}
                        >
                          <PencilSimple className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteComponent(component.id)}
                          className="h-8 w-8 p-0 hover:bg-[#A63C3C]/10 text-[#A63C3C]"
                          data-testid={`delete-component-${component.id}`}
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  <h3 className="font-outfit font-medium text-lg text-[#1A1A1A] mb-2">
                    {component.name}
                  </h3>
                  
                  <div className="space-y-2 text-sm text-[#5C554D]">
                    {component.batch_yield_grams > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="font-mono bg-[#F4F1EA] px-2 py-0.5 rounded">
                          {component.batch_yield_grams}g
                        </span>
                        <span>per batch</span>
                      </div>
                    )}
                    {component.prep_time_minutes > 0 && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>{component.prep_time_minutes} min</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Carrot className="w-4 h-4" />
                      <span>{component.ingredients?.length || 0} ingredients</span>
                    </div>
                  </div>
                  
                  {component.notes && (
                    <p className="mt-3 text-sm text-[#5C554D] border-t border-[#E8E3D9] pt-3">
                      {component.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        
        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="bg-white border-[#E8E3D9] max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-outfit">Edit Component Recipe</DialogTitle>
            </DialogHeader>
            {selectedComponent && (
              <div className="space-y-6 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="form-label">Component Name *</label>
                    <Input
                      value={selectedComponent.name}
                      onChange={(e) => setSelectedComponent({ ...selectedComponent, name: e.target.value })}
                      className="form-input"
                      data-testid="edit-component-name"
                    />
                  </div>
                  <div>
                    <label className="form-label">Batch Yield (grams)</label>
                    <Input
                      type="number"
                      value={selectedComponent.batch_yield_grams}
                      onChange={(e) => setSelectedComponent({ ...selectedComponent, batch_yield_grams: parseFloat(e.target.value) || 0 })}
                      className="form-input"
                      data-testid="edit-component-yield"
                    />
                  </div>
                  <div>
                    <label className="form-label">Prep Time (minutes)</label>
                    <Input
                      type="number"
                      value={selectedComponent.prep_time_minutes}
                      onChange={(e) => setSelectedComponent({ ...selectedComponent, prep_time_minutes: parseFloat(e.target.value) || 0 })}
                      className="form-input"
                      data-testid="edit-component-time"
                    />
                  </div>
                </div>
                
                {/* Ingredients Section */}
                <div>
                  <label className="form-label">Ingredients</label>
                  <div className="border border-[#E8E3D9] rounded-lg p-4 space-y-3">
                    {selectedComponent.ingredients?.length > 0 ? (
                      selectedComponent.ingredients.map((item) => (
                        <div key={item.id} className="flex items-center justify-between py-2 border-b border-[#E8E3D9] last:border-0">
                          <span>{item.ingredient_name}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm">{item.quantity} {item.unit}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveIngredientFromComponent(item.id)}
                              className="h-6 w-6 p-0 text-[#A63C3C]"
                            >
                              <Trash className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[#5C554D] text-center py-2">No ingredients added</p>
                    )}
                    
                    {/* Add Ingredient Row */}
                    <div className="flex gap-2 pt-2 border-t border-[#E8E3D9]">
                      <Select 
                        value={newIngredient.ingredient_id} 
                        onValueChange={(v) => setNewIngredient({ ...newIngredient, ingredient_id: v })}
                      >
                        <SelectTrigger className="flex-1 form-input" data-testid="add-component-ingredient-select">
                          <SelectValue placeholder="Select ingredient" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-[#E8E3D9]">
                          {ingredients.map((ing) => (
                            <SelectItem key={ing.id} value={ing.id}>{ing.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={newIngredient.quantity}
                        onChange={(e) => setNewIngredient({ ...newIngredient, quantity: e.target.value })}
                        placeholder="Qty"
                        className="w-20 form-input"
                        data-testid="add-component-ingredient-qty"
                      />
                      <Input
                        value={newIngredient.unit}
                        onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value })}
                        placeholder="Unit"
                        className="w-16 form-input"
                        data-testid="add-component-ingredient-unit"
                      />
                      <Button
                        onClick={handleAddIngredientToComponent}
                        size="sm"
                        className="bg-[#C57B57] hover:bg-[#b06a48]"
                        data-testid="add-component-ingredient-btn"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="form-label">Notes</label>
                  <Input
                    value={selectedComponent.notes || ""}
                    onChange={(e) => setSelectedComponent({ ...selectedComponent, notes: e.target.value })}
                    className="form-input"
                    data-testid="edit-component-notes"
                  />
                </div>
                
                <Button 
                  onClick={handleUpdateComponent}
                  className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F] text-white"
                  data-testid="confirm-edit-component"
                >
                  Save Changes
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
