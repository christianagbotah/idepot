<?php
$system_name = $this->db->get_where('settings', array('type' => 'system_name'))->row()->description;

//UPDATING SOME TABLES
//date duration selection
$opening_day =  $this->db->get_where('settings', array('type' => 'opening_day'))->row()->description; 
$from = date('d-m-Y', strtotime('this week '. $opening_day));
$to = date('d-m-Y');


$no_customers = $this->db->get('customers')->num_rows();

$total_sales = $this->db
  ->select_sum('credit_amount')
  ->where('journal', 'Sales')
  //->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"')
  ->where('account_name', 'General Sales')
  ->get('general_journal')->row()->credit_amount;

$total_income = $this->db
  ->select_sum('amount')
  //->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"')
  ->where('payment_type', 'Income')
  ->get('payment')->row()->amount;

$total_income2 = $this->db
  ->select_sum('amount')
  //->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"')
  ->where('payment_type', 'Receivable')
  ->get('payment')->row()->amount;

$total_income += $total_income2;

//customers side
$this->db->where('amount_due >', 0);
//$this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
$customers_array = $this->db->get('invoice')->result_array();


//suppliers side
$this->db->where('amount_due <', 0);
//$this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
$suppliers_array = $this->db->get('accounts_payable')->result_array();

$receivable_counter = 0;
$grand_total = 0;

/*foreach ($customers_array as $cus):
  $grand_total += $cus['amount_due'];
endforeach;*/

//get owings from the sales table
//customers who still have not paid all their debts
$this->db->select('customer_id');
$this->db->distinct();
//$this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
$this->db->where('amount_due >', 0);
$debtor_customer_id_query = $this->db->get('invoice');

if ($debtor_customer_id_query->num_rows() > 0) {
  $debtor_customer_id_array = $debtor_customer_id_query->result_array();

  $debtor_customer_ids = array();


  foreach ($debtor_customer_id_array as $did) {
    array_push($debtor_customer_ids, $did['customer_id']);
  }

}

//for those customers who have not finished payment
for ($di = 0; $di < count($debtor_customer_ids); $di++) {
    //$this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');

    $this->db->select_sum('amount_due');
    $balance_owe = $this->db->get_where('invoice', array('customer_id' => $debtor_customer_ids[$di], 'amount_due >' => 0))->row()->amount_due;

    /*foreach ($balance_owe_array as $bal) {

        //let's check for the very latest date in the prices table
        //latest from date
        $dt = 1;

        $week_starts_from = date('d-m-Y', strtotime('this week '. $opening_day));
        $week_ends_on = date('d-m-Y');

        
        for($dr = 0; $dr < 8; $dr++) {

          $ditem_num = 'item'.$dt.'_price';

          $debtor_latest_from = $this->db
                                ->select_max('from')
                                ->where($ditem_num.' IS NOT NULL')
                                ->where('customer_id', $debtor_customer_ids[$di])
                                ->get('prices')->row()->from;

          if($debtor_latest_from == null) {
            $debtor_latest_from = strtotime($week_starts_from);
          }


          //latest to date
          $debtor_latest_to = $this->db
                                  ->select_max('to')
                                  ->where($ditem_num.' IS NOT NULL')
                                  ->where('customer_id', $debtor_customer_ids[$di])
                                  ->get('prices')->row()->to;

          if($debtor_latest_to == null) {
            $debtor_latest_to = strtotime($week_ends_on);
          }

          $this->db->where('customer_id', $debtor_customer_ids[$di]);
          $this->db->where($ditem_num.' IS NOT NULL');
          $this->db->where('from <=', $debtor_latest_from);
          $this->db->where('to >=', $debtor_latest_to);
          $this->db->where('customer_status', 1);
          $ditem_price = $this->db->get('prices')->row()->$ditem_num;

          //compare the current item id with the one in the prices table
         // echo substr($item_price, 0, strlen($owe['item_id']));
          if($bal['item_id'] == substr($ditem_price, 0, strlen($bal['item_id']))) {
            $dprice = substr($ditem_price, strlen($bal['item_id']) + 1); //price

            break; //break the for loop here
          } else {
            $dt++; //increment $t by 1 and continue the loop
          }
        }
        //incase price is not set for a particular item for this customer
        if($ditem_price == null) {
          $dprice = 0;
        }



        $grand_total += $dprice * $bal['quantity'];
    } //end of customers who are still owing us
    */
    $grand_total += $balance_owe; //$dprice * $bal['quantity'];

} //end of customers

foreach ($suppliers_array as $sup):
  $sup['amount_due'] = abs($sup['amount_due']);
  $grand_total += $sup['amount_due'];
endforeach;

