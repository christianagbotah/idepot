<?php
$timestamp = strtotime('now');
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
?>

<div class="max-w-4xl mx-auto p-6">
    <!-- Header -->
    <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">Add New Item</h1>
        <p class="text-gray-600">Create a new inventory item with all necessary details</p>
    </div>

    <!-- Form Card -->
    <div class="bg-white rounded-xl shadow-lg border border-gray-200">
        <div class="p-6">
            <?php echo form_open_multipart(site_url('admin/item/create'), array('class' => 'space-y-6', 'id' => 'modern_create_item_form')); ?>
            
            <!-- Item Image Section -->
            <div class="border-b border-gray-200 pb-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">Item Image</h3>
                <div class="flex items-start space-x-6">
                    <div class="flex-shrink-0">
                        <div class="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer" id="image-preview-container">
                            <img id="image-preview" src="<?= base_url('uploads/item_image/placeholder.jpg') ?>" class="w-full h-full object-cover rounded-lg hidden" alt="Item preview">
                            <div id="image-placeholder" class="text-center">
                                <svg class="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                </svg>
                                <p class="text-sm text-gray-500">Click to upload</p>
                            </div>
                        </div>
                    </div>
                    <div class="flex-1">
                        <input type="file" id="item_image" name="item_image" accept="image/*" class="hidden">
                        <button type="button" onclick="document.getElementById('item_image').click()" class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                            </svg>
                            Choose Image
                        </button>
                        <button type="button" id="remove-image" class="ml-2 inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 hidden">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                            Remove
                        </button>
                        <p class="mt-2 text-sm text-gray-500">PNG, JPG, GIF up to 10MB</p>
                    </div>
                </div>
            </div>

            <!-- Basic Information -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Item Name -->
                <div>
                    <label for="item_name" class="block text-sm font-medium text-gray-700 mb-2">Item Name *</label>
                    <input type="text" id="item_name" name="item_name" required class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter item name">
                </div>

                <!-- Category -->
                <div>
                    <label for="category_name" class="block text-sm font-medium text-gray-700 mb-2">Category *</label>
                    <select id="category_name" name="category_name" required class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <option value="">Select Category</option>
                        <?php 
                        $categories = $this->db->get('item_category')->result_array();
                        foreach ($categories as $cat): 
                        ?>
                        <option value="<?= $cat['category_id'] ?>"><?= $cat['category_name'] ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <!-- Supplier -->
                <div>
                    <label for="supplier_name" class="block text-sm font-medium text-gray-700 mb-2">Supplier *</label>
                    <select id="supplier_name" name="supplier_name" required class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <option value="">Select Supplier</option>
                        <?php 
                        $suppliers = $this->db->get('suppliers')->result_array();
                        foreach ($suppliers as $supplier): 
                        ?>
                        <option value="<?= $supplier['supplier_id'] ?>"><?= $supplier['supplier_name'] ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <!-- Quantity -->
                <div>
                    <label for="quantity" class="block text-sm font-medium text-gray-700 mb-2">Available Quantity</label>
                    <input type="number" id="quantity" name="quantity" min="0" step="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="0">
                </div>
            </div>

            <!-- Description -->
            <div>
                <label for="description" class="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea id="description" name="description" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter item description"></textarea>
            </div>

            <!-- Pricing -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Selling Price -->
                <div>
                    <label for="selling_price" class="block text-sm font-medium text-gray-700 mb-2">Selling Price *</label>
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span class="text-gray-500 text-sm"><?= $currency ?></span>
                        </div>
                        <input type="number" id="selling_price" name="selling_price" required step="0.01" min="0" class="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="0.00">
                    </div>
                </div>

                <!-- Purchase Price -->
                <div>
                    <label for="purchase_price" class="block text-sm font-medium text-gray-700 mb-2">Purchase Price *</label>
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span class="text-gray-500 text-sm"><?= $currency ?></span>
                        </div>
                        <input type="number" id="purchase_price" name="purchase_price" required step="0.01" min="0" class="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500" placeholder="0.00">
                    </div>
                </div>
            </div>

            <!-- Multiple Units Section -->
            <div class="border-t border-gray-200 pt-6">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-900">Multiple Units</h3>
                        <p class="text-sm text-gray-600">Enable if this item can be sold in different units</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="item_switch" name="item_switch" value="0" class="sr-only peer">
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>

                <!-- Units Configuration (Hidden by default) -->
                <div id="units-section" class="hidden space-y-4">
                    <!-- Primary Unit -->
                    <div>
                        <label for="package_name" class="block text-sm font-medium text-gray-700 mb-2">Primary Unit</label>
                        <select id="package_name" name="package_name" class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Select Primary Unit</option>
                            <?php 
                            $packages = $this->db->get('packages')->result_array();
                            foreach ($packages as $package): 
                            ?>
                            <option value="<?= $package['package_id'] ?>"><?= $package['package_name'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <!-- Add Unit Form -->
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h4 class="text-sm font-medium text-gray-900 mb-3">Add Additional Unit</h4>
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                                <select id="item_unit" name="item_unit" class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                    <option value="">Select Unit</option>
                                    <?php 
                                    $units = $this->db->get('units')->result_array();
                                    foreach ($units as $unit): 
                                    ?>
                                    <option value="<?= $unit['unit_id'] ?>"><?= $unit['unit_name'] ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <div>
                                <input type="number" id="unit_total" name="unit_total" step="any" placeholder="Total Units" class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            </div>
                            <div>
                                <input type="number" id="unit_price" name="unit_price" step="0.01" placeholder="Unit Price" class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            </div>
                            <div>
                                <button type="button" id="add-unit-btn" class="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors">
                                    Add Unit
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Units List -->
                    <div id="units-list" class="hidden">
                        <h4 class="text-sm font-medium text-gray-900 mb-3">Added Units</h4>
                        <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                    </tr>
                                </thead>
                                <tbody id="units-table-body" class="bg-white divide-y divide-gray-200">
                                    <!-- Units will be added here -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Form Actions -->
            <div class="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
                <button type="submit" name="save_continue" class="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors font-medium">
                    <svg class="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                    Create & Continue
                </button>
                <button type="submit" name="save_close" class="flex-1 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors font-medium">
                    <svg class="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    Create & Close
                </button>
            </div>

            <input type="hidden" name="timestamp" value="<?= $timestamp ?>">
            </form>
        </div>
    </div>
</div>

<!-- Loading Modal -->
<div id="loading-modal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 max-w-sm mx-auto">
        <div class="flex items-center">
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-gray-900">Processing...</span>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    // Image upload handling
    const imageInput = document.getElementById('item_image');
    const imagePreview = document.getElementById('image-preview');
    const imagePlaceholder = document.getElementById('image-placeholder');
    const removeImageBtn = document.getElementById('remove-image');

    imageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                imagePreview.classList.remove('hidden');
                imagePlaceholder.classList.add('hidden');
                removeImageBtn.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    });

    removeImageBtn.addEventListener('click', function() {
        imageInput.value = '';
        imagePreview.classList.add('hidden');
        imagePlaceholder.classList.remove('hidden');
        removeImageBtn.classList.add('hidden');
        imagePreview.src = '<?= base_url('uploads/item_image/placeholder.jpg') ?>';
    });

    // Units toggle
    const itemSwitch = document.getElementById('item_switch');
    const unitsSection = document.getElementById('units-section');

    itemSwitch.addEventListener('change', function() {
        if (this.checked) {
            this.value = '1';
            unitsSection.classList.remove('hidden');
        } else {
            this.value = '0';
            unitsSection.classList.add('hidden');
            clearUnits();
        }
    });

    // Add unit functionality
    const addUnitBtn = document.getElementById('add-unit-btn');
    const unitsList = document.getElementById('units-list');
    const unitsTableBody = document.getElementById('units-table-body');
    let unitsData = [];

    addUnitBtn.addEventListener('click', function() {
        const unitSelect = document.getElementById('item_unit');
        const unitTotal = document.getElementById('unit_total');
        const unitPrice = document.getElementById('unit_price');

        if (!unitSelect.value || !unitTotal.value || !unitPrice.value) {
            alert('Please fill all unit fields');
            return;
        }

        const unitData = {
            id: unitSelect.value,
            name: unitSelect.options[unitSelect.selectedIndex].text,
            total: unitTotal.value,
            price: unitPrice.value
        };

        unitsData.push(unitData);
        renderUnitsTable();
        
        // Clear form
        unitSelect.value = '';
        unitTotal.value = '';
        unitPrice.value = '';
    });

    function renderUnitsTable() {
        if (unitsData.length === 0) {
            unitsList.classList.add('hidden');
            return;
        }

        unitsList.classList.remove('hidden');
        unitsTableBody.innerHTML = unitsData.map((unit, index) => `
            <tr>
                <td class="px-4 py-3 text-sm text-gray-900">${unit.name}</td>
                <td class="px-4 py-3 text-sm text-gray-900">${unit.total}</td>
                <td class="px-4 py-3 text-sm text-gray-900"><?= $currency ?> ${unit.price}</td>
                <td class="px-4 py-3 text-sm">
                    <button type="button" onclick="removeUnit(${index})" class="text-red-600 hover:text-red-900">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    window.removeUnit = function(index) {
        unitsData.splice(index, 1);
        renderUnitsTable();
    };

    function clearUnits() {
        unitsData = [];
        renderUnitsTable();
    }

    // Form submission
    const form = document.getElementById('modern_create_item_form');
    const loadingModal = document.getElementById('loading-modal');

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        loadingModal.classList.remove('hidden');
        loadingModal.classList.add('flex');

        const formData = new FormData(this);
        
        // Add units data if any
        if (unitsData.length > 0) {
            formData.append('units_data', JSON.stringify(unitsData));
        }

        fetch('<?= site_url('admin/item/create') ?>', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            loadingModal.classList.add('hidden');
            loadingModal.classList.remove('flex');
            
            if (data.success) {
                showNotification('Item created successfully!', 'success');
                
                const submitBtn = e.submitter;
                if (submitBtn.name === 'save_continue') {
                    form.reset();
                    clearUnits();
                    unitsSection.classList.add('hidden');
                    itemSwitch.checked = false;
                    itemSwitch.value = '0';
                    removeImageBtn.click();
                } else {
                    setTimeout(() => window.location.reload(), 1500);
                }
            } else {
                showNotification(data.message || 'Error creating item', 'error');
            }
        })
        .catch(error => {
            loadingModal.classList.add('hidden');
            loadingModal.classList.remove('flex');
            showNotification('Network error occurred', 'error');
        });
    });

    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
            type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
});
</script>