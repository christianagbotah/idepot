<?php
$suppliers_add = $this->db->get('suppliers');
$suppliers_array_add = $suppliers_add->result_array();

//those customers with negative balance
$this->db->select('customer_id');
$this->db->distinct();
$this->db->where('amount_due <', 0);
$customers = $this->db->get('invoice');
$customers_array = $customers->result_array();

//customers who still have some goods with us, yet have paid for all
$this->db->select('customer_id');
$this->db->distinct();
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
    $quantity_owe_array = $this->db->get_where('sales_order', array('customer_id' => $customer_ids[$i], 'quantity_due >' => 0))->result_array();

    foreach ($quantity_owe_array as $owe) {
        $amount_payable += $owe['price'] * $owe['quantity_due'];
        $amount_receivable = $owe['grand_total'] - $owe['amount_paid'];
    }

    if ($amount_payable > $amount_receivable) {
        /**$payable_counter++;
        $grand_total_p += $amount_payable;
        $amount_payable = 0; //reset
        **/
    }

}

?>

<select required="true" class="form-control " onchange="populate_edit_button($(this).val())" name="supplier_name" id="pay_to"><option value="">Select Supplier|Creditor</option><optgroup label="Suppliers">

  <?php foreach ($suppliers_array_add as $srow): ?>
    <option value="<?=$srow['supplier_id'];?>"><?=$srow['supplier_name'];?></option>

  <?php endforeach;?>

  </optgroup>
    <optgroup label="Oustandings">
        <?php 
                        //for other outanding debts like loan, TNT etc
                        $debt_query = $this->db->get_where('outstanding_debts', array('amount_due >' => 0));
                        if($debt_query->num_rows() > 0) {
                            $debt_array = $debt_query->result_array();

                            foreach($debt_array as $debt):
                                    ?>
                    <option value="de_<?=$debt['debt_id'] ?>"><?=$debt['name']; ?></option><?php endforeach; 
                    }
                 ?>
                </optgroup><optgroup label="Other Creditors"><?php foreach ($customers_array as $cus): ?><option value="ce_<?=$cus['customer_id'];?>"><?=$this->db->get_where('customers', array('customer_id' => $cus['customer_id']))->row()->customer_name;?></option><?php endforeach; //for those customers who have not taken all their products

          for ($i = 0; $i < count($customer_ids); $i++) {
            $quantity_owe_array = $this->db->get_where('sales_order', array('customer_id' => $customer_ids[$i], 'quantity_due >' => 0))->result_array();
            
            $c_name_query = $this->db->get_where('customers', array('customer_id' => '$customer_ids[$i]'));
           

          foreach ($quantity_owe_array as $owe) {
            $amount_payable += $owe['price'] * $owe['quantity_due'];
            $amount_receivable = $owe['grand_total'] - $owe['amount_paid']; 
          }

        //if ($amount_payable > $amount_receivable) {
            /**$payable_counter++;
            $grand_total_p += $amount_payable;
            $amount_payable = 0; //reset
            **/
            if($c_name_query->num_rows() > 0) {
              $c_name = $c_name_query->row()->customer_name;
            
            ?>
            <option value="cr_<?=$customer_ids[$i].'_'.$owe['so_code'];?>"><?=$c_name;?></option><?php
            }
        //}

      } ?></optgroup>

  </select>
