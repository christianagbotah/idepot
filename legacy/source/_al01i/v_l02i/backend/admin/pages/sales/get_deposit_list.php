<?php

 //currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);


if($debtor_id != 0) {
    $this->db->where('customer_id', $debtor_id);

    if($from != 0 && $to != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }

    //$this->db->where('amount_due <', 0);
    $this->db->like('invoice_code', 'Deposit-', 'after');
    $customer_id_query = $this->db->get('invoice');

    if ($customer_id_query->num_rows() > 0) {
        $customer_id_array = $customer_id_query->result_array();

        $customer_ids = array();
    }
        

} else {

    if($from != 0 && $to != 0) {
        $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }

    //$this->db->where('amount_due <', 0);
    $this->db->like('invoice_code', 'Deposit-', 'after');
    $customer_id_query = $this->db->get('invoice');

    if ($customer_id_query->num_rows() > 0) {
        $customer_id_array = $customer_id_query->result_array();

        $customer_ids = array();

    }
}

/*

//suppliers

if($category == 'supplier' && $debtor_id != '0') {
    $this->db->where('supplier_id', $debtor_id);

    if($from != 0 && $to != 0) {
        $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->where('payment_type', 'Receivable');
    $suppliers_array = $this->db->get('payment')->result_array();

} else {
    if($from != 0 && $to != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->where('payment_type', 'Receivable');
    $suppliers_array = $this->db->get('payment')->result_array();
}


*/

$ids_array = array();
?>
    <hr>
    <div class="row">
        <table class="table" width="100%" id="debtors_list">
            <thead class="bg-info">
              <tr>
                <th>Date | Time</th>
                <th>Deposit Code</th>
                <th>Customer</th>
                <th style="text-align: right">Amount Deposited</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
                <?php

//for customers 
foreach($customer_id_array as $customer) {


   // if ($amount_payable > $amount_receivable) {
        //$actual_payable = $amount_payable - $amount_receivable;

        ?>
        <tr ondblclick="deselect_all('customer')" onclick="populate_links('<?=$customer['invoice_id']?>', 'customer', '<?=$customer['customer_id'];?>', '<?=$customer['invoice_code'];?>', '<?=$customer['creation_timestamp'];?>')" id="customer_id_<?=$customer['invoice_id'];?>">

        <td><strong><?=date('d-m-Y H:i:s', $customer['creation_timestamp']);?></strong></td>
        <td><strong><?=$customer['invoice_code'];?></strong></td>
        <td><?=$this->db->get_where('customers', array('customer_id' => $customer['customer_id']))->row()->customer_name;?></td>
        <td align="right"><strong><?=numfmt_format_currency($fmt, abs($customer['amount']), $currency);?></strong></td>
        <td><?=$this->db->get_where('customers', array('customer_id' => $customer['customer_id']))->row()->mobile;if (!empty($this->db->get_where('customers', array('customer_id' => $customer['customer_id']))->row()->phone)) {
        echo ' | ' . $this->db->get_where('customers', array('customer_id' => $customer['customer_id']))->row()->phone;
        }
        ?></td>
        </tr>
        <?php
        array_push($ids_array, $customer['invoice_id']);

    //}

}

