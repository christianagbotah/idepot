

  <!-- Nav Item - reports -->
  <li class="nav-item active">
    <a class="nav-link" href="<?php echo site_url('admin/reports'); ?>">
      <i class="fas fa-fw fa-bar-chart"></i>
      <span>Reports</span></a>
  </li>
  <li  class="list-group navbar-nav bg-gradient-primary sidebar-dark accordion">
              
            <!-- REPORTS NAV -->
            <!-- Divider -->
            <hr class="sidebar-divider my-0">

            <!-- Nav Item - reports Collapse Menu -->
            <li class="nav-item ">
              <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapseReports" aria-expanded="true" aria-controls="collapseReports">
                <i class="fas fa-fw fa-bar-chart-o"></i>
                <span>Reports</span>
              </a>
              <div id="collapseReports" class="collapse" aria-labelledby="headingReports" data-parent="#nav_items_holder">
                <div class="bg-white py-2 collapse-inner rounded">

                
                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_balance_sheet_report/'); ?>')">Balance Sheet</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_income_statement_report/'); ?>')">Income Statement</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_cash_flow_report/'); ?>')">Cash Flow</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_trial_balance_report/'); ?>')">Trial Balance</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                

                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_accounts_receivable_report/'); ?>')">Accounts Receivable</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_accounts_payable_report/'); ?>')">Accounts Payable</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_accounts_payable_report/test'); ?>')">Accounts Payable Test</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_invoice_report/'); ?>')">Invoice Report</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_inventory_report/'); ?>')">Inventory Report</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">

                  <a class="collapse-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_stock_margin_report/'); ?>')">Stock Margin Report</a>
                </div>
              </div>
            </li>
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