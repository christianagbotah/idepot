<?php
// Batch load admin and settings
$admin_row = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id') ?? 0))->row();
$level = $admin_row->level ?? 0;

$settings = $this->db->where_in('type', array('currency', 'opening_day'))->get('settings')->result_array();
$settings_map = array_column($settings, 'description', 'type');

$currency = $settings_map['currency'] ?? '';
$opening_day = $settings_map['opening_day'] ?? 'monday';
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

$from = date('d-m-Y', strtotime('this week '. $opening_day));
$to = date('d-m-Y');
$from_ts = strtotime($from);
$to_ts = strtotime($to);

$no_customers = $this->db->get('customers')->num_rows();

// Batch load sales data
$sales_row = $this->db
	->select_sum('credit_amount')
  ->where('timestamp BETWEEN "'. $from_ts .'" AND "'. $to_ts . '"')
	->where('journal', 'Sales')
	->where('account_name', 'General Sales')
	->get('general_journal')->row();
$total_sales = $sales_row->credit_amount ?? 0;

// Batch load all payment types in single query
$this->db->select('payment_type, SUM(amount) as total');
$this->db->where('timestamp BETWEEN "'. $from_ts .'" AND "'. $to_ts . '"');
$this->db->where_in('payment_type', array('Income', 'Receivable', 'Deposit'));
$this->db->group_by('payment_type');
$payment_totals = $this->db->get('payment')->result_array();

$total_income = 0;
foreach ($payment_totals as $pt) {
    $total_income += $pt['total'] ?? 0;
}

// ACCOUNTS RECEIVABLE - customers side
$receivable_row = $this->db
  ->select_sum('amount_due')
  ->where('timestamp BETWEEN "'. $from_ts .'" AND "'. $to_ts . '"')
  ->where('amount_due >', 0)
  ->get('invoice')->row();
$receivable_sub_total = $receivable_row->amount_due ?? 0;

// ACCOUNTS RECEIVABLE - suppliers side (overpaid)
$receivable_s_row = $this->db
  ->select_sum('amount_due')
  ->where('timestamp BETWEEN "'. $from_ts .'" AND "'. $to_ts . '"')
  ->where('amount_due <', 0)
  ->get('accounts_payable')->row();
$receivable_sub_total_s = abs($receivable_s_row->amount_due ?? 0);

$grand_total_rec = $receivable_sub_total + $receivable_sub_total_s;