/*
//for other outanding debts like loan, TNT etc
if($category == 'debt' && $debtor_id != '0') {
    $this->db->where('debt_id', $debtor_id);

    if($from != 0 && $to != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->where('payment_type', 'Receivable');
    $debt_query = $this->db->get_where('payment');
} else {
    if($from != 0 && $to != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }

    $this->db->where('payment_type', 'Receivable');
    $debt_query = $this->db->get_where('payment');
}
 


if($debt_query->num_rows() > 0) {
    $debt_array = $debt_query->result_array();

    foreach($debt_array as $debt):
        ?>
        <tr ondblclick="deselect_all('debt')" onclick="populate_links('<?=$debt['debt_id']?>', 'debt')" id="debt_id_<?=$debt['debt_id'];?>">
        <td><?=$debt['name'];?></td>
        <td></td>
        <td align="right"><strong><?=numfmt_format_currency($fmt, $debt['amount_due'], $currency);?></strong></td>
        <td></td>
        </tr>
        <?php

        array_push($ids_array_debt, $debt['debt_id']);
        $receivable_counter++;
        $grand_total += $debt['amount_due'];
    endforeach;
}



//suppliers
foreach($suppliers_array as $sup):

    $this->db->select_sum('amount_due');
    if($from != 0 && $to != 0) {
        $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->where('amount_due >', 0);
    $this->db->where('supplier_id', $sup['supplier_id']);
    $total_amount = $this->db->get('accounts_payable')->row()->amount_due;

    $supplier_name = $this->db->get_where('suppliers', array('supplier_id' => $sup['supplier_id']))->row()->supplier_name;
    $supplier_address = $this->db->get_where('suppliers', array('supplier_id' => $sup['supplier_id']))->row()->address;
    $supplier_mobile = $this->db->get_where('suppliers', array('supplier_id' => $sup['supplier_id']))->row()->mobile;
    $supplier_phone = $this->db->get_where('suppliers', array('supplier_id' => $sup['supplier_id']))->row()->phone;
?>
	  <tr ondblclick="deselect_all('supplier')" onclick="populate_links('<?=$sup['supplier_id']?>', 'supplier')" id="supplier_id_<?=$sup['supplier_id'];?>">
	    <td><?=$supplier_name;?></td>
	    <td><?=$supplier_address;?></td>
	    <td align="right"><strong><?=numfmt_format_currency($fmt, $total_amount, $currency);?></strong></td>
	    <td><?=$supplier_mobile;if (!empty($supplier_phone)) {
	echo ' | ' . $supplier_phone;
}
?></td>
	  </tr>
	  <?php
array_push($ids_array_sup, $sup['supplier_id']);

$receivable_counter++;
$grand_total += $total_amount;
$total_amount = 0;
endforeach;?>
            </tbody>
        </table>
    </div>

     <br>
    <hr>
    <div class="row">
            <div class="col-md-2 col-sm-2 text-lg-left"><strong><?php echo number_format($receivable_counter, 0, '.', ',') . ' ';
echo ' ' . $receivable_counter > 1 ? 'Bills' : 'Bill'; ?></strong></div>
            <div class="col-md-2 col-sm-2 text-lg-left"><strong>Total: <?=numfmt_format_currency($fmt, $grand_total, $currency);?></strong></div>

    </div>

<?php */ ?>
    <script type="text/javascript">
    $(function() {
        $('#debtors_list').DataTable();

    });

    function populate_links(id, user, customer_id, invoice_code, date_time) {
        //alert(so_code);
        //show the payment button
        //$('#deposit_holder').slideUp('slow');
        $('#deposit_holder').slideDown('slow');
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all ids
        let ids_array = <?php echo json_encode($ids_array); ?>;

        if(user == 'customer') {
            //$('#cuedit').attr('disabled', 'disabled');

            $('#cuedit').attr("onclick", "showAjaxModal_payments('<?php echo site_url('modal/popup_sales/edit_deposit/'); ?>" + customer_id + "/" + id + "/" + invoice_code + "', 'Edit Deposit'), $('.close').click()");

                    for(i = 0; i < ids_array.length; i++) {

                //check which table row is clicked
                if(id == ids_array[i]) {

                    //change the background of the row
                    $('#customer_id_' + id).removeAttr('class');
                    $('#customer_id_' + id).css({
                        background: '#1cc88a',
                        color: '#ffffff'
                    });

                    /*$('#cusprint').attr("onclick", "load_receipt('" + receipt_code + "', '" + invoice_code + "', '" + customer_id + "', '" + id + "', '" + date_time + "'), $('.close').click()");*/



                    } else {
                        for(j = 0; j < ids_array.length; j++) {
                            if(ids_array[j] != id) {
                                $('#customer_id_' + ids_array[j]).removeAttr('style');

                            }
                        }
                    }
                }

        }           
    }


    //loading receipt for print
    /*function load_receipt(receipt_code, invoice_code, customer_id, payment_id, date_time) {
        //loading receipt page
        $.ajax({
          url: '<?php echo site_url('admin/receipt/') ?>' + receipt_code + '/' + invoice_code + '/' + customer_id + '/' + payment_id + '/' + date_time,
          type: 'POST',
          dataType: 'html',

        })
        .done(function(response) {

          showAjaxModal_receipt('<?php echo site_url('modal/popup_sales/receipt_modal/'); ?>', response, 'Print Receipt');
         // $('#receipt_holder').html(response);
        });
    }*/

    function toBack() {
        $('.close').click();
    }

    function deselect_all(user) {
        //hide payment button
        $('#deposit_holder').slideUp('slow');
        //call the buttons disabled function immediately
        buttons_disabled();
        let ids_array = <?php echo json_encode($ids_array); ?>;

        if(user == 'customer') {
            for(i = 0; i < ids_array.length; i++) {
                $('#customer_id_' + ids_array[i]).removeAttr('style');
            }
        } 
    }

    </script>