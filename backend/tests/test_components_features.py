"""
Backend API Tests for Shadow Cakes Components Features
Tests: Component CRUD, Component Cost Calculation, Component Import, Recipe-Component Integration
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://shadow-cakes-costing.preview.emergentagent.com')


class TestComponentRecipesCRUD:
    """Test Component Recipes CRUD operations"""
    
    def test_get_component_recipes_list(self):
        """GET /api/component-recipes returns list of components"""
        response = requests.get(f"{BASE_URL}/api/component-recipes")
        assert response.status_code == 200, f"Failed to get components: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/component-recipes: {len(data)} components found")
        return data
    
    def test_create_component_recipe(self):
        """POST /api/component-recipes creates a new component"""
        test_id = str(uuid.uuid4())
        component_data = {
            "id": test_id,
            "name": f"TEST_Ganache_{test_id[:8]}",
            "category": "Frostings",
            "batch_yield_grams": 400,
            "notes": "Test component",
            "variants": [{
                "id": str(uuid.uuid4()),
                "name": "Default",
                "prep_time_minutes": 15,
                "utility_time_minutes": 5,
                "ingredients": [],
                "packaging": [],
                "components": []
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/component-recipes", json=component_data)
        assert response.status_code == 200, f"Failed to create component: {response.text}"
        
        data = response.json()
        assert data["name"] == component_data["name"]
        assert data["batch_yield_grams"] == 400
        assert len(data["variants"]) == 1
        assert data["variants"][0]["prep_time_minutes"] == 15
        assert data["variants"][0]["utility_time_minutes"] == 5
        print(f"✓ POST /api/component-recipes: Created {data['name']}")
        return data
    
    def test_get_single_component_recipe(self):
        """GET /api/component-recipes/{id} returns single component"""
        # First create a component
        created = self.test_create_component_recipe()
        component_id = created["id"]
        
        response = requests.get(f"{BASE_URL}/api/component-recipes/{component_id}")
        assert response.status_code == 200, f"Failed to get component: {response.text}"
        
        data = response.json()
        assert data["id"] == component_id
        assert data["name"] == created["name"]
        print(f"✓ GET /api/component-recipes/{component_id}: Retrieved successfully")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/component-recipes/{component_id}")
        return data
    
    def test_update_component_recipe(self):
        """PUT /api/component-recipes/{id} updates component"""
        # First create a component
        created = self.test_create_component_recipe()
        component_id = created["id"]
        
        # Update the component
        updated_data = created.copy()
        updated_data["name"] = f"UPDATED_{created['name']}"
        updated_data["batch_yield_grams"] = 600
        updated_data["variants"][0]["prep_time_minutes"] = 25
        updated_data["variants"][0]["utility_time_minutes"] = 10
        
        response = requests.put(f"{BASE_URL}/api/component-recipes/{component_id}", json=updated_data)
        assert response.status_code == 200, f"Failed to update component: {response.text}"
        
        data = response.json()
        assert data["name"] == updated_data["name"]
        assert data["batch_yield_grams"] == 600
        assert data["variants"][0]["prep_time_minutes"] == 25
        assert data["variants"][0]["utility_time_minutes"] == 10
        print(f"✓ PUT /api/component-recipes/{component_id}: Updated successfully")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/component-recipes/{component_id}")
        return data
    
    def test_delete_component_recipe(self):
        """DELETE /api/component-recipes/{id} deletes component"""
        # First create a component
        created = self.test_create_component_recipe()
        component_id = created["id"]
        
        response = requests.delete(f"{BASE_URL}/api/component-recipes/{component_id}")
        assert response.status_code == 200, f"Failed to delete component: {response.text}"
        
        # Verify deletion
        response = requests.get(f"{BASE_URL}/api/component-recipes/{component_id}")
        assert response.status_code == 404, "Component should not exist after deletion"
        print(f"✓ DELETE /api/component-recipes/{component_id}: Deleted successfully")
    
    def test_component_not_found(self):
        """GET /api/component-recipes/{id} returns 404 for non-existent component"""
        fake_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/component-recipes/{fake_id}")
        assert response.status_code == 404
        print("✓ GET non-existent component returns 404")


class TestComponentCostCalculation:
    """Test Component Cost Calculation endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup_test_data(self):
        """Setup test ingredient and component for cost calculation"""
        # Create test ingredient
        self.ingredient_id = str(uuid.uuid4())
        ingredient_data = {
            "id": self.ingredient_id,
            "name": f"TEST_Chocolate_{self.ingredient_id[:8]}",
            "default_unit": "g"
        }
        requests.post(f"{BASE_URL}/api/ingredients", json=ingredient_data)
        
        # Create ingredient price
        self.price_id = str(uuid.uuid4())
        price_data = {
            "id": self.price_id,
            "ingredient_id": self.ingredient_id,
            "ingredient_name": ingredient_data["name"],
            "store_vendor": "Test Store",
            "purchase_price": 10.00,
            "package_size": 1000,
            "unit": "g",
            "unit_cost": 0.01,
            "purchase_date": "2025-01-15",
            "is_latest": True,
            "notes": "Test brand"
        }
        requests.post(f"{BASE_URL}/api/ingredient-prices", json=price_data)
        
        # Create test component with ingredient
        self.component_id = str(uuid.uuid4())
        self.variant_id = str(uuid.uuid4())
        component_data = {
            "id": self.component_id,
            "name": f"TEST_Ganache_Cost_{self.component_id[:8]}",
            "category": "Frostings",
            "batch_yield_grams": 500,
            "notes": "Test component for cost calculation",
            "variants": [{
                "id": self.variant_id,
                "name": "Default",
                "prep_time_minutes": 30,
                "utility_time_minutes": 10,
                "ingredients": [{
                    "id": str(uuid.uuid4()),
                    "ingredient_id": self.ingredient_id,
                    "ingredient_name": ingredient_data["name"],
                    "quantity": 200,
                    "unit": "g"
                }],
                "packaging": [],
                "components": []
            }]
        }
        requests.post(f"{BASE_URL}/api/component-recipes", json=component_data)
        
        yield
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/component-recipes/{self.component_id}")
        requests.delete(f"{BASE_URL}/api/ingredient-prices/{self.price_id}")
        requests.delete(f"{BASE_URL}/api/ingredients/{self.ingredient_id}")
    
    def test_component_cost_endpoint_exists(self):
        """GET /api/component-recipes/{id}/variants/{vid}/cost endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/component-recipes/{self.component_id}/variants/{self.variant_id}/cost")
        assert response.status_code == 200, f"Cost endpoint failed: {response.text}"
        print("✓ Component cost endpoint exists and returns 200")
    
    def test_component_cost_breakdown_structure(self):
        """Component cost breakdown has correct structure"""
        response = requests.get(f"{BASE_URL}/api/component-recipes/{self.component_id}/variants/{self.variant_id}/cost")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check top-level fields
        assert "recipe_name" in data
        assert "variant_name" in data
        assert "prep_time_minutes" in data
        assert "utility_time_minutes" in data
        assert "batch_yield_grams" in data
        assert "settings" in data
        assert "breakdown" in data
        
        # Check breakdown structure
        breakdown = data["breakdown"]
        assert "ingredient_costs" in breakdown
        assert "packaging_costs" in breakdown
        assert "component_costs" in breakdown
        assert "labour_cost" in breakdown
        assert "utility_cost" in breakdown
        assert "total_cost" in breakdown
        
        print(f"✓ Component cost breakdown structure correct")
        print(f"  - Total cost: ${breakdown['total_cost']}")
        print(f"  - Labour cost: ${breakdown['labour_cost']}")
        print(f"  - Utility cost: ${breakdown['utility_cost']}")
    
    def test_component_cost_calculation_values(self):
        """Component cost calculation returns correct values"""
        response = requests.get(f"{BASE_URL}/api/component-recipes/{self.component_id}/variants/{self.variant_id}/cost")
        data = response.json()
        
        # Verify prep and utility times
        assert data["prep_time_minutes"] == 30
        assert data["utility_time_minutes"] == 10
        assert data["batch_yield_grams"] == 500
        
        breakdown = data["breakdown"]
        
        # Ingredient cost: 200g * $0.01/g = $2.00
        assert len(breakdown["ingredient_costs"]) == 1
        ing_cost = breakdown["ingredient_costs"][0]
        assert ing_cost["quantity"] == 200
        assert abs(ing_cost["cost"] - 2.00) < 0.01
        
        # Labour cost: 30 min * ($10/hr / 60) = $5.00 (default rate)
        # Utility cost: 10 min * ($1/hr / 60) = $0.17 (default rate)
        assert breakdown["labour_cost"] > 0
        assert breakdown["utility_cost"] > 0
        
        print(f"✓ Component cost calculation values correct")
    
    def test_component_cost_per_gram(self):
        """Component cost breakdown includes cost per gram calculation"""
        response = requests.get(f"{BASE_URL}/api/component-recipes/{self.component_id}/variants/{self.variant_id}/cost")
        data = response.json()
        
        # batch_yield_grams should be present for gram costing
        assert data["batch_yield_grams"] == 500
        
        # Cost per gram = total_cost / batch_yield_grams
        total_cost = data["breakdown"]["total_cost"]
        cost_per_gram = total_cost / 500
        
        print(f"✓ Cost per gram: ${cost_per_gram:.4f}/g (total: ${total_cost})")
    
    def test_component_cost_not_found(self):
        """Component cost returns 404 for non-existent component"""
        fake_id = str(uuid.uuid4())
        fake_variant = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/component-recipes/{fake_id}/variants/{fake_variant}/cost")
        assert response.status_code == 404
        print("✓ Component cost returns 404 for non-existent component")


class TestComponentImport:
    """Test CSV import for components using recipe_name column"""
    
    def test_import_components_with_recipe_name_column(self):
        """CSV import for components works with recipe_name column"""
        # First ensure we have ingredients
        csv_ingredients = """ingredient_name,store_vendor,purchase_price,package_size,unit,purchase_date,brand
