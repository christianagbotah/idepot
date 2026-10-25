<div class="row">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('opening_order_balances'); ?>
              </div>
          </div>

          <?php
//let's see if is a creditor button is on so we can increase the codes by 1 extra... code + 2
if($is_debtor == 1) {
    $code_increment = 2;

} else {
    $code_increment = 1;
}

//generate so id
$so_no_prefix = $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;

$so_no = $this->db->get_where('settings', array('type' => 'so_no'))->row()->description;
$id_length = strlen($so_no_prefix . $so_no);

$this->db->select('so_code');
//$this->db->where('so_code !=', 'Opening Balance');
$this->db->like('so_code', 'O2pening-'.$so_no_prefix, 'after');
$this->db->not_like('so_code', 'R', 'before');
$this->db->order_by('so_code', 'desc');
$this->db->limit(1);
$so_query = $this->db->get('sales_order');
$so_id = $so_query->row()->so_code;

if ($so_query->num_rows() < 1) {
  //let's search from the general journal table instead
  $this->db->select('so_code');
  $this->db->like('so_code', 'Opening-'.$so_no_prefix, 'after');
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

    $so_code = $n_soid + $code_increment;

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
$this->db->like('invoice_code', 'Opening-'.$inv_no_prefix, 'after');
$this->db->not_like('invoice_code', 'R', 'before');
$this->db->order_by('invoice_code', 'desc');
$this->db->limit(1);
$inv_query = $this->db->get('invoice');
$inv_id = $inv_query->row()->invoice_code;

if ($inv_query->num_rows() < 1) {
  //let's search from the general journal table instead
  $this->db->select('invoice_code');
  $this->db->like('invoice_code', 'Opening-'.$inv_no_prefix);
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

    $invoice_code = $n_invid + $code_increment;

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
          <div class="panel-body" style="padding: 10px">
            <div class="form-group row">
                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success text-light">SO CODE:</div>
                        </div>
                    <input type="text" required="true" class="form-control" name="order_no" id="order_no"  value="<?php if ($second_num == 0) {echo 'Opening-'. $so_code;} else {echo 'Opening-'. $so_no_prefix . $so_code;}?>" readonly="readonly">
                    </div>
                    <div style="position: absolute;" id="so_code_err_message"></div>
                </div>

                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">INVOICE CODE:</div>
                        </div>
                    <input type="text" required="true" onkeyup="verify_inv_no()" class="form-control" name="invoice_code" id="invoice_code" minlength="<?php echo $inv_length; ?>" maxlength="<?php echo $inv_length; ?>" value="<?php if ($second_num_inv == 0) {echo 'Opening-'.$invoice_code;} else {echo 'Opening-'.$inv_no_prefix . $invoice_code;}?>" readonly="readonly">
                    </div>
                    <div style="position: absolute;" id="so_code_err_message"></div>
                </div>
            </div>


            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="s_order_create_table">
                    <thead>
                      <tr>
                        <th>Qty</th>
                        <!--<th>Qty Picked</th>-->
                        <th>Item</th>
                        <th>Description</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                        <th>Delete</th>
                      </tr>
                    </thead>
                    <tbody>

                    </tbody>

                </table>
            </div>

            <hr>
            <div class="row">
                <div class="col-md-8 col-sm-8 col-lg-8"></div>
                <div class="col-md-4 col-sm-4 col-lg-4" style="text-align: right">
                    <a href="javascript:;" onclick="add_new_row()" class="btn btn-success btn-sm" style="text-align: right">Add Item</a>
                </div>
            </div>
            <hr>

            <div class="form-group row">
                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('comments'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="comments" class="form-control" cols="50" placeholder="Comments" ></textarea>
                    </div>
                </div>

                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('private_comments:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="private_comments" class="form-control" cols="50" placeholder="Private Comments"></textarea>
                    </div>
                </div>

                <div class="col-md-6 col-sm-6">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th>Subtotal:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="subtotal">0.00</span></strong></th>
                                </tr>
                                <tr>
                                    <th>Total:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="total">0.00</span></strong></th>
                                </tr>
                                <input type="hidden" name="hidden_total" id="hidden_total" value="">
                                <input type="hidden" name="hidden_payment_balance" id="hidden_payment_balance" value="">

                                <input type="hidden" name="hidden_total_quantity" id="hidden_total_quantity" value="">
                                <input type="hidden" name="hidden_quantity_balance" id="hidden_quantity_balance" value="">

                                <input type="hidden" name="hidden_account_balance" id="hidden_account_balance_so" value="">


                            </thead>
                        </table>

                        <hr><hr>
                        <?php

$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'account_is_bank' => 0))->result_array();
?>
                        <div class="form-group row">
                            <div class="col-sm-12 col-md-12">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-danger text-light">Account Paid To:</div>
                                    </div>
                                    <select name="paid_to" id="paid_to" class="form-control">
                                        <option value="">Select Account</option>
                                        <?php foreach ($accounts as $acc): ?>
                                            <option value="<?=$acc['account_id']?>" <?php if($acc['name'] == 'Cash' || $acc['name'] == 'CASH') echo 'selected'; ?>><?=$acc['name']?></option>
                                        <?php endforeach;?>
                                    </select>
                                </div>
                            </div>
                        </div><!--end of account-->

                    </div>
                </div>
            </div>
          </div>

          </div>
        </div>
    </div>
</div>

<script type="text/javascript">
   
    //add row to table at a button click
    function add_new_row() {
        let tbody = $('#s_order_create_table tbody').find('tr').length + 1;

        //trying to make sure that a selected item does not appear in the next row
        let selected_item_ids = [];
        let i = 1;
        $.each($('tr td select'), function(index, val) {

             /* iterate through array or object */
                selected_item_ids.push($('#tr_'+ i +' td select').val());
            i++;
        });

        selected_item_ids = selected_item_ids.join('-');

        $.ajax({
            url: '<?php echo site_url('admin/add_creditor_order_row/so/opening/') ?>' + selected_item_ids,
            type: 'POST',
            dataType: 'html',
            cache: false
        })
        .done(function(data) {

            let tr = '<tr id="tr_'+ tbody +'">'+data+'<td width="60"><a href="javascript:;" onclick="remove_row('+tbody+')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td></tr>';

            //add row now
            $('#s_order_create_table tbody').append(tr);

            //disable the previous button
            $('#tr_' + (Number(tbody) - 1) + ' td a').attr('disabled', 'disabled');
         });
    }

    //Verify po no
    function verify_so_no() {
        //verify id
        var so_no = $('#order_no').val();
        $.ajax({
            url: '<?php echo site_url('admin/get_generated_so_no/'); ?>' + so_no
        })
        .done(function(response) {
                $('#so_code_err_message').html(response);
        });
    }


    //Verify po no
    function verify_inv_no() {
        //verify id
        var invoice_code = $('#invoice_code').val();
        $.ajax({
            url: '<?php echo site_url('admin/get_generated_invoice_code/'); ?>' + invoice_code
        })
        .done(function(response) {
                $('#error_holder').slideDown('slow');
                $('#inv_code_err_message').html(response);
        });
    }
</script>