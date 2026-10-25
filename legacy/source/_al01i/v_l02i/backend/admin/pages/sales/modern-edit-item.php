<?php
$item_id = $param2;
$item_data = $this->db->get_where('items', array('item_id' => $item_id))->row_array();
$timestamp = strtotime('now');
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;

if (!$item_data) {
    echo '<div class="max-w-4xl mx-auto p-6"><div class="bg-red-50 border border-red-200 rounded-lg p-4"><p class="text-red-800">Item not found.</p></div></div>';
    return;
}
?>

<div class="max-w-4xl mx-auto p-6">
    <!-- Header -->
    <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">Edit Item</h1>
        <p class="text-gray-600">Update item details and configuration</p>
    </div>

    <!-- Form Card -->
    <div class="bg-white rounded-xl shadow-lg border border-gray-200">
        <div class="p-6">
            <?php echo form_open_multipart(site_url('admin/item/update/' . $item_id), array('class' => 'space-y-6', 'id' => 'modern_edit_item_form')); ?>
            
            <!-- Item Image Section -->
            <div class="border-b border-gray-200 pb-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">Item Image</h3>
                <div class="flex items-start space-x-6">
                    <div class="flex-shrink-0">
                        <div class="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer" id="image-preview-container">
                            <img id="image-preview" src="<?= file_exists('uploads/item_image/' . $item_id . '.jpg') ? base_url('uploads/item_image/' . $item_id . '.jpg') : base_url('uploads/item_image/placeholder.jpg') ?>" class="w-full h-full object-cover rounded-lg" alt="Item preview">
                        </div>
                    </div>
                    <div class="flex-1">
                        <input type="file" id="item_image" name="item_image" accept="image/*" class="hidden">
                        <button type="button" onclick="document.getElementById('item_image').click()" class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                            </svg>
                            Change Image
                        </button>
                        <button type="button" id="remove-image" class="ml-2 inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500">
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
                    <input type="text" id="item_name" name="item_name" required value="<?= htmlspecialchars($item_data['item_name']) ?>" class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter item name">
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
                        <option value="<?= $cat['category_id'] ?>" <?= $item_data['category_id'] == $cat['category_id'] ? 'selected' : '' ?>><?= $cat['category_name'] ?></option>
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
                        <option value="<?= $supplier['supplier_id'] ?>" <?= $item_data['supplier_id'] == $supplier['supplier_id'] ? 'selected' : '' ?>><?= $supplier['supplier_name'] ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <!-- Current Quantity (Read-only) -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Current Quantity</label>
                    <div class="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700">
                        <?= number_format($item_data['quantity'], 0, '.', ',') ?>
                    </div>
                </div>
            </div>

            <!-- Description -->
            <div>
                <label for="description" class="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea id="description" name="description" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter item description"><?= htmlspecialchars($item_data['description']) ?></textarea>
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
                        <input type="number" id="selling_price" name="selling_price" required step="0.01" min="0" value="<?= $item_data['selling_price'] ?>" class="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="0.00">
                    </div>
                </div>

                <!-- Purchase Price -->
                <div>
                    <label for="purchase_price" class="block text-sm font-medium text-gray-700 mb-2">Purchase Price *</label>
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span class="text-gray-500 text-sm"><?= $currency ?></span>
                        </div>
                        <input type="number" id="purchase_price" name="purchase_price" required step="0.01" min="0" value="<?= $item_data['purchase_price'] ?>" class="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500" placeholder="0.00">
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
                        <input type="checkbox" id="item_switch" name="item_switch" value="<?= $item_data['item_sold_in_units'] ?>" <?= $item_data['item_sold_in_units'] ? 'checked' : '' ?> class="sr-only peer">
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>

                <!-- Units Configuration -->
                <div id="units-section" class="<?= $item_data['item_sold_in_units'] ? '' : 'hidden' ?> space-y-4">
                    <!-- Primary Unit -->
                    <div>
                        <label for="package_name" class="block text-sm font-medium text-gray-700 mb-2">Primary Unit</label>
                        <select id="package_name" name="package_name" class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Select Primary Unit</option>
                            <?php 
                            $packages = $this->db->get('packages')->result_array();
                            foreach ($packages as $package): 
                            ?>
                            <option value="<?= $package['package_id'] ?>" <?= $item_data['package_id'] == $package['package_id'] ? 'selected' : '' ?>><?= $package['package_name'] ?></option>
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

                    <!-- Existing Units List -->
                    <div id="units-list">
                        <h4 class="text-sm font-medium text-gray-900 mb-3">Item Units</h4>
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
                                    <!-- Existing units will be loaded here -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Form Actions -->
            <div class="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
                <button type="submit" class="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors font-medium">
                    <svg class="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    Update Item
                </button>
                <button type="button" onclick="window.history.back()" class="flex-1 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors font-medium">
                    <svg class="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                    </svg>
                    Cancel
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
            <span class="text-gray-900">Updating...</span>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    // Image upload handling
    const imageInput = document.getElementById('item_image');
    const imagePreview = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image');

    imageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    removeImageBtn.addEventListener('click', function() {
        imageInput.value = '';
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
        }
    });

    // Load existing units
    loadExistingUnits();

    // Add unit functionality
    const addUnitBtn = document.getElementById('add-unit-btn');
    const unitsTableBody = document.getElementById('units-table-body');

    addUnitBtn.addEventListener('click', function() {
        const unitSelect = document.getElementById('item_unit');
        const unitTotal = document.getElementById('unit_total');
        const unitPrice = document.getElementById('unit_price');

        if (!unitSelect.value || !unitTotal.value || !unitPrice.value) {
            showNotification('Please fill all unit fields', 'error');
            return;
        }

        // Add unit via AJAX
        fetch('<?= site_url('admin/addItemUnits/create/0/' . $item_id) ?>', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'item_unit': unitSelect.value,
                'unit_total': unitTotal.value,
                'unit_price': unitPrice.value,
                'timestamp': '<?= $timestamp ?>'
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success !== false) {
                loadExistingUnits();
                // Clear form
                unitSelect.value = '';
                unitTotal.value = '';
                unitPrice.value = '';
                showNotification('Unit added successfully', 'success');
            } else {
                showNotification('Error adding unit', 'error');
            }
        })
        .catch(error => {
            showNotification('Network error occurred', 'error');
        });
    });

    function loadExistingUnits() {
        fetch('<?= site_url('admin/getItemUnitsByItemId/' . $item_id . '/1') ?>', {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.data) {
                unitsTableBody.innerHTML = data.data;
            }
        })
        .catch(error => {
            console.error('Error loading units:', error);
        });
    }

    // Form submission
    const form = document.getElementById('modern_edit_item_form');
    const loadingModal = document.getElementById('loading-modal');

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        loadingModal.classList.remove('hidden');
        loadingModal.classList.add('flex');

        const formData = new FormData(this);

        fetch('<?= site_url('admin/item/update/' . $item_id) ?>', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            loadingModal.classList.add('hidden');
            loadingModal.classList.remove('flex');
            
            if (data.success) {
                showNotification('Item updated successfully!', 'success');
                setTimeout(() => {
                    window.history.back();
                }, 1500);
            } else {
                showNotification(data.message || 'Error updating item', 'error');
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

// Global function for removing units (called from loaded HTML)
function removeItemUnit(unitId) {
    if (confirm('Are you sure you want to remove this unit?')) {
        fetch('<?= site_url('admin/removeItemUnit/') ?>' + unitId, {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadExistingUnits();
                showNotification('Unit removed successfully', 'success');
            } else {
                showNotification('Error removing unit', 'error');
            }
        })
        .catch(error => {
            showNotification('Network error occurred', 'error');
        });
    }
}
</script>