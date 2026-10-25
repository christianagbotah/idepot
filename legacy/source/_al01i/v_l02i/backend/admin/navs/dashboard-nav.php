
          <?php 
            //date duration selection - cached for performance
            static $opening_day = null;
            if ($opening_day === null) {
                $opening_day = $this->db->get_where('settings', array('type' => 'opening_day'))->row()->description;
            }
            $from = date('d-m-Y', strtotime('this week '. $opening_day));
            $to = date('d-m-Y');
          ?>

           <!-- Nav Item - Dashboard -->
           <li class="nav-item active">
            <a class="nav-link" href="<?php echo site_url('admin/dashboard'); ?>">
              <i class="fas fa-fw fa-tachometer-alt"></i>
              <span class="hidden-sm">Dashboard</span>
            </a>
          </li>
          <li  class="list-group navbar-nav bg-gradient-primary sidebar-dark accordion">
            
          <!-- DASHBOARD -->
          <!-- Divider -->
          <hr class="sidebar-divider my-0">

          <!-- Nav Item - Transactions Collapse Menu -->
          <li class="nav-item ">
            <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapseTwo" aria-expanded="true" aria-controls="collapseTwo">
              <i class="fas fa-fw fa-exchange-alt"></i>
              <span>Transactions</span>
            </a>
            <div id="collapseTwo" class="collapse" aria-labelledby="headingTwo" data-parent="#nav_items_holder">
              <div class="bg-white py-2 collapse-inner rounded">
                <a class="collapse-item" href="#" onclick="showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/payments/'); ?>', 'Payments and Purchases')">Make a payment</a>
                <!-- Divider -->
                <hr class="sidebar-divider my-0">
                <a class="collapse-item" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/payments/'); ?>', 'New Payment')">Receive a payment</a>
                <!-- Divider -->
                <hr class="sidebar-divider my-0">
               <!-- <a class="collapse-item" href="cards.html">Manual journal entry</a>-->
                <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/view_journals?from='.$from.'&to='.$to); ?>', 'View Journal Enquiries')">View journal</a>
               <!-- <a class="collapse-item" href="cards.html">Reconcile accounts</a>-->
              </div>
            </div>
          </li>

          <!-- Divider -->
          <hr class="sidebar-divider">
          <!-- Nav Item - Sales Collapse Menu -->
          <li class="nav-item ">
            <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapseSales" aria-expanded="true" aria-controls="collapseSales">
              <i class="fas fa-fw fa-hand-holding-usd"></i>
              <span>Sales</span>
            </a>
            <div id="collapseSales" class="collapse" aria-labelledby="headingSales" data-parent="#nav_items_holder">
              <div class="bg-white py-2 collapse-inner rounded">
                <a class="collapse-item" href="<?= site_url('admin/pos'); ?>" target="_blank">Create new sales order</a>
                <!-- Divider -->
                <hr class="sidebar-divider my-0">
               <!-- <a class="collapse-item" href="utilities-color.html">Create new invoice</a>-->
                <a class="collapse-item" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/payments/'); ?>', 'New Payment')">Apply customer's payment</a>
              </div>
            </div>
          </li>

          <!-- Divider -->
          <hr class="sidebar-divider">
          <!-- Nav Item - Purchases Collapse Menu -->
          <li class="nav-item ">
            <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapsePurchases" aria-expanded="true" aria-controls="collapsePurchases">
              <i class="fas fa-fw fa-money-bill-alt"></i>
              <span>Purchases</span>
            </a>
            <div id="collapsePurchases" class="collapse" aria-labelledby="headingPages" data-parent="#nav_items_holder">
              <div class="bg-white py-2 collapse-inner rounded">
                <a class="collapse-item" href="javascript:;" title="Create New Purchase Order" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_purchase_order/');?>', 'Create New Purchase Order')">Create new purchase order</a>
                <!-- Divider -->
                <hr class="sidebar-divider my-0">
                <a class="collapse-item" href="#" onclick="showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/enter_payable/');?>', 'Record New Account Payable')">Enter new accounts payable</a>
              </div>
            </div>
          </li>

          <!-- Divider -->
          <hr class="sidebar-divider">
          <!-- Nav Item - Banking Collapse Menu -->
          <li class="nav-item ">
            <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapseBanking" aria-expanded="true" aria-controls="collapseBanking">
              <i class="fas fa-fw fa-landmark"></i>
              <span>Banking</span>
            </a>
            <div id="collapseBanking" class="collapse" aria-labelledby="headingPages" data-parent="#nav_items_holder">
              <div class="bg-white py-2 collapse-inner rounded">
                <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_banking/account_enquiry/');?>', 'View Accounts Enquiries')">Bank reconciliation</a>
                <!-- Divider -->
                <hr class="sidebar-divider my-0">
                <a class="collapse-item" href="#" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_banking/account_transfer/');?>', 'Accounts Transfer')">Account transfer</a>
              </div>
            </div>
          </li>

          <!-- Divider
          <hr class="sidebar-divider">
          Nav Item - Reports Collapse Menu 
          <li class="nav-item">
            <a class="nav-link" href="tables.html">
              <i class="fas fa-fw fa-bar-chart"></i>
              <span>Reports</span></a>
          </li>-->
          <!-- Divider -->
            <hr class="sidebar-divider">
            <!-- Nav Item - Settings Collapse Menu -->
            <li class="nav-item">
              <a class="nav-link" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/system_settings/');?>');">
                <i class="fas fa-fw fa-cog fa-spin"></i>
                <span>Settings</span></a>
            </li>
          <!-- Divider -->
          <hr class="sidebar-divider d-none d-md-block">
</li>