?>

  

          <!-- Page Heading -->
          <div class="d-sm-flex align-items-center justify-content-between mb-4">
            <h1 class="h3 mb-0 text-gray-800">
                <i class="entypo-right-circled"></i>
                  <?php echo $page_title; ?>
            </h1>
            <a href="JavaScript:;" class="d-none d-sm-inline-block btn btn-sm btn-success shadow-lg rounded-lg p-4 calendar_pop" onclick="showAjaxModal_calendar('<?php echo site_url('modal/popup_calendar/calendar/'); ?>');"><i class="fas fa-calendar fa-sm text-white-50"></i> Calendar</a>
          </div>

          <div class="row">

             <!-- Earnings (Monthly) Card Example -->
            <div class="col-xl-3 col-md-6 mb-4">
              <div class="card border-left-success shadow h-100 py-2 bg-sky-500 rounded-lg">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-success text-uppercase mb-1 ">ACCOUNTS RECEIVABLE</div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800"><?=numfmt_format_currency($fmt, $grand_total_rec, $currency);?></div> 
                      <div class="text-xs font-weight-bold text-danger text-uppercase" style="text-align: right">This Week</div>
                    </div>
                    <div class="col-auto">
                      <i class="fas fa-dollar-sign fa-2x text-gray-300"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Earnings (Monthly) Card Example -->
            <div class="col-xl-3 col-md-6 mb-4">
              <div class="card border-left-success shadow h-100 py-2">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-success text-uppercase mb-1">Sales</div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800"><?=numfmt_format_currency($fmt, $total_sales, $currency);?></div>
                      <div class="text-xs font-weight-bold text-danger text-uppercase" style="text-align: right">This Week</div>
                    </div>
                    <div class="col-auto">
                      <i class="fas fa-dollar-sign fa-2x text-gray-300"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Earnings (Monthly) Card Example -->
            <div class="col-xl-3 col-md-6 mb-4">
              <div class="card border-left-success shadow h-100 py-2">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-success text-uppercase mb-1">Income</div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800"><?=numfmt_format_currency($fmt, $total_income, $currency);?></div>
                      <div class="text-xs font-weight-bold text-danger text-uppercase" style="text-align: right">This Week</div>
                    </div>
                    <div class="col-auto">
                      <i class="fas fa-dollar-sign fa-2x text-gray-300"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Earnings (Monthly) Card Example -->
            <div class="col-xl-3 col-md-6 mb-4">
              <div class="card border-left-success shadow h-100 py-2">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-success text-uppercase mb-1">No. Of Customers</div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800"><?=number_format($no_customers, 0, '.', ',');?></div>
                    </div>
                    <div class="col-auto">
                      <i class="fas fa-users fa-2x text-gray-300"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="row">

            <div class="col-lg-6">

              <!-- Collapsable Card Example -->
              <div class="card shadow mb-4">
                <!-- Card Header - Accordion -->
                <a href="#collapseCardSales1" class="d-block card-header py-3" data-toggle="collapse" role="button" aria-expanded="true" aria-controls="collapseCardSales1">
                  <h6 class="m-0 font-weight-bold text-success">Sales Orders</h6>
                </a>
                <!-- Card Content - Collapse -->
                <div class="collapse show" id="collapseCardSales1">
                  <div class="card-body">

                    <div class="row">
                      <!--<div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_sales_order/'); ?>', 'Add Sales Order')">
                        <div class="card bg-success text-white shadow">
                          <div class="card-body">
                            Create New Sales Orders
                            <div class="text-white-50 small">Orders From Customers</div>
                          </div>
                        </div>
                        </a>
                      </div> -->

                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="<?= site_url('admin/pos'); ?>" style="text-decoration: none; color: #fff; font-size: 20px" target="_blank">
                          <div class="card bg-success text-white shadow">
                            <div class="card-body">
                              <i class="fas fa-cash-register fa-2x"></i> <span style="color: #fff; font-size: 20px; font-weight: bold;">POS</span> <em><small style="font-size: 10px">Start your sales here...</small></em>
                            </div>
                          </div>
                        </a>
                      </div> 

                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/sales_order_list?from='.$from.'&to='.$to); ?>', 'View Sales Orders')">
                        <div class="card bg-success text-white shadow">
                          <div class="card-body">
                            View All Sales Orders
                            <div class="text-white-50 small">View/Edit Customers' Orders</div>
                          </div>
                        </div>
                        </a>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

              <!-- Collapsable Card Example -->
              <div class="card shadow mb-4">
                <!-- Card Header - Accordion -->
                <a href="#collapseCardSales2" class="d-block card-header py-3" data-toggle="collapse" role="button" aria-expanded="true" aria-controls="collapseCardSales2">
                  <h6 class="m-0 font-weight-bold text-success">Invoicing Column</h6>
                </a>
                <!-- Card Content - Collapse -->
                <div class="collapse show" id="collapseCardSales2">
                  <div class="card-body">

                    <div class="row">
                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="<?= site_url('admin/pos'); ?>" target="_blank" style="text-decoration: none;">
                        <div class="card bg-success text-white shadow">
                          <div class="card-body">
                            Create New Invoice | Order
                            <div class="text-white-50 small">New Invoices For Customers</div>
                          </div>
                        </div>
                        </a>
                      </div>

                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/view_invoices?from='.$from.'&to='.$to); ?>', 'View Invoices')">
                        <div class="card bg-success text-white shadow">
                          <div class="card-body">
                            View All Invoices
                            <div class="text-white-50 small">View/Edit Customers' Invoices</div>
                          </div>
                        </div>
                        </a>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

            </div>

            <div class="col-lg-6">

             <!-- Collapsable Card Example -->
              <div class="card shadow mb-4">
                <!-- Card Header - Accordion -->
                <a href="#collapseCardSales3" class="d-block card-header py-3" data-toggle="collapse" role="button" aria-expanded="true" aria-controls="collapseCardSales3">
                  <h6 class="m-0 font-weight-bold text-success">Customers Column</h6>
                </a>
                <!-- Card Content - Collapse -->
                <div class="collapse show" id="collapseCardSales3">
                  <div class="card-body">

                    <div class="row">
                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add New Customer')">
                        <div class="card bg-success text-white shadow">
                          <div class="card-body">
                            Create New Customer
                            <div class="text-white-50 small">Add New Customer</div>
                          </div>
                        </div>
                      </div>

                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;">
                        <div class="card bg-success text-white shadow">
                          <div class="card-body">
                            <div class="text-white-50 small">
                              <?php
                              $this->db->order_by('customer_name', 'asc');
                              $all_customers = $this->db->get('customers')->result_array(); ?>

                              
                                  <select class="form-control form-control-info select2" id="nameSearch" onchange="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/customers_list/'); ?>' + $(this).val(), 'View Customers')">
                                      <option value="">Search/Select Customer</option>
                                      <?php
                                          foreach($all_customers as $c) { ?>
                                              <option value="<?=$c['customer_id'] ?? 0; ?>"><?=$c['customer_name'] ?? ''; ?></option>

                                          <?php } ?>

                                  </select>
                            </div>
                          </div>
                        </div>
                        </a>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

              <!-- Collapsable Card Example -->
              <div class="card shadow mb-4">
                <!-- Card Header - Accordion -->
                <a href="#collapseCardSales4" class="d-block card-header py-3" data-toggle="collapse" role="button" aria-expanded="true" aria-controls="collapseCardSales4">
                  <h6 class="m-0 font-weight-bold text-success">Price Management & Receivable Reports</h6>
                </a>
                <!-- Card Content - Collapse -->
                <div class="collapse show" id="collapseCardSales4">
                  <div class="card-body">

                    <div class="row">
                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" id="anchor_r" style="text-decoration: none;" >

                          <!-- 
                            onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/pricing?from='.$from.'&to='.$to); ?>', 'Manage Customers\' Prices')"
                          -->
                        <div class="card bg-success text-white shadow">
                          <div class="card-body">
                            Pricing
                            <div class="text-white-50 small">Manage Customers' Prices</div>
                          </div>
                        </div>
                      </a>
                      </div>

                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/accounts_receivable?from='.$from.'&to='.$to); ?>', 'Accounts Receivable')">
                        <div class="card bg-success text-white shadow">
                          <div class="card-body">
                            Accounts Receivable
                            <div class="text-white-50 small">View Unpaid Invoices</div>
                          </div>
                        </div>
                      </a>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

            </div>

          </div>

        

  <?php
  echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
