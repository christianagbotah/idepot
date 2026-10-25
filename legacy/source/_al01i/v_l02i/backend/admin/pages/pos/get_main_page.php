<?php
  
// Batch load settings
$settings = $this->db->where_in('type', array('opening_day', 'so_prefix', 'so_no', 'currency'))->get('settings')->result_array();
$settings_map = array_column($settings, 'description', 'type');

$opening_day = $settings_map['opening_day'] ?? 'monday';
$so_no_prefix = $settings_map['so_prefix'] ?? '';
$so_no = $settings_map['so_no'] ?? '1';
$currency = $settings_map['currency'] ?? '';

$from = date('d-m-Y', strtotime('this week ' . $opening_day));
$to = date('d-m-Y');

$no_customers = $this->db->get('customers')->num_rows();

// Batch load sales and income data
$sales_row = $this->db
	->select_sum('credit_amount')
	->where('journal', 'Sales')
	->where('account_name', 'General Sales')
	->get('general_journal')->row();
$total_sales = $sales_row->credit_amount ?? 0;

$this->db->select('payment_type, SUM(amount) as total');
$this->db->where_in('payment_type', array('Income', 'Receivable'));
$this->db->group_by('payment_type');
$payment_totals = $this->db->get('payment')->result_array();

$total_income = 0;
foreach ($payment_totals as $pt) {
    $total_income += $pt['total'] ?? 0;
}

// Optimize receivables calculation - single query instead of loop
$receivable_row = $this->db
	->select_sum('amount_due')
	->where('amount_due >', 0)
	->get('invoice')->row();
$grand_total = $receivable_row->amount_due ?? 0;

// Add suppliers overpayment (negative amounts)
$suppliers_row = $this->db
	->select_sum('amount_due')
	->where('amount_due <', 0)
	->get('accounts_payable')->row();
$grand_total += abs($suppliers_row->amount_due ?? 0);

// Purchases
$no_suppliers = $this->db->get('suppliers')->num_rows();

$purchases_row = $this->db
	->select_sum('debit_amount')
	->where('journal', 'Purchases')
	->where('account_name', 'General Products Purchased')
	->get('general_journal')->row();
$total_purchases = $purchases_row->debit_amount ?? 0;

// Batch load expenditure
$this->db->select('payment_type, SUM(amount) as total');
$this->db->where_in('payment_type', array('Payable', 'Expense'));
$this->db->group_by('payment_type');
$expenditure_totals = $this->db->get('payment')->result_array();

$total_expenditure = 0;
foreach ($expenditure_totals as $et) {
    $total_expenditure += $et['total'] ?? 0;
}

// Optimize payables calculation
$customers_p_row = $this->db
	->select_sum('amount_due')
	->where('amount_due <', 0)
	->get('invoice')->row();
$grand_total_p = abs($customers_p_row->amount_due ?? 0);

$suppliers_p_row = $this->db
	->select_sum('amount_due')
	->where('amount_due >', 0)
	->get('accounts_payable')->row();
$grand_total_p += $suppliers_p_row->amount_due ?? 0;

$debts_row = $this->db
	->select_sum('amount_due')
	->where('amount_due >', 0)
	->get('outstanding_debts')->row();
$grand_total_p += $debts_row->amount_due ?? 0;

// Optimize goods payable calculation
$this->db->select('SUM(price * quantity_due) as total_payable');
$this->db->where('quantity_due >', 0);
$goods_payable_row = $this->db->get('sales_order')->row();
$grand_total_p += $goods_payable_row->total_payable ?? 0;

$payable_counter = 0;

// SO ID generation (settings already loaded)
$id_length = strlen($so_no_prefix . $so_no);

$this->db->select('so_code');
//$this->db->where('so_code !=', 'Opening Balance');
$this->db->like('so_code', $so_no_prefix, 'after');
$this->db->not_like('so_code', 'R', 'before');
$this->db->order_by('so_code', 'desc');
$this->db->limit(1);
$so_query = $this->db->get('sales_order');
$so_id = $so_query->row()->so_code;

if ($so_query->num_rows() < 1) {
	//let's search from the general journal table instead
	$this->db->select('so_code');
	$this->db->like('so_code', $so_no_prefix, 'after');
	$this->db->not_like('so_code', 'R', 'before');
	$this->db->order_by('so_code', 'desc');
	$this->db->limit(1);
	$so_query = $this->db->get('general_journal');
	$so_id = $so_query->row()->so_code;
}

if ($so_query->row()->so_code != '' || $so_query->row()->so_code != null) {
	if ($so_query->num_rows() > 0) {
		//extract the numeric out and increase it by 1
		$second_num = ''; //the second occurence of a number in the string ....
		$position_of_second_num = ''; //the position of the second number

		$i = 0;
		$numeric_counter = 0;
		$pos_counter = 0;
		for ($i = 0; $i < strlen($so_id); $i++) {
			if (is_numeric($so_id[$i])) {

				$numeric_counter++;

				if ($numeric_counter == 2) {
//get the 2nd time a number is found
					$second_num = $so_id[$i];
					break;
				}
			}

			$pos_counter++;
		}

		//find the position
		$position_of_second_num = $pos_counter; //strpos($so_id, $second_num);

		//now let's do the extraction
		$n_soid = substr($so_id, $position_of_second_num, strlen($so_id) - $i);

		$so_code = $n_soid + 1;

		if ($second_num == 0) {
			$old_len = strlen($so_id);
			$new_len = strlen($so_code);
			$act_len = ($old_len - $new_len);
			$so_code = substr($so_id, 0, $act_len) . $so_code;
		} else {
			$so_code = $so_code;
		}

	} else {
		$so_code = $so_no_prefix . $so_no;
	}
} else {
	$so_code = $so_no_prefix . $so_no;
}

?>
<div class="col-md-8 col-sm-12 col-xs-12" style="max-height: 100vh;">
            <center>
              <div class="container-fluid">

              <?php
