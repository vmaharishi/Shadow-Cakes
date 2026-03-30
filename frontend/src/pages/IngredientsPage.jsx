import { useEffect, useState } from "react";
import axios from "axios";
import { 
  Carrot, 
  Plus, 
  MagnifyingGlass,
  Trash,
  Storefront,
  CheckSquare,
  Square,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState([]);
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [newIngredient, setNewIngredient] = useState({ name: "", default_unit: "g", notes: "" });
  const [newPrice, setNewPrice] = useState({ 
    store_vendor: "", 
    purchase_price: "", 
    package_size: "", 
    unit: "g",
    purchase_date: new Date().toISOString().split('T')[0],
    notes: ""
  });
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const fetchData = async () => {
    try {
      const [ingredientsRes, pricesRes] = await Promise.all([
        axios.get(`${API}/ingredients`),
        axios.get(`${API}/ingredient-prices`)
      ]);
      setIngredients(ingredientsRes.data);
      setPrices(pricesRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load ingredients");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateIngredient = async () => {
    if (!newIngredient.name.trim()) {
      toast.error("Ingredient name is required");
      return;
    }
    
    try {
      await axios.post(`${API}/ingredients`, newIngredient);
      toast.success("Ingredient created");
      setDialogOpen(false);
      setNewIngredient({ name: "", default_unit: "g", notes: "" });
      fetchData();
    } catch (error) {
      console.error("Error creating ingredient:", error);
      toast.error("Failed to create ingredient");
    }
  };

  const handleDeleteIngredient = async (ingredientId) => {
    if (!window.confirm("Delete this ingredient and all its pricing records?")) return;
    
    try {
      await axios.delete(`${API}/ingredients/${ingredientId}`);
      toast.success("Ingredient deleted");
      fetchData();
    } catch (error) {
      console.error("Error deleting ingredient:", error);
      toast.error("Failed to delete ingredient");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected ingredient(s) and all their pricing records?`)) return;
    
    try {
      await axios.post(`${API}/ingredients/bulk-delete`, { ids: Array.from(selectedIds) });
      toast.success(`Deleted ${selectedIds.size} ingredient(s)`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      fetchData();
    } catch (error) {
      console.error("Error bulk deleting:", error);
      toast.error("Failed to delete ingredients");
    }
  };

  const handleExport = () => {
    if (ingredients.length === 0) {
      toast.error("No ingredients to export");
      return;
    }
    
    // Match import format: ingredient_name, store_vendor, purchase_price, package_size, unit, purchase_date, brand
    const headers = ["ingredient_name", "store_vendor", "purchase_price", "package_size", "unit", "purchase_date", "brand"];
    const rows = [];
    
    ingredients.forEach(ing => {
      const ingPrices = prices.filter(p => p.ingredient_id === ing.id);
      if (ingPrices.length > 0) {
        ingPrices.forEach(price => {
          rows.push([
            ing.name,
            price.store_vendor,
            price.purchase_price,
            price.package_size,
            price.unit,
            price.purchase_date?.split('T')[0] || "",
            price.notes || ""
          ]);
        });
      } else {
        rows.push([
          ing.name,
          "",
          "",
          "",
          ing.default_unit,
          "",
          ""
        ]);
      }
    });
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ingredients_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success("Ingredients exported");
  };

  const handleAddPrice = async () => {
    if (!newPrice.store_vendor || !newPrice.purchase_price || !newPrice.package_size) {
      toast.error("Please fill all required fields");
      return;
    }
    
    try {
      await axios.post(`${API}/ingredient-prices`, {
        ingredient_id: selectedIngredient.id,
        ingredient_name: selectedIngredient.name,
        store_vendor: newPrice.store_vendor,
        purchase_price: parseFloat(newPrice.purchase_price),
        package_size: parseFloat(newPrice.package_size),
        unit: newPrice.unit,
        purchase_date: newPrice.purchase_date,
        is_latest: true,
        notes: newPrice.notes
      });
      toast.success("Price added");
      setPriceDialogOpen(false);
      setNewPrice({ 
        store_vendor: "", 
        purchase_price: "", 
        package_size: "", 
        unit: "g",
        purchase_date: new Date().toISOString().split('T')[0],
        notes: ""
      });
      fetchData();
    } catch (error) {
      console.error("Error adding price:", error);
      toast.error("Failed to add price");
    }
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
    if (selectedIds.size === filteredIngredients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIngredients.map(i => i.id)));
    }
  };

  const cancelSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const getIngredientPrices = (ingredientId) => {
    return prices.filter(p => p.ingredient_id === ingredientId);
  };

  const getLatestPrice = (ingredientId) => {
    const ingPrices = getIngredientPrices(ingredientId);
    const latest = ingPrices.find(p => p.is_latest) || ingPrices[0];
    return latest;
  };

  const filteredIngredients = ingredients.filter(ing =>
    ing.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div data-testid="ingredients-page">
      <header className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Ingredients</h1>
          <p className="text-sm text-[#5C554D] mt-1">
            {ingredients.length} ingredient{ingredients.length !== 1 ? "s" : ""} in your master list
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
                data-testid="export-ingredients-btn"
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
                  <Button className="bg-[#2C1E16] hover:bg-[#3E2A1F] text-white" data-testid="add-ingredient-btn">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Ingredient
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white border-[#E8E3D9]">
                  <DialogHeader>
                    <DialogTitle className="font-outfit">Add New Ingredient</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <label className="form-label">Ingredient Name *</label>
                      <Input
                        value={newIngredient.name}
                        onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                        placeholder="e.g., All-Purpose Flour"
                        className="form-input"
                        data-testid="ingredient-name-input"
                      />
                    </div>
                    <div>
                      <label className="form-label">Default Unit</label>
                      <Input
                        value={newIngredient.default_unit}
                        onChange={(e) => setNewIngredient({ ...newIngredient, default_unit: e.target.value })}
                        placeholder="g"
                        className="form-input"
                        data-testid="ingredient-unit-input"
                      />
                    </div>
                    <div>
                      <label className="form-label">Notes</label>
                      <Input
                        value={newIngredient.notes}
                        onChange={(e) => setNewIngredient({ ...newIngredient, notes: e.target.value })}
                        placeholder="Optional notes..."
                        className="form-input"
                        data-testid="ingredient-notes-input"
                      />
                    </div>
                    <Button 
                      onClick={handleCreateIngredient}
                      className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F] text-white"
                      data-testid="confirm-create-ingredient"
                    >
                      Add Ingredient
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
              data-testid="search-ingredients-input"
            />
          </div>
        </div>
        
        {/* Ingredients Table */}
        {loading ? (
          <div className="text-center py-12 text-[#5C554D]">Loading...</div>
        ) : filteredIngredients.length === 0 ? (
          <div className="empty-state">
            <Carrot className="empty-state-icon" weight="duotone" />
            <h3 className="empty-state-title">No ingredients yet</h3>
            <p className="empty-state-description">
              Add ingredients manually or import them from an Excel spreadsheet.
            </p>
          </div>
        ) : (
          <div className="card-flat overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-[#E8E3D9] hover:bg-transparent">
                  {isSelectionMode && (
                    <TableHead className="table-header-cell w-12">
                      <Checkbox
                        checked={selectedIds.size === filteredIngredients.length && filteredIngredients.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="select-all-checkbox"
                      />
                    </TableHead>
                  )}
                  <TableHead className="table-header-cell">Ingredient</TableHead>
                  <TableHead className="table-header-cell">Unit</TableHead>
                  <TableHead className="table-header-cell">Latest Price</TableHead>
                  <TableHead className="table-header-cell">Store/Vendor</TableHead>
                  <TableHead className="table-header-cell text-right">Unit Cost</TableHead>
                  {!isSelectionMode && (
                    <TableHead className="table-header-cell w-24">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIngredients.map((ingredient) => {
                  const latestPrice = getLatestPrice(ingredient.id);
                  const priceCount = getIngredientPrices(ingredient.id).length;
                  
                  return (
                    <TableRow 
                      key={ingredient.id} 
                      className={`table-row ${selectedIds.has(ingredient.id) ? 'bg-[#C57B57]/5' : ''}`}
                      data-testid={`ingredient-row-${ingredient.id}`}
                    >
                      {isSelectionMode && (
                        <TableCell className="table-cell">
                          <Checkbox
                            checked={selectedIds.has(ingredient.id)}
                            onCheckedChange={() => toggleSelection(ingredient.id)}
                            data-testid={`select-ingredient-${ingredient.id}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="table-cell font-medium">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-[#C57B57]/10 flex items-center justify-center">
                            <Carrot className="w-4 h-4 text-[#C57B57]" />
                          </div>
                          <div>
                            <p>{ingredient.name}</p>
                            {ingredient.notes && (
                              <p className="text-xs text-[#5C554D]">{ingredient.notes}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="table-cell">{ingredient.default_unit}</TableCell>
                      <TableCell className="table-cell">
                        {latestPrice ? (
                          <span className="font-mono">${latestPrice.purchase_price.toFixed(2)}</span>
                        ) : (
                          <span className="text-[#D99441]">No pricing</span>
                        )}
                      </TableCell>
                      <TableCell className="table-cell">
                        {latestPrice ? (
                          <div className="flex items-center gap-2">
                            <Storefront className="w-4 h-4 text-[#5C554D]" />
                            <span>{latestPrice.store_vendor}</span>
                            {priceCount > 1 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-[#F4F1EA] text-[#5C554D]">
                                +{priceCount - 1} more
                              </span>
                            )}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="table-cell-numeric">
                        {latestPrice ? (
                          <span className="font-mono">${latestPrice.unit_cost.toFixed(4)}/{latestPrice.unit}</span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      {!isSelectionMode && (
                        <TableCell className="table-cell">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSelectedIngredient(ingredient); setPriceDialogOpen(true); }}
                              className="h-8 w-8 p-0 hover:bg-[#F4F1EA]"
                              data-testid={`add-price-${ingredient.id}`}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteIngredient(ingredient.id)}
                              className="h-8 w-8 p-0 hover:bg-[#A63C3C]/10 text-[#A63C3C]"
                              data-testid={`delete-ingredient-${ingredient.id}`}
                            >
                              <Trash className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        
        {/* Price Dialog */}
        <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
          <DialogContent className="bg-white border-[#E8E3D9]">
            <DialogHeader>
              <DialogTitle className="font-outfit">
                Add Price for {selectedIngredient?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="form-label">Store/Vendor *</label>
                <Input
                  value={newPrice.store_vendor}
                  onChange={(e) => setNewPrice({ ...newPrice, store_vendor: e.target.value })}
                  placeholder="e.g., Costco, Walmart"
                  className="form-input"
                  data-testid="price-vendor-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Purchase Price ($) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newPrice.purchase_price}
                    onChange={(e) => setNewPrice({ ...newPrice, purchase_price: e.target.value })}
                    placeholder="5.99"
                    className="form-input"
                    data-testid="price-amount-input"
                  />
                </div>
                <div>
                  <label className="form-label">Package Size *</label>
                  <Input
                    type="number"
                    value={newPrice.package_size}
                    onChange={(e) => setNewPrice({ ...newPrice, package_size: e.target.value })}
                    placeholder="1000"
                    className="form-input"
                    data-testid="price-size-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Unit</label>
                  <Input
                    value={newPrice.unit}
                    onChange={(e) => setNewPrice({ ...newPrice, unit: e.target.value })}
                    placeholder="g"
                    className="form-input"
                    data-testid="price-unit-input"
                  />
                </div>
                <div>
                  <label className="form-label">Purchase Date</label>
                  <Input
                    type="date"
                    value={newPrice.purchase_date}
                    onChange={(e) => setNewPrice({ ...newPrice, purchase_date: e.target.value })}
                    className="form-input"
                    data-testid="price-date-input"
                  />
                </div>
              </div>
              <div>
                <label className="form-label">Notes</label>
                <Input
                  value={newPrice.notes}
                  onChange={(e) => setNewPrice({ ...newPrice, notes: e.target.value })}
                  placeholder="Optional notes..."
                  className="form-input"
                  data-testid="price-notes-input"
                />
              </div>
              <Button 
                onClick={handleAddPrice}
                className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F] text-white"
                data-testid="confirm-add-price"
              >
                Add Price
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
