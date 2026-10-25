<?php
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

//date duration selection
$opening_day =  $this->db->get_where('settings', array('type' => 'opening_day'))->row()->description; 
$from = date('d-m-Y', strtotime('this week '. $opening_day));
$to = date('d-m-Y');

//suppliers
$no_suppliers = $this->db->get('suppliers')->num_rows();

$total_purchases = $this->db
	->select_sum('debit_amount')
  ->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"')
	->where('journal', 'Purchases')
	->where('account_name', 'General Products Purchased')
	->get('general_journal')->row()->debit_amount;

$total_expenditure = $this->db
	->select_sum('amount')
  ->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"')
	->where('payment_type', 'Payable')
	->get('payment')->row()->amount;

$total_expenditure2 = $this->db
	->select_sum('amount')
  ->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"')
	->where('payment_type', 'Expense')
	->get('payment')->row()->amount;
$total_expenditure += $total_expenditure2;

//customers side
$this->db->where('amount_due <', 0);
$this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
$customers_array = $this->db->get('invoice')->result_array();


//suppliers side
$this->db->where('amount_due >', 0);
$this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
$suppliers_array = $this->db->get('accounts_payable')->result_array();

$receivable_counter = 0;
$grand_total_paya = 0;

foreach ($customers_array as $cus):
	$cus['amount_due'] = abs($cus['amount_due']);
	$grand_total_paya += $cus['amount_due'];
endforeach;

foreach ($suppliers_array as $sup):
	$grand_total_paya += $sup['amount_due'];
endforeach;

//for other outanding debts like loan, TNT etc
$this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
$debt_query = $this->db->get_where('outstanding_debts', array('amount_due >' => 0));
if($debt_query->num_rows() > 0) {
    $debt_array = $debt_query->result_array();

    foreach($debt_array as $debt):
      $grand_total_paya += $debt['amount_due'];
      endforeach;
}

//customers who still have some goods with us, yet have paid for all
$this->db->select('customer_id');
$this->db->distinct();
$this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
$this->db->where('quantity_due >', 0);
$customer_id_query = $this->db->get('sales_order');

if ($customer_id_query->num_rows() > 0) {
  $customer_id_array = $customer_id_query->result_array();

  $customer_ids = array();
  $amount_payable = 0;
  $amount_receivable = 0;

  foreach ($customer_id_array as $id) {
    array_push($customer_ids, $id['customer_id']);
  }

}

//for those customers who have not taken all their products
if(is_array($customer_ids) && count($customer_ids) > 0){
  for ($i = 0; $i < count($customer_ids); $i++) {
    $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    $quantity_owe_array = $this->db->get_where('sales_order', array('customer_id' => $customer_ids[$i], 'quantity_due >' => 0))->result_array();

    foreach ($quantity_owe_array as $owe) {

        //let's check for the very latest date in the prices table
        //latest from date
      /*  $t = 1;

        $week_starts_from = date('d-m-Y', strtotime('this week '. $opening_day));
        $week_ends_on = date('d-m-Y');

        
        for($r = 0; $r < 8; $r++) {

          $item_num = 'item'.$t.'_price';

          $this->db->where('customer_id', $customer_ids[$i]);
          $this->db->where($item_num.' !=', 0);
          $this->db->where('from <=', strtotime($from));
          $this->db->where('to >=', strtotime($to));
          $this->db->where('customer_status', 1);
          $item_price = $this->db->get('prices')->row()->$item_num;

          if($item_price == null || $item_price == '') {

            $latest_from = $this->db
                                  ->select_max('from')
                                  ->where($item_num.' !=', 0)
                                  ->where('customer_id', $customer_ids[$i])
                                  ->get('prices')->row()->from;

            if($latest_from == null) {
              $latest_from = strtotime($week_starts_from);
            }


            //latest to date
            $latest_to = $this->db
                                    ->select_max('to')
                                    ->where($item_num.' !=', 0)
                                    ->where('customer_id', $customer_ids[$i])
                                    ->get('prices')->row()->to;

            if($latest_to == null) {
              $latest_to = strtotime($week_ends_on);
            }

            $this->db->where('customer_id', $customer_ids[$i]);
            $this->db->where($item_num.' !=', 0);
            $this->db->where('from <=', $latest_from);
            $this->db->where('to >=', $latest_to);
            $this->db->where('customer_status', 1);
            $item_price = $this->db->get('prices')->row()->$item_num;
          }

          //compare the current item id with the one in the prices table
          //echo substr($item_price, 0, strlen($owe['item_id']));
          if($owe['item_id'] == substr($item_price, 0, strlen($owe['item_id']))) {
            $price = substr($item_price, strlen($owe['item_id']) + 1); //price

            break; //break the for loop here
          } else {
            $t++; //increment $t by 1 and continue the loop
          }
        }
        //incase price is not set for a particular item for this customer
        if($item_price == null) {
          $price = 0;
        }
    */
        $amount_payable += $owe['price'] * $owe['quantity_due'];
        $amount_receivable = $owe['grand_total'] - $owe['amount_paid'];
    }

    //if ($amount_payable > $amount_receivable) {
       $payable_counter++;
        $grand_total_paya += $amount_payable;
        $amount_payable = 0; //reset
    //}

}
}


