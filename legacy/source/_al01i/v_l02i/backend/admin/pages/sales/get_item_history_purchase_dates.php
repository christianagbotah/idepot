<?php

	//select the purchase dates
  $this->db->select('date_timestamp');
  $this->db->from('purchase_order');
  $this->db->distinct();
  $this->db->order_by('date_timestamp', 'asc');
  $this->db->where('item_id', $item_id);
  $item_purchase_dates_array = $this->db->get()->result_array();


  foreach($item_purchase_dates_array as $date):?>
      <option value="<?=date('d-m-Y', $date['date_timestamp']);?>"><?=date('d-m-Y', $date['date_timestamp']);?></option>
  <?php
  endforeach;
 ?>