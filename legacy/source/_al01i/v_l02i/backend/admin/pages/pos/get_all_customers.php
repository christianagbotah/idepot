<?php
$all_customers = $this->db->get('customers');
if($all_customers->num_rows() > 0) { ?>
  <option value="">Search Customer...</option>
  <?php
  foreach($all_customers->result_array() as $cu) {
    ?>
    <option value="<?= $cu['customer_id'] ?>"><?= $cu['customer_name'] ?></option>
    <?php
  }
}
?>