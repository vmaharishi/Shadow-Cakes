import { useEffect, useState } from "react";
import axios from "axios";
import { 
  Package, 
  Plus, 
  MagnifyingGlass,
  Trash,
  PencilSimple,
  CheckSquare,
  X
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

export default function PackagingPage() {
  const [packaging, setPackaging] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedPackaging, setSelectedPackaging] = useState(null);
  const [newPackaging, setNewPackaging] = useState({ name: "", unit_cost: "", unit: "piece", notes: "" });
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const fetchPackaging = async () => {
    try {
      const res = await axios.get(`${API}/packaging`);
      setPackaging(res.data);
    } catch (error) {
      console.error("Error fetching packaging:", error);
      toast.error("Failed to load packaging");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackaging();
  }, []);

  const handleCreatePackaging = async () => {
    if (!newPackaging.name.trim() || !newPackaging.unit_cost) {
      toast.error("Name and unit cost are required");
      return;
    }
    
    try {
      await axios.post(`${API}/packaging`, {
        name: newPackaging.name,
        unit_cost: parseFloat(newPackaging.unit_cost),
        unit: newPackaging.unit,
        notes: newPackaging.notes
      });
      toast.success("Packaging item created");
      setDialogOpen(false);
      setNewPackaging({ name: "", unit_cost: "", unit: "piece", notes: "" });
      fetchPackaging();
    } catch (error) {
      console.error("Error creating packaging:", error);
      toast.error("Failed to create packaging");
    }
  };

  const handleUpdatePackaging = async () => {
    if (!selectedPackaging.name.trim() || !selectedPackaging.unit_cost) {
      toast.error("Name and unit cost are required");
      return;
    }
    
    try {
      await axios.put(`${API}/packaging/${selectedPackaging.id}`, {
        name: selectedPackaging.name,
        unit_cost: parseFloat(selectedPackaging.unit_cost),
        unit: selectedPackaging.unit,
        notes: selectedPackaging.notes
      });
      toast.success("Packaging updated");
      setEditDialogOpen(false);
      setSelectedPackaging(null);
      fetchPackaging();
    } catch (error) {
      console.error("Error updating packaging:", error);
      toast.error("Failed to update packaging");
    }
  };

  const handleDeletePackaging = async (packagingId) => {
    if (!window.confirm("Delete this packaging item?")) return;
    
    try {
      await axios.delete(`${API}/packaging/${packagingId}`);
      toast.success("Packaging deleted");
      fetchPackaging();
    } catch (error) {
      console.error("Error deleting packaging:", error);
      toast.error("Failed to delete packaging");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected packaging item(s)?`)) return;
    
    try {
      await axios.post(`${API}/packaging/bulk-delete`, { ids: Array.from(selectedIds) });
      toast.success(`Deleted ${selectedIds.size} packaging item(s)`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      fetchPackaging();
    } catch (error) {
      console.error("Error bulk deleting:", error);
      toast.error("Failed to delete packaging items");
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
    if (selectedIds.size === filteredPackaging.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPackaging.map(p => p.id)));
    }
  };

  const cancelSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const filteredPackaging = packaging.filter(pkg =>
    pkg.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div data-testid="packaging-page">
      <header className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Packaging</h1>
          <p className="text-sm text-[#5C554D] mt-1">
            {packaging.length} packaging item{packaging.length !== 1 ? "s" : ""} in your list
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
                  <Button className="bg-[#2C1E16] hover:bg-[#3E2A1F] text-white" data-testid="add-packaging-btn">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Packaging
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white border-[#E8E3D9]">
                  <DialogHeader>
                    <DialogTitle className="font-outfit">Add New Packaging</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <label className="form-label">Name *</label>
                      <Input
                        value={newPackaging.name}
                        onChange={(e) => setNewPackaging({ ...newPackaging, name: e.target.value })}
                        placeholder="e.g., 6-inch Cake Box"
                        className="form-input"
                        data-testid="packaging-name-input"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="form-label">Unit Cost ($) *</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newPackaging.unit_cost}
                          onChange={(e) => setNewPackaging({ ...newPackaging, unit_cost: e.target.value })}
                          placeholder="2.50"
                          className="form-input"
                          data-testid="packaging-cost-input"
                        />
                      </div>
                      <div>
                        <label className="form-label">Unit</label>
                        <Input
                          value={newPackaging.unit}
                          onChange={(e) => setNewPackaging({ ...newPackaging, unit: e.target.value })}
                          placeholder="piece"
                          className="form-input"
                          data-testid="packaging-unit-input"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="form-label">Notes</label>
                      <Input
                        value={newPackaging.notes}
                        onChange={(e) => setNewPackaging({ ...newPackaging, notes: e.target.value })}
                        placeholder="Optional notes..."
                        className="form-input"
                        data-testid="packaging-notes-input"
                      />
                    </div>
                    <Button 
                      onClick={handleCreatePackaging}
                      className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F] text-white"
                      data-testid="confirm-create-packaging"
                    >
                      Add Packaging
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
              placeholder="Search packaging..."
              className="pl-10 form-input"
              data-testid="search-packaging-input"
            />
          </div>
        </div>
        
        {/* Packaging Table */}
        {loading ? (
          <div className="text-center py-12 text-[#5C554D]">Loading...</div>
        ) : filteredPackaging.length === 0 ? (
          <div className="empty-state">
            <Package className="empty-state-icon" weight="duotone" />
            <h3 className="empty-state-title">No packaging yet</h3>
            <p className="empty-state-description">
              Add packaging items like boxes, boards, ribbons, and labels.
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
                        checked={selectedIds.size === filteredPackaging.length && filteredPackaging.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="select-all-checkbox"
                      />
                    </TableHead>
                  )}
                  <TableHead className="table-header-cell">Item</TableHead>
                  <TableHead className="table-header-cell">Unit</TableHead>
                  <TableHead className="table-header-cell text-right">Unit Cost</TableHead>
                  <TableHead className="table-header-cell">Notes</TableHead>
                  {!isSelectionMode && (
                    <TableHead className="table-header-cell w-24">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPackaging.map((pkg) => (
                  <TableRow 
                    key={pkg.id} 
                    className={`table-row ${selectedIds.has(pkg.id) ? 'bg-[#C57B57]/5' : ''}`}
                    data-testid={`packaging-row-${pkg.id}`}
                  >
                    {isSelectionMode && (
                      <TableCell className="table-cell">
                        <Checkbox
                          checked={selectedIds.has(pkg.id)}
                          onCheckedChange={() => toggleSelection(pkg.id)}
                          data-testid={`select-packaging-${pkg.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="table-cell font-medium">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-[#4A6B53]/10 flex items-center justify-center">
                          <Package className="w-4 h-4 text-[#4A6B53]" />
                        </div>
                        {pkg.name}
                      </div>
                    </TableCell>
                    <TableCell className="table-cell">{pkg.unit}</TableCell>
                    <TableCell className="table-cell-numeric font-mono">
                      ${pkg.unit_cost.toFixed(2)}
                    </TableCell>
                    <TableCell className="table-cell text-[#5C554D]">
                      {pkg.notes || "-"}
                    </TableCell>
                    {!isSelectionMode && (
                      <TableCell className="table-cell">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSelectedPackaging(pkg); setEditDialogOpen(true); }}
                            className="h-8 w-8 p-0 hover:bg-[#F4F1EA]"
                            data-testid={`edit-packaging-${pkg.id}`}
                          >
                            <PencilSimple className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePackaging(pkg.id)}
                            className="h-8 w-8 p-0 hover:bg-[#A63C3C]/10 text-[#A63C3C]"
                            data-testid={`delete-packaging-${pkg.id}`}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        
        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="bg-white border-[#E8E3D9]">
            <DialogHeader>
              <DialogTitle className="font-outfit">Edit Packaging</DialogTitle>
            </DialogHeader>
            {selectedPackaging && (
              <div className="space-y-4 mt-4">
                <div>
                  <label className="form-label">Name *</label>
                  <Input
                    value={selectedPackaging.name}
                    onChange={(e) => setSelectedPackaging({ ...selectedPackaging, name: e.target.value })}
                    className="form-input"
                    data-testid="edit-packaging-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Unit Cost ($) *</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={selectedPackaging.unit_cost}
                      onChange={(e) => setSelectedPackaging({ ...selectedPackaging, unit_cost: e.target.value })}
                      className="form-input"
                      data-testid="edit-packaging-cost"
                    />
                  </div>
                  <div>
                    <label className="form-label">Unit</label>
                    <Input
                      value={selectedPackaging.unit}
                      onChange={(e) => setSelectedPackaging({ ...selectedPackaging, unit: e.target.value })}
                      className="form-input"
                      data-testid="edit-packaging-unit"
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label">Notes</label>
                  <Input
                    value={selectedPackaging.notes || ""}
                    onChange={(e) => setSelectedPackaging({ ...selectedPackaging, notes: e.target.value })}
                    className="form-input"
                    data-testid="edit-packaging-notes"
                  />
                </div>
                <Button 
                  onClick={handleUpdatePackaging}
                  className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F] text-white"
                  data-testid="confirm-edit-packaging"
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
