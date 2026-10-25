 <style type="text/css">
    #customers_list_processing {
        position: absolute;
        top: 100px;
        margin-left: -120px;
        width: 250px;
        background-color: red;
        font-weight: bold;
        color: #ffffff;
    }
    
</style>

 <?php

 //currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

/*$this->db->select_min('date_timestamp');
$min_date = date('d-m-Y', $this->db->get('payment_with_goods')->row()->date_timestamp);

$this->db->select_max('date_timestamp');
$max_date = date('d-m-Y', $this->db->get('payment_with_goods')->row()->date_timestamp);

if($from == 0 && $to == 0) {
    $from = $min_date;
    $to = $max_date;
}*/

$customer_ids = array();
$amount_payable = 0;

if($category != 'debt'):
    if($category == 'customer_n') {
        $this->db->where('customer_id', $creditor_id);
        if($from != 0 && $to != 0) {
            $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
        }
     
        $this->db->select('customer_id');
        $this->db->distinct();
        $this->db->where('amount_due <', 0);
        $customers_array_n = $this->db->get('invoice')->result_array(); 

    } /*else {

        if($from != 0 && $to != 0) {
            $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
        }
        $this->db->select('customer_id');
        $this->db->distinct();
        $this->db->where('amount_due <', 0);
        $customers_array_n = $this->db->get('invoice')->result_array();
    }  */  




    //customers who still have some goods with us, yet have paid for all
     else if($category == 'customer') {
        $this->db->where('customer_id', $creditor_id);

        if($from != 0 && $to != 0) {
            $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
        }
 
        $this->db->select('customer_id');
        $this->db->distinct();
        $this->db->where('type_of_sales', 'Payables');
        $this->db->or_where('type_of_sales', 'Receivables');
        $customer_id_query = $this->db->get('sales_order');

        if ($customer_id_query->num_rows() > 0) {
            $customer_id_array = $customer_id_query->result_array();

            foreach ($customer_id_array as $id) {
                array_push($customer_ids, $id['customer_id']);
            }

        } //end of goods creditors qquery

    } else {

        //if all creditors option is selected
        
        //for those with goods
        $c_ids = [];
        if($from != 0 && $to != 0) {
            $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
        } 
        $this->db->select('customer_id');
        $this->db->distinct();
        $this->db->where('type_of_sales', 'Payables');
        $this->db->or_where('type_of_sales', 'Receivables');
        $customer_id_query = $this->db->get('sales_order');

        $customer_id_array = $customer_id_query->result_array();

        foreach ($customer_id_array as $id) {
            array_push($c_ids, $id['customer_id']);
        }

        //negative balance
        
        if($from != 0 && $to != 0) {
            $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
        }
        $this->db->select('customer_id');
        $this->db->distinct();
        $this->db->where('amount_due <', 0);
        $this->db->where_not_in($c_ids); //eliminate all the customers who have some products with us
        $customers_array_n = $this->db->get('invoice')->result_array();

        if ($customer_id_query->num_rows() > 0) {
            $customer_id_array = $customer_id_query->result_array();

            

            foreach ($customer_id_array as $id) {
                array_push($customer_ids, $id['customer_id']);
            }

        } //end of goods creditors qquery

        /*if($category != 'customer_n') {

            if($from != 0 && $to != 0) {
            $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
        }
            
            $this->db->select('customer_id');
            $this->db->distinct();
            $this->db->where('quantity_due >', 0);
            $customer_id_query = $this->db->get('payment_with_goods');

        }*/
        //end of checking if this is a single query wth negative balance


    }
endif;



    

    //suppliers

/*if($category == 'supplier' && $creditor_id != '0') {
    $this->db->where('supplier_id', $creditor_id);

    if($from != 0 && $to != 0) {
        if($from != 0 && $to != 0) {
            $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
        }
    }
    $this->db->select('supplier_id');
    $this->db->distinct();
    $this->db->where('amount_due <', 0);
    $suppliers_array = $this->db->get('accounts_payable')->result_array();

} else {
    if($from != 0 && $to != 0) {
    if($from != 0 && $to != 0) {
            $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
        }
    }
    $this->db->select('supplier_id');
    $this->db->distinct();
    $this->db->where('amount_due >', 0);
    $suppliers_array = $this->db->get('accounts_payable')->result_array();
}*/





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
                <th>Creditors</th>
                <th>Address</th>
                <th style="text-align: right">Goods Payable</th>
                <th style="text-align: right">Cash Payable</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
                <?php

