import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { 
  Flask, 
  Plus, 
  MagnifyingGlass,
  DotsThreeVertical,
  Trash,
  PencilSimple,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ComponentsPage() {
  const navigate = useNavigate();
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newComponent, setNewComponent] = useState({ name: "", category: "", batch_yield_grams: 0, notes: "" });
  const [newVariant, setNewVariant] = useState({ name: "", prep_time_minutes: 0, utility_time_minutes: 0 });

  const fetchComponents = async () => {
    try {
      const res = await axios.get(`${API}/component-recipes`);
      setComponents(res.data);
    } catch (error) {
      console.error("Error fetching components:", error);
      toast.error("Failed to load components");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComponents();
  }, []);

  const handleCreateComponent = async () => {
    if (!newComponent.name.trim()) {
      toast.error("Component name is required");
      return;
    }
    
    try {
      const data = {
        ...newComponent,
        batch_yield_grams: parseFloat(newComponent.batch_yield_grams) || 0,
        variants: newVariant.name ? [{
          name: newVariant.name,
          prep_time_minutes: parseFloat(newVariant.prep_time_minutes) || 0,
          utility_time_minutes: parseFloat(newVariant.utility_time_minutes) || 0,
          ingredients: [],
          packaging: [],
          components: []
        }] : []
      };
      
      await axios.post(`${API}/component-recipes`, data);
      toast.success("Component created successfully");
      setDialogOpen(false);
      setNewComponent({ name: "", category: "", batch_yield_grams: 0, notes: "" });
      setNewVariant({ name: "", prep_time_minutes: 0, utility_time_minutes: 0 });
      fetchComponents();
    } catch (error) {
      console.error("Error creating component:", error);
      toast.error("Failed to create component");
    }
  };

  const handleDeleteComponent = async (componentId) => {
    if (!window.confirm("Are you sure you want to delete this component?")) return;
    
    try {
      await axios.delete(`${API}/component-recipes/${componentId}`);
      toast.success("Component deleted");
      fetchComponents();
    } catch (error) {
      console.error("Error deleting component:", error);
      toast.error("Failed to delete component");
    }
  };

  const handleExport = () => {
    if (components.length === 0) {
      toast.error("No components to export");
      return;
    }
    
    const headers = ["recipe_name", "variant_name", "ingredient_name", "quantity", "unit", "prep_time_minutes", "utility_time_minutes", "category", "notes", "batch_yield_grams"];
    const rows = [];
    
    components.forEach(comp => {
      if (comp.variants && comp.variants.length > 0) {
        comp.variants.forEach(variant => {
          if (variant.ingredients && variant.ingredients.length > 0) {
            variant.ingredients.forEach((ing, idx) => {
              rows.push([
                comp.name,
                variant.name,
                ing.ingredient_name,
                ing.quantity,
                ing.unit,
                idx === 0 ? (variant.prep_time_minutes || 0) : "",
                idx === 0 ? (variant.utility_time_minutes || 0) : "",
                idx === 0 ? (comp.category || "") : "",
                idx === 0 ? (comp.notes || "") : "",
                idx === 0 ? (comp.batch_yield_grams || 0) : ""
              ]);
            });
          } else {
            rows.push([comp.name, variant.name, "", "", "", variant.prep_time_minutes || 0, variant.utility_time_minutes || 0, comp.category || "", comp.notes || "", comp.batch_yield_grams || 0]);
          }
        });
      } else {
        rows.push([comp.name, "", "", "", "", "", "", comp.category || "", comp.notes || "", comp.batch_yield_grams || 0]);
      }
    });
    
    const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `components_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Components exported");
  };

  const filteredComponents = components.filter(comp =>
    comp.name.toLowerCase().includes(search.toLowerCase()) ||
    comp.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div data-testid="components-page">
      <header className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Components</h1>
          <p className="text-sm text-[#5C554D] mt-1">
            {components.length} component{components.length !== 1 ? "s" : ""} in your library
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={handleExport}
            variant="outline"
            className="border-[#E8E3D9]"
            data-testid="export-components-btn"
          >
            <Export className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-[#2C1E16] hover:bg-[#3E2A1F] text-white"
                data-testid="add-component-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Component
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E8E3D9]">
              <DialogHeader>
                <DialogTitle className="font-outfit">Create New Component</DialogTitle>
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
                <div>
                  <label className="form-label">Category</label>
                  <Input
                    value={newComponent.category}
                    onChange={(e) => setNewComponent({ ...newComponent, category: e.target.value })}
                    placeholder="e.g., Frostings, Fillings"
                    className="form-input"
                    data-testid="component-category-input"
                  />
                </div>
                <div>
                  <label className="form-label">Batch Yield (grams)</label>
                  <Input
                    type="number"
                    value={newComponent.batch_yield_grams}
                    onChange={(e) => setNewComponent({ ...newComponent, batch_yield_grams: e.target.value })}
                    placeholder="0"
                    className="form-input"
                    data-testid="component-batch-yield-input"
                  />
                </div>
                <div>
                  <label className="form-label">First Variant Name</label>
                  <Input
                    value={newVariant.name}
                    onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })}
                    placeholder="e.g., Small Batch, Full Batch"
                    className="form-input"
                    data-testid="component-variant-name-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Prep Time (min)</label>
                    <Input
                      type="number"
                      value={newVariant.prep_time_minutes}
                      onChange={(e) => setNewVariant({ ...newVariant, prep_time_minutes: e.target.value })}
                      className="form-input"
                      data-testid="component-prep-time-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Utility Time (min)</label>
                    <Input
                      type="number"
                      value={newVariant.utility_time_minutes}
                      onChange={(e) => setNewVariant({ ...newVariant, utility_time_minutes: e.target.value })}
                      className="form-input"
                      data-testid="component-utility-time-input"
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
                  data-testid="create-component-btn"
                >
                  Create Component
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      
      <div className="p-8">
        <div className="mb-6">
          <div className="relative max-w-md">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5C554D]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search components..."
              className="pl-10 form-input"
              data-testid="search-components-input"
            />
          </div>
        </div>
        
        {loading ? (
          <div className="text-center py-12 text-[#5C554D]">Loading...</div>
        ) : filteredComponents.length === 0 ? (
          <div className="empty-state">
            <Flask className="empty-state-icon" weight="duotone" />
            <h3 className="empty-state-title">No components yet</h3>
            <p className="empty-state-description">
              Create your first component recipe (frosting, ganache, filling, etc.) or import from a spreadsheet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredComponents.map((comp, index) => (
              <div 
                key={comp.id}
                className={`card-flat p-6 hover:shadow-sm transition-all cursor-pointer animate-fade-in-up stagger-${(index % 5) + 1}`}
                onClick={() => navigate(`/components/${comp.id}`)}
                data-testid={`component-card-${comp.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-[#C57B57]/10 flex items-center justify-center">
                    <Flask className="w-6 h-6 text-[#C57B57]" weight="duotone" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <button className="p-1 rounded hover:bg-[#F4F1EA]" data-testid={`component-menu-${comp.id}`}>
                        <DotsThreeVertical className="w-5 h-5 text-[#5C554D]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white border-[#E8E3D9]">
                      <DropdownMenuItem 
                        onClick={(e) => { e.stopPropagation(); navigate(`/components/${comp.id}`); }}
                        className="cursor-pointer"
                      >
                        <PencilSimple className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => { e.stopPropagation(); handleDeleteComponent(comp.id); }}
                        className="cursor-pointer text-[#A63C3C]"
                      >
                        <Trash className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <h3 className="font-outfit font-medium text-lg text-[#1A1A1A] mb-1">
                  {comp.name}
                </h3>
                {comp.category && (
                  <p className="text-sm text-[#5C554D] mb-1">{comp.category}</p>
                )}
                {comp.batch_yield_grams > 0 && (
                  <p className="text-xs text-[#8B7E73]">Yield: {comp.batch_yield_grams}g</p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  {comp.variants?.slice(0, 3).map((variant) => (
                    <span 
                      key={variant.id}
                      className="text-xs px-2 py-1 rounded bg-[#F4F1EA] text-[#5C554D]"
                    >
                      {variant.name}
                    </span>
                  ))}
                  {comp.variants?.length > 3 && (
                    <span className="text-xs px-2 py-1 rounded bg-[#F4F1EA] text-[#5C554D]">
                      +{comp.variants.length - 3} more
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