//purchases
$no_suppliers = $this->db->get('suppliers')->num_rows();

$total_purchases = $this->db
  ->select_sum('debit_amount')
  //->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"')
  ->where('journal', 'Purchases')
  ->where('account_name', 'General Products Purchased')
  ->get('general_journal')->row()->debit_amount;

$total_expenditure = $this->db
  ->select_sum('amount')
  //->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"')
  ->where('payment_type', 'Payable')
  ->get('payment')->row()->amount;

$total_expenditure2 = $this->db
  ->select_sum('amount')
  //->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"')
  ->where('payment_type', 'Expense')
  ->get('payment')->row()->amount;
$total_expenditure += $total_expenditure2;

//customers side
$this->db->where('amount_due <', 0);
//$this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
$customers_array_p = $this->db->get('invoice')->result_array();


//suppliers side
$this->db->where('amount_due >', 0);
//$this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
$suppliers_array_p = $this->db->get('accounts_payable')->result_array();

$grand_total_p = 0;

foreach ($customers_array_p as $cus_p):
  $cus_p['amount_due'] = abs($cus_p['amount_due']);
  $grand_total_p += $cus_p['amount_due'];
endforeach;

foreach ($suppliers_array_p as $sup_p):
  $grand_total_p += $sup_p['amount_due'];
endforeach;

//for other outanding debts like loan, TNT etc
$debt_query = $this->db->get_where('outstanding_debts', array('amount_due >' => 0));
if($debt_query->num_rows() > 0) {
    $debt_array = $debt_query->result_array();

    foreach($debt_array as $debt):
      $grand_total_p += $debt['amount_due'];
      endforeach;
}