echo form_open(site_url('admin/sales_order_pos/create'),
	array('class' => 'form-groups-bordered h-screen max-h-screen overflow-auto', 'style' => 'padding-bottom: 96px !important', 'id' => 'sales_order_form_pos', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-md-3 col-sm-6 col-xs-12">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success pb- text-light" style="height: 45px; font-size: 14px !important;">SO No:</div>
                        </div>
                    <input type="text" style="height: 45px; font-size: 14px !important;" required="true" onkeyup="verify_so_no_pos()" class="form-control" name="order_no_pos" id="order_no_pos" minlength="<?php echo $id_length; ?>" maxlength="<?php echo $id_length; ?>" value="<?php if ($second_num == 0) {echo $so_code;} else {echo $so_no_prefix . $so_code;}?>">
                    </div>
                    <div style="position: absolute;" id="so_code_err_message_pos"></div>
                </div>

              <div class="input-group col-md-6 col-sm-6 col-xs-12">
                <div class="input-group-prepend">
                    <span class="input-group-text" id="basic-addon1_pos"><i class="fa fa-search"></i></span>
                </div>

                       <select class="form-control select2" onchange="populate_edit_button_pos($('#order_to_pos').val())" name="order_to_pos" id="order_to_pos"></select>
                  <div class="input-group-append ml-2">
                      <button class="btn btn-primary" type="button" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer_pos/'); ?>', 'Add new customer')"> <?php echo 'Add' ?> <i class="fa fa-fw fa-plus"></i></button>

                      &nbsp; <!--<button class="btn btn-danger" type="button" onclick="showAjaxModal_settings('<?php //echo site_url('modal/popup_sales/customers_list/'); ?>', 'View Customers')"> <?php //echo 'Edit' ?> <i class="fa fa-fw fa-pencil"></i></button>-->
                  </div>
              </div>


              <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light" style="height: 45px; font-size: 14px !important;">Order Date:</div>
                        </div>
                        <input type="text" style="height: 45px; font-size: 14px !important;" required="true" class="form-control datepicker" name="order_date_pos" id="order_date_pos" data-format="dd-mm-yyyy"
                            value="<?php echo date('d-m-Y'); ?>">

                        <input type="hidden" class="form-control datepicker" name="order_date_pos2"
                            value="<?php echo date('d-m-Y H:i:s'); ?>">
                    </div>
                </div>
            </div>

                <hr><hr>

                <!--PRODUCT SELECTION AND ORDERING SECTION-->
                <div class="col-sm-12 col-md-12">
                  <center><strong id="selection_error" class="bg-danger p-3 text-light" style="display:none;">This Item has been added already!</strong></center>
                    <div class="form-group row">
                        <table class="table table-striped table-hover table-success" width="100%" id="s_order_create_table_pos">
                            <thead>
                              <tr>
                                <th>Qty</th>
                                <th>Qty Picked</th>
                                <th>Item</th>
                                <!--<th>Description</th>-->
                                <th>Unit Price</th>
                                <!--<th>Tax</th>-->
                                <th>Total Amount</th>
                                <th>Delete</th>
                              </tr>
                            </thead>
                            <tbody>

                            </tbody>

                        </table>
                    </div>
                </div>

                <hr><hr>
                <!--CALCULATIONS HERE-->
                <div class="col-md-12 col-sm-12">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <table width="100%">
                              <thead>
                                  <tr>
                                      <th class="text-muted">Subtotal:</th>
                                      <th style="text-align: left;" class="text-muted" width="150">                                      
                                        <div class="flex">
                                          <span class="inline-flex items-center px-3 text-lg bg-gray-200 border rounded-e-0 border-gray-300 border-e-0 rounded-s-md dark:bg-gray-600 dark:border-gray-600">
                                          <?=$currency;?>
                                          </span>
                                          <div id="subtotal_pos" class="rounded-none rounded-e-lg bg-gray-200 border focus:ring-blue-500 focus:border-blue-500 block flex-1 min-w-0 w-24 max-w-24 text-lg border-gray-300 p-2.5  dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">0.00</div>
                                        </div>
                                      </th>
                                  </tr>


                                  <tr>
                                      <th class="text-muted">Discount:</th>
                                      <th style="text-align: left;" class="text-muted row" width="150">
                                        <div class="flex mt-3 ml-4">
                                          <span class="inline-flex items-center px-3 text-lg bg-gray-200 border rounded-e-0 border-gray-300 border-e-0 rounded-s-md dark:bg-gray-600 dark:border-gray-600">
                                          <?=$currency;?>
                                          </span>
                                          
                                            <input type="text" id="discount_pos" onkeyup="grand_total_pos()" onchange="grand_total_pos()" min="0" name="discount_pos" class="rounded-none rounded-e-lg bg-gray-50 border focus:ring-blue-500 focus:border-blue-500 block flex-1 min-w-0 w-24 max-w-24 text-lg border-gray-300 p-2.5  dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" placeholder="0.00">
                                          
                                        </div>
                                      </th>
                                  </tr>

                                  <tr>
                                      <th>Total:</th>
                                      <th style="text-align: left;" width="150">
                                        <div class="flex mt-3">
                                          <span class="inline-flex items-center px-3 text-lg text-gray-900 bg-gray-200 border rounded-e-0 border-gray-300 border-e-0 rounded-s-md dark:bg-gray-600 dark:text-gray-400 dark:border-gray-600">
                                          <?=$currency;?>
                                          </span>
                                          <div id="total_pos" class="rounded-none rounded-e-lg bg-gray-200 border text-gray-900 focus:ring-blue-500 focus:border-blue-500 block flex-1 min-w-0 w-24 max-w-24 text-lg border-gray-300 p-2.5  dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">0.00</div>
                                        </div>

                                      </th>
                                  </tr>
                                  <input type="hidden" name="hidden_total_pos" id="hidden_total_pos" value="">
                                  <input type="hidden" name="hidden_payment_balance_pos" id="hidden_payment_balance_pos" value="">

                                  <input type="hidden" name="hidden_total_quantity_pos" id="hidden_total_quantity_pos" value="">
                                  <input type="hidden" name="hidden_quantity_balance_pos" id="hidden_quantity_balance_pos" value="">

                                  <input type="hidden" name="hidden_account_balance_pos" id="hidden_account_balance_pos" value="">


                              </thead>
                          </table>
                        </div>
                        <div class="col-span-2">
                          <!-- Start of invoice code verification -->
                          <div id="invoice_verification_holder">

                          </div>
                          <br/>

                          <!-- End of invoice code verification -->
                        </div>
                    </div>
                    <div class="col-sm-12 col-md-12">

                        <hr><hr>
                        <div class="form-group row">
                            <div class="col-sm-7 col-md-7">
                                <label class="control-label col-sm-6 col-sm-6"><strong class="text-success">CASH SALES</strong></label>

                                <div class="switch-button  showcase-switch-button">
                                <input id="instant_payment"  type="checkbox"   name="instant_payment" onchange="value_change_pos(this.value)">
                                <label for="instant_payment" ></label>   <strong style="font-size: 22px;" id="yes_no_inst">NO</strong>
                                </div>
                            </div>

                            <div class="col-sm-5 col-md-5 payment_holder">
                              <label class="control-label col-md-6 col-sm-6"><strong>PRINT RECEIPT?</strong></label>

                              <div class="switch-button  showcase-switch-button">
                              <input id="print_receipt_r"  type="checkbox"  value="0" name="print_receipt" onchange="value_change_receipt(this.value)">
                              <label for="print_receipt_r" ></label>   <strong style="font-size: 22px;" id="yes_no_r">NO</strong>
                              </div>
                              <hr><hr>

                              <!--CHOOSE PRINTER TO USE-->
                              <div class="col-sm-12 col-md-12 printers_holder" style="display: none">
                                <label class="control-label col-md-12 col-sm-12"><strong>SELECT PRINTER</strong></label>

                                <div class="col-sm-12 col-md-12">
                                    <div class="form-check-inline">
                                      <label class="form-check-label">
                                        <input type="radio" class="form-check-input" checked value="1" id="thermal" name="printer" required><img src="<?php echo base_url('uploads/printers/thermal-printer.png') ?>" width="50" height="50" class="printers" /> Thermal
                                      </label>
                                    </div>

                                    <div class="form-check-inline" style="text-align: right">
                                        <label class="form-check-label">
                                          <input type="radio" class="form-check-input" value="0" id="normal" name="printer" required><img src="<?php echo base_url('uploads/printers/normal-printer.png') ?>" width="50" height="50" class="printers" /> Normal
                                        </label>
                                    </div>
                                </div>
                              </div>
                          </div>
                        </div>
                        <hr>
                        <div class="form-group row" style="display: none" id="error_holder_pos"></div>

                          

                          <div class="payment_holder">
                             <?php

                            $accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'account_is_bank' => 0))->result_array();
                              ?>
                            <div class="form-group row text-left">
                              <div class="col-lg-6 col-md-6 col-sm-6 flex flex-col">
                                <div class="form-group row">
                                    <div class="input-group">
                                      <div class="input-group-prepend w-fit max-w-fit" style="height: 32px; max-height: 32px;">
                                            <div class="input-group-text bg-success text-white" style="font-size: 16px !important;">Payment Method:</div>
                                      </div>

                                      <div>
                                        <select name="paid_to_pos[]" multiple id="paid_to_pos" disabled onchange="get_account_field($(this).val())" class="form-control select2 w-full max-w-full" required="required" style="height: 45px; font-size: 16px !important;">
                                            <?php foreach ($accounts as $acc): ?>
                                                <option value="<?=$acc['account_id'] ?? 0;?>"><?=$acc['name'] ?? '';?></option>
                                            <?php endforeach;?>
                                        </select>
                                      </div>
                                  </div>
                                </div>
                                <div class="row grid grid-cols-1 gap-4 grid-flow-col mt-5" id="account_method_holder"></div>
                              </div>

                              <div class="input-group col-lg-6 col-md-6 col-sm-6">

                                <div class="payment_holder">
                                    <div class="form-group row">
                                      <div class="col-sm-6 col-md-6 text-left"><strong style="color: #000;">Amount Tendered</strong></div>
                                      <div class="col-sm-6 col-md-6 text-left"><strong style="color: #000;">Amount Paid</strong></div>

                                    </div>

                                    <div class="form-group row">
                                      <div class="col-sm-6 col-md-6">
                                              <input type="currency" onkeyup="change_update()" onchange="change_update()" min="0" name="amount_tendered_pos" id="amount_tendered_pos" class="form-control" value="" required="required" placeholder="0.00" style="height: 80px; font-size: 40px !important;" readonly="readonly">
                                      </div>

                                      <div class="col-sm-6 col-md-6">
                                              <input type="currency" onkeyup="payment_update()" onchange="payment_update()" min="0" name="amount_paid_pos" id="amount_paid_pos" class="form-control" value="" required="required" readonly="readonly" placeholder="0.00" style="height: 80px; font-size: 40px !important;">
                                      </div>
                                    </div>

                                    <div class="form-group row flex items-baseline">
                                      <label class="col-sm-2 col-md-2 form-control-label" style="height: 30px; font-size: 18px !important; color: #85868d; text-align: left;">Change</label>
                                      <div class="col-sm-4 col-md-4">
                                          <input type="text" name="change_due_pos" id="change_due_pos" class="form-control form-control-plaintext p-2" placeholder="0.00" value="" readonly="readonly" style="height: 30px; font-size: 18px !important; color: #85868d;">
                                      </div>


                                      <label class="col-sm-2 col-md-2 col-lg-2 form-control-label" style="height: 30px; font-size: 18px !important; color: #85868d; text-align: left;">Balance</label>
                                      <div class="col-sm-4 col-md-4">
                                          <input type="text" name="balance_amount_pos" id="balance_amount_pos" class="form-control form-control-plaintext p-2" placeholder="0.00" value="" readonly="readonly" style="height: 30px; font-size: 18px !important; color: #85868d;">
                                      </div>
                                    </div>

                                  </div>
                              </div>

                              <input type="hidden" name="account_balance_pos" id="account_balance_pos" class="form-control form-control-plaintext">
                            </div>
                          </div> <!--end of holder-->

                       
                            <div class="form-group row">
                                <div class="col-sm-6 col-md-6 col-xs-6 text-left fixed left-0 bottom-0 w-full max-w-full">
                                    <input type="submit" name="submit" id="submit" class="fixed left-5 text-gray-200 bottom-5 z-20 rounded-xl pb-4 pt-2 pr-3 pl-3  p-6 border-2 border-gray-700 bg-green-600 hover:bg-green-400 hover:text-white hover:ring-0 shadow-lg"
                                        value="Create Order" style="font-size: 18px !important;">
                                </div>

                                <!-- <div class="col-sm-6 col-md-6 text-sm-right pull-right payment_holder">
                                    <a href="javascript:;" class="btn btn-outline-success btn-sm disabled" id="autofill_button" onclick="auto_fill()">Autofill</a>
                                </div> -->
                            </div>
                </form>
              </div>


            </center>

          </div> <!--for transaction display -->

          <div class="container-fluid col-md-4 col-sm-12 col-xs-12 shadow-lg mt-5 md:mt-0" style="height: 82vh; overflow: hidden">

            <div class="p-3 bg-success"><h3 style="color: #fff; text-align: center">SALES INVOICE ITEMS</h3></div>
            <hr>
              <div>
                <input type="search" class="form-control" name="item_search" id="item_search" placeholder="Search Item..." style="height: 35px">
              </div>
              <hr>

            <div class="container pb-3" style="height: 60vh; overflow-y: scroll;">

              <!-- <table class="table container-fluid" width="100%" id="item_list">
                <thead></thead>
                <tbody></tbody>
              </table> -->

              <div class="container-fluid" style="height: fit-content;" id="item_list"></div>

             </div>

          </div> <!--for products display -->

        </div>