?>
  
          <!-- Page Heading -->
          <div class="d-sm-flex align-items-center justify-content-between mb-4">
            <h1 class="h3 mb-0 text-gray-800">
                <i class="entypo-right-circled"></i>
                  <?php echo $page_title; ?>
            </h1>
            <a href="#" class="d-none d-sm-inline-block btn btn-sm btn-success shadow-lg rounded-lg p-4 calendar_pop" onclick="showAjaxModal_calendar('<?php echo site_url('modal/popup_calendar/calendar/'); ?>');"><i class="fas fa-calendar fa-sm text-white-50"></i> Calendar</a>
          </div>

          <div class="row">

           <!-- Earnings (Monthly) Card Example -->
            <div class="col-xl-3 col-md-6 mb-4">
              <div class="card border-left-danger shadow h-100 py-2">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-danger text-uppercase mb-1">ACCOUNTS PAYABLE</div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800"><?=numfmt_format_currency($fmt, $grand_total_paya, $currency);?></div>
                      <div class="text-xs font-weight-bold text-primary text-uppercase" style="text-align: right">This Week</div>
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
              <div class="card border-left-danger shadow h-100 py-2">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-danger text-uppercase mb-1">Purchases</div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800"><?=numfmt_format_currency($fmt, $total_purchases, $currency);?></div>
                      <div class="text-xs font-weight-bold text-primary text-uppercase" style="text-align: right">This Week</div>
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
              <div class="card border-left-danger shadow h-100 py-2">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-danger text-uppercase mb-1">Expenses & Payments</div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800"><?=numfmt_format_currency($fmt, $total_expenditure, $currency);?></div>
                      <div class="text-xs font-weight-bold text-primary text-uppercase" style="text-align: right">This Week</div>
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
              <div class="card border-left-danger shadow h-100 py-2">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-danger text-uppercase mb-1">No. Of Suppliers</div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800"><?=$no_suppliers;?></div>
                    </div>
                    <div class="col-auto">
                      <i class="fas fa-fw fa-users fa-2x text-gray-300"></i>
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
                <a href="#collapseCardPurchases1" class="d-block card-header py-3" data-toggle="collapse" role="button" aria-expanded="true" aria-controls="collapseCardPurchases1">
                  <h6 class="m-0 font-weight-bold text-primary">Purchase Orders</h6>
                </a>
                <!-- Card Content - Collapse -->
                <div class="collapse show" id="collapseCardPurchases1">
                  <div class="card-body">

                    <div class="row">
                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_purchase_order/'); ?>', 'Create New Purchase Order')">
                        <div class="card bg-danger text-white shadow">
                          <div class="card-body">
                            Create New Purchase Orders
                            <div class="text-white-50 small">Orders To Suppliers</div>
                          </div>
                        </div>
                        </a>
                      </div>

                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_purchases/purchase_order_list?from='.$from.'&to='.$to); ?>', 'View Purchase Orders')">
                        <div class="card bg-danger text-white shadow">
                          <div class="card-body">
                            View All Purchase Orders
                            <div class="text-white-50 small">View/Edit  Orders</div>
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
                <a href="#collapseCardPurchases2" class="d-block card-header py-3" data-toggle="collapse" role="button" aria-expanded="true" aria-controls="collapseCardPurchases2">
                  <h6 class="m-0 font-weight-bold text-primary">Payments Column</h6>
                </a>
                <!-- Card Content - Collapse -->
                <div class="collapse show" id="collapseCardPurchases2">
                  <div class="card-body">

                    <div class="row">
                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none" onclick="showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/payments/'); ?>', 'Payments and Purchases')">
                        <div class="card bg-danger text-white shadow">
                          <div class="card-body">
                            Enter New Payment
                            <div class="text-white-50 small">Make New Payment</div>
                          </div>
                        </div>
                        </a>
                      </div>

                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_purchases/payments_history/'); ?>', 'View Payments History')">
                        <div class="card bg-danger text-white shadow">
                          <div class="card-body">
                            View All Payments History
                            <div class="text-white-50 small">View/Edit Amount Paid</div>
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
                <a href="#collapseCardPurchases3" class="d-block card-header py-3" data-toggle="collapse" role="button" aria-expanded="true" aria-controls="collapseCardPurchases3">
                  <h6 class="m-0 font-weight-bold text-primary">Suppliers Column</h6>
                </a>
                <!-- Card Content - Collapse -->
                <div class="collapse show" id="collapseCardPurchases3">
                  <div class="card-body">

                    <div class="row">
                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_supplier/'); ?>', 'Add new supplier')">
                        <div class="card bg-danger text-white shadow">
                          <div class="card-body">
                            Create New Supplier
                            <div class="text-white-50 small">Add New Supplier</div>
                          </div>
                        </div>
                        </a>
                      </div>

                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_purchases/suppliers_list/'); ?>', 'View Suppliers')">
                        <div class="card bg-danger text-white shadow">
                          <div class="card-body">
                            View All Suppliers
                            <div class="text-white-50 small">View/Edit Suppliers</div>
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
                  <h6 class="m-0 font-weight-bold text-primary">Purchases Reports</h6>
                </a>
                <!-- Card Content - Collapse -->
                <div class="collapse show" id="collapseCardSales4">
                  <div class="card-body">

                    <div class="row">
                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_purchases/credit_purchases?from='.$from.'&to='.$to); ?>', 'Credit Purchases')">
                          <div class="card bg-danger text-white shadow">
                            <div class="card-body">
                              Credit Purchases
                              <div class="text-white-50 small">View Credit Purchases</div>
                            </div>
                          </div>
                        </a>
                      </div>

                      <div class="col-lg-6 col-md-6 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_accounts_payable_report/'); ?>')">
                        <div class="card bg-danger text-white shadow">
                          <div class="card-body">
                            Accounts Payable
                            <div class="text-white-50 small">View Unpaid Payables</div>
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



          <script type="text/javascript">

$(function($) {
  
  loadNavMenu();    

})

function loadNavMenu() {

  $('#nav_menu_loading_holder').html('<center class="mt-5"><i class="fa fa-spinner fa-pulse fa-3x"></i><br/><p>Loading Sidebar Menu</p></center>'); //pre-loader

  $.ajax({
    url: '<?php echo site_url('admin/loadContents/purchases/freshLoad') ?>',
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