//for those customers who have not taken all their products
$grand_total_due = 0;
///////////////////////////////////////////////
if($category != 'debt'):
for ($i = 0; $i < count($customer_ids); $i++) {

//////////////////////////////////////////////////////////////////////
/////////Check if this customer has any good left///////////////////
    ////////////////////////////////////////////////////////////
    
        /*$this->db->select('item_id');
        $this->db->distinct();
        if($from != 0 && $to != 0) {
            $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
        }
    
        $quantity_owe_array = $this->db->get_where('payment_with_goods', array('customer_id' => $customer_ids[$i]))->result_array();

        $pointCounter = 0;
        foreach($quantity_owe_array as $item) {

            if($from != 0 && $to != 0) {
                $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
            }
            $this->db->order_by('so_id', 'asc');
            $this->db->where('item_id', $item['item_id']);
            $cQuantity_due = $this->db->get_where('payment_with_goods', array('customer_id' => $customer_ids[$i]))->last_row()->quantity_due;

            if($cQuantity_due > 0) {
                $pointCounter++;
            }
        }

        if($pointCounter == 0) {
            continue; //escape this customer and move on to the next one
        }*/

 ///////////////////////////////////////////////////////////////////////       
        ?>
        <tr ondblclick="deselect_all('customer')" onclick="populate_links('<?=$customer_ids[$i]?>', 'customer', '')" id="customer_id_<?=$customer_ids[$i];?>">
        <td><?=$this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->customer_name;?></td>
        <td><?=$this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->address;?></td>

        <td align="right">
        <?php
        //show in terms of goods

            //selecting all the date_timestamp distinctly
            $timestamps = array();
            $total_q_due = 0;
            

                    //selecting all items distinctly
                    /*if($from != 0 && $to != 0) {
                        $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                    }
                    
                    $this->db->select('item_id');
                    $this->db->distinct();
                    $this->db->where('customer_id', $customer_ids[$i]);
                    $this->db->where('quantity_due >', 0);
                    $items_ids_found = $this->db->get('payment_with_goods')->result_array();*/


                   // foreach($items_ids_found as $it_ids) {

                    //selecting sales order code for each day

                    if($from != 0 && $to != 0) {
                        $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                    }
                    
                    $this->db->select('so_code');
                    $this->db->distinct();
                    /*$this->db->where('date_timestamp', $date_timestamp['date_timestamp']);*/
                    //$this->db->where('item_id', $it_ids['item_id']);
                    //$this->db->where('quantity_due >', 0);
                    $this->db->where('type_of_sales', 'Payables');
                    $this->db->where('customer_id', $customer_ids[$i]);
                    $so_code_array = $this->db->get('sales_order')->result_array();

                    $q_due = 0;
                    $so_counter = 0;
                    foreach($so_code_array as $so_code) {//each so code

                        //let's check if this is an old order that was picked on this date
                        /*$old_order_row = $this->db->get_where('sales_order', [
                            'so_code' => $so_code['so_code'],
                            'date_timestamp <' => strtotime($from),
                        ])->num_rows();

                        if($old_order_row > 0) {
                            //we don't need this record, so let's move on to another so code
                            continue; //
                        }*/

                        
                        //more filtering to get only those items with a balance

                        if($from != 0 && $to != 0) {
                            $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                        }
                        $this->db->where('so_code', $so_code['so_code']);
                        $this->db->where('customer_id', $customer_ids[$i]);
                        //$this->db->where('quantity_due >', '0');
                        $date_query = $this->db->get('payment_with_goods');

                        
                    

                        //each item
                        $this->db->select('item_id');
                        $this->db->distinct();
                        if($from != 0 && $to != 0) {
                            $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                        }
                        $this->db->where('so_code', $so_code['so_code']);
                        $this->db->where('customer_id', $customer_ids[$i]);
                        //$this->db->where('quantity_due >', '0');
                        $items_query = $this->db->get('payment_with_goods');

                        //test//////////////////////////
                        $sCounter = 0;
                        foreach($items_query->result_array() as $it):
                            if($from != 0 && $to != 0) {
                                $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                            }
                            
                            $this->db->where('item_id', $it['item_id']);
                            $this->db->where('so_code', $so_code['so_code']);
                            $last_row = $this->db->get('payment_with_goods')->last_row()->quantity_due;

                            if($last_row > 0) {
                                $sCounter++;
                            }

                        endforeach;///////////////////

                            if($sCounter > 0) {
                                echo '<p style="margin-bottom: -3px">'.$date_query->last_row()->date. ' - ORDER#:'.$so_code['so_code'].':'.$date_query->last_row()->total_quantity.'</p>';
                            }


                            ///////////////////////////////////////////////////////////////////////////////

                        foreach($items_query->result_array() as $soq):
                            

                            if($from != 0 && $to != 0) {
                                $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                            }
                            
                            $this->db->where('item_id', $soq['item_id']);
                            $this->db->where('so_code', $so_code['so_code']);
                            $this->db->where('customer_id', $customer_ids[$i]);
                            //$this->db->where('quantity_due >', '0');
                            $this->db->order_by('so_id', 'desc');
                            $this->db->limit(1);
                            $due_query = $this->db->get('payment_with_goods');

                            $q_due = $due_query->row()->quantity_due;
                            $item_quantity = $due_query->row()->quantity;

                            

                            //show now
                            if($q_due <= 0) { //jump over to the next
                                continue;
                            }

                            //price
                            $due_price1 = $due_query->row()->price;

                            //amount payable
                            $amt = $due_price1 * $q_due;
                            $amount_payable += $amt;//edited

                            $item_name = $this->db->get_where('items', array('item_id' => $soq['item_id']))->row()->item_name;
                       
                       echo '<strong style="text-align: right;">'.$item_name.'('.number_format($due_price1, 2, '.', ',').'): <span style="background: #ebe5e5; padding: 1px">'.number_format($q_due, 0, '.', ',').'/'.number_format($item_quantity, 0, '.', ',').'</span></strong><div style="margin-top: 10px"></div>'; //shows individual item's quantity due

                        $total_q_due += $q_due; //total due for all the items for the entire range of date selected
                      //  $q_due = 0; //reset this

                    endforeach;

                    $payable_counter++; //each so_code is a bill
                } //end of each so_code

                if($total_q_due > 0) {
                    $so_counter++; //we have a valid data
                }

         //   } //end of each item array

            //show now
            echo '<strong style="text-align: right"><hr><u>'.number_format($total_q_due, 0, '.', ',').'</u></strong><br>'; //shows individual item's quantity due

            
            
        ?>
        </td>

        <td align="right"><strong><?=numfmt_format_currency($fmt, $amount_payable, $currency);?></strong></td>
        <td><?=$this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->mobile;if (!empty($this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->phone)) {
        echo ' | ' . $this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->phone;
        }
        ?></td>
        </tr>
        <?php

            if($so_counter > 0) {
                //good to go
                $grand_total_due += $total_q_due;
                array_push($ids_array, $customer_ids[$i]);
                $grand_total += $amount_payable;
                $amount_payable = 0;

            } else {
                //delete this row
                echo '
                    <script>
                       
                            removeRow();
                        

                        function removeRow() {
                            $("#customer_id_'.$customer_ids[$i].'").remove();
                        }
                    </script>
                ';
                
            }
        

        
    //}
    } //end of each customer
