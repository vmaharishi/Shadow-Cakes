import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  CurrencyDollar,
  ChartLineUp,
  Clock,
  TrendUp,
  MagnifyingGlass,
  Trash,
  Export,
  CheckSquare,
  X,
  Calendar,
  User,
  Receipt,
  PencilSimple,
  Funnel
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

export default function Dashboard() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);

  const fetchData = async () => {
    try {
      const salesRes = await axios.get(`${API}/sales`);
      setSales(salesRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Build month options from sales data
  const monthOptions = useMemo(() => {
    const months = new Map();
    sales.forEach((sale) => {
      if (!sale.sale_date) return;
      const d = new Date(sale.sale_date + "T00:00:00");
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!months.has(key)) {
        months.set(key, d.toLocaleString("en-CA", { month: "long", year: "numeric" }));
      }
    });
    return Array.from(months.entries())
      .sort((a, b) => b[0].localeCompare(a[0])); // newest first
  }, [sales]);

  // Filter sales by month + search
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Month filter
      if (monthFilter !== "all") {
        if (!sale.sale_date) return false;
        const d = new Date(sale.sale_date + "T00:00:00");
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key !== monthFilter) return false;
      }
      // Text search
      if (search) {
        const q = search.toLowerCase();
        return (
          (sale.recipe_name || "").toLowerCase().includes(q) ||
          (sale.customer_name || "").toLowerCase().includes(q) ||
          (sale.variant_name || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sales, monthFilter, search]);

  // Compute KPI summary from filtered sales
  const salesSummary = useMemo(() => {
    let total_revenue = 0, total_cost = 0, total_hourly_pay = 0, total_profit = 0;
    filteredSales.forEach((s) => {
      total_revenue += s.selling_price || 0;
      total_cost += s.total_cost || 0;
      total_hourly_pay += s.labour_cost || 0;
      total_profit += s.profit || 0;
    });
    return { total_revenue, total_cost, total_hourly_pay, total_profit };
  }, [filteredSales]);

  const handleDeleteSale = async (saleId) => {
    if (!window.confirm("Delete this sale record?")) return;
    try {
      await axios.delete(`${API}/sales/${saleId}`);
      toast.success("Sale deleted");
      fetchData();
    } catch (error) {
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
      fetchData();
    } catch (error) {
      toast.error("Failed to delete sales");
    }
  };

  const handleEditSale = (sale) => {
    setEditingSale({ ...sale });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingSale) return;
    try {
      const profit = editingSale.selling_price - editingSale.total_cost;
      const margin = editingSale.selling_price > 0
        ? (profit / editingSale.selling_price) * 100
        : 0;
      const updated = {
        ...editingSale,
        profit,
        profit_margin: margin
      };
      await axios.put(`${API}/sales/${editingSale.id}`, updated);
      toast.success("Sale updated");
      setEditDialogOpen(false);
      setEditingSale(null);
      fetchData();
    } catch (error) {
      toast.error("Failed to update sale");
    }
  };

  const handleExport = () => {
    if (filteredSales.length === 0) {
      toast.error("No sales data to export");
      return;
    }
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
      (sale.notes || "").replace(/,/g, ";")
    ]);
    const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
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
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSales.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredSales.map(s => s.id)));
  };

  const cancelSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const salesCards = [
    { label: "Total Revenue", value: salesSummary.total_revenue, icon: CurrencyDollar, color: "#4A6B53" },
    { label: "Total Cost", value: salesSummary.total_cost, icon: ChartLineUp, color: "#C57B57" },
    { label: "Total Wages", value: salesSummary.total_hourly_pay, icon: Clock, color: "#D99441" },
    { label: "Total Profit", value: salesSummary.total_profit, icon: TrendUp, color: salesSummary.total_profit >= 0 ? "#4A6B53" : "#A63C3C" }
  ];

  return (
    <div data-testid="sales-dashboard-page">
      <header className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Sales Dashboard</h1>
          <p className="text-sm text-[#5C554D] mt-1">
            {filteredSales.length} sale{filteredSales.length !== 1 ? "s" : ""}{monthFilter !== "all" ? ` in ${monthOptions.find(([k]) => k === monthFilter)?.[1] || monthFilter}` : " recorded"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSelectionMode ? (
            <>
              <span className="text-sm text-[#5C554D] mr-2">{selectedIds.size} selected</span>
              <Button
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0}
                className="bg-[#A63C3C] hover:bg-[#8B3333] text-white"
                data-testid="bulk-delete-btn"
              >
                <Trash className="w-4 h-4 mr-2" />
                Delete Selected
              </Button>
              <Button onClick={cancelSelection} variant="outline" className="border-[#E8E3D9]" data-testid="cancel-selection-btn">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setIsSelectionMode(true)} variant="outline" className="border-[#E8E3D9]" data-testid="select-mode-btn">
                <CheckSquare className="w-4 h-4 mr-2" />
                Select
              </Button>
              <Button onClick={handleExport} className="bg-[#4A6B53] hover:bg-[#3d5a45] text-white" data-testid="export-btn">
                <Export className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="p-8">
        {/* Month Filter */}
        <div className="flex items-center gap-3 mb-6" data-testid="month-filter-section">
          <Funnel className="w-4 h-4 text-[#5C554D] flex-shrink-0" />
          <div className="w-56">
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger
                className="form-input"
                data-testid="month-filter-select"
              >
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#E8E3D9]">
                <SelectItem value="all" data-testid="month-option-all">All Time</SelectItem>
                {monthOptions.map(([key, label]) => (
                  <SelectItem key={key} value={key} data-testid={`month-option-${key}`}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {monthFilter !== "all" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMonthFilter("all")}
              className="text-[#5C554D] hover:text-[#1A1A1A] text-xs"
              data-testid="clear-month-filter"
            >
              <X className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-fade-in-up">
          {salesCards.map((card, index) => (
            <div
              key={card.label}
              className={`card-flat p-5 stagger-${index + 1}`}
              data-testid={`sales-card-${card.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${card.color}10` }}
                >
                  <card.icon className="w-4 h-4" weight="duotone" style={{ color: card.color }} />
                </div>
              </div>
              <p className="text-2xl font-outfit font-semibold text-[#1A1A1A] font-mono">
                {loading ? "..." : `$${card.value.toFixed(2)}`}
              </p>
              <p className="text-xs text-[#5C554D] mt-1">{card.label}</p>
            </div>
          ))}
        </div>

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
                  <TableHead className="table-header-cell w-24">Actions</TableHead>
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
                    <TableCell className="table-cell-numeric font-mono">${sale.selling_price.toFixed(2)}</TableCell>
                    <TableCell className="table-cell-numeric font-mono text-[#5C554D]">${sale.total_cost.toFixed(2)}</TableCell>
                    <TableCell className={`table-cell-numeric font-mono ${sale.profit >= 0 ? 'text-[#4A6B53]' : 'text-[#A63C3C]'}`}>
                      ${sale.profit.toFixed(2)}
                    </TableCell>
                    <TableCell className="table-cell-numeric">
                      <span className={`badge-${sale.profit_margin >= 0 ? 'success' : 'danger'}`}>
                        {sale.profit_margin.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="table-cell">
                      <div className="flex items-center gap-1">
                        {!isSelectionMode && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditSale(sale)}
                              className="h-8 w-8 p-0 hover:bg-[#C57B57]/10 text-[#C57B57]"
                              data-testid={`edit-sale-${sale.id}`}
                            >
                              <PencilSimple className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSale(sale.id)}
                              className="h-8 w-8 p-0 hover:bg-[#A63C3C]/10 text-[#A63C3C]"
                              data-testid={`delete-sale-${sale.id}`}
                            >
                              <Trash className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit Sale Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-white border-[#E8E3D9]">
          <DialogHeader>
            <DialogTitle className="font-outfit">Edit Sale</DialogTitle>
          </DialogHeader>
          {editingSale && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-1 block">Date</label>
                <Input
                  type="date"
                  value={editingSale.sale_date}
                  onChange={(e) => setEditingSale({ ...editingSale, sale_date: e.target.value })}
                  className="form-input"
                  data-testid="edit-sale-date"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-1 block">Customer</label>
                <Input
                  value={editingSale.customer_name}
                  onChange={(e) => setEditingSale({ ...editingSale, customer_name: e.target.value })}
                  className="form-input"
                  data-testid="edit-sale-customer"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-1 block">Selling Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingSale.selling_price}
                    onChange={(e) => setEditingSale({ ...editingSale, selling_price: parseFloat(e.target.value) || 0 })}
                    className="form-input font-mono"
                    data-testid="edit-sale-price"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-1 block">Total Cost</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingSale.total_cost}
                    onChange={(e) => setEditingSale({ ...editingSale, total_cost: parseFloat(e.target.value) || 0 })}
                    className="form-input font-mono"
                    data-testid="edit-sale-cost"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-1 block">Notes</label>
                <Input
                  value={editingSale.notes || ""}
                  onChange={(e) => setEditingSale({ ...editingSale, notes: e.target.value })}
                  className="form-input"
                  data-testid="edit-sale-notes"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="border-[#E8E3D9]" onClick={() => setEditDialogOpen(false)} data-testid="edit-sale-cancel">
                  Cancel
                </Button>
                <Button className="bg-[#2C1E16] hover:bg-[#1A1A1A] text-white" onClick={handleSaveEdit} data-testid="edit-sale-save">
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
