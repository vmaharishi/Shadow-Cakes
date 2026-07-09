import { useEffect, useState } from "react";
import axios from "axios";
import { 
  Receipt, 
  MagnifyingGlass,
  Trash,
  Export,
  CheckSquare,
  X,
  Calendar,
  User,
  CurrencyDollar
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function SalesPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const fetchSales = async () => {
    try {
      const res = await axios.get(`${API}/sales`);
      setSales(res.data);
    } catch (error) {
      console.error("Error fetching sales:", error);
      toast.error("Failed to load sales");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const handleDeleteSale = async (saleId) => {
    if (!window.confirm("Delete this sale record?")) return;
    
    try {
      await axios.delete(`${API}/sales/${saleId}`);
      toast.success("Sale deleted");
      fetchSales();
    } catch (error) {
      console.error("Error deleting sale:", error);
      toast.error("Failed to delete sale");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected sale(s)?`)) return;
    
    try {
      await axios.post(`${API}/sales/bulk-delete`, { ids: Array.from(selectedIds) });
      toast.success(`Deleted ${selectedIds.size} sale(s)`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      fetchSales();
    } catch (error) {
      console.error("Error bulk deleting:", error);
      toast.error("Failed to delete sales");
    }
  };

  const handleExport = () => {
    if (filteredSales.length === 0) {
      toast.error("No sales data to export");
      return;
    }
    
    // Create CSV content
    const headers = ["Sale Date", "Recipe", "Variant", "Customer", "Selling Price", "Total Cost", "Labour Cost", "Profit", "Profit Margin", "Notes"];
    const rows = filteredSales.map(sale => [
      sale.sale_date,
      sale.recipe_name,
      sale.variant_name,
      sale.customer_name,
      sale.selling_price.toFixed(2),
      sale.total_cost.toFixed(2),
      (sale.labour_cost || 0).toFixed(2),
      sale.profit.toFixed(2),
      `${sale.profit_margin.toFixed(1)}%`,
      sale.notes.replace(/,/g, ";")
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");
    
    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shadow_cakes_sales_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success("Sales data exported");
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
    if (selectedIds.size === filteredSales.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSales.map(s => s.id)));
    }
  };

  const cancelSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const filteredSales = sales.filter(sale =>
    sale.recipe_name.toLowerCase().includes(search.toLowerCase()) ||
    sale.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    sale.variant_name.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate totals
  const totals = filteredSales.reduce((acc, sale) => ({
    revenue: acc.revenue + sale.selling_price,
    cost: acc.cost + sale.total_cost,
    profit: acc.profit + sale.profit
  }), { revenue: 0, cost: 0, profit: 0 });

  return (
    <div data-testid="sales-page">
      <header className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Sales</h1>
          <p className="text-sm text-[#5C554D] mt-1">
            {sales.length} sale{sales.length !== 1 ? "s" : ""} recorded
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
              <Button 
                onClick={handleExport}
                className="bg-[#4A6B53] hover:bg-[#3d5a45] text-white"
                data-testid="export-btn"
              >
                <Export className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </>
          )}
        </div>
      </header>
      
      <div className="p-8">
        {/* Summary Cards */}
        {sales.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="card-flat p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-1">Total Revenue</p>
              <p className="text-2xl font-outfit font-semibold text-[#1A1A1A] font-mono">${totals.revenue.toFixed(2)}</p>
            </div>
            <div className="card-flat p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-1">Total Cost</p>
              <p className="text-2xl font-outfit font-semibold text-[#1A1A1A] font-mono">${totals.cost.toFixed(2)}</p>
            </div>
            <div className="card-flat p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-1">Total Profit</p>
              <p className={`text-2xl font-outfit font-semibold font-mono ${totals.profit >= 0 ? 'text-[#4A6B53]' : 'text-[#A63C3C]'}`}>
                ${totals.profit.toFixed(2)}
              </p>
            </div>
          </div>
        )}
        
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5C554D]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder=""
              className="pl-10 form-input"
              data-testid="search-sales-input"
            />
          </div>
        </div>
        
        {/* Sales Table */}
        {loading ? (
          <div className="text-center py-12 text-[#5C554D]">Loading...</div>
        ) : filteredSales.length === 0 ? (
          <div className="empty-state">
            <Receipt className="empty-state-icon" weight="duotone" />
            <h3 className="empty-state-title">No sales recorded yet</h3>
            <p className="empty-state-description">
              Record sales from the recipe detail page using the "Record a Sale" button.
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
                        checked={selectedIds.size === filteredSales.length && filteredSales.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="select-all-checkbox"
                      />
                    </TableHead>
                  )}
                  <TableHead className="table-header-cell">Date</TableHead>
                  <TableHead className="table-header-cell">Recipe</TableHead>
                  <TableHead className="table-header-cell">Customer</TableHead>
                  <TableHead className="table-header-cell text-right">Selling Price</TableHead>
                  <TableHead className="table-header-cell text-right">Cost</TableHead>
                  <TableHead className="table-header-cell text-right">Profit</TableHead>
                  <TableHead className="table-header-cell text-right">Margin</TableHead>
                  {!isSelectionMode && (
                    <TableHead className="table-header-cell w-16">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => (
                  <TableRow 
                    key={sale.id} 
                    className={`table-row ${selectedIds.has(sale.id) ? 'bg-[#C57B57]/5' : ''}`}
                    data-testid={`sale-row-${sale.id}`}
                  >
                    {isSelectionMode && (
                      <TableCell className="table-cell">
                        <Checkbox
                          checked={selectedIds.has(sale.id)}
                          onCheckedChange={() => toggleSelection(sale.id)}
                          data-testid={`select-sale-${sale.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="table-cell">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#5C554D]" />
                        <span>{sale.sale_date}</span>
                      </div>
                    </TableCell>
                    <TableCell className="table-cell font-medium">
                      <div>
                        <p>{sale.recipe_name}</p>
                        <p className="text-xs text-[#5C554D]">{sale.variant_name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="table-cell">
                      {sale.customer_name ? (
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-[#5C554D]" />
                          <span>{sale.customer_name}</span>
                        </div>
                      ) : (
                        <span className="text-[#5C554D]">-</span>
                      )}
                    </TableCell>
                    <TableCell className="table-cell-numeric font-mono">
                      ${sale.selling_price.toFixed(2)}
                    </TableCell>
                    <TableCell className="table-cell-numeric font-mono text-[#5C554D]">
                      ${sale.total_cost.toFixed(2)}
                    </TableCell>
                    <TableCell className={`table-cell-numeric font-mono ${sale.profit >= 0 ? 'text-[#4A6B53]' : 'text-[#A63C3C]'}`}>
                      ${sale.profit.toFixed(2)}
                    </TableCell>
                    <TableCell className="table-cell-numeric">
                      <span className={`badge-${sale.profit_margin >= 0 ? 'success' : 'danger'}`}>
                        {sale.profit_margin.toFixed(1)}%
                      </span>
                    </TableCell>
                    {!isSelectionMode && (
                      <TableCell className="table-cell">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSale(sale.id)}
                          className="h-8 w-8 p-0 hover:bg-[#A63C3C]/10 text-[#A63C3C]"
                          data-testid={`delete-sale-${sale.id}`}
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