</div>

<script src="<?php echo base_url('assets/js/neon-custom.js'); ?>"></script>
<!--number_format-->
<script src="<?php echo base_url('assets/js/number_format.js'); ?>" type="text/javascript"></script>

<!--numeric_format-->
<script src="<?php echo base_url('assets/js/numeric_format.js'); ?>" type="text/javascript"></script>





<script type="text/javascript">
  
  $(function() {

     //global variables
     window.oldIdArray =  [];
     window.paymentMethodsIds = [];
    
    loadPosInvoiceItems(); //load items
    loadAllCustomers(); //load customers

    getInvoiceCodeSection4Verification(); //load invoice code

    $(".select2").select2({
      theme: "classic"
    });



      //get invoice code section for verification
      function getInvoiceCodeSection4Verification() {

        $('#invoice_verification_holder').html('<p>Loading invoice code... <i class="fa fa-spinner fa-pulse"></i></p>'); //preloader


        let ajaxUrl = '<?php echo site_url('admin/getInvoiceCodeSection4Verification') ?>';

        $.ajax({
          url: ajaxUrl,
          type: 'post',
          dataType: 'html',
          cache: false,
        })
        .done(function(response) {
          //success
          $('#invoice_verification_holder').html(response); //loaded

        })
        .fail(function(err) {
          $('#invoice_verification_holder').html('Unable to load invoice code. Please refresh the page!');
          //error
        })
      }

      $("#item_search").on("change", function() {
        var pvalue = $(this).val();

         loadPosInvoiceItems(pvalue);

      });

      //to filter the items
      $("#item_search").on("keyup", function() {
        var pvalue = $(this).val();

          loadPosInvoiceItems(pvalue); //load items


      });

      value_change_pos();
      update_ables_pos();//this does very important updates such as the payables, receivables account etc

      $('#confirm_selection_unit .modal-content').hover(function() {

          $(this).css({
              background: 'bisque',
          });

      }, function() {

          $(this).css({
              background: '#fff',
          });
      });
  });


  //load invoice items
  function loadPosInvoiceItems(searchValue = '') {

    //$('#item_list tbody').html('<p>Loading items... <i class="fa fa-spinner fa-pulse"></i></p>'); //preloader
    $('#item_list').html('<p>Loading items... <i class="fa fa-spinner fa-pulse"></i></p>'); //preloader

    $.ajax({
      url: '<?php echo site_url('admin/get_all_invoice_items/') ?>',
      type: 'POST',
      dataType: 'html',
      data: {'searchValue':searchValue},
      cache: false,

    })
    .done(function(response) {
      //$('#item_list tbody').html(response);
      $('#item_list').html(response);
    })
    .fail(function(err) {
      //$('#item_list tbody').html('Items not loaded - Reason: ' + err.responseText);
      $('#item_list').html('Items not loaded - Reason: ' + err.responseText);
    })
  }

  function loadAllCustomers() {

    $('#order_to_pos').html('<option value=""><i class="fa fa-spinner fa-pulse"></i> Loading customers...</option>'); //preloader

    $.ajax({
      url: '<?php echo site_url('admin/get_customers/') ?>',
      type: 'POST',
      dataType: 'html',
      cache: false,

    })
    .done(function(response) {
      $('#order_to_pos').html(response);
    })
    .fail(function(err) {
     return;
    })
  }

  //update change due when amount tendered is changed
  function change_update() {
      /* Act on the event */
      let amount_tendered_pos = Number($('#amount_tendered_pos').val());
      let amount_paid_pos = Number($('#amount_paid_pos').val());


      $('#change_due_pos').val(number_format((amount_tendered_pos - amount_paid_pos), 2, '.', ','));
  }

  //update amount left to be paid when user enters the amount paid in all
	function payment_update() {
	    /* Act on the event */
	    //amount balancing
	    let total_amount_pos = Number($('#hidden_total_pos').val());
	    let amount_tendered_pos = Number($('#amount_tendered_pos').val());
	    let amount_paid_pos = Number($('#amount_paid_pos').val());
	    let amount_left = total_amount_pos - amount_paid_pos;
	    $('#amount_pd').html(number_format(amount_paid_pos, 2, '.', ','));

	    //qunatity balancing
	    let total_quantity_pos = Number($('#hidden_total_quantity_pos').val());
	    /*let quantity_picked = Number($('#quantity_picked_pos').val());
	    let quantity_left = total_quantity_pos - quantity_picked;*/

	    //amount fields
	    //populate the hidden payment balance field with this
	    //$('#hidden_payment_balance_pos').val(amount_left);
	    ///Now let's format the balance field with this
	    $('#balance_amount_pos').val(number_format(amount_left, 2, '.', ','));
	    $('#change_due_pos').val(number_format((amount_tendered_pos - amount_paid_pos), 2, '.', ','));

	    //qunatity fields
	    //populate the hidden quantity balance field with this
	    //$('#hidden_quantity_balance_pos').val(quantity_left);
	    ///Now let's format the balance field with this
	    //$('#balance_quantity_pos').val(number_format(quantity_left, 0, '.', ','));
	}

  function value_change_pos(val) {
       let instant_payment = $('#instant_payment').filter(':checked').length;

       if(instant_payment > 0) {
            $('#instant_payment').val(1);
            $('#instant_payment').attr('checked', 'checked');
            $('#yes_no_inst').text('YES');
            $('#yes_no_inst').css('color', '#000000');
            $('.payment_holder').slideDown('slow');
            $('#paid_to_pos').attr('required', 'required');
            $('#amount_paid_pos').attr('required', 'required');
            $('#amount_tendered_pos').attr('required', 'required');

       } else {
            $('#instant_payment').val(0);
            $('#instant_payment').removeAttr('checked');
            $('#yes_no_inst').text('NO');
            $('#yes_no_inst').css('color', '#b3afaf');

            //reset some values
            let t_hidden = Number($('#hidden_total_pos').val());
            $('#amount_tendered_pos').val('');
            $('#amount_tendered_pos').attr('placeholder', '0.00');

            $('#amount_paid_pos').val(0);
            $('#amount_paid_pos').attr('placeholder', '0.00');

            change_update();

            $('#balance_amount_pos').val(number_format(t_hidden, 2, '.', ','));
            $('#hidden_payment_balance_pos').val(t_hidden);
            $('#account_balance_pos').val(0);
            $('#hidden_account_balance_pos').val(0);

            //clear all selected options in the payment method selection field
            $('#sales_order_form_pos #paid_to_pos option').prop('selected', false).trigger('change');
            $('#account_method_holder').empty();

            $('#paid_to_pos').val('');
            /*$('#hidden_total_pos').val('');
            $('#hidden_total_quantity_pos').val('');
            $('#subtotal_pos').text('0.00');
            $('#total_pos').text('0.00');*/



            $('.payment_holder').slideUp('slow');
            $('#paid_to_pos').removeAttr('required');
            $('#amount_paid_pos').removeAttr('required');
            $('#amount_tendered_pos').removeAttr('required');
       }
    }


    function update_ables_pos() {
      let index_payable = <?php echo $grand_total_p; ?>;
      let index_receivable = <?php echo $grand_total; ?>;

      //use ajax
      $.ajax({
        url: '<?php echo site_url('admin/update_ables/') ?>' + index_payable + '/' + index_receivable,
        type: 'POST',
        dataType: 'text',

      })
      .done(function() {
        //Don't do anything--- relax and take a cup of coffee--
        //console.log("success");
      });
    }



    //ask user to confirm if that is the item he/she really wants to sell
    function confirm_selection(item_id) {

      $('#confirm_selection_unit').addClass('backdrop');
      $('#confirm_selection_unit .modal-content').css({
          boxShadow: '4px 8px 10px 10px rgba(0, 0, 0, 0.5), 4px 8px 25px 10px rgba(0, 0, 0, 0.3)',
          borderRadius: '20px'
      });


      $('#hidden_item_id').val(item_id);

      //be sure user selected customer before trying to add row
        let selected_customer = $('#order_to_pos').val();
        if(selected_customer == '') {
            //no customer selected, flag error message
            showAjaxModal_confirm('No Customer Was Selected! Select One and Try Again.', 'Error');
            return false;
        }//end


        //trying to make sure that a selected item does not appear in the next row
        let selected_item_ids = [];
        let i = 1;
        $.each($('tr td select'), function(index, val) {

             // iterate through array or object
                selected_item_ids.push($('#tr_pos_'+ i +' td select').val());
            i++;
        });

        //we need to check if an item is already added so we prevent it from being added again
        for(t = 0; t < selected_item_ids.length; t++) {
          if(selected_item_ids[t] == item_id) {

            $('#selection_error').slideDown('slow');

            setTimeout(() => {
              // Todo...
              $('#selection_error').slideUp('slow');
            }, 4000);

            //increase the quantity by one
            $('#plus_btn_'+ item_id).click();
            return false;
          }
        }//end

      //the ajax brain
      $.ajax({
        url: '<?php echo site_url('admin/confirm_item_selection/') ?>' + item_id,
        type: 'POST',
        dataType: 'json',

      })
      .done(function(response) {
        //result is ready===add the data first
        if(response.isSoldInUnit) {

          $('input[name="package_or_unit"]').prop('checked', false);

          $('#confirm_selection_unit .modal-body #item_package_name').html(response.package_name);
          $('#confirm_selection_unit .modal-body #main-content').html(response.data);

          //show modal now
          $('#confirm_selection_unit').modal('show', {backdrop: 'static'});

        } else {
          $('#confirm_selection .modal-body').html(response.data);
          $('#yes_btn').attr('onclick', 'add_new_row_pos('+item_id+')');

          //show modal now
          $('#confirm_selection').modal('show', {backdrop: 'static'});
        }

      })
      .fail(function(err) {
        showAjaxModal_confirm('Failed to load item: ' + err.responseText, 'Error');
        //alert();
      });

    }

    /*function value_change_pos(val) {
       let instant_payment = $('#instant_payment').filter(':checked').length;

       if(instant_payment > 0) {
            $('#instant_payment').val(1);
            $('#instant_payment').attr('checked', 'checked');
            $('#yes_no_inst').text('YES');
            $('#yes_no_inst').css('color', '#000000');
            $('.payment_holder').slideDown('slow');
            $('#paid_to_pos').attr('required', 'required');
            $('#amount_paid_pos').attr('required', 'required');
            $('#amount_tendered_pos').attr('required', 'required');
       } else {
            $('#instant_payment').val(0);
            $('#yes_no_inst').text('NO');
            $('#yes_no_inst').css('color', '#b3afaf');

            //reset some values
            let t_hidden = Number($('#hidden_total_pos').val());

            $('#amount_tendered_pos').val('');
            $('#amount_tendered_pos').attr('placeholder', '0.00');

            $('#amount_paid_pos').val('');
            $('#amount_paid_pos').attr('placeholder', '0.00');

            change_update();

            $('#balance_amount_pos').val(number_format(t_hidden, 2, '.', ','));
            $('#hidden_payment_balance_pos').val(t_hidden);
            $('#account_balance_pos').val('');
            $('#hidden_account_balance_pos').val('');
            $('#paid_to_pos').val('');

            $('.payment_holder').slideUp('slow');
            $('#paid_to_pos').removeAttr('required');
            $('#amount_paid_pos').removeAttr('required');
            $('#amount_tendered_pos').removeAttr('required');
       }
    }*/

    function value_change_receipt(val) {
       let print_receipt_r = $('#print_receipt_r').filter(':checked').length;
       if(print_receipt_r > 0) {
            $('#print_receipt_r').val(1);
            $('#yes_no_r').text('YES');
            $('.printers_holder').slideDown('slow');
            $('#yes_no_r').css('color', '#000000');
       } else {
            $('#print_receipt_r').val(0);
            $('#yes_no_r').text('NO');
            $('.printers_holder').slideUp('slow');
            $('#yes_no_r').css('color', '#b3afaf');
       }
    }

    $('#order_date_pos').change(function(event) {

        //clear all table rows and inputs if Customer is changed
        $('#s_order_create_table_pos tbody tr').css('display', 'none');
        $('#s_order_create_table_pos tbody tr').slideUp('slow');
        $('#s_order_create_table_pos tbody tr').remove();
    });

    ////live update ship to info
    $('#bill_to').keyup(function(event) {

        let bill_to = $('#bill_to').val();
        $('#ship_to').val(bill_to);
    });

   
    function get_account_field(idArray) {

      oldIdArray = paymentMethodsIds;   

        if(idArray != '') {
          paymentMethodsIds = idArray;

            $.ajax({
              url: '<?= site_url('admin/get_account_field/') ?>',
              type: 'post',
              data: {'idArray[]': idArray, 'oldIdArray[]': oldIdArray},
              dataType: 'html',
              cache: false
            })
            .done(function(response) {
              $('#account_method_holder').html(response);

              update_amount_paid();
            })
            .fail(function(err) {

            })
        } else {

          update_amount_paid(0);

          $('#account_method_holder').html('<div class="flex items-center p-4 mb-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:border-red-800" role="alert"><svg class="flex-shrink-0 inline w-4 h-4 me-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/></svg><span class="sr-only">Info</span><div class="font-bold text-xl"><span>Error:</span> No account found!</div></div>');
            
        }

        //disable the autofill button when user select more than 1 payment method
        if(idArray.length > 1) {
          $('#autofill_button').addClass('disabled');

        } else {
          $('#autofill_button').removeClass('disabled');
        }
    }

    //add row to table at a button click
    function add_new_row_pos(item_id, item_unit_id = '') {


        //be sure user selected customer before trying to add row
        let selected_customer = $('#order_to_pos').val();
        let url = '';
        if(selected_customer == '') {
            //no customer selected, flag error message
            showAjaxModal_confirm('No Customer Was Selected! Select One and Try Again.', 'Error');
            return false;
        }


        let tbody = $('#s_order_create_table_pos tbody').find('tr').length + 1;

        let order_date_pos = $('#order_date_pos').val();


        //trying to make sure that a selected item does not appear in the next row
        let selected_item_ids = [];
        let i = 1;
        $.each($('tr td select'), function(index, val) {

             // iterate through array or object
                selected_item_ids.push($('#tr_pos_'+ i +' td select').val());
            i++;
        });

        //we need to check if an item is already added so we prevent it from being added again
        for(t = 0; t < selected_item_ids.length; t++) {
          if(selected_item_ids[t] == item_id) {

            $('#selection_error').slideDown('slow');

            setTimeout(() => {
              // Todo...
              $('#selection_error').slideUp('slow');
            }, 4000);

            //increase the quantity by one
            $('#plus_btn_'+ item_id).click();
            return false;
          }
        }

        selected_item_ids = selected_item_ids.join('-');


        if(item_unit_id != '') {

          if(selected_item_ids.length == 0) {
            selected_item_ids = ['0'];
          }

          //we are selling item in units
          url = '<?php echo site_url('admin/add_order_row_pos_unit/so/0/0/') ?>' + selected_customer + '/' + order_date_pos + '/' + item_id + '/' + selected_item_ids + '/' + item_unit_id;

          $('#item_unit option:first').prop('selected', true).trigger('change');

        } else {
          url = '<?php echo site_url('admin/add_order_row_pos/so/0/0/') ?>' + selected_customer + '/' + order_date_pos + '/' + item_id + '/' + selected_item_ids;
        }


        $.ajax({
            url: url,
            type: 'POST',
            dataType: 'html',
            cache: false
        })
        .done(function(data) {

            let tr = '<tr id="tr_pos_'+ tbody +'">'+data+'<td width="60" style="vertical-align: middle"><a href="javascript:;" onclick="remove_row('+tbody+')" class="btn btn-danger btn-sm" style="z-index: 9999; height: 30px;"><i class="fa fa-fw fa-trash"></i></a></td></tr>';

            //add row now
            $('#s_order_create_table_pos tbody').append(tr);

            //disable the previous delete button
            $('#tr_pos_' + (Number(tbody) - 1) + ' td a').attr('disabled', 'disabled');
         });
    }

    //populate the edit button with the selected supplier
    function populate_edit_button_pos(id) {

        //we need to check if this customer is at the same time a creditor with goods or negative bal
        $.ajax({
            url: '<?php echo site_url('admin/is_creditor/') ?>' + id,
            type: 'POST',
            dataType: 'json',
           // data: {param1: 'value1'},
        })
        .done(function(data) {
           // alert(data.goods);
            if(data.goods_negative == true) {
              $('#creditor_detection a').text('GOODS');
              $('#creditor_detection button').hide();
                confirm_order('goods_negative', id, 'You owe this customer both cash balances and goods. If you want to issue the goods then click on the "GOODS" button. For cash payment, kindly go to the "Purchases" tab, choose "Payment" and select this customer and then choose the appropriate option. (Inform your administrator).', data.so_code, 'pos');

            } else if(data.goods == true) {
              $('#creditor_detection a').text('YES');
              $('#creditor_detection button').show();
                confirm_order('goods', id, 'This customer has some goods with you which you have not supplied yet. Do you want to supply those goods instead of creating a new Sales Order for this customer?',  data.so_code, 'pos');

            } else if(data.negative == true) {
                $('#creditor_detection a').text('YES');
                $('#creditor_detection button').show();
                confirm_order('negative', id, 'You owe this customer some cash balance. Do you want to supply this customer with goods to set off your debt instead of creating a new Sales Order for this customer?');

            }
        });

        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_sales/edit_customer/"); ?>' + id + '", "Edit Customer")');

        //clear all table rows and inputs if Customer is changed
        $('#s_order_create_table_pos tbody tr').css('display', 'none');
        $('#s_order_create_table_pos tbody tr').slideUp('slow');
        $('#s_order_create_table_pos tbody tr').remove();
        remove_this_row_pos(id);

        //amounts
        let row_total_pos_cost = Number($('#tr_pos_' + id + ' td .sum_total_pos_amount').val());

        if(!isNaN(row_total_pos_cost)) {
            let grand_total_pos = Number($('#hidden_total_pos').val());
            let balance = grand_total_pos - row_total_pos_cost;

            //quantities
            let row_total_quantity_pos = Number($('#tr_pos_' + id + ' td .sum_total_quantity_pos').val());
            let grand_total_quantity_pos = Number($('#hidden_total_quantity_pos').val());
            let balance_quantity_pos = grand_total_quantity_pos - row_total_quantity_pos;


            $('#hidden_total_pos').val(balance);
            $('#subtotal_pos').html(number_format(balance, 2, '.', ','));
            $('#total_pos').html(number_format(balance, 2, '.', ','));
            $('#amount_paid_pos').val('0.00');
            $('#balance_amount_pos').val(number_format(balance, 2, '.', ','));


            $('#hidden_total_quantity_pos').val(balance_quantity_pos);
            //$('#quantity_picked_pos').val(0);
            $('#balance_quantity_pos').val(balance_quantity_pos);

            $('#s_order_create_table_pos tbody tr').css('display', 'none');
            $('#s_order_create_table_pos tbody tr').slideUp('slow');
            $('#s_order_create_table_pos tbody tr').remove();
        }

        //let's auto fill the bill to and ship to addresses with the customer's address
        if(id != '') {
            $.ajax({
            url: '<?php echo site_url('admin/get_customer_address/') ?>' + id,
            type: 'POST',
            dataType: 'text'
            })
            .done(function(response) {
                if(response != '') {
                    $('#bill_to').val(response);
                    $('#ship_to').val(response);
                }
            });
        }  else {
                    $('#bill_to').val('');
                    $('#ship_to').val('');
                }

    }

    //Verify po no
    function verify_so_no_pos() {
        //verify id
        var so_no = $('#order_no_pos').val();
        $.ajax({
            url: '<?php echo site_url('admin/get_generated_so_no/'); ?>' + so_no
        })
        .done(function(response) {
                $('#so_code_err_message_pos').html(response);

        });
    }


    //use this to reset the page
    function pageReset() {

      $('#instant_payment').val(0);
      $('#instant_payment').removeAttr('checked');
      $('#yes_no_inst').text('NO');
      $('#yes_no_inst').css('color', '#b3afaf');

      //reset some values
      let t_hidden = Number($('#hidden_total_pos').val());
      $('#amount_tendered_pos').val('');
      $('#amount_tendered_pos').attr('placeholder', '0.00');

      $('#amount_paid_pos').val('');
      $('#amount_paid_pos').attr('placeholder', '0.00');

      change_update();

      $('#balance_amount_pos').val(number_format(t_hidden, 2, '.', ','));
      $('#hidden_payment_balance_pos').val(t_hidden);
      $('#account_balance_pos').val('');
      $('#hidden_account_balance_pos').val('');
      $('#paid_to_pos').val('');
      $('#hidden_total_pos').val('');
      $('#hidden_total_quantity_pos').val('');
      $('#subtotal_pos').text('0.00');
      $('#total_pos').text('0.00');



      $('.payment_holder').slideUp('slow');
      $('#paid_to_pos').removeAttr('required');
      $('#paid_to_pos').attr('disabled', 'disabled');
      $('#amount_paid_pos').removeAttr('required');
      $('#amount_tendered_pos').removeAttr('required');

      //printer selection side
      $('#print_receipt_r').val(0);
      $('#print_receipt_r').removeAttr('checked');
      $('#yes_no_r').text('NO');
      $('.printers_holder').slideUp('slow');
      $('#yes_no_r').css('color', '#b3afaf');
    }



    //Sales Order Creation form submitted
  $('#sales_order_form_pos').submit(function(event) {
    // Act on the event
    event.preventDefault();

    showAjaxModal_confirm('<center>Please wait...<i class="fa fa-spinner fa-pulse"></i><br/>Transaction is being processed.</center>', 'Loading');

    //scroll to top after submit button is clicked
    $('html, body').animate({
      scrollTop: ($('#top_top').offset().top),
    }, 1000);

    ///

    verify_inv_no_pos(function(result) {

      if(!result) {
        showAjaxModal_confirm('INVOICE CODE IS INVALID', 'Error');
        return;
      }


      let a_paid = Number($('#amount_paid_pos').val());
      let ac_paid_to_pos = $('#paid_to_pos').val();

      if(a_paid > 0 && ac_paid_to_pos == '') {
          //reject submission
          showAjaxModal_confirm('No Deposit Account Is Selected. Select A Deposit Account!', 'Error');
          return false;

      }

      let no_tr = $('#s_order_create_table_pos tbody').find('tr').length;
      let input_ids_numeric = []; //array to hold the numeric parts of the ids
      let paymentMethodsIdsNew = [];
      

      for(i = 1; i <= no_tr; i++) {

          let each_id_numeric =  $('#tr_pos_' + i + ' input[type="number"]').attr('id').replace(/[^\d]+/, '');
          input_ids_numeric.push(each_id_numeric); //push the numbers into this array
      }

      //replace the , with -
      input_ids_numeric = input_ids_numeric.join('-')
      paymentMethodsIdsNew = paymentMethodsIds.join('-');
      let form_data = $('#sales_order_form_pos').serialize();

      //send data via ajax
      $.ajax({
        url: '<?php echo site_url('admin/sales_order_pos/create/') ?>' + input_ids_numeric + '/' + paymentMethodsIdsNew,
        type: 'POST',
        dataType: 'json',
        data: form_data,
        cache: false
      })
      .done(function(data) {

        if(data.success == true) {

          if(data.no_payment == true) { //no payment was made during this transaction
            //$('#main_holder').html('<center><div style="position: absolute; top: 38vh; left: 46vw;"><h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your page</h4></div></center>');

          // getMainPage();

            showAjaxModal_confirm('Credit Sales Order Created Successfully.', 'Success');

            setTimeout(() => {

              //reset form
              updateCodes();
              $('#sales_order_form_pos')[0].reset();
              $('#sales_order_form_pos #order_to_pos option:first-child').prop('selected', true).trigger('change');

              //clear all selected options in the payment method selection field
              $('#sales_order_form_pos #paid_to_pos option').prop('selected', false).trigger('change');
              $('#account_method_holder').empty();

              paymentMethodsIds = [];
              input_ids_numeric = [];
              paymentMethodsIdsNew = [];
              
              pageReset();

              loadPosInvoiceItems();
              getInvoiceCodeSection4Verification();//load new invoice code


              $('.close').click(); //window.location.reload();
            }, 3000);

          } else {// payment was made during this transaction

            if(data.print_receipt == 1) {
              showAjaxModal_confirm('Transaction Done Successfully! <br><br><em>Please wait while we redirect you to the receipt page for printing...</em>', 'Loading');

              //reset form
              updateCodes();
              $('#sales_order_form_pos')[0].reset();
              $('#sales_order_form_pos #order_to_pos option:first-child').prop('selected', true).trigger('change');

              //clear all selected options in the payment method selection field
              $('#sales_order_form_pos #paid_to_pos option').prop('selected', false).trigger('change');
              $('#account_method_holder').empty();

              paymentMethodsIds = [];
              input_ids_numeric = [];
              paymentMethodsIdsNew = [];

              pageReset();

              loadPosInvoiceItems();
              getInvoiceCodeSection4Verification();//load new invoice code

              setTimeout(() => {
                $('.close').click();

                //loading receipt page
                $.ajax({
                  url: '<?php echo site_url('admin/receipt/') ?>' + data.receipt_code + '/' + data.customer_id + '/' + data.date_time + '/' + data.printer + '/pos',
                  type: 'POST',
                  dataType: 'html',

                })
                .done(function(response) {

                  showAjaxModal_receipt('<?php echo site_url('modal/popup_sales/receipt_modal/'); ?>', response, 'Print Receipt');
                 // $('#receipt_holder').html(response);
                });

              }, 4000);

            } else {

              //$('#main_holder').html('<center><div style="position: absolute; top: 38vh; left: 46vw;"><h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your page</h4></div></center>');

           // getMainPage();

              showAjaxModal_confirm('Transaction Done Successfully!', 'Success');


              //reset form
              updateCodes();
              $('#sales_order_form_pos')[0].reset();
              $('#sales_order_form_pos #order_to_pos option:first-child').prop('selected', true).trigger('change');

              //clear all selected options in the payment method selection field
              $('#sales_order_form_pos #paid_to_pos option').prop('selected', false).trigger('change');
              $('#account_method_holder').empty();

              paymentMethodsIds = [];
              input_ids_numeric = [];
              paymentMethodsIdsNew = [];

              pageReset();

              loadPosInvoiceItems();
              getInvoiceCodeSection4Verification();//load new invoice code

              setTimeout(() => {

                $('.close').click();
                ;//window.location.reload();
              }, 2000);
            }
          }


        } else if(data.success == 'duplicate') {
          showAjaxModal_confirm(data.duplicate, 'Error');
        } else {
          $(function(){
            $.each(data, function(index, val) {
            $('#list_err_s_order_create_pos').append('<li>' + val + '</li>');
          }); });

          //$('.close').click();
          showAjaxModal_confirm('<ul id="list_err_s_order_create_pos"></ul>', 'Error');
        }
      })
      .fail(function(err) {
          showAjaxModal_confirm(err.responseText, 'Error');
      });

    });//end of invoice code checking
  });

    //Verify inv no
    function verify_inv_no_pos(callbackFunction) {
        //verify id
        let result = false;
        var invoice_code = $('#invoice_code_pos').val();
        $.ajax({
            url: '<?php echo site_url('admin/get_generated_invoice_code/'); ?>' + invoice_code
        })
        .done(function(response) {
                $('#error_holder_pos').slideDown('slow');
                $('#inv_code_err_message_pos').html(response);

                if($('#inv_code_err_message_pos span').text() == 'VALID INVOICE CODE') {
                  $('#invoiceReasonRow').slideUp('slow'); //hide

                  result = true;
                } else {

                  result = false;
                  //$('#invoiceReasonRow').slideDown('slow');
                }

                callbackFunction(result);
        });
    }


    function remove_this_row_pos(id) {
        //remove row now
        $('#tr_pos_'+id).remove();
    }



          //let the first opened modal still gain focus if an aux modal get closed

            let mod_counter_1 = 0;
            // when any modal is still opened
            $(document).on('shown.bs.modal', function (e) {

              mod_counter_1++;
              $('body').addClass('modal-open');

              $('.modal-open .modal').css({
                'overflow-x' : 'scroll'
              });

            });


            $('#create').on('hidden.bs.modal', function () {

             // $('#main_holder').html('<center><div style="position: absolute; top: 38vh; left: 46vw;"><h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your page</h4></div></center>');

              //getMainPage();//window.location.reload();
            });

            $(document).on('hidden.bs.modal', function () {
              mod_counter_1--;
            });

            $(document).on('hidden.bs.modal', function () {

              if(mod_counter_1 > 0) {
                //there is still an opened modal
                $('body').addClass('modal-open');
              }
            });


            /////////////////////////////////////////////////////////////////////////
          //providing extra shadow when a modal is called on another modal
          ////////////////////////////////////////////////////////////////////////
          //for extra detail or creation modal
          $(document).on('shown.bs.modal', '#create', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#create', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for deleting modal
          $(document).on('shown.bs.modal', '#deletion_modal', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#deletion_modal', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for confirming modal
          $(document).on('shown.bs.modal', '#modal_confirm', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#modal_confirm', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for date selection modal
          $(document).on('shown.bs.modal', '#date_selection', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#date_selection', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for date other deletion modal
          $(document).on('shown.bs.modal', '#deletion', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#deletion', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for date loading modal
          $(document).on('shown.bs.modal', '#loading', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#loading', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for payment modal
          $(document).on('shown.bs.modal', '#payments_sales', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#loading', function () {
            $('#main').removeClass('modal-backdrop');
          });






      function updateCodes() {
        getCodesForNewOrder(function(so_code) {
            $('#order_no_pos').val(so_code);
            //$('#invoice_code_pos').val(invoice_code);
        });
    }

    function getCodesForNewOrder(callback) {
        var po_code = '';

        return $.ajax({
          url: '<?php echo site_url('admin/getCodesForNewOrder') ?>',
          type: 'POST',
          dataType: 'json',
          cache: false
        })
        .done(function(response) {
            callback(response.so_code);
        })
        .fail(function(err) {
            return;
        })
    }

    //get invoice code section for verification
      function getInvoiceCodeSection4Verification() {

        $('#invoice_verification_holder').html('<p>Loading invoice code... <i class="fa fa-spinner fa-pulse"></i></p>'); //preloader


        let ajaxUrl = '<?php echo site_url('admin/getInvoiceCodeSection4Verification') ?>';

        $.ajax({
          url: ajaxUrl,
          type: 'post',
          dataType: 'html',
          cache: false,
        })
        .done(function(response) {
          //success
          $('#invoice_verification_holder').html(response); //loaded

        })
        .fail(function(err) {
          $('#invoice_verification_holder').html('Unable to load invoice code. Please refresh the page!');
          //error
        })
      }



    /*toggle invoice code change reason form*/
    function toggleReasonForm() {

          $('#invoiceReasonRow').toggle('slow');

    }


    //update amount paid from the payment method/account paid to
    function update_amount_paid(amount) {
      let totalAmountReceived = 0;

      for(let i in paymentMethodsIds) {
        let eachAmountReceived = Number($('#method_amount_' + paymentMethodsIds[i]).val());
        totalAmountReceived += eachAmountReceived;
      }

      if(amount == 0) {

        totalAmountReceived = 0;
      }

      $('#amount_paid_pos').val(totalAmountReceived);

      //we update the amount tendered automatically if user didn't enter anything
      $('#amount_tendered_pos').val(totalAmountReceived);
      
      payment_update();
 
    }






                          /////////////////////////////////////
                                          //END//
                          /////////////////////////////////////


      </script>