endif;
////////////////////////////////////////////////////////////////////////////////

if($category != 'customer' && $category != 'customer_n'):
    //for other outanding debts like loan, TNT etc
    if($category == 'debt' && $creditor_id != '0') {
        $this->db->where('debt_id', $creditor_id);

     
        if($from != 0 && $to != 0) {
                $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
            }
        
        $debt_query = $this->db->get_where('outstanding_debts', array('amount_due >' => 0));
    } else {

        if($from != 0 && $to != 0) {
                $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
            }
        
        $debt_query = $this->db->get_where('outstanding_debts', array('amount_due >' => 0));
    }
     


    if($debt_query->num_rows() > 0) {
        $debt_array = $debt_query->result_array();

        foreach($debt_array as $debt):
            ?>
            <tr ondblclick="deselect_all('debt')" onclick="populate_links('<?=$debt['debt_id']?>', 'debt')" id="debt_id_<?=$debt['debt_id'];?>">
            <td><?=$debt['name'];?></td>
            <td></td>
            <td></td>
            <td align="right"><strong><?=numfmt_format_currency($fmt, $debt['amount_due'], $currency);?></strong></td>
            <td></td>
            </tr>
            <?php

            array_push($ids_array_debt, $debt['debt_id']);
            $payable_counter++;
            $grand_total += $debt['amount_due'];
        endforeach;
    }