//customers who still have some goods with us, yet have paid for all
$this->db->select('customer_id');
$this->db->distinct();
//$this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
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
for ($i = 0; $i < count($customer_ids); $i++) {
    //$this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    $quantity_owe_array = $this->db->get_where('sales_order', array('customer_id' => $customer_ids[$i], 'quantity_due >' => 0))->result_array();

    foreach ($quantity_owe_array as $owe) {

        //let's check for the very latest date in the prices table
        //latest from date
      /*  $t = 1;

        $week_starts_from = date('d-m-Y', strtotime('this week '. $opening_day));
        $week_ends_on = date('d-m-Y');

        
        for($r = 0; $r < 8; $r++) {

          $item_num = 'item'.$t.'_price';

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

          //compare the current item id with the one in the prices table
         // echo substr($item_price, 0, strlen($owe['item_id']));
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
        $grand_total_p += $amount_payable;
        $amount_payable = 0; //reset
   // }

}//END OF SUCH AUTOMATIC UPDATES


//generate so id
$so_no_prefix = $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;

$so_no = $this->db->get_where('settings', array('type' => 'so_no'))->row()->description;
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

        if($numeric_counter == 2) {//get the 2nd time a number is found
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

//generate invoice code
$inv_no_prefix = $this->db->get_where('settings', array('type' => 'inv_prefix'))->row()->description;

$inv_no = $this->db->get_where('settings', array('type' => 'inv_no'))->row()->description;
$inv_length = strlen($inv_no_prefix . $inv_no);

$this->db->select('invoice_code');
//$this->db->where('invoice_code !=', 'Opening Balance');
$this->db->like('invoice_code', $inv_no_prefix, 'after');
$this->db->not_like('invoice_code', 'R', 'before');
$this->db->order_by('invoice_code', 'desc');
$this->db->limit(1);
$inv_query = $this->db->get('invoice');
$inv_id = $inv_query->row()->invoice_code;

if ($inv_query->num_rows() < 1) {
  //let's search from the general journal table instead
  $this->db->select('invoice_code');
  $this->db->like('invoice_code', $inv_no_prefix);
  $this->db->like('invoice_code', $inv_no_prefix, 'after');
  $this->db->not_like('invoice_code', 'R', 'before');
  $this->db->order_by('invoice_code', 'desc');
  $this->db->limit(1);
  $inv_query = $this->db->get('general_journal');
  $inv_id = $inv_query->row()->invoice_code;
}

if ($inv_query->row()->invoice_code != '' || $inv_query->row()->invoice_code != null) {
  if ($inv_query->num_rows() > 0) {
    //extract the numeric out and increase it by 1
    $second_num_inv = ''; //the second occurence of a number in the string ....
    $position_of_second_num_inv = ''; //the position of the second number

    $i = 0;
    $numeric_counter_inv = 0;
    $pos_counter = 0;
    for ($i = 0; $i < strlen($inv_id); $i++) {
      if (is_numeric($inv_id[$i])) {

        $numeric_counter_inv++;
        
        if($numeric_counter_inv == 2) {//get the 2nd time a number is found
            $second_num_inv = $inv_id[$i];
            break;
        }
      }

      $pos_counter++;
    }

    //find the position
    $position_of_second_num_inv = $pos_counter; //strpos($inv_id, $second_num_inv);

    //now let's do the extraction
    $n_invid = substr($inv_id, $position_of_second_num_inv, strlen($inv_id) - $i);

    $invoice_code = $n_invid + 1;

    if ($second_num_inv == 0) {
      $old_len = strlen($inv_id);
      $new_len = strlen($invoice_code);
      $act_len = ($old_len - $new_len);
      $invoice_code = substr($inv_id, 0, $act_len) . $invoice_code;
    } else {
      $invoice_code = $invoice_code;
    }

  } else {
    $invoice_code = $inv_no_prefix . $inv_no;
  }
} else {
  $invoice_code = $inv_no_prefix . $inv_no;
}
?>

<!DOCTYPE html>
<html lang="en" dir="<?php if ($text_align == 'right-to-left') echo 'rtl';?>">
<head>

    <title><?php echo $page_title;?> | <?php echo $system_name;?></title>

    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Lightworldtech Inventory Management Software - Lightworld Technologies Ltd" />
    <meta name="author" content="Lightworldtech" />

    <?php include 'css.php'; //header?>

    <style type="text/css">

      .item_images:hover, .printers:hover {
        transition: transform 0.6s;
        transform-style: all;
        transform: scale(2);
        cursor: pointer;
      }

     

    </style>
    <?php include 'includes_top.php'; //header?>
</head>



<body style="min-height: 100vh;">

  <div class="container-fluid" style="min-height: 100vh;" id="top_top">
        <div id="header-nav">
          <?php include 'top-header.php';?>
        </div>
<br>

<div id="welcomer" style="display: none">
  <center>
    <div class="jumbotron jumbotron-fluid">
      <div class="container">
        <h1 style="font-size: 30px; font-weight: bolder;">WELCOME BACK <?php echo $name; ?></h1>
        <br>
        <h3 class="text-white bg-danger p-5">Please CLOCK-IN to have access to your POS Portal.</h3>

        <!--FOR DISPLAYING TIME INPUT IF USER DID NOT LOGOUT DURING THE PREVIOUS SESSION -->
        <div id="time_display">
          <?php
            echo form_open(site_url('admin/clock_in_out/update_clock_out/'),
  array('class' => 'form-groups-bordered', 'id' => 'update_clock_out', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-md-12 col-sm-12 col-xs-12">
                  <div class="col-md-2 col-sm-2 col-xs-2"></div>
                  <input type="time" required="true" class="form-control col-md-4 col-sm-4 col-xs-4" name="closing_time" id="closing_time" value="17:30" style="text-align: center; font-size: 30px; font-weight: bolder"><br>

                  <button type="submit" class="col-md-4 col-sm-4 col-xs-4 btn btn-success btn-lg" style="text-align: center; font-size: 25px; font-weight: bolder"><i class="fas fa-clock-o fa-spin text-white"></i> Submit</button>
                  <div class="col-md-2 col-sm-2 col-xs-2"></div>
                </div>
              </div>
            </form>
        </div> <!--END OF THAT -->

        <hr>
        <hr>
        <br>
        <h4 class="text-success">Do have a great day and great sales today.</h4>
          <hr>
          <h5 class="text-warning"><small><em>Software Developed & Designed By Lightworld Technologies Ltd - 0243618186|0247612799</em></small></h4>
      </div>
    </div>
  </center>
</div>

<div id="goodbye" style="display: none">
  <center>
    <div class="jumbotron jumbotron-fluid">
      <div class="container">
        <h1 style="font-size: 30px; font-weight: bolder;">GOODBYE <?php echo $name; ?></h1>
        <br>
        <h3 class="text-white bg-danger p-5">You have just ended your shift for today!</h3>
        <hr>
        <hr>
        <br>
        <h4 class="text-success">We hope you had a great day and great sales today.</h4>
          <hr>
          <h5 class="text-warning"><small><em>Software Developed & Designed By Lightworld Technologies Ltd - 0243618186|0247612799</em></small></h4>
      </div>
    </div>
  </center>
</div>

    <div class="row col-sm-12 col-md-12" style="padding-bottom: 20px; display: none;" id="main_holder">
          <div class="col-md-9 col-sm-9 col-xs-12" style="border: 1px solid red; overflow: auto; max-height: 88vh;">
            <center>
              <div class="container">

              <?php
echo form_open(site_url('admin/sales_order_pos/create'),
  array('class' => 'form-groups-bordered', 'id' => 'sales_order_form_pos', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-md-3 col-sm-6 col-xs-12">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success text-light">SO No:</div>
                        </div>
                    <input type="text" required="true" onkeyup="verify_so_no_pos()" class="form-control" name="order_no_pos" id="order_no_pos" minlength="<?php echo $id_length; ?>" maxlength="<?php echo $id_length; ?>" value="<?php if ($second_num == 0) {echo $so_code;} else {echo $so_no_prefix . $so_code;}?>">
                    </div>
                    <div style="position: absolute;" id="so_code_err_message_pos"></div>
                </div>

              <div class="input-group col-md-6 col-sm-6 col-xs-12">
                <div class="input-group-prepend">
                    <span class="input-group-text" id="basic-addon1_pos"><i class="fa fa-search"></i></span>
                </div>
                
                       <select class="form-control select2" onchange="populate_edit_button_pos($('#order_to_pos').val())" name="order_to_pos" id="order_to_pos">
                        <option value="">Search Customer...</option>
                        <?php
                          $all_customers = $this->db->get('customers');
                          if($all_customers->num_rows() > 0) {
                            foreach($all_customers->result_array() as $cu) {
                              ?>
                              <option value="<?= $cu['customer_id'] ?>"><?= $cu['customer_name'] ?></option>
                              <?php
                            }
                          }
                        ?>
                        
                       </select> 
                  <div class="input-group-append ml-2">
                      <button class="btn btn-primary" type="button" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add new customer')"> <?php echo 'Add' ?> <i class="fa fa-fw fa-plus"></i></button>

                      &nbsp; <button class="btn btn-danger" type="button" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/customers_list/'); ?>', 'View Customers')"> <?php echo 'Edit' ?> <i class="fa fa-fw fa-pencil"></i></button>
                  </div>
              </div>
            

              <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light">Order Date:</div>
                        </div>
                        <input type="text" required="true" class="form-control datepicker" name="order_date_pos" id="order_date_pos" data-format="dd-mm-yyyy"
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
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th>Subtotal:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="subtotal_pos">0.00</span></strong></th>
                                </tr>
                                <tr>
                                    <th>Total:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="total_pos">0.00</span></strong></th>
                                </tr>
                                <input type="hidden" name="hidden_total_pos" id="hidden_total_pos" value="">
                                <input type="hidden" name="hidden_payment_balance_pos" id="hidden_payment_balance_pos" value="">

                                <input type="hidden" name="hidden_total_quantity_pos" id="hidden_total_quantity_pos" value="">
                                <input type="hidden" name="hidden_quantity_balance_pos" id="hidden_quantity_balance_pos" value="">

                                <input type="hidden" name="hidden_account_balance_pos" id="hidden_account_balance_pos" value="">


                            </thead>
                        </table>

                        <hr><hr>
                        <div class="form-group row">
                            <div class="col-sm-2 col-md-2"><h3>INVOICE</h3></div>

                            <div class="col-sm-5 col-md-5">
                                <label class="control-label col-sm-6 col-sm-6"><strong class="text-success">INSTANT PAYMENT</strong></label>  

                                <div class="switch-button  showcase-switch-button">
                                <input id="instant_payment"  type="checkbox"  value="0" name="instant_payment" onchange="value_change_pos(this.value)">
                                <label for="instant_payment" ></label>   <strong style="font-size: 22px;" id="yes_no_inst">NO</strong>                               
                                </div>    
                            </div>

                            <div class="col-sm-5 col-md-5 payment_holder">
                              <label class="control-label col-md-6 col-sm-6"><strong>PRINT RECEIPT?</strong></label>  

                              <div class="switch-button  showcase-switch-button">
                              <input id="print_receipt_r"  type="checkbox"  value="1" checked name="print_receipt" onchange="value_change_receipt(this.value)">
                              <label for="print_receipt_r" ></label>   <strong style="font-size: 22px;" id="yes_no_r">YES</strong>                               
                              </div> 
                              <hr><hr>

                              <!--CHOOSE PRINTER TO USE-->
                              <div class="col-sm-12 col-md-12 printers_holder">
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
                        <div class="form-group row" style="display: none" id="error_holder_pos">
                                <div class="col-sm-12 col-md-12">
                                    <div id="inv_code_err_message_pos"></div>
                                </div>

                                
                            </div>
                            <div class="form-group row">
                                <div class="col-sm-4 col-md-4">
                                  <div class="form-group row">
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <div class="input-group-text bg-info text-light" style="height: 40px; font-size: 20px;">Invoice Code</div>
                                        </div>
                                        <input type="text" required="true" onkeyup="verify_inv_no_pos()" class="form-control" name="invoice_code_pos" id="invoice_code_pos" minlength="<?php echo $inv_length; ?>" maxlength="<?php echo $inv_length; ?>" value="<?php if ($second_num_inv == 0) {echo $invoice_code;} else {echo $inv_no_prefix . $invoice_code;}?>" style="height: 40px; font-size: 20px;">
                                    </div>
                                  </div>
                                  <div class="payment_holder">
                                  <div class="form-group row">
                                     <?php

$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'account_is_bank' => 0))->result_array();
?>
                                  <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-success text-light" style="height: 40px; font-size: 20px;">Payment Mode:</div>
                                    </div>
                                    <select name="paid_to_pos" id="paid_to_pos" onchange="update_bank_balance_pos($(this).val())" class="form-control select2" value="" required="required" style="height: 40px; font-size: 20px;">
                                        <option value="">Select Account</option>
                                        <?php foreach ($accounts as $acc): ?>
                                            <option value="<?=$acc['account_id']?>"><?=$acc['name']?></option>
                                        <?php endforeach;?>
                                    </select>
                                </div>
                            </div>

                            <div class="form-group row">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-success text-light" style="height: 40px; font-size: 20px;">Balance: <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                                    </div>
                                    <input type="text" name="account_balance_pos" id="account_balance_pos" class="form-control form-control-plaintext" value="" readonly="readonly" style="height: 40px; font-size: 20px;">
                                </div>
                              </div>
                            </div> <!--end of holder-->

                            <hr>
                            <br>
                            <div class="form-group row">
                                <div class="col-sm-3 col-md-3 col-xs-6">
                                    <input type="submit" name="submit" id="submit" class="btn btn-info btn-lg"
                                        value="Create Sales Order" style="height: 40px; font-size: 26px">
                                </div>
                              </div>

                                </div>

                                <div class="col-sm-8 col-md-8">
                                  <div class="payment_holder">
                                    <div class="form-group row">
                                      <div class="col-sm-6 col-md-6"><strong style="color: #000;">Amount Tendered</strong></div>
                                      <div class="col-sm-6 col-md-6"><strong style="color: #000;">Amount Paid</strong></div>
                                      
                                    </div>

                                    <div class="form-group row">
                                      <div class="col-sm-6 col-md-6">
                                              <input type="currency" onkeyup="change_update()" onchange="change_update()" min="0" name="amount_tendered_pos" id="amount_tendered_pos" class="form-control" value="" required="required" placeholder="0.00" style="height: 130px; font-size: 100px;">
                                      </div>

                                      <div class="col-sm-6 col-md-6">
                                              <input type="currency" onkeyup="payment_update()" onchange="payment_update()" min="0" name="amount_paid_pos" id="amount_paid_pos" class="form-control" value="" required="required" placeholder="0.00" style="height: 130px; font-size: 100px;">
                                      </div>
                                    </div>

                                    <div class="form-group row">
                                      <label class="col-sm-4 col-md-4 form-control-label" style="height: 50px; font-size: 30px; color: #85868d; text-align: left;">Change</label>
                                      <div class="col-sm-6 col-md-6">
                                          <input type="text" name="change_due_pos" id="change_due_pos" class="form-control form-control-plaintext" placeholder="0.00" value="" readonly="readonly" style="height: 50px; font-size: 30px; color: #85868d;">
                                      </div>

                                      <div class="col-sm-2 col-md-2 text-sm-right">
                                          
                                      </div>
                                    </div>

                                    <div class="form-group row">
                                      <label class="col-sm-4 col-md-4 form-control-label" style="height: 50px; font-size: 30px; color: #85868d; text-align: left;">Balance Due</label>
                                      <div class="col-sm-6 col-md-6">
                                          <input type="text" name="balance_amount_pos" id="balance_amount_pos" class="form-control form-control-plaintext" placeholder="0.00" value="" readonly="readonly" style="height: 50px; font-size: 30px; color: #85868d;">
                                      </div>

                                      <div class="col-sm-2 col-md-2 text-sm-right">
                                          <a href="javascript:;" class="btn btn-outline-success btn-sm" onclick="auto_fill()">Autofill</a>
                                      </div>
                                    </div>

                                </div>
                            </div>
                        
                            <!--<div class="col-sm-12 col-md-12">
                                    <div style="color: red; font-weight: bold; padding-bottom: 3px;">Please Note that customer will not receive any alert when you take payment here. Use the "Take Payment" button instead after creating this Order.</div>
                                </div>-->
                        
                        </div>

                    <!--
                        <div class="form-group row">
                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Quantity Picked:</div>
                                    </div>
                                    <input type="number" onkeyup="payment_update()" onchange="payment_update()" min="0" name="quantity_picked" id="quantity_picked" class="form-control" value="" required="required">
                                </div>
                            </div>

                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Balance:</div>
                                    </div>
                                    <input type="text" name="balance_quantity_pos" id="balance_quantity_pos" class="form-control form-control-plaintext" value="" readonly="readonly">
                                </div>
                            </div>
                        </div>
                    -->

                        </div>                    

                </div>
              </form>
            </div>
          

        </center>
            
          </div> <!--for transaction display -->

          <div class="col-md-3 col-sm-3 col-xs-12" style="border: 1px solid green;">

            <div class="p-3 bg-success"><h3 style="color: #fff; text-align: center">SALES INVOICE ITEMS</h3></div>
            <div class="container" style="max-height: 82vh; overflow: auto;">
            <?php
            $this->db->select('category_id');
            $this->db->distinct();
            $this->db->order_by('category_id', 'ASC');
            $category_array = $this->db->get('items')->result_array();
              ?>

              <table class="table container-fluid" width="100%" id="item_list">
                <thead></thead>
                <tbody>

                  <?php
                    foreach($category_array as $cat):
                      $category_name = $this->db->get_where('item_category', array('category_id' => $cat['category_id']))->row()->category_name;

                      $items_query = $this->db->get_where('items', array('category_id' => $cat['category_id']));

                      if($items_query->num_rows() > 0) {

                        $items_array = $items_query->result_array();
                  ?>
                  <tr><td colspan="3" style="margin-bottom: -60px"><strong><?=$category_name ?></strong></td></tr>
                  <tr>
                    
                    <?php
                    $tr = '</tr>';
                    $position_counter = 0;
                    $n_columns = 4;

                    

                    foreach($items_array as $item):

                    ?>
                      <td align="center">
                        <div style="width: 60px; padding: 5px" >
                          <figure>
                            <img src="<?php echo $this->crud_model->get_image_url('item',$item['item_id']);?>" width="60" height="90" class="item_images" onclick="confirm_selection(<?=$item['item_id'] ?>)" />
                            <figcaption style="background-color: #000; color: #fff; text-align: center; width: 60px; font-size: 12px"><strong><?=$item['item_name']; ?></strong><br>(<strong><?=number_format($item['quantity'], '0', '.',','); ?></strong>)</figcaption>
                          </figure>
                        </div>
                      </td>
                    <?php

                      $position_counter++;
                      //continue on a new row if the first row data  add up to 3
                      if($position_counter == $n_columns ) {

                        echo $tr; //close the row
                        echo '<tr>'; //open new row

                        $position_counter = 0; //reset it to 0
                      }
                    endforeach; //for each item
                  } //end of if statement for item found or not
                    else {
                      ?>
                      <tr>
                        <td colspan="3"><strong style="text-align: center; color: red;">No Item Found!</strong></td>
                      </tr>
                      <?php
                    }
                  
                  endforeach;//for each category

                    echo $tr;
                  ?>

                </tbody>
              </table>
            
             </div>
            
          </div> <!--for products display -->

        </div>

</div>
</div>

  <!-- confirm selection modal-->
  <div class="modal fade" id="confirm_selection" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document" style="margin-top: -3vh">
      <div class="modal-content">
        <div class="modal-header bg-warning">
          <h3 class="modal-title text-dark">Are you sure you really want to sell this item?</h3>
        </div>
        <div class="modal-body">
                    
        </div>

        <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
          <a href="#" class="btn btn-success btn-lg" data-dismiss="modal" id="yes_btn" style="font-weight: bolder; font-size: 25px;"><?php echo get_phrase('Yes'); ?></a>
          <button type="button" class="btn btn-danger btn-lg" id="no_btn" data-dismiss="modal" style="font-weight: bolder; font-size: 25px;"><?php echo get_phrase('No'); ?></button>
      </div>
      </div>
    </div>
  </div><!--end of modal-->

  <!-- confirm clock-out modal-->
  <div class="modal fade" id="confirm_clock_out" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document" style="margin-top: -15vh">
      <div class="modal-content">
        <div class="modal-header bg-danger">
          <h3 class="modal-title text-white">You requested to CLOCK-OUT!</h3>
        </div>
        <div class="modal-body">
           <strong>Are you sure you want to perform this action? If you CLOCK-OUT you will not be able to CLOCK-IN today again, until tomorrow as this will end your shift for today! If you intend to remain CLOCKED-IN till the end of your shift today, then consider using the LOGOUT button instead!</strong>         
        </div>

        <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
          <a href="#" class="btn btn-success btn-lg" data-dismiss="modal" id="clock_me_out" style="font-weight: bolder; font-size: 16px;"><?php echo get_phrase('CLOCK ME OUT'); ?></a>
          <button type="button" class="btn btn-danger btn-lg" id="no_btn" data-dismiss="modal" style="font-weight: bolder; font-size: 16px;"><?php echo get_phrase('CANCEL'); ?></button>
      </div>
      </div>
    </div>
  </div><!--end of modal-->

</div>





<script type="text/javascript">
    $(function() {

        $.ajaxSetup({
            cache: false,
            data: {
                '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
            } 
         });

       // get_price_list();

       // $('#pricing_table').DataTable();


    });


    //delay clock out form submitted
  $('#update_clock_out').submit(function(event) {
    /* Act on the event */
    event.preventDefault();
    
    const user_id = <?php echo $this->session->userdata('admin_id'); ?>;

    $.ajax({
      url: '<?php echo site_url('admin/clock_in_out/update_clock_out/') ?>' + user_id,
      type: 'POST',
      data: new FormData(this),
      dataType: 'text',
      cache: false,
      contentType: false,
      processData: false
    })
    .done(function(response) {
      if(response == 'done') {

        showAjaxModal_confirm('Very well. Your previous day\'s CLOCK-OUT has been successful. Kindly CLOCK-IN now to proceed', 'Success');

          setTimeout(() => {
            $('#modal_confirm .close').click(); window.location.reload();
          }, 5000);

      } else {
        showAjaxModal_confirm('Sorry, there seems to be a problem somewhere. Please try again.', 'Error');
      }
    });
  });


  </script>

  <script type="text/javascript">
    $(function() {
       // let chk_val = $('#instant_payment').val();
        value_change_pos();

    });

    //ask user to confirm if that is the item he/she really wants to sell
    function confirm_selection(item_id) {
      
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
        dataType: 'html',
      })
      .done(function(data) {
        //result is ready===add the data first
        $('#confirm_selection .modal-body').html(data);
        
        $('#yes_btn').attr('onclick', 'add_new_row_pos('+item_id+')');

        //show modal now
        $('#confirm_selection').modal('show', {backdrop: 'static'});
      })
      .fail(function() {
        alert('failed');
      });
      
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
            $('#yes_no_inst').text('NO');
            $('#yes_no_inst').css('color', '#b3afaf');

            //reset some values
            let t_hidden = Number($('#hidden_total_pos').val());
            $('#amount_paid_pos').val('');
            $('#amount_paid_pos').attr('placeholder', '0.00');
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
    }

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

    //get bank account balance
    function update_bank_balance_pos(id) {
        if(id != '') {
            $.ajax({
                url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + id,
                type: 'POST',
                dataType: 'json',
               // cache: false
            })
            .done(function(response) {
               $('#account_balance_pos').val(number_format(response.balance, 2, '.', ','));
               $('#hidden_account_balance_pos').val(response.balance);
            });
        } else {
            $('#account_balance_pos').val('');
            $('#hidden_account_balance_pos').val('');
        }
    }

    //add row to table at a button click
    function add_new_row_pos(item_id) {

        //be sure user selected customer before trying to add row
        let selected_customer = $('#order_to_pos').val();
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


        $.ajax({
            url: '<?php echo site_url('admin/add_order_row_pos/so/0/0/') ?>' + selected_customer + '/' + order_date_pos + '/' + item_id + '/' + selected_item_ids,
            type: 'POST',
            dataType: 'html',
            cache: false
        })
        .done(function(data) {

            let tr = '<tr id="tr_pos_'+ tbody +'">'+data+'<td width="60" style="vertical-align: middle"><a href="javascript:;" onclick="remove_row('+tbody+')" class="btn btn-danger btn-sm" style="z-index: 9999; height: 50px;"><i class="fa fa-fw fa-trash fa-3x"></i></a></td></tr>';

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
                confirm_order('goods_negative', id, 'You owe this customer both cash balances and goods. If you want to settle any of the debts with goods, kindly go to the "Purchases" tab, choose "Payment" and select this customer and then choose the appropriate option');
                
            } else if(data.goods == true) {
                confirm_order('goods', id, 'This customer has some goods with you which you have not supplied yet. Do you want to supply those goods instead of creating a new Sales Order for this customer?',  data.so_code );
                
            } else if(data.negative == true) {
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
            $('#quantity_picked_pos').val(0);
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

    //Sales Order Creation form submitted
  $('#sales_order_form_pos').submit(function(event) {
    // Act on the event 
    event.preventDefault();

    //scroll to top after submit button is clicked
    $('html, body').animate({
      scrollTop: ($('#top_top').offset().top),
    }, 1000);

    let a_paid = Number($('#amount_paid_pos').val());
    let ac_paid_to_pos = $('#paid_to_pos').val();

    if(a_paid > 0 && ac_paid_to_pos == '') {
        //reject submission
        showAjaxModal_confirm('No Deposit Account Is Selected. Select A Deposit Account!', 'Error');
        return false;

    }

    let no_tr = $('#s_order_create_table_pos tbody').find('tr').length;
    let input_ids_numeric = []; //array to hold the numeric parts of the ids

    for(i = 1; i <= no_tr; i++) {

        let each_id_numeric =  $('#tr_pos_' + i + ' input[type="number"]').attr('id').replace(/[^\d]+/, '');
        input_ids_numeric.push(each_id_numeric); //push the numbers into this array
    }

    //replace the , with -
    input_ids_numeric = input_ids_numeric.join('-')
    let form_data = $('#sales_order_form_pos').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/sales_order_pos/create/') ?>' + input_ids_numeric,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {

        if(data.no_payment == true) { //no payment was made during this transaction
          $('.close').click();
          showAjaxModal_confirm('Sales Order Created Successfully.', 'Success');

          setTimeout(() => {
            $('#modal_confirm .close').click(); window.location.reload();
          }, 3000);

        } else {// payment was made during this transaction
          $('.close').click();

          if(data.print_receipt == 1) {
            showAjaxModal_confirm(data.payment_type + ' received Successfully. <br><br><em>Please wait while we redirect you to the receipt page for printing...</em>', 'Loading');

            setTimeout(() => {
              $('#modal_confirm .close').click(); 

              //loading receipt page
              $.ajax({
                url: '<?php echo site_url('admin/receipt/') ?>' + data.receipt_code + '/' + data.customer_id + '/' + data.date_time + '/' + data.printer,
                type: 'POST',
                dataType: 'html',

              })
              .done(function(response) {

                showAjaxModal_receipt('<?php echo site_url('modal/popup_sales/receipt_modal/'); ?>', response, 'Print Receipt');
               // $('#receipt_holder').html(response);
              });
              
            }, 2000); 

          } else {

            showAjaxModal_confirm(data.payment_type + ' received Successfully.', 'Success');

            setTimeout(() => {
              window.location.reload();
            }, 1000); 
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
  });

    //Verify po no
    function verify_inv_no_pos() {
        //verify id
        var invoice_code = $('#invoice_code_pos').val();
        $.ajax({
            url: '<?php echo site_url('admin/get_generated_invoice_code/'); ?>' + invoice_code
        })
        .done(function(response) {
                $('#error_holder_pos').slideDown('slow');
                $('#inv_code_err_message_pos').html(response);
        });
    }

    
    function remove_this_row_pos(id) {
        //remove row now
        $('#tr_pos_'+id).remove();
    }   
    </script>

  <div class="row" id="modals_holder">

                  <?php include 'modal.php';?>

      </div>
<?php include 'includes_bottom.php'; //header?>

<script type="text/javascript">
        //remove the preloader after page has fully loaded
        $(document).ready(function() {
          update_ables_pos();//this does very important updates such as the payables, receivables acoount etc

         /* $(window).on("load", function() {
            $('#modal_preloader').slideUp('400', function() {
              $('.modal-backdrop').removeClass('modal-backdrop');
              $('#modal_preloader').modal('hidden');
              $('#modal_preloader').remove();
              $('#modal_preloader').css('display', 'none');
            });
          
          });*/
        });

        //for firefox browser
       /* window.onload = function() {
            $('#modal_preloader').slideUp('400', function() {
              $('.modal-backdrop').removeClass('modal-backdrop');
              $('#modal_preloader').modal('hidden');
              $('#modal_preloader').remove();
              $('#modal_preloader').css('display', 'none');
            });
          
          //
          if($('#main_div').hasClass('sidebar-collapsed')) {
            $('#main-menu > div ul').addClass('toggled');
          }
          };

          $(function() {
            //
          if($('#main_div').hasClass('sidebar-collapsed')) {
            $('#main-menu > div ul').addClass('toggled');
          }
        });*/

          //let the first opened modal still gain focus if an aux modal get closed
        
            let mod_counter = 0;
            // when any modal is still opened
            $(document).on('shown.bs.modal', function (e) {

              mod_counter++;
              $('body').addClass('modal-open');

              $('.modal-open .modal').css({
                'overflow-x' : 'scroll'
              });

            });


            $('#create').on('hidden.bs.modal', function () {
              
              window.location.reload();
            });

            $(document).on('hidden.bs.modal', function () {
              mod_counter--;
            });

            $(document).on('hidden.bs.modal', function () {
              
              if(mod_counter > 0) {
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
                          /////////////////////////////////////
                                          //END//
                          /////////////////////////////////////

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
      </script>
</body>

</html>