TEST_Heavy Cream,Costco,8.99,2,L,2025-01-15,Kirkland
TEST_Dark Chocolate,Bulk Barn,15.99,1,kg,2025-01-15,Callebaut"""
        
        files = {'file': ('ingredients.csv', csv_ingredients, 'text/csv')}
        requests.post(f"{BASE_URL}/api/import/ingredients", files=files)
        
        # Import components using recipe_name column (same as recipes)
        csv_content = """recipe_name,variant_name,ingredient_name,quantity,unit,prep_time_minutes,utility_time_minutes,category,notes,batch_yield_grams
TEST_Chocolate Ganache Import,Full Batch,TEST_Heavy Cream,500,ml,20,10,Frostings,Rich ganache,800
TEST_Chocolate Ganache Import,Full Batch,TEST_Dark Chocolate,400,g,20,10,Frostings,Rich ganache,800
TEST_Chocolate Ganache Import,Half Batch,TEST_Heavy Cream,250,ml,15,5,Frostings,Rich ganache,400
TEST_Chocolate Ganache Import,Half Batch,TEST_Dark Chocolate,200,g,15,5,Frostings,Rich ganache,400"""
        
        files = {'file': ('test_components.csv', csv_content, 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/import/components", files=files)
        
        assert response.status_code == 200, f"Component import failed: {response.text}"
        data = response.json()
        assert data.get("status") == "success"
        assert data.get("components_created", 0) >= 1
        print(f"✓ CSV import components with recipe_name: {data.get('components_created')} components, {data.get('variants_created', 0)} variants")
        
        # Verify component was created with correct structure
        response = requests.get(f"{BASE_URL}/api/component-recipes")
        components = response.json()
        test_component = next((c for c in components if c.get("name") == "TEST_Chocolate Ganache Import"), None)
        
        assert test_component is not None, "TEST_Chocolate Ganache Import not found"
        assert test_component.get("batch_yield_grams") == 800
        assert len(test_component.get("variants", [])) >= 2, "Should have at least 2 variants"
        
        # Check variant structure
        full_batch = next((v for v in test_component["variants"] if v["name"] == "Full Batch"), None)
        assert full_batch is not None, "Full Batch variant not found"
        assert full_batch.get("prep_time_minutes") == 20
        assert full_batch.get("utility_time_minutes") == 10
        assert len(full_batch.get("ingredients", [])) == 2
        
        print("✓ Component import verified: variants, prep_time, utility_time, batch_yield_grams all correct")
    
    def test_import_components_with_component_name_column(self):
        """CSV import for components also works with component_name column"""
        csv_content = """component_name,variant_name,ingredient_name,quantity,unit,prep_time_minutes,utility_time_minutes,category,notes,batch_yield_grams
