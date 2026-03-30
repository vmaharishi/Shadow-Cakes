"""
Backend API Tests for Shadow Cakes PWA
Tests: PWA assets, CSV/XLSX imports, API endpoints
"""
import pytest
import requests
import os
import io
import csv

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://shadow-cakes-costing.preview.emergentagent.com')

class TestPWAAssets:
    """Test PWA manifest, service worker, and icons accessibility"""
    
    def test_manifest_json_accessible(self):
        """PWA manifest.json is accessible with correct structure"""
        response = requests.get(f"{BASE_URL}/manifest.json")
        assert response.status_code == 200, f"manifest.json not accessible: {response.status_code}"
        
        data = response.json()
        assert data.get("name") == "Shadow Cakes Pricing Tool"
        assert data.get("short_name") == "Shadow Cakes"
        assert data.get("display") == "standalone"
        assert data.get("theme_color") == "#2C1E16"
        assert "icons" in data
        
        # Check for required icon sizes
        icon_sizes = [icon.get("sizes") for icon in data.get("icons", [])]
        assert "192x192" in icon_sizes, "Missing 192x192 icon"
        assert "512x512" in icon_sizes, "Missing 512x512 icon"
        print("✓ manifest.json accessible with correct PWA configuration")
    
    def test_service_worker_accessible(self):
        """Service worker is accessible at /service-worker.js"""
        response = requests.get(f"{BASE_URL}/service-worker.js")
        assert response.status_code == 200, f"service-worker.js not accessible: {response.status_code}"
        assert "CACHE_NAME" in response.text or "caches" in response.text
        print("✓ service-worker.js accessible")
    
    def test_icon_192x192_accessible(self):
        """PWA icon 192x192 is accessible"""
        response = requests.get(f"{BASE_URL}/icon-192x192.png")
        assert response.status_code == 200, f"icon-192x192.png not accessible: {response.status_code}"
        print("✓ icon-192x192.png accessible")
    
    def test_icon_512x512_accessible(self):
        """PWA icon 512x512 is accessible"""
        response = requests.get(f"{BASE_URL}/icon-512x512.png")
        assert response.status_code == 200, f"icon-512x512.png not accessible: {response.status_code}"
        print("✓ icon-512x512.png accessible")
    
    def test_favicon_accessible(self):
        """Favicon is accessible"""
        response = requests.get(f"{BASE_URL}/favicon.ico")
        assert response.status_code == 200, f"favicon.ico not accessible: {response.status_code}"
        print("✓ favicon.ico accessible")
    
    def test_apple_touch_icon_accessible(self):
        """Apple touch icon is accessible"""
        response = requests.get(f"{BASE_URL}/apple-touch-icon.png")
        assert response.status_code == 200, f"apple-touch-icon.png not accessible: {response.status_code}"
        print("✓ apple-touch-icon.png accessible")


class TestAPIEndpoints:
    """Test core API endpoints"""
    
    def test_api_root(self):
        """API root endpoint returns correct message"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "Shadow Cakes" in data.get("message", "")
        print("✓ API root endpoint working")
    
    def test_get_settings(self):
        """Settings endpoint returns default settings"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert "labour_rate_per_hour" in data
        assert "utility_rate_per_hour" in data
        assert data.get("currency") == "CAD"
        print("✓ Settings endpoint working")
    
    def test_get_ingredients(self):
        """Ingredients endpoint returns list"""
        response = requests.get(f"{BASE_URL}/api/ingredients")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Ingredients endpoint working")
    
    def test_get_packaging(self):
        """Packaging endpoint returns list"""
        response = requests.get(f"{BASE_URL}/api/packaging")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Packaging endpoint working")
    
    def test_get_recipes(self):
        """Recipes endpoint returns list"""
        response = requests.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Recipes endpoint working")
    
    def test_get_component_recipes(self):
        """Component recipes endpoint returns list"""
        response = requests.get(f"{BASE_URL}/api/component-recipes")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Component recipes endpoint working")
    
    def test_get_sales(self):
        """Sales endpoint returns list"""
        response = requests.get(f"{BASE_URL}/api/sales")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Sales endpoint working")
    
    def test_get_sales_summary(self):
        """Sales summary endpoint returns aggregated data"""
        response = requests.get(f"{BASE_URL}/api/sales/summary")
        assert response.status_code == 200
        data = response.json()
        assert "total_sales" in data
        assert "total_revenue" in data
        assert "total_profit" in data
        print("✓ Sales summary endpoint working")