?>

  <script type="text/javascript">

    $('#anchor_r').click(function(event) {
      /* Act on the event */
      let level = <?php echo $level; ?>;

      if(level == 1 || level == 2) {
        $(this).removeAttr('href');
        $(this).attr('href', '<?php echo site_url('admin/manage_prices/'.$from.'/'.$to) ?>');
        $(this).attr('target', '_blank');

      } else {
        showAjaxModal_confirm('Sorry! You don\'t have enough permission to view this page.', 'Error');
      }
    });
  </script>

<script type="text/javascript">

$(function($) {
  
  loadNavMenu();    

})

function loadNavMenu() {

  $('#nav_menu_loading_holder').html('<center class="mt-5"><i class="fa fa-spinner fa-pulse fa-3x"></i><br/><p>Loading Sidebar Menu</p></center>'); //pre-loader

  $.ajax({
    url: '<?php echo site_url('admin/loadContents/sales/freshLoad') ?>',
    type: 'post',
    dataType: 'json',
    cache: false
  })
  .done(function(response) {
  
    //load nav menu
    $('#nav_items_holder').html(response.navMenu);
    $('#nav_menu_loading_holder').slideUp('slow');
    $('#nav_items_holder').slideDown('slow');

  })
  .fail(function(err) {

  });
}
</script>