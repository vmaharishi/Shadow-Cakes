#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timezone

class ShadowCakesAPITester:
    def __init__(self, base_url="https://recipe-costing-19.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Store created IDs for cleanup and further testing
        self.ingredient_ids = []
        self.packaging_ids = []
        self.component_ids = []
        self.recipe_ids = []

    def log_result(self, test_name, success, response_data=None, error_msg=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name} - PASSED")
        else:
            print(f"❌ {test_name} - FAILED: {error_msg}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "error": error_msg,
            "response_data": response_data
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            response_data = None
            
            try:
                response_data = response.json()
            except:
                response_data = response.text

            if success:
                self.log_result(name, True, response_data)
                return True, response_data
            else:
                self.log_result(name, False, response_data, f"Expected {expected_status}, got {response.status_code}")
                return False, response_data

        except Exception as e:
            self.log_result(name, False, None, str(e))
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def test_settings_crud(self):
        """Test settings endpoints"""
        print("\n🔧 Testing Settings...")
        
        # Get settings
        success, settings = self.run_test("Get Settings", "GET", "settings", 200)
        if not success:
            return False
            
        # Update settings
        updated_settings = {
            "labour_rate_per_hour": 15.0,
            "utility_rate_per_hour": 2.0,
            "currency": "CAD",
            "currency_symbol": "$"
        }
        success, _ = self.run_test("Update Settings", "PUT", "settings", 200, updated_settings)
        return success

    def test_ingredients_crud(self):
        """Test ingredients endpoints"""
        print("\n🥕 Testing Ingredients...")
        
        # Create ingredient
        ingredient_data = {
            "name": "Test Flour",
            "default_unit": "g",
            "notes": "Test ingredient for API testing"
        }
        success, response = self.run_test("Create Ingredient", "POST", "ingredients", 200, ingredient_data)
        if success and response:
            self.ingredient_ids.append(response.get('id'))
        
        # Get all ingredients
        success, ingredients = self.run_test("Get All Ingredients", "GET", "ingredients", 200)
        
        # Create another ingredient for pricing test
        ingredient_data2 = {
            "name": "Test Sugar",
            "default_unit": "g",
            "notes": "Another test ingredient"
        }
        success, response = self.run_test("Create Second Ingredient", "POST", "ingredients", 200, ingredient_data2)
        if success and response:
            self.ingredient_ids.append(response.get('id'))
        
        return len(self.ingredient_ids) > 0

    def test_ingredient_prices_crud(self):
        """Test ingredient prices endpoints"""
        print("\n💰 Testing Ingredient Prices...")
        
        if not self.ingredient_ids:
            print("❌ No ingredients available for pricing test")
            return False
            
        ingredient_id = self.ingredient_ids[0]
        
        # Create ingredient price
        price_data = {
            "ingredient_id": ingredient_id,
            "ingredient_name": "Test Flour",
            "store_vendor": "Test Store",
            "purchase_price": 5.99,
            "package_size": 1000,
            "unit": "g",
            "purchase_date": datetime.now(timezone.utc).isoformat(),
            "is_latest": True,
            "notes": "Test price"
        }
        success, response = self.run_test("Create Ingredient Price", "POST", "ingredient-prices", 200, price_data)
        
        # Get all prices
        success, prices = self.run_test("Get All Ingredient Prices", "GET", "ingredient-prices", 200)
        
        # Get prices for specific ingredient
        success, ingredient_prices = self.run_test("Get Ingredient Prices", "GET", f"ingredient-prices/{ingredient_id}", 200)
        
        return success

    def test_packaging_crud(self):
        """Test packaging endpoints"""
        print("\n📦 Testing Packaging...")
        
        # Create packaging
        packaging_data = {
            "name": "Test Box",
            "unit_cost": 2.50,
            "unit": "piece",
            "notes": "Test packaging item"
        }
        success, response = self.run_test("Create Packaging", "POST", "packaging", 200, packaging_data)
        if success and response:
            self.packaging_ids.append(response.get('id'))
        
        # Get all packaging
        success, packaging = self.run_test("Get All Packaging", "GET", "packaging", 200)
        
        return len(self.packaging_ids) > 0

    def test_component_recipes_crud(self):
        """Test component recipes endpoints"""
        print("\n🧪 Testing Component Recipes...")
        
        if not self.ingredient_ids:
            print("❌ No ingredients available for component test")
            return False
        
        # Create component recipe
        component_data = {
            "name": "Test Ganache",
            "batch_yield_grams": 500,
            "prep_time_minutes": 30,
            "notes": "Test component recipe",
            "ingredients": [
                {
                    "ingredient_id": self.ingredient_ids[0],
                    "ingredient_name": "Test Flour",
                    "quantity": 100,
                    "unit": "g"
                }
            ],
            "packaging": []
        }
        success, response = self.run_test("Create Component Recipe", "POST", "component-recipes", 200, component_data)
        if success and response:
            self.component_ids.append(response.get('id'))
        
        # Get all components
        success, components = self.run_test("Get All Component Recipes", "GET", "component-recipes", 200)
        
        # Get specific component
        if self.component_ids:
            success, component = self.run_test("Get Component Recipe", "GET", f"component-recipes/{self.component_ids[0]}", 200)
        
        return len(self.component_ids) > 0

    def test_recipes_crud(self):
        """Test recipes endpoints"""
        print("\n🍰 Testing Recipes...")
        
        if not self.ingredient_ids:
            print("❌ No ingredients available for recipe test")
            return False
        
        # Create recipe with variant
        recipe_data = {
            "name": "Test Cake",
            "category": "Cakes",
            "notes": "Test recipe",
            "variants": [
                {
                    "name": "6-inch",
                    "prep_time_minutes": 60,
                    "ingredients": [
                        {
                            "ingredient_id": self.ingredient_ids[0],
                            "ingredient_name": "Test Flour",
                            "quantity": 200,
                            "unit": "g",
                            "store_vendor_override": None
                        }
                    ],
                    "packaging": [],
                    "components": []
                }
            ]
        }
        success, response = self.run_test("Create Recipe", "POST", "recipes", 200, recipe_data)
        if success and response:
            self.recipe_ids.append(response.get('id'))
        
        # Get all recipes
        success, recipes = self.run_test("Get All Recipes", "GET", "recipes", 200)
        
        # Get specific recipe
        if self.recipe_ids:
            success, recipe = self.run_test("Get Recipe", "GET", f"recipes/{self.recipe_ids[0]}", 200)
        
        return len(self.recipe_ids) > 0

    def test_cost_calculation(self):
        """Test cost calculation endpoint"""
        print("\n💵 Testing Cost Calculation...")
        
        if not self.recipe_ids:
            print("❌ No recipes available for cost calculation test")
            return False
        
        # Get recipe to find variant ID
        success, recipe = self.run_test("Get Recipe for Cost Calc", "GET", f"recipes/{self.recipe_ids[0]}", 200)
        if not success or not recipe.get('variants'):
            print("❌ No variants found in recipe")
            return False
        
        variant_id = recipe['variants'][0]['id']
        
        # Calculate cost without selling price
        success, cost_breakdown = self.run_test("Calculate Cost", "GET", f"recipes/{self.recipe_ids[0]}/variants/{variant_id}/cost", 200)
        
        # Calculate cost with selling price
        success, cost_with_margin = self.run_test("Calculate Cost with Margin", "GET", f"recipes/{self.recipe_ids[0]}/variants/{variant_id}/cost", 200, params={"selling_price": 25.00})
        
        return success

    def cleanup_test_data(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete recipes
        for recipe_id in self.recipe_ids:
            self.run_test(f"Delete Recipe {recipe_id}", "DELETE", f"recipes/{recipe_id}", 200)
        
        # Delete components
        for component_id in self.component_ids:
            self.run_test(f"Delete Component {component_id}", "DELETE", f"component-recipes/{component_id}", 200)
        
        # Delete packaging
        for packaging_id in self.packaging_ids:
            self.run_test(f"Delete Packaging {packaging_id}", "DELETE", f"packaging/{packaging_id}", 200)
        
        # Delete ingredients (this also deletes associated prices)
        for ingredient_id in self.ingredient_ids:
            self.run_test(f"Delete Ingredient {ingredient_id}", "DELETE", f"ingredients/{ingredient_id}", 200)

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Shadow Cakes API Tests...")
        print(f"Testing against: {self.base_url}")
        
        # Test basic connectivity
        success = self.test_root_endpoint()
        if not success:
            print("❌ Cannot connect to API. Stopping tests.")
            return False
        
        # Test all endpoints
        self.test_settings_crud()
        self.test_ingredients_crud()
        self.test_ingredient_prices_crud()
        self.test_packaging_crud()
        self.test_component_recipes_crud()
        self.test_recipes_crud()
        self.test_cost_calculation()
        
        # Cleanup
        self.cleanup_test_data()
        
        # Print summary
        print(f"\n📊 Test Summary:")
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        # Save detailed results
        with open('/app/test_reports/backend_api_results.json', 'w') as f:
            json.dump({
                "summary": {
                    "tests_run": self.tests_run,
                    "tests_passed": self.tests_passed,
                    "success_rate": round(self.tests_passed/self.tests_run*100, 1)
                },
                "results": self.test_results
            }, f, indent=2)
        
        return self.tests_passed == self.tests_run

def main():
    tester = ShadowCakesAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())