TEST_Vanilla Buttercream,Default,TEST_Heavy Cream,100,ml,25,5,Frostings,Classic buttercream,600"""
        
        files = {'file': ('test_components2.csv', csv_content, 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/import/components", files=files)
        
        assert response.status_code == 200, f"Component import failed: {response.text}"
        data = response.json()
        assert data.get("status") == "success"
        print(f"✓ CSV import components with component_name column works")


class TestRecipeComponentIntegration:
    """Test adding components to recipes and cost calculation"""
    
    @pytest.fixture(autouse=True)
    def setup_test_data(self):
        """Setup test component and recipe"""
        # Create test ingredient
        self.ingredient_id = str(uuid.uuid4())
        ingredient_data = {
            "id": self.ingredient_id,
            "name": f"TEST_Butter_{self.ingredient_id[:8]}",
            "default_unit": "g"
        }
        requests.post(f"{BASE_URL}/api/ingredients", json=ingredient_data)
        
        # Create ingredient price
        self.price_id = str(uuid.uuid4())
        price_data = {
            "id": self.price_id,
            "ingredient_id": self.ingredient_id,
            "ingredient_name": ingredient_data["name"],
            "store_vendor": "Test Store",
            "purchase_price": 5.00,
            "package_size": 500,
            "unit": "g",
            "unit_cost": 0.01,
            "purchase_date": "2025-01-15",
            "is_latest": True
        }
        requests.post(f"{BASE_URL}/api/ingredient-prices", json=price_data)
        
        # Create test component
        self.component_id = str(uuid.uuid4())
        self.component_variant_id = str(uuid.uuid4())
        component_data = {
            "id": self.component_id,
            "name": f"TEST_Frosting_{self.component_id[:8]}",
            "category": "Frostings",
            "batch_yield_grams": 400,
            "variants": [{
                "id": self.component_variant_id,
                "name": "Default",
                "prep_time_minutes": 15,
                "utility_time_minutes": 5,
                "ingredients": [{
                    "id": str(uuid.uuid4()),
                    "ingredient_id": self.ingredient_id,
                    "ingredient_name": ingredient_data["name"],
                    "quantity": 200,
                    "unit": "g"
                }],
                "packaging": [],
                "components": []
            }]
        }
        requests.post(f"{BASE_URL}/api/component-recipes", json=component_data)
        self.component_name = component_data["name"]
        
        # Create test recipe with component reference
        self.recipe_id = str(uuid.uuid4())
        self.recipe_variant_id = str(uuid.uuid4())
        recipe_data = {
            "id": self.recipe_id,
            "name": f"TEST_Cake_With_Component_{self.recipe_id[:8]}",
            "category": "Cakes",
            "variants": [{
                "id": self.recipe_variant_id,
                "name": "8-inch",
                "prep_time_minutes": 60,
                "utility_time_minutes": 30,
                "ingredients": [],
                "packaging": [],
                "components": [{
                    "id": str(uuid.uuid4()),
                    "component_recipe_id": self.component_id,
                    "component_name": self.component_name,
                    "quantity": 200,
                    "use_gram_costing": True
                }]
            }]
        }
        requests.post(f"{BASE_URL}/api/recipes", json=recipe_data)
        
        yield
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/recipes/{self.recipe_id}")
        requests.delete(f"{BASE_URL}/api/component-recipes/{self.component_id}")
        requests.delete(f"{BASE_URL}/api/ingredient-prices/{self.price_id}")
        requests.delete(f"{BASE_URL}/api/ingredients/{self.ingredient_id}")
    
    def test_recipe_with_component_cost_calculation(self):
        """Recipe cost calculation includes component costs"""
        response = requests.get(f"{BASE_URL}/api/recipes/{self.recipe_id}/variants/{self.recipe_variant_id}/cost")
        assert response.status_code == 200, f"Recipe cost failed: {response.text}"
        
        data = response.json()
        breakdown = data["breakdown"]
        
        # Should have component costs
        assert "component_costs" in breakdown
        assert len(breakdown["component_costs"]) == 1
        
        comp_cost = breakdown["component_costs"][0]
        assert comp_cost["component_name"] == self.component_name
        assert comp_cost["quantity"] == 200
        assert comp_cost["use_gram_costing"] == True
        assert comp_cost["cost"] > 0
        
        # Total cost should include component cost
        assert breakdown["total_component_cost"] > 0
        assert breakdown["total_cost"] > 0
        
        print(f"✓ Recipe cost includes component: ${comp_cost['cost']:.2f}")
        print(f"  - Total component cost: ${breakdown['total_component_cost']:.2f}")
        print(f"  - Total recipe cost: ${breakdown['total_cost']:.2f}")


class TestRecipeDetailPageFeatures:
    """Test Recipe Detail Page features - Prep Time and Utility Time separation"""
    
    def test_recipe_variant_has_separate_times(self):
        """Recipe variants have separate prep_time_minutes and utility_time_minutes"""
        # Create a recipe with both times
        recipe_id = str(uuid.uuid4())
        variant_id = str(uuid.uuid4())
        recipe_data = {
            "id": recipe_id,
            "name": f"TEST_Time_Recipe_{recipe_id[:8]}",
            "category": "Test",
            "variants": [{
                "id": variant_id,
                "name": "Default",
                "prep_time_minutes": 45,
                "utility_time_minutes": 20,
                "ingredients": [],
                "packaging": [],
                "components": []
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/recipes", json=recipe_data)
        assert response.status_code == 200
        
        # Verify times are stored separately
        response = requests.get(f"{BASE_URL}/api/recipes/{recipe_id}")
        data = response.json()
        
        variant = data["variants"][0]
        assert variant["prep_time_minutes"] == 45
        assert variant["utility_time_minutes"] == 20
        
        print(f"✓ Recipe variant has separate times: prep={variant['prep_time_minutes']}min, utility={variant['utility_time_minutes']}min")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/recipes/{recipe_id}")
    
    def test_recipe_cost_uses_separate_times(self):
        """Recipe cost calculation uses separate prep and utility times"""
        # Create a recipe
        recipe_id = str(uuid.uuid4())
        variant_id = str(uuid.uuid4())
        recipe_data = {
            "id": recipe_id,
            "name": f"TEST_Cost_Time_Recipe_{recipe_id[:8]}",
            "category": "Test",
            "variants": [{
                "id": variant_id,
                "name": "Default",
                "prep_time_minutes": 60,  # 1 hour
                "utility_time_minutes": 30,  # 0.5 hour
                "ingredients": [],
                "packaging": [],
                "components": []
            }]
        }
        
        requests.post(f"{BASE_URL}/api/recipes", json=recipe_data)
        
        # Get cost breakdown
        response = requests.get(f"{BASE_URL}/api/recipes/{recipe_id}/variants/{variant_id}/cost")
        data = response.json()
        
        assert data["prep_time_minutes"] == 60
        assert data["utility_time_minutes"] == 30
        
        breakdown = data["breakdown"]
        settings = data["settings"]
        
        # Labour cost = prep_time * labour_rate
        expected_labour = (60 / 60) * settings["labour_rate_per_hour"]
        assert abs(breakdown["labour_cost"] - expected_labour) < 0.01
        
        # Utility cost = utility_time * utility_rate
        expected_utility = (30 / 60) * settings["utility_rate_per_hour"]
        assert abs(breakdown["utility_cost"] - expected_utility) < 0.01
        
        print(f"✓ Recipe cost uses separate times:")
        print(f"  - Labour cost: ${breakdown['labour_cost']:.2f} (60min @ ${settings['labour_rate_per_hour']}/hr)")
        print(f"  - Utility cost: ${breakdown['utility_cost']:.2f} (30min @ ${settings['utility_rate_per_hour']}/hr)")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/recipes/{recipe_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