class TestCSVImportIngredients:
    """Test CSV import for ingredients"""
    
    def test_import_ingredients_csv(self):
        """CSV import for ingredients works correctly"""
        # Create CSV content
        csv_content = """ingredient_name,store_vendor,purchase_price,package_size,unit,purchase_date,brand
TEST_Flour,Costco,12.99,10,kg,2025-01-15,Robin Hood
TEST_Sugar,Walmart,8.50,5,kg,2025-01-15,Redpath
TEST_Butter,Costco,15.99,2,kg,2025-01-15,Kirkland"""
        
        files = {'file': ('test_ingredients.csv', csv_content, 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/import/ingredients", files=files)
        
        assert response.status_code == 200, f"Import failed: {response.text}"
        data = response.json()
        assert data.get("status") == "success"
        assert data.get("ingredients_created", 0) >= 3
        assert data.get("prices_added", 0) >= 3
        print(f"✓ CSV import ingredients: {data.get('ingredients_created')} ingredients, {data.get('prices_added')} prices")
        
        # Verify data was persisted
        response = requests.get(f"{BASE_URL}/api/ingredients")
        ingredients = response.json()
        ingredient_names = [i.get("name") for i in ingredients]
        assert "TEST_Flour" in ingredient_names, "TEST_Flour not found after import"
        print("✓ Imported ingredients verified in database")


class TestXLSXImportIngredients:
    """Test XLSX import for ingredients"""
    
    def test_import_ingredients_xlsx(self):
        """XLSX import for ingredients works correctly"""
        import openpyxl
        from io import BytesIO
        
        # Create XLSX content
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["ingredient_name", "store_vendor", "purchase_price", "package_size", "unit", "purchase_date", "brand"])
        ws.append(["TEST_Cocoa", "Bulk Barn", 18.99, 1, "kg", "2025-01-15", "Ghirardelli"])
        ws.append(["TEST_Vanilla", "Amazon", 24.99, 0.5, "L", "2025-01-15", "Nielsen-Massey"])
        
        xlsx_buffer = BytesIO()
        wb.save(xlsx_buffer)
        xlsx_buffer.seek(0)
        
        files = {'file': ('test_ingredients.xlsx', xlsx_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        response = requests.post(f"{BASE_URL}/api/import/ingredients", files=files)
        
        assert response.status_code == 200, f"XLSX Import failed: {response.text}"
        data = response.json()
        assert data.get("status") == "success"
        print(f"✓ XLSX import ingredients: {data.get('ingredients_created')} ingredients, {data.get('prices_added')} prices")


class TestCSVImportPackaging:
    """Test CSV import for packaging with all required fields"""
    
    def test_import_packaging_csv_with_all_fields(self):
        """CSV import for packaging stores store_vendor, purchase_price, package_size, purchase_date"""
        csv_content = """packaging_name,store_vendor,purchase_price,package_size,unit,purchase_date,notes
TEST_Cake Box 8inch,Uline,45.00,50,piece,2025-01-10,White cardboard
TEST_Cupcake Liner,Amazon,12.99,500,piece,2025-01-12,Paper liners
TEST_Ribbon Gold,Michaels,8.50,10,meter,2025-01-14,Satin ribbon"""
        
        files = {'file': ('test_packaging.csv', csv_content, 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/import/packaging", files=files)
        
        assert response.status_code == 200, f"Packaging import failed: {response.text}"
        data = response.json()
        assert data.get("status") == "success"
        assert data.get("packaging_added", 0) >= 3
        print(f"✓ CSV import packaging: {data.get('packaging_added')} items")
        
        # Verify all fields were stored correctly
        response = requests.get(f"{BASE_URL}/api/packaging")
        packaging_items = response.json()
        
        # Find our test item
        test_box = next((p for p in packaging_items if p.get("name") == "TEST_Cake Box 8inch"), None)
        assert test_box is not None, "TEST_Cake Box 8inch not found"
        
        # Verify all fields are stored
        assert test_box.get("store_vendor") == "Uline", f"store_vendor not stored correctly: {test_box.get('store_vendor')}"
        assert test_box.get("purchase_price") == 45.00, f"purchase_price not stored correctly: {test_box.get('purchase_price')}"
        assert test_box.get("package_size") == 50, f"package_size not stored correctly: {test_box.get('package_size')}"
        assert "2025-01-10" in str(test_box.get("purchase_date", "")), f"purchase_date not stored correctly: {test_box.get('purchase_date')}"
        
        # Verify unit_cost is calculated correctly (45.00 / 50 = 0.90)
        expected_unit_cost = 45.00 / 50
        assert abs(test_box.get("unit_cost", 0) - expected_unit_cost) < 0.01, f"unit_cost not calculated correctly: {test_box.get('unit_cost')}"
        
        print("✓ Packaging import verified: store_vendor, purchase_price, package_size, purchase_date all stored correctly")


class TestCSVImportRecipes:
    """Test CSV import for recipes"""
    
    def test_import_recipes_csv(self):
        """CSV import for recipes works correctly"""
        # First ensure we have ingredients
        csv_ingredients = """ingredient_name,store_vendor,purchase_price,package_size,unit,purchase_date,brand
TEST_Flour,Costco,12.99,10,kg,2025-01-15,Robin Hood
TEST_Sugar,Walmart,8.50,5,kg,2025-01-15,Redpath"""
        
        files = {'file': ('ingredients.csv', csv_ingredients, 'text/csv')}
        requests.post(f"{BASE_URL}/api/import/ingredients", files=files)
        
        # Now import recipes
        csv_content = """recipe_name,variant_name,ingredient_name,quantity,unit,prep_time_minutes,category,notes
TEST_Chocolate Cake,6-inch,TEST_Flour,200,g,45,Cakes,Birthday cake
TEST_Chocolate Cake,6-inch,TEST_Sugar,150,g,45,Cakes,Birthday cake
TEST_Chocolate Cake,8-inch,TEST_Flour,350,g,60,Cakes,Birthday cake
TEST_Chocolate Cake,8-inch,TEST_Sugar,250,g,60,Cakes,Birthday cake"""
        
        files = {'file': ('test_recipes.csv', csv_content, 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/import/recipes", files=files)
        
        assert response.status_code == 200, f"Recipe import failed: {response.text}"
        data = response.json()
        assert data.get("status") == "success"
        assert data.get("recipes_created", 0) >= 1
        assert data.get("variants_created", 0) >= 2
        print(f"✓ CSV import recipes: {data.get('recipes_created')} recipes, {data.get('variants_created')} variants")
        
        # Verify recipe was created with variants
        response = requests.get(f"{BASE_URL}/api/recipes")
        recipes = response.json()
        test_recipe = next((r for r in recipes if r.get("name") == "TEST_Chocolate Cake"), None)
        assert test_recipe is not None, "TEST_Chocolate Cake not found"
        assert len(test_recipe.get("variants", [])) >= 2, "Recipe should have at least 2 variants"
        print("✓ Recipe variants verified")


class TestCSVImportComponents:
    """Test CSV import for component recipes"""
    
    def test_import_components_csv(self):
        """CSV import for components works correctly"""
        # First ensure we have ingredients
        csv_ingredients = """ingredient_name,store_vendor,purchase_price,package_size,unit,purchase_date,brand
TEST_Cream Cheese,Costco,15.99,2,kg,2025-01-15,Philadelphia
TEST_Icing Sugar,Walmart,5.99,2,kg,2025-01-15,Redpath"""
        
        files = {'file': ('ingredients.csv', csv_ingredients, 'text/csv')}
        requests.post(f"{BASE_URL}/api/import/ingredients", files=files)
        
        # Now import components
        csv_content = """component_name,batch_yield_grams,ingredient_name,quantity,unit,prep_time_minutes,notes
TEST_Cream Cheese Frosting,500,TEST_Cream Cheese,250,g,15,Classic frosting
TEST_Cream Cheese Frosting,500,TEST_Icing Sugar,200,g,15,Classic frosting"""
        
        files = {'file': ('test_components.csv', csv_content, 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/import/components", files=files)
        
        assert response.status_code == 200, f"Component import failed: {response.text}"
        data = response.json()
        assert data.get("status") == "success"
        assert data.get("components_created", 0) >= 1
        print(f"✓ CSV import components: {data.get('components_created')} components")
        
        # Verify component was created
        response = requests.get(f"{BASE_URL}/api/component-recipes")
        components = response.json()
        test_component = next((c for c in components if c.get("name") == "TEST_Cream Cheese Frosting"), None)
        assert test_component is not None, "TEST_Cream Cheese Frosting not found"
        assert test_component.get("batch_yield_grams") == 500
        print("✓ Component verified with batch_yield_grams")


class TestImportValidation:
    """Test import validation and error handling"""
    
    def test_import_ingredients_missing_columns(self):
        """Import fails gracefully with missing required columns"""
        csv_content = """ingredient_name,purchase_price
TEST_Bad,10.00"""
        
        files = {'file': ('bad.csv', csv_content, 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/import/ingredients", files=files)
        
        assert response.status_code == 400, "Should return 400 for missing columns"
        print("✓ Import validation: missing columns handled correctly")
    
    def test_import_invalid_file_type(self):
        """Import fails for invalid file types"""
        files = {'file': ('test.txt', 'invalid content', 'text/plain')}
        response = requests.post(f"{BASE_URL}/api/import/ingredients", files=files)
        
        assert response.status_code == 400, "Should return 400 for invalid file type"
        print("✓ Import validation: invalid file type handled correctly")


class TestCostCalculation:
    """Test recipe cost calculation endpoint"""
    
    def test_cost_calculation_with_selling_price(self):
        """Cost calculation returns profit margin when selling price provided"""
        # Get a recipe
        response = requests.get(f"{BASE_URL}/api/recipes")
        recipes = response.json()
        
        if not recipes:
            pytest.skip("No recipes available for cost calculation test")
        
        recipe = recipes[0]
        if not recipe.get("variants"):
            pytest.skip("Recipe has no variants")
        
        variant = recipe["variants"][0]
        recipe_id = recipe["id"]
        variant_id = variant["id"]
        
        # Calculate cost with selling price
        response = requests.get(f"{BASE_URL}/api/recipes/{recipe_id}/variants/{variant_id}/cost?selling_price=50.00")
        assert response.status_code == 200
        
        data = response.json()
        assert "breakdown" in data
        assert "total_cost" in data["breakdown"]
        assert data["breakdown"].get("selling_price") == 50.00
        assert "profit_margin" in data["breakdown"]
        print(f"✓ Cost calculation: total_cost=${data['breakdown']['total_cost']}, margin={data['breakdown']['profit_margin']}%")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