endif;

//for those customers with negative balances
if($category != 'debt'):
    if(count($customers_array_n) > 0):
        foreach ($customers_array_n as $cus):

            $this->db->select_sum('amount_due');

            if($from != 0 && $to != 0) {
                $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
            }
            
            $this->db->where('customer_id', $cus['customer_id']);
            $this->db->where('amount_due <', 0);
            $cus_query = $this->db->get('invoice')->row();

        /////////////////////////////date
            if($from != 0 && $to != 0) {
                $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
            }
            
            $this->db->where('customer_id', $cus['customer_id']);
            $this->db->where('amount_due <', 0);
            $date_query = $this->db->get('invoice')->row();

        ////////////////////////////////
            $cus_amount = abs($cus_query->amount_due);
            $cus_date =   date('d-m-Y', $date_query->timestamp);

            $customer_name = $this->db->get_where('customers', array('customer_id' => $cus['customer_id']))->row()->customer_name;
            $customer_address = $this->db->get_where('customers', array('customer_id' => $cus['customer_id']))->row()->address;
            $customer_mobile = $this->db->get_where('customers', array('customer_id' => $cus['customer_id']))->row()->mobile;
            $customer_phone = $this->db->get_where('customers', array('customer_id' => $cus['customer_id']))->row()->phone;

            ?>
              <tr ondblclick="deselect_all('customer_n')" onclick="populate_links('<?=$cus['customer_id']?>', 'customer')" id="customer_id_n_<?=$cus['customer_id'];?>">
                <td><?=$customer_name;?></td>
                <td><?=$customer_address;?></td>
                <td align="right">Date: <?=$cus_date;?></td>
                <td align="right"><strong><?=numfmt_format_currency($fmt, $cus_amount, $currency);?></strong></td>
                <td><?=$customer_mobile;if (!empty($customer_phone)) {
                echo ' | ' . $customer_phone;
            }
            ?></td>
                                                                      </tr>
                                                                      <?php
            array_push($ids_array, $cus['customer_id']);

            $payable_counter++;
            $grand_total += $cus_amount;
        endforeach;
    endif;
endif;

?>



            </tbody>
        </table>
    </div>

     <br>
    <hr>
    <div class="row">
            <div class="col-md-3 col-sm-3 text-lg-left"><strong><?php echo number_format($payable_counter, 0, '.', ',') . ' ';
echo ' ' . $payable_counter > 1 ? 'Bills' : 'Bill'; ?></strong></div>

            <div class="col-md-4 col-sm-4 text-lg-left"><strong>Total Quantity Due: <?=number_format($grand_total_due, 0, '.', ',');?> <?=$grand_total_due > 1 ? 'Items' : 'Item'; ?></strong></div>

            <div class="col-md-4 col-sm-4 text-lg-left"><strong>Total Amount: <?=numfmt_format_currency($fmt, $grand_total, $currency);?></strong></div>


    </div>


    <script type="text/javascript">
    $(function() {

        $.fn.dataTable.ext.errMode = 'throw';
        $('#customers_list').DataTable({
            //'processing': true,
            'serverSide': true
        });

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

                $('#cupayment').attr("onclick", "showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/payments/'); ?>" + id + "', 'Payments And Purchases')");

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