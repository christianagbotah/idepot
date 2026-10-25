

<?php
  // Cache opening day for performance
  static $opening_day = null;
  if ($opening_day === null) {
    $opening_day = $this->db->get_where('settings', array('type' => 'opening_day'))->row()->description;
  }
  $from = date('d-m-Y', strtotime('this week '. $opening_day));
  $to = date('d-m-Y');
?>

  <!-- Nav Item - Purchases -->
  <li class="nav-item active">
    <a class="nav-link" href="<?php echo site_url('admin/purchases'); ?>">
      <i class="fas fa-fw fa-money"></i>
      <span>General Purchases</span></a>
  </li>
  <li  class="list-group navbar-nav bg-gradient-primary sidebar-dark accordion">
              
            <!-- PURCHASES NAV -->
            <!-- Divider -->
            <hr class="sidebar-divider my-0">

            <!-- Nav Item - purchases Collapse Menu -->
            <li class="nav-item ">
              <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapsePurchases" aria-expanded="true" aria-controls="collapsePurchases">
                <i class="fas fa-fw fa-money"></i>
                <span>Purchase Orders</span>
              </a>
              <div id="collapsePurchases" class="collapse" aria-labelledby="headingPurchases" data-parent="#nav_items_holder">
                <div class="bg-white py-2 collapse-inner rounded">
                  <a class="collapse-item" href="#" title="Create New Purchase Order" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_purchase_order/');?>', 'Create New Purchase Order')">Create new purchases order</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_purchases/purchase_order_list/');?>', 'View Purchase Orders')">View Purchase Oders</a>
                </div>
              </div>
            </li>

            <!-- Divider -->
            <hr class="sidebar-divider">
            <!-- Nav Item - purchases Collapse Menu -->
            <li class="nav-item ">
              <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapseAccountsPayable" aria-expanded="true" aria-controls="collapseAccountsPayable">
                <i class="fas fa-fw fa-money-check-alt"></i>
                <span>Accounts Payable</span>
              </a>
              <div id="collapseAccountsPayable" class="collapse" aria-labelledby="headingPurchases" data-parent="#nav_items_holder">
                <div class="bg-white py-2 collapse-inner rounded">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/enter_payable/');?>', 'Record New Account Payable')">Record New Account Payable</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_accounts_payable_report/'); ?>')">View Accounts Payable</a>
                </div>
              </div>
            </li>

            <!-- Divider -->
            <hr class="sidebar-divider">
            <li class="nav-item">
              <a class="nav-link" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_purchases/payables_taken?from='.$from.'&to='.$to); ?>', 'Payables Taken')">
                <i class="entypo-chart-area"></i>
                <span>Payables Taken</span>
              </a>
            </li>
            <!-- Divider -->
            <hr class="sidebar-divider">
            <!-- Nav Item - purchases Collapse Menu -->
            <li class="nav-item ">
              <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapsePayments" aria-expanded="true" aria-controls="collapsePayments">
                <i class="fas fa-fw fa-donate"></i>
                <span>Enter Payments</span>
              </a>
              <div id="collapsePayments" class="collapse" aria-labelledby="headingPurchases" data-parent="#nav_items_holder">
                <div class="bg-white py-2 collapse-inner rounded">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/payments/');?>', 'Payments And Purchases')">Make Direct Payments</a>

             <!--     <a class="collapse-item" href="#" onclick="showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/pay_payable/');?>', 'Enter Payments For Accounts Payable')">Pay For Accounts Payable</a> -->
                </div>
              </div>
            </li>

            <!-- Divider -->
            <hr class="sidebar-divider">
            <!-- Nav Item - suppliers Collapse Menu -->
            <li class="nav-item ">
              <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapseSuppliers" aria-expanded="true" aria-controls="collapseSuppliers">
                <i class="fas fa-fw fa-users"></i>
                <span>Suppliers</span>
              </a>
              <div id="collapseSuppliers" class="collapse" aria-labelledby="headingSuppliers" data-parent="#nav_items_holder">
                <div class="bg-white py-2 collapse-inner rounded">
                  <a class="collapse-item" href="#" title="Create New Supplier" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_supplier/');?>', 'Add new supplier')">Add new supplier</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_purchases/suppliers_list/');?>', 'View Suppliers')">View suppliers</a>
                </div>
              </div>
            </li>

            <!-- Divider -->
            <hr class="sidebar-divider">
            <!-- Nav Item - Settings Collapse Menu -->
            <li class="nav-item">
              <a class="nav-link" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/system_settings/');?>')">
                <i class="fas fa-fw fa-cog fa-spin"></i>
                <span>Settings</span></a>
            </li>
            <!-- Divider -->
            <hr class="sidebar-divider d-none d-md-block">
</li>