
<?php
  // Cache user data for performance
  static $user_data = null;
  if ($user_data === null) {
    $current_user_id = $this->session->userdata('login_user_id');
    $user_data = $this->db->get_where('admin', ['admin_id' => $current_user_id])->row();
  }
  $isManager = $user_data->manager;

  // Cache opening day for performance
  static $opening_day = null;
  if ($opening_day === null) {
    $opening_day = $this->db->get_where('settings', array('type' => 'opening_day'))->row()->description;
  }
  $from = date('d-m-Y', strtotime('this week '. $opening_day));
  $to = date('d-m-Y');
?>


  <!-- Nav Item - Sales -->
  <li class="nav-item active">
    <a class="nav-link" href="<?php echo site_url('admin/sales'); ?>">
      <i class="fas fa-fw fa-hand-holding-usd"></i>
      <span>General Sales</span></a>
  </li>
  

  <li  class="list-group navbar-nav bg-gradient-primary sidebar-dark accordion">
              
            <!-- SALES NAV -->
            <!-- Divider -->
            <hr class="sidebar-divider my-0">

            <!-- Nav Item - Sales Collapse Menu -->
            <li class="nav-item">
              <a class="nav-link collapsed list-item" href="#" data-toggle="collapse" data-target="#collapseSales" aria-expanded="true" aria-controls="collapseSales">
                <i class="fas fa-fw fa-hand-holding-usd"></i>
                <span>Sales Order</span>
              </a>
              <div id="collapseSales" class="collapse" aria-labelledby="headingSales" data-parent="#nav_items_holder">
                <div class="bg-white py-2 collapse-inner rounded">
                  <a class="collapse-item" href="<?= site_url('admin/pos'); ?>" target="_blank">Create New Sales Order</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/sales_order_list/'); ?>', 'View Sales Orders')">View Sales Orders</a>
                </div>
              </div>
            </li>

            <!-- Divider -->
            <hr class="sidebar-divider">
            <!-- Nav Item - Transactions Collapse Menu -->
            <li class="nav-item ">
              <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapseInvoices" aria-expanded="true" aria-controls="collapseInvoices">
                <i class="fas fa-fw fa-file-invoice"></i>
                <span>Invoices</span>
              </a>
              <div id="collapseInvoices" class="collapse" aria-labelledby="headingInvoices" data-parent="#nav_items_holder">
                <div class="bg-white py-2 collapse-inner rounded">
                  <!--<a class="collapse-item" href="#" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_invoice/'); ?>', 'Add Invoice')">Create new invoice</a>-->
                  <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/view_invoices/'); ?>', 'View Invoices')">View invoices</a>
                </div>
              </div>
            </li>

            <!-- Divider -->
            <hr class="sidebar-divider">
            <!-- Nav Item - Transactions Collapse Menu -->
            <li class="nav-item ">
              <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapsePayments" aria-expanded="true" aria-controls="collapsePayments">
                <i class="fa fa-fw fa-credit-card-alt"></i>
                <span>Receipts</span>
              </a>
              <div id="collapsePayments" class="collapse" aria-labelledby="headingPayments" data-parent="#nav_items_holder">
                <div class="bg-white py-2 collapse-inner rounded">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/payments/'); ?>', 'New Payment')">Receive Payment</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/view_payments?from='.$from.'&to='.$to); ?>', 'View Payments')">View Cash Received</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/view_receipts?from='.$from.'&to='.$to); ?>', 'View Receipts')">View Receipts</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider">

                  <!-- Show this only if user is a manager -->
                  <?php
                    if($isManager == '1'):
                      ?>
                      <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/daily_cash_received?date='.$from); ?>', 'Daily Cash Received')">Daily Cash Received</a>
                    <?php endif; ?>
                </div>
              </div>
            </li>

            <!-- Divider -->
            <hr class="sidebar-divider">
            <!-- Nav Item - Sales Collapse Menu -->
            <li class="nav-item ">
              <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapseInvoce_items" aria-expanded="true" aria-controls="collapseInvoce_items">
                <i class="fas fa-fw fa-flag-checkered"></i>
                <span>Invoice Items</span>
              </a>
              <div id="collapseInvoce_items" class="collapse" aria-labelledby="headingInvoice_items" data-parent="#nav_items_holder">
                <div class="bg-white py-2 collapse-inner rounded">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/add_item_main_category/'); ?>', 'Add Item Main Category')">Add new main category</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/view_items_main_category/'); ?>', 'View Items Main Categories')">View main categories</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/add_item_category/'); ?>', 'Add Item Sub Category')">Add new sub category</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/view_items_category/'); ?>', 'View Items Sub Categories')">View sub categories</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/add_item/'); ?>', 'Add Item')">Add new item</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">
                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_backlog_report/'); ?>')">Backlog Account</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/view_items/'); ?>', 'View Items')">View items</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_item_transfer/add_item_transfer/'); ?>', 'Transfer Item')">Transfer items</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_item_transfer/items_transfer_list/'); ?>', 'View Transferred Items')">View Transferred items</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <!-- Show this only if user is a manager -->
                  <?php
                    if($isManager == '1'):
                      ?>
                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_daily_stock_report/'); ?>')">Daily Stock Report</a>
                <?php endif; ?>

                </div>
              </div>
            </li>

            <!-- Divider -->
            <hr class="sidebar-divider">
            <!-- Nav Item - Purchases Collapse Menu -->
            <li class="nav-item ">
              <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapseCustomers" aria-expanded="true" aria-controls="collapseCustomers">
                <i class="fas fa-fw fa-users"></i>
                <span>Customers</span>
              </a>
              <div id="collapseCustomers" class="collapse" aria-labelledby="headingCustomers" data-parent="#nav_items_holder">
                <div class="bg-white py-2 collapse-inner rounded">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add new customer')">Add new customer</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/customers_list/'); ?>', 'View Customers')">View customers</a>
                </div>
              </div>
            </li>

            <!-- Divider -->
            <hr class="sidebar-divider">
            <!-- Nav Item - Settings Collapse Menu -->
            <li class="nav-item">
              <a class="nav-link" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/system_settings/'); ?>');">
                <i class="fas fa-fw fa-cog fa-spin"></i>
                <span>Settings</span></a>
            </li>
            <!-- Divider -->
            <hr class="sidebar-divider d-none d-md-block">
          </li>
