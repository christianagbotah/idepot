 <?php

 //currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

$payments_array_ids = array();

$filer = array('Payable', 'Expense');
if($from != 0 && $to != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
}

$this->db->where_in('payment_type', $filer);
$payments_array = $this->db->get('payment')->result_array();
?>
    <div class="row">
        <table class="table" width="100%" id="view_accounts_payable_table">
            <thead class="bg-info">
              <tr>
                <th>Date</th>
                <th>Creditor | Item</th>
                <th>Order No. | Category</th>
                <th>Description</th>
                <th style="text-align: right">Amount</th>
              </tr>
            </thead>
            <tbody>
                <?php
$total_payment = 0;
$total_amount = 0;

foreach ($payments_array as $payment):
?>
              <tr ondblclick="deselect_all()" <?php 

              if($payment['customer_id'] != NULL) {
                echo  'onclick="populate_links(\''.$payment['payment_id'].'\', \'ce_'.$payment['customer_id'].'\', \''.$payment['so_code'].'\')" id="payment_'.$payment['payment_id'].'"';

              } else if($payment['supplier_id'] != NULL) {
                echo  'onclick="populate_links(\''.$payment['payment_id'].'\', \''.$payment['supplier_id'].'\', \''.$payment['po_code'].'\')" id="payment_'.$payment['payment_id'].'"';
              } else {
                echo  'onclick="populate_links(\''.$payment['payment_id'].'\', 0, 0)" id="payment_'.$payment['payment_id'].'"';
              }

              ?> >
                <td><?=date('d-m-Y', $payment['timestamp']);?></td>
                <td><?php

                    $category = '';
                    if($payment['supplier_id'] == null &&  $payment['customer_id'] == null && $payment['debt_id'] == null) {
                        //display expenditure item name
                        echo $payment['expenditure_item'];
                        $category = 'General Expenses';

                    } else if($payment['expenditure_item'] == null && $payment['debt_id'] == null &&  $payment['customer_id'] == null) {
                        //display supplier's name
                        echo $this->db->get_where('suppliers', array('supplier_id' => $payment['supplier_id']))->row()->supplier_name;

                        $category = $payment['po_code'];

                    } else if($payment['expenditure_item'] == null && $payment['supplier_id'] == null &&  $payment['customer_id'] == null) {

                        //display debt item's name
                        echo $this->db->get_where('outstanding_debts', array('debt_id' => $payment['debt_id']))->row()->name;

                        $category = 'Outstanding Debt';

                    } else if($payment['expenditure_item'] == null && $payment['supplier_id'] == null &&  $payment['debt_id'] == null) {

                        //display customer's name
                        echo $this->db->get_where('customers', array('customer_id' => $payment['customer_id']))->row()->customer_name;

                        $category = $payment['so_code'];
                    }
                 ?>  

                    

                </td>
                <td><?=$category;?></td>
                <td><?=$this->db->get_where('general_journal', array('payment_id' => $payment['payment_id'], 'journal' => 'payments'))->row()->description;?></td>
                <td align="right"><strong><?=numfmt_format_currency($fmt, $payment['amount'], $currency);?></strong></td>
              </tr>
          <?php
$total_payment++;
$total_amount += $payment['amount'];

//push the ids here
array_push($payments_array_ids, $payment['payment_id']);
endforeach;?>
            </tbody>
        </table>
    </div>
    <br>
    <hr>
    <div class="row">
            <div class="col-md-2 col-sm-2 text-lg-left"><strong><?php echo number_format($total_payment, 0, '.', ',') . ' ';
echo ' ' . $total_payment > 1 ? 'Payments' : 'Payment'; ?></strong></div>
            <div class="col-md-2 col-sm-2 text-lg-left"><strong>Total: <?=numfmt_format_currency($fmt, $total_amount, $currency);?></strong></div>

    </div>
</div>

    <script type="text/javascript">
    $(function() {
        $('#view_accounts_payable_table').DataTable();

    });

    function populate_links(id, supplier_id, po_code) {
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all payments
        let payments_array = <?php echo json_encode($payments_array_ids); ?>;

        for(i = 0; i < payments_array.length; i++) {

            //check which table row is clicked
            if(id == payments_array[i]) {

                //change the background of the row
                $('#payment_' + id).removeAttr('class');
                $('#payment_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                $('#paymentsedit').attr("onclick", "toBackground(); showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/edit_payments/'); ?>" + supplier_id + "/" + id + "/" + po_code + "', 'Edit Payment')");

                //delete button

                $('#paymentsdelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/payments/delete/'); ?>" + id + "', 'Are you sure you want to delete this Payment? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < payments_array.length; j++) {
                    if(payments_array[j] != id) {
                        $('#payment_' + payments_array[j]).removeAttr('style');

                    }
                }
            }
        }
    }

    
    function deselect_all() {
        //call the buttons disabled function immediately
        buttons_disabled();
        let payments_array = <?php echo json_encode($payments_array_ids); ?>;

        for(i = 0; i < payments_array.length; i++) {
            $('#payment_' + payments_array[i]).removeAttr('style');
        }
    }


    function toBackground() {
        $('.btn').attr('data-dismiss', 'modal');
    }

    //show whether it is a supplier or expenses
    $('#payment_type').change(function(event) {
        /* Act on the event */
        let valSelected = $('select[name="payment_type"]').val();

        if(valSelected == 1) {
            $('#expenses_div').css('display', 'none');
            $('#supplier_div').slideDown('slow');
            $('#expenses_div').slideUp('slow');
        } else if(valSelected == 2) {
            $('#supplier_div').css('display', 'none');
            $('#supplier_div').slideUp('slow');
            $('#expenses_div').slideDown('slow');
        } else {
            $('#supplier_div').css('display', 'none');
            $('#expenses_div').css('display', 'none');
        }
    });


    

    </script>