 <?php

 //currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);


//suppliers

if($category == 'supplier' && $creditor_id != '0') {
    $this->db->where('supplier_id', $creditor_id);

    if($from != 0 && $to != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->select('*');
    $this->db->where('amount_due >', 0);
    $suppliers_array = $this->db->get('accounts_payable')->result_array();
} else {
    if($from != 0 && $to != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
    }
    $this->db->select('*');
    //$this->db->distinct();
    $this->db->where('amount_due >', 0);
    $suppliers_array = $this->db->get('accounts_payable')->result_array();
}




$ids_array = array();
$ids_array_debt = array();
$ids_array_sup = array();

$payable_counter = 0;
$grand_total = 0;
$actual_payable = 0;
?>
    <hr>
    <div class="row">
        <table class="table" width="100%" id="customers_list">
            <thead class="bg-info">
              <tr>
                <th>Date | Time</th>
                <th>Supplier</th>
                <th>Address</th>
                <th>Contact</th>
                <th style="text-align: right">Accounts Payable</th>
              </tr>
            </thead>
            <tbody>

<!--for suppliers-->
<?php
foreach($suppliers_array as $sup):


    $total_amount = $sup['amount_due'];

    $supplier_name = $this->db->get_where('suppliers', array('supplier_id' => $sup['supplier_id']))->row()->supplier_name;
    $supplier_address = $this->db->get_where('suppliers', array('supplier_id' => $sup['supplier_id']))->row()->address;
    $supplier_mobile = $this->db->get_where('suppliers', array('supplier_id' => $sup['supplier_id']))->row()->mobile;
    $supplier_phone = $this->db->get_where('suppliers', array('supplier_id' => $sup['supplier_id']))->row()->phone;
?>
	  <tr ondblclick="deselect_all('supplier')" onclick="populate_links('<?=$sup['accounts_payable_id']?>', 'supplier')" id="accounts_payable_id_<?=$sup['accounts_payable_id'];?>">
        <td><?=date('d-m-Y H:i:s', $sup['creation_timestamp']);?></td>
	    <td><?=$supplier_name;?></td>
	    <td><?=$supplier_address;?></td>
        <td><?=$supplier_mobile;if (!empty($supplier_phone)) {
            echo ' | ' . $supplier_phone;
        }
        ?></td>
	    <td align="right"><strong><?=numfmt_format_currency($fmt, $total_amount, $currency);?></strong></td>
	    
	  </tr>
	  <?php
array_push($ids_array_sup, $sup['accounts_payable_id']);

$payable_counter++;
$grand_total += $total_amount;
$total_amount = 0;
endforeach;?>
            </tbody>
        </table>
    </div>

     <br>
    <hr>
    <div class="row">
            <div class="col-md-3 col-sm-3 text-lg-left"><strong><?php echo number_format($payable_counter, 0, '.', ',') . ' ';
echo ' ' . $payable_counter > 1 ? 'Bills' : 'Bill'; ?></strong></div>


            <div class="col-md-4 col-sm-4 text-lg-left"><strong>Total Amount: <?=numfmt_format_currency($fmt, $grand_total, $currency);?></strong></div>


    </div>


    <script type="text/javascript">
    $(function() {
        $('#customers_list').DataTable();

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

                    $('#cupayment').attr("onclick", "showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/payments/'); ?>cr_" + id + "_" + so_code + "', 'Payments And Purchases')");

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
                    $('#accounts_payable_id_' + ids_array_sup[j]).removeAttr('style');
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

                    $('#cupayment').attr("onclick", "showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/payments/'); ?>ce_" + id + "', 'Payments And Purchases')");

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
                    $('#accounts_payable_id_' + ids_array_sup[j]).removeAttr('style');
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
                $('#accounts_payable_id_' + id).removeAttr('class');
                $('#accounts_payable_id_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                $('#cupayment').attr("onclick", "showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/payments/'); ?>" + id + "', 'Payments And Purchases')");

                } else {
                    for(j = 0; j < ids_array_sup.length; j++) {
                        if(ids_array_sup[j] != id) {
                            $('#accounts_payable_id_' + ids_array_sup[j]).removeAttr('style');

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

                $('#cupayment').attr("onclick", "showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/payments/'); ?>" + id + "', 'Payments And Purchases')");

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
                $('#accounts_payable_id_' + ids_array_sup[s]).removeAttr('style');
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
                $('#accounts_payable_id_' + ids_array_sup[i]).removeAttr('style');
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