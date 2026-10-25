<?php
	
	$item_image = $this->crud_model->get_image_url('item', $item_id);
	$item_row = $this->db->get_where('items', array('item_id' => $item_id))->row();
		$isSoldInUnit = $item_row->item_sold_in_units;
		if($isSoldInUnit == '1') {
			//item is sold in unit
			echo '<center><figure><img src="' . $item_image . '" width="400" height="350" class="item_selected_images">

            <figcaption style="background-color: #000; font-size: 18px; color: #fff; text-align: center; width: 300px"><strong>' . $item_row->item_name . '</strong> (<strong>' . number_format($item_row->quantity, '0', '.', ',') . '</strong>)</figcaption></figure></center>';

		} else {

			echo '<center><figure><img src="' . $item_image  . '" width="300" height="350" class="item_selected_images">

            <figcaption style="background-color: #000; font-size: 18px; color: #fff; text-align: center; width: 300px"><strong>' . $item_row->item_name . '</strong><br>(<strong>' . number_format($item_row->quantity, '0', '.', ',') . '</strong>)</figcaption></figure></center>';
		}
?>