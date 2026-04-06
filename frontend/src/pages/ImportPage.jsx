import { useState } from "react";
import axios from "axios";
import { 
  Upload, 
  FileXls,
  CheckCircle,
  XCircle,
  Warning,
  DownloadSimple,
  Carrot,
  Cake,
  Package,
  Flask,
  Receipt
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ImportSection = ({ 
  title, 
  description, 
  endpoint, 
  icon: Icon,
  columns,
  templateName,
  onSuccess,
  disclaimer
}) => {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls') || droppedFile.name.endsWith('.csv'))) {
      setFile(droppedFile);
      setResult(null);
    } else {
      toast.error("Please upload a CSV or Excel file (.csv, .xlsx)");
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await axios.post(`${API}${endpoint}`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setResult(res.data);
      toast.success("Import completed successfully");
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Import error:", error);
      const errorMsg = error.response?.data?.detail || "Import failed";
      toast.error(errorMsg);
      setResult({ status: "error", message: errorMsg });
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    // Create a simple template description
    const templateContent = columns.join("\t") + "\n" + 
      columns.map(col => `{${col}}`).join("\t");
    
    const blob = new Blob([templateContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${templateName}_template.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.info("Template columns: " + columns.join(", "));
  };

  return (
    <div className="card-flat p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-lg bg-[#C57B57]/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-6 h-6 text-[#C57B57]" weight="duotone" />
        </div>
        <div>
          <h3 className="font-outfit font-medium text-lg text-[#1A1A1A]">{title}</h3>
          <p className="text-sm text-[#5C554D] mt-1">{description}</p>
          {disclaimer && (
            <p className="text-xs text-[#D99441] font-medium mt-2">{disclaimer}</p>
          )}
        </div>
      </div>
      
      {/* Required columns */}
      <div className="mb-4 p-3 bg-[#F4F1EA] rounded-lg">
        <p className="text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-2">Required Columns</p>
        <div className="flex flex-wrap gap-2">
          {columns.map((col) => (
            <span key={col} className="text-xs font-mono bg-white px-2 py-1 rounded border border-[#E8E3D9]">
              {col}
            </span>
          ))}
        </div>
      </div>
      
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`drop-zone ${dragging ? "active" : ""} ${file ? "border-[#4A6B53]" : ""}`}
        data-testid={`dropzone-${endpoint.replace("/import/", "")}`}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileXls className="w-8 h-8 text-[#4A6B53]" weight="duotone" />
            <div className="text-left">
              <p className="font-medium text-[#1A1A1A]">{file.name}</p>
              <p className="text-sm text-[#5C554D]">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button 
              onClick={() => { setFile(null); setResult(null); }}
              className="ml-4 p-1 hover:bg-[#A63C3C]/10 rounded text-[#A63C3C]"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-10 h-10 text-[#5C554D] mx-auto mb-3" weight="duotone" />
            <p className="text-[#1A1A1A] font-medium mb-1">
              Drag & drop your CSV or Excel file here
            </p>
            <p className="text-sm text-[#5C554D] mb-3">or</p>
            <label className="btn-secondary cursor-pointer inline-block">
              Browse Files
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                data-testid={`file-input-${endpoint.replace("/import/", "")}`}
              />
            </label>
          </>
        )}
      </div>
      
      {/* Actions */}
      <div className="flex items-center justify-between mt-4">
        <button 
          onClick={downloadTemplate}
          className="text-sm text-[#5C554D] hover:text-[#2C1E16] flex items-center gap-1"
        >
          <DownloadSimple className="w-4 h-4" />
          View template columns
        </button>
        
        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="bg-[#2C1E16] hover:bg-[#3E2A1F] text-white disabled:opacity-50"
          data-testid={`upload-btn-${endpoint.replace("/import/", "")}`}
        >
          {uploading ? "Importing..." : "Import Data"}
        </Button>
      </div>
      
      {/* Result */}
      {result && (
        <div className={`mt-4 p-4 rounded-lg ${
          result.status === "success" ? "bg-[#4A6B53]/10" : "bg-[#A63C3C]/10"
        }`}>
          <div className="flex items-start gap-3">
            {result.status === "success" ? (
              <CheckCircle className="w-5 h-5 text-[#4A6B53] flex-shrink-0 mt-0.5" weight="fill" />
            ) : (
              <XCircle className="w-5 h-5 text-[#A63C3C] flex-shrink-0 mt-0.5" weight="fill" />
            )}
            <div className="text-sm">
              {result.status === "success" ? (
                <>
                  <p className="font-medium text-[#4A6B53]">Import Successful</p>
                  {result.ingredients_created !== undefined && (
                    <p className="text-[#5C554D]">Created {result.ingredients_created} ingredients, {result.prices_added} prices</p>
                  )}
                  {result.recipes_created !== undefined && (
                    <p className="text-[#5C554D]">Created {result.recipes_created} recipes with {result.variants_created} variants</p>
                  )}
                  {result.packaging_added !== undefined && (
                    <p className="text-[#5C554D]">Added {result.packaging_added} packaging items</p>
                  )}
                  {result.components_created !== undefined && (
                    <p className="text-[#5C554D]">Created {result.components_created} components</p>
                  )}
                </>
              ) : (
                <p className="text-[#A63C3C]">{result.message || "Import failed"}</p>
              )}
              
              {result.errors?.length > 0 && (
                <div className="mt-2">
                  <p className="flex items-center gap-1 text-[#D99441]">
                    <Warning className="w-4 h-4" />
                    {result.errors.length} warning(s):
                  </p>
                  <ul className="text-xs text-[#5C554D] mt-1 space-y-1">
                    {result.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function ImportPage() {
  return (
    <div data-testid="import-page">
      <header className="page-header">
        <h1 className="page-title">Import Data</h1>
        <p className="text-sm text-[#5C554D] mt-1">
          Upload Excel spreadsheets to replace your data (ingredients, recipes, packaging, components)
        </p>
      </header>
      
      <div className="p-8">
        <Tabs defaultValue="ingredients" className="space-y-6">
          <TabsList className="bg-[#F4F1EA] p-1 rounded-lg">
            <TabsTrigger 
              value="ingredients"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4"
              data-testid="tab-import-ingredients"
            >
              <Carrot className="w-4 h-4 mr-2" />
              Ingredients
            </TabsTrigger>
            <TabsTrigger 
              value="recipes"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4"
              data-testid="tab-import-recipes"
            >
              <Cake className="w-4 h-4 mr-2" />
              Recipes
            </TabsTrigger>
            <TabsTrigger 
              value="packaging"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4"
              data-testid="tab-import-packaging"
            >
              <Package className="w-4 h-4 mr-2" />
              Packaging
            </TabsTrigger>
            <TabsTrigger 
              value="components"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4"
              data-testid="tab-import-components"
            >
              <Flask className="w-4 h-4 mr-2" />
              Components
            </TabsTrigger>
            <TabsTrigger 
              value="sales"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4"
              data-testid="tab-import-sales"
            >
              <Receipt className="w-4 h-4 mr-2" />
              Sales
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="ingredients">
            <ImportSection
              title="Import Ingredient Pricing"
              description="Upload your ingredient pricing spreadsheet. This will create ingredients and their vendor prices."
              disclaimer="Replaces all existing ingredient data."
              endpoint="/import/ingredients"
              icon={Carrot}
              columns={["ingredient_name", "store_vendor", "purchase_price", "package_size", "unit", "purchase_date", "brand"]}
              templateName="ingredient_pricing"
            />
          </TabsContent>
          
          <TabsContent value="recipes">
            <ImportSection
              title="Import Recipes"
              description="Upload your recipes spreadsheet. Each row represents an ingredient in a recipe variant."
              disclaimer="Replaces all existing recipe data."
              endpoint="/import/recipes"
              icon={Cake}
              columns={["recipe_name", "variant_name", "ingredient_name", "quantity", "unit", "prep_time_minutes", "utility_time_minutes", "category", "notes"]}
              templateName="recipes"
            />
          </TabsContent>
          
          <TabsContent value="packaging">
            <ImportSection
              title="Import Packaging"
              description="Upload your packaging items spreadsheet. Unit cost is calculated from purchase_price / package_size."
              disclaimer="Replaces all existing packaging data."
              endpoint="/import/packaging"
              icon={Package}
              columns={["packaging_name", "store_vendor", "purchase_price", "package_size", "unit", "purchase_date", "notes"]}
              templateName="packaging"
            />
          </TabsContent>
          
          <TabsContent value="components">
            <ImportSection
              title="Import Component Recipes"
              description="Upload your component recipes (frostings, ganaches, fillings, etc.)."
              disclaimer="Replaces all existing component data."
              endpoint="/import/components"
              icon={Flask}
              columns={["recipe_name", "variant_name", "ingredient_name", "quantity", "unit", "prep_time_minutes", "utility_time_minutes", "category", "notes"]}
              templateName="component_recipes"
            />
          </TabsContent>
          
          <TabsContent value="sales">
            <ImportSection
              title="Import Sales"
              description="Upload sales data using the same CSV format as the Sales Dashboard export."
              disclaimer="Appends to existing records (does not replace)."
              endpoint="/import/sales"
              icon={Receipt}
              columns={["Sale Date", "Recipe", "Variant", "Customer", "Selling Price", "Total Cost", "Labour Cost", "Profit", "Profit Margin", "Notes"]}
              templateName="sales"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
