 <style type="text/css">
    #payables_taken_list_processing {
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



$this->db->select('customer_id');
$this->db->distinct();
if($from != 0 && $to != 0) {
    $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
}
if($creditor_id != 0) {
    $this->db->where('customer_id', $creditor_id);
}
$customers_ids_array = $this->db->get_where('payment_with_goods', array('quantity_picked >' => '0', 'type_of_sales' => 'Payables'))->result_array();

?>
    <hr>
    <div class="row">
        <table class="table" width="100%" id="payables_taken_list">
            <thead class="bg-info">
              <tr>
                <th width="150">NAME</th>
                <th style="text-align: center">ITEMS PICKING DETAILS</th>
                <th style="text-align: right" width="150">AMOUNT</th>  
              </tr>
            </thead>
            <tbody>
                <?php



            ///////////////////////////////////////////////

            $grand_total = 0;
            $grandQuantity = 0;
            $items_ids = [];

            if(count($customers_ids_array) > 0):
                foreach ($customers_ids_array as $customer) {

                    $item_quantity = 0;//each customer total

                    //customer info
                    $customer_info = $this->db->get_where('customers', ['customer_id' => $customer['customer_id']])->row();
                    $customer_name = $customer_info->customer_name;
                    $customer_mobile = $customer_info->mobile;
                    $customer_phone = $customer_info->phone;

                    //query
                    $this->db->select('so_code');
                    $this->db->distinct();
                    if($from != 0 && $to != 0) {
                        $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                    }
                    $this->db->where('type_of_sales', 'Payables');
                    $quantity_picked_codes = $this->db->get_where('payment_with_goods', array('customer_id' => $customer['customer_id'], 'quantity_picked >' => '0'))->result_array();


                    


                    ?>
                    <tr id="customer_row_<?=$customer['customer_id']?>">
                        <td align="center"><strong><?=$customer_name;?></strong><br>[MOBILE#: <?=$customer_mobile == '' ? $customer_phone : '';?>]</td>

                        <td align="center">
                            <table style="font-size: 12px; max-width: 80%">
                                <tbody>
                                    <tr>
                                        <th>Date</th>
                                        <th>Item Picked</th>
                                        <th style="text-align: right">Q' Bought</th>
                                        <th style="text-align: right">Q' Picked</th>
                                        <th style="text-align: right">Price</th>
                                        <th style="text-align: right">Amount</th>
                                    </tr>
                                    <tr>
                                        <th>
                                            
                                            <?php

                                            $validCodesCounter = 0; //this let us know if the customer has a valid code
                                            $gandSo_total = 0; // sum of all codes for each customer
                                            foreach($quantity_picked_codes as $so) {

                                                //we check if this order was bought before the selected time frame

                                                if(substr($so['so_code'], -1) != 'R') { //if the last digit of the code is not ending with R

                                                    $codeAccepted = $this->db->get_where('sales_order', ['so_code' => $so['so_code'], 'date_timestamp <' => strtotime($from)])->num_rows();

                                                    if($codeAccepted < 1) {
                                                        continue; //move on to the next code
                                                    }
                                                }
                                                

                                                $validCodesCounter++;

                                                $so_total = 0; //each code total

                                                if($from != 0 && $to != 0) {
                                                    $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                                }
                                                $this->db->where('so_code', $so['so_code']);
                                                $this->db->where('type_of_sales', 'Payables');
                                                $quantity_picked_query = $this->db->get_where('payment_with_goods', array('customer_id' => $customer['customer_id'], 'quantity_picked >' => '0'));

                                                $quantity_picked_array = $quantity_picked_query->result_array();

                                                $orderFirstDateQuery = $this->db->get_where('sales_order', ['so_code' => $so['so_code']])->row();
                                                $orderFirstDate = $orderFirstDateQuery->date;
                                                $orderDiscount = $orderFirstDateQuery->discount;


                                                ?>
                                                <tr>
                                                    <th colspan="6">ORDER#: <?=$so['so_code'].' :<span class="text-muted">'.$orderFirstDate;?></span></th>
                                                </tr>
                                                <?php
                                                //items
                                                $i = 0;
         
                                                foreach($quantity_picked_array as $item){

                                                    

                                                    $date = date('d-m-Y H:i:s', $item['timestamp']);
                                                     
                                                    $item_name = $this->db->get_where('items', ['item_id' => $item['item_id']])->row()->item_name;
                                                    $qBought = $item['quantity'];
                                                    $qPicked = $item['quantity_picked'];
                                                    $uPrice = $item['price'];
                                                    $amount = $uPrice * $qPicked;

                                                    $item_quantity += $qPicked;

                                                    array_push($items_ids, $item['item_id']);

                                        
                                                    ?>
                                                    <tr>
                                                        <td align="left"><?=$date;?></td>
                                                        <td align="left"><?=$item_name;?></td>
                                                        <td align="right"><?=number_format($qBought, 0, '.', ',');?></td>
                                                        <td align="right"><?=number_format($qPicked, 0, '.', ',');?></td>
                                                        <td align="right"><?=number_format($uPrice, 2, '.', ',');?></td>
                                                        <td align="right"><?=number_format($amount, 2, '.', ',');?></td>
                                                    </tr>

                                                <?php
                                                $i++;
                                                $so_total += $amount;
                                                }
                                               
                                                
                                                ?>
                                                <tr>
                                                    
                                                    <td colspan="4" align="right"><strong><?=number_format($item_quantity, 0, '.', ',');?></strong></td>

                                                    <td colspan="3" align="right"><strong><?=number_format($so_total, 2, '.', ',');?></strong></td>
                                                </tr>
                                                <tr>
                                                    
                                                    <td colspan="4" align="right">Discount</td>

                                                    <td colspan="3" align="right">(<?=number_format($orderDiscount, 2, '.', ',');?>)</td>
                                                </tr>

                                                <tr>
                                                    
                                                    <td colspan="4" align="right"><strong class="text-gray-500 mute">Net Payable</strong></td>

                                                    <td colspan="3" align="right"><strong><?=number_format($so_total - $orderDiscount, 2, '.', ',');?></strong></td>
                                                </tr>

                                                
                                                <?php

                                                $gandSo_total += ($so_total - $orderDiscount);
                                            } //each code

                                            if($validCodesCounter < 1) {

                                                //this customer does not have a valid code, so we delete the row
                                                ?>
                                                <script type="text/javascript">
                                                    $(function(e) {
                                                        $('#customer_row_<?=$customer['customer_id']?>').remove();
                                                    });
                                                </script>
                                                <?php
                                            }
                                        ?>

                                        </th>
                                    </tr>
                                    </tbody>
                                
                                </table>
                            
                        </td>
                    </tr>

                    <?php
                         if($validCodesCounter < 1) {

                            //this customer does not have a valid code, so we delete the row
                            ?>
                            <script type="text/javascript">
                                $(function(e) {
                                    $('#customer_row_<?=$customer['customer_id']?>').remove();
                                });
                            </script>
                            <?php
                        }

                        if($gandSo_total > 0):
                            //we show this row only if we have a value greater than 0
                    ?>
                    <tr>
                                                
                        <td colspan="4" align="right"><strong><?=number_format($gandSo_total, 2, '.', ',');?></strong></td>
                    </tr>
                <?php 
                     endif;
                     
                $grand_total += $gandSo_total;
                $grandQuantity += $item_quantity;

                } //each customer ?>
                <tr>
                    <td>
                        <strong>TOTAL AMOUNT:</strong>
                    </td>
                    <td align="center">
                        <table style="font-size: 12px; max-width: 80%">
                            <tbody>
                                <tr>
                                    <td align="right">
                                        <strong style="margin-right: 30px"><?=number_format($grandQuantity, 0, '.', ',');?></strong>
                                    </td>
                                    <td colspan="3"></td>
                                </tr>
                            </tbody>
                        </table>
                       
                    </td>
                    <td align="right">
                       <strong><?=numfmt_format_currency($fmt, $grand_total, $currency);?></strong>
                    </td>
                </tr>
                
                <?php
                else:
                    echo '<tr><td align="center" colspan="4"><strong>No Record Found!</strong></td></tr>';
                endif;
                ?>
                </tbody>
                
        </table>
    </div>

   

     <br>


    <script type="text/javascript">
    $(function() {
        $('#payables_taken_list').DataTable();

    });


    </script>