 <?php

 //currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);


if($category == 'customer' && $debtor_id != '0') {
    $this->db->where('customer_id', $debtor_id);

    if($from != 0 && $to != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->select('customer_id');
    $this->db->distinct();
    $this->db->where('amount_due >', 0);

    $customer_id_query = $this->db->get('invoice');

    if ($customer_id_query->num_rows() > 0) {
        $customer_id_array = $customer_id_query->result_array();

        $customer_ids = array();
        $amount_payable = 0;
        $amount_receivable = 0;

        foreach ($customer_id_array as $id) {
            array_push($customer_ids, $id['customer_id']);
        }

    }
        

} else {

    if($from != 0 && $to != 0) {
        $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->select('customer_id');
    $this->db->distinct();
    $this->db->where('amount_due >', 0);
    $customer_id_query = $this->db->get('invoice');

    if ($customer_id_query->num_rows() > 0) {
        $customer_id_array = $customer_id_query->result_array();

        $customer_ids = array();
        $amount_payable = 0;
        $amount_receivable = 0;

        foreach ($customer_id_array as $id) {
            array_push($customer_ids, $id['customer_id']);
        }

    }
}



//suppliers

if($category == 'supplier' && $debtor_id != '0') {
    $this->db->where('supplier_id', $debtor_id);

    if($from != 0 && $to != 0) {
        $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->select('supplier_id');
    $this->db->distinct();
    $this->db->where('amount_due <', 0);
    $suppliers_array = $this->db->get('accounts_payable')->result_array();

} else {
    if($from != 0 && $to != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->select('supplier_id');
    $this->db->distinct();
    $this->db->where('amount_due <', 0);
    $suppliers_array = $this->db->get('accounts_payable')->result_array();
}




$ids_array = array();
$ids_array_debt = array();
$ids_array_sup = array();

$receivable_counter = 0;
$grand_total = 0;
$actual_payable = 0;
?>
    <hr>
    <div class="row">
        <table class="table" width="100%" id="debtors_list">
            <thead class="bg-info">
              <tr>
                <th>Debtors</th>
                <th>Address</th>
                <th style="text-align: right">Amount</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
                <?php

//for customers 
for ($i = 0; $i < count($customer_ids); $i++) {

    $this->db->select_sum('amount_due');
    $this->db->where('amount_due >', 0);
    if($from != 0 && $to != 0) {
        $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->where('customer_id', $customer_ids[$i]);
    $total_amount = $this->db->get('invoice')->row()->amount_due;

    //so_code
    $this->db->where('amount_due >', 0);
    if($from != 0 && $to != 0) {
        $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->where('customer_id', $customer_ids[$i]);
    $so_code = $this->db->get('invoice')->row()->so_code;


   // if ($amount_payable > $amount_receivable) {
        //$actual_payable = $amount_payable - $amount_receivable;

        ?>
        <tr ondblclick="deselect_all('customer')" onclick="populate_links('<?=$customer_ids[$i]?>', 'customer', '<?=$so_code; ?>')" id="customer_id_<?=$customer_ids[$i];?>">
        <td><?=$this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->customer_name;?></td>
        <td><?=$this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->address;?></td>
        <td align="right"><strong><?=numfmt_format_currency($fmt, $total_amount, $currency);?></strong></td>
        <td><?=$this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->mobile;if (!empty($this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->phone)) {
        echo ' | ' . $this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->phone;
        }
        ?></td>
        </tr>
        <?php
        array_push($ids_array, $customer_ids[$i]);

        $receivable_counter++;
        $grand_total += $total_amount;
        $total_amount = 0;
    //}

}

//for other outanding debts like loan, TNT etc
if($category == 'debt' && $debtor_id != '0') {
    $this->db->where('debt_id', $debtor_id);

    if($from != 0 && $to != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $debt_query = $this->db->get_where('outstanding_debts', array('amount_due <' => 0));
} else {
    if($from != 0 && $to != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $debt_query = $this->db->get_where('outstanding_debts', array('amount_due <' => 0));
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


    <script type="text/javascript">
    $(function() {
        $('#debtors_list').DataTable();

    });

       function populate_links(id, user, so_code) {
        //alert(so_code);
        //show the payment button
        //$('#payment_holder').slideUp('slow');
        $('#payment_holder').slideDown('slow');
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all ids
        let ids_array = <?php echo json_encode($ids_array); ?>;
        let ids_array_debt = <?php echo json_encode($ids_array_debt); ?>;
        let ids_array_sup = <?php echo json_encode($ids_array_sup); ?>;

        if(user == 'customer') {
            $('#cuedit').attr('disabled', 'disabled');
            if(so_code != undefined) {
                    for(i = 0; i < ids_array.length; i++) {

                //check which table row is clicked
                if(id == ids_array[i]) {

                    //change the background of the row
                    $('#customer_id_' + id).removeAttr('class');
                    $('#customer_id_' + id).css({
                        background: '#1cc88a',
                        color: '#ffffff'
                    });

                    $('#cupayment').attr("onclick", "showAjaxModal_payments('<?php echo site_url('modal/popup_sales/payments/'); ?>" + id + '/' + so_code + "', 'Take Payment')");

                    } else {
                        for(j = 0; j < ids_array.length; j++) {
                            if(ids_array[j] != id) {
                                $('#customer_id_' + ids_array[j]).removeAttr('style');

                            }
                        }
                    }
                }

                //remove background for suppliers
                for(j = 0; j < ids_array_sup.length; j++) {
                    $('#supplier_id_' + ids_array_sup[j]).removeAttr('style');
                }

                //remove background for customers with negative bal
                for(n = 0; n < ids_array.length; n++) {
                    $('#customer_id_n_' + ids_array[n]).removeAttr('style');
                }

                //remove background for debt
                for(d = 0; d < ids_array_debt.length; d++) {
                    $('#debt_id_' + ids_array_debt[d]).removeAttr('style');
                }


            } else {
                //customer with negative balance selected
               for(i = 0; i < ids_array.length; i++) {

                //check which table row is clicked
                if(id == ids_array[i]) {

                    //change the background of the row
                    $('#customer_id_n_' + id).removeAttr('class');
                    $('#customer_id_n_' + id).css({
                        background: '#1cc88a',
                        color: '#ffffff'
                    });

                    $('#cupayment').attr("onclick", "showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/payments/'); ?>cr_" + id + "_" + so_code + "', 'Payments And Purchases')");

                    } else {
                        for(j = 0; j < ids_array.length; j++) {
                            if(ids_array[j] != id) {
                                $('#customer_id_n_' + ids_array[j]).removeAttr('style');

                            }
                        }
                    }
                }

                //remove background for suppliers
                for(j = 0; j < ids_array_sup.length; j++) {
                    $('#supplier_id_' + ids_array_sup[j]).removeAttr('style');
                }

                //remove background for customers
                for(n = 0; n < ids_array.length; n++) {
                    $('#customer_id_' + ids_array[n]).removeAttr('style');
                }

                //remove background for debt
                for(d = 0; d < ids_array_debt.length; d++) {
                    $('#debt_id_' + ids_array_debt[d]).removeAttr('style');
                }

            }

        } else if(user == 'supplier') {
            $('#cuedit').attr('disabled', 'disabled');
            for(i = 0; i < ids_array_sup.length; i++) {

            //check which table row is clicked
            if(id == ids_array_sup[i]) {

                //change the background of the row
                $('#supplier_id_' + id).removeAttr('class');
                $('#supplier_id_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                $('#cupayment').attr("onclick", "showAjaxModal_payments('<?php echo site_url('modal/popup_sales/payments/'); ?>su_" + id + "', 'Take Payment')");

                } else {
                    for(j = 0; j < ids_array_sup.length; j++) {
                        if(ids_array_sup[j] != id) {
                            $('#supplier_id_' + ids_array_sup[j]).removeAttr('style');

                        }
                    }
/**
                    for(j = 0; j < ids_array.length; j++) {
                        $('#customer_id_' + ids_array[j]).removeAttr('style');

                    } **/
                }
            }

            //remove background for customers
            for(j = 0; j < ids_array.length; j++) {
                $('#customer_id_' + ids_array[j]).removeAttr('style');

            }

            //remove background for customers with negative bal
            for(n = 0; n < ids_array.length; n++) {
                $('#customer_id_n_' + ids_array[n]).removeAttr('style');
            }

            //remove background for debt
            for(d = 0; d < ids_array_debt.length; d++) {
                $('#debt_id_' + ids_array_debt[d]).removeAttr('style');
            }

        } else if(user == 'debt') {
            $('#cuedit').removeAttr('disabled');
            //debt selected
            for(i = 0; i < ids_array_debt.length; i++) {

            //check which table row is clicked
            if(id == ids_array_debt[i]) {

                //change the background of the row
                $('#debt_id_' + id).removeAttr('class');
                $('#debt_id_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                $('#cupayment').attr("onclick", "showAjaxModal_payments('<?php echo site_url('modal/popup_sales/payments/'); ?>" + id + "', 'Take Payment')");

                $('#cuedit').attr("onclick", "showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/edit_enter_payable/'); ?>" + id + "', 'Edit Payable'), $('.close').click()");

                } else {
                    for(j = 0; j < ids_array_debt.length; j++) {
                        if(ids_array_debt[j] != id) {
                            $('#debt_id_' + ids_array_debt[j]).removeAttr('style');

                        }
                    }

                 /**   for(j = 0; j < ids_array.length; j++) {
                        $('#customer_id_' + ids_array[j]).removeAttr('style');

                    }**/
                }
            }

            //remove background for customers
            for(j = 0; j < ids_array.length; j++) {
                $('#customer_id_' + ids_array[j]).removeAttr('style');

            }

            //remove background for customers with negative bal
            for(n = 0; n < ids_array.length; n++) {
                $('#customer_id_n_' + ids_array[n]).removeAttr('style');
            }

            //remove background for supplier
            for(s = 0; s < ids_array_sup.length; s++) {
                $('#supplier_id_' + ids_array_sup[s]).removeAttr('style');
            }
        }
    }

    $('#cupayment').click(function(event) {
        /* Act on the event */
        toBack();
    });
    function toBack() {
        $('.close').click();
    }

    function deselect_all(user) {
        //hide payment button
        $('#payment_holder').slideUp('slow');
        //call the buttons disabled function immediately
        buttons_disabled();
        let ids_array = <?php echo json_encode($ids_array); ?>;
        let ids_array_debt = <?php echo json_encode($ids_array_debt); ?>;
        let ids_array_sup = <?php echo json_encode($ids_array_sup); ?>;

        if(user == 'customer') {
            for(i = 0; i < ids_array.length; i++) {
                $('#customer_id_' + ids_array[i]).removeAttr('style');
            }
        } else if(user == 'supplier') {
            for(i = 0; i < ids_array_sup.length; i++) {
                $('#supplier_id_' + ids_array_sup[i]).removeAttr('style');
            }
        } else if(user == 'debt') {
            for(i = 0; i < ids_array_debt.length; i++) {
                $('#debt_id_' + ids_array_debt[i]).removeAttr('style');
            }
        } else if(user == 'customer_n') {
            for(i = 0; i < ids_array.length; i++) {
                $('#customer_id_n_' + ids_array[i]).removeAttr('style');
            }
        }
    }

    </script>