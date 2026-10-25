<?php
$this->db->select('items.category_id');
$this->db->distinct();

if ($searchValue != '') {
	$this->db->like('category_name', $searchValue);
	$this->db->or_like('item_name', $searchValue);
	$this->db->join('item_category', 'item_category.category_id = items.category_id');
}

$this->db->order_by('items.category_id', 'ASC');
$category_array = $this->db->get('items')->result_array();

//in case we find no match with the category, let's make a query of all the categories
if ($searchValue != '' && count($category_array) < 1) {

	$this->db->select('items.category_id');
	$this->db->distinct();
	$this->db->order_by('items.category_id', 'ASC');
	$category_array = $this->db->get('items')->result_array();
}

if(count($category_array) < 1) {
	echo '<div class="w-full text-center text-red-500 font-bold">No Item Found!</div>';
	return;
}

foreach ($category_array as $cat):

	$itemsHaveStockCount = 0;
	$category_name = $this->db->get_where('item_category', array('category_id' => $cat['category_id']))->row()->category_name;

	if ($searchValue != '') {
		$this->db->like('item_name', $searchValue);
		$this->db->or_like('category_name', $searchValue);
		$this->db->join('item_category', 'item_category.category_id = items.category_id');
	}
	$items_query = $this->db->get_where('items', array('items.category_id' => $cat['category_id']));

	if ($items_query->num_rows() < 1) {
		//no item for this category so don't show anything. move on to the next category

		continue;

	} else if ($items_query->num_rows() > 0) {

		$items_array = $items_query->result_array();

		?>
					<div id="category_<?=$cat['category_id'];?>" class="category flex w-full mb-3 bg-gray-300"><strong><?=$category_name?></strong></div>

					<div class="grid grid-cols-3 gap-4 lg:gap-2 invoice_items">

					  <?php
		// $tr = '</tr>';
		//$position_counter = 0;
		//$n_columns = 4;

		foreach ($items_array as $item):

			$item_quantity = $item['quantity'];
			$unit_name = '';

			if ($item['quantity'] < 1 && $item['unit_quantity'] < 1) {
				//if quantity is 0, move on to the next item
				//continue;
			}

			$itemsHaveStockCount++; //counting items under this category with stock value not zero

			if ($item['quantity'] < 1 && $item['unit_quantity'] > 0) {
				$item_quantity = $item['unit_quantity'];
				$unit_name = $this->crud_model->getUnitNameByItemId($item['item_id']);
				$unit_name = explode(" ", $unit_name)[0];
			}

			?>
				    	<div class="w-48 max-w-48 shadow-md bg-gray-200  rounded-md hover:shadow-xl border ring-2 ring-gray-50 hover:ring-green-500 overflow-hidden" onclick="confirm_selection(<?=$item['item_id']?>); getPackage('0')">
				        <figure title="<?=$item['item_name'];?>" class="flex shadow-md h-full hover:shadow-2xl hover:border-b-4  hover:border-b-green-500">
				          <img src="<?php echo $this->crud_model->get_image_url('item', $item['item_id']); ?>" width="65" height="85" class="item_images" style="min-height: 85px; max-height: 85px" />
				          <figcaption class="flex flex-col rounded-b-md p-3 cursor-help justify-center h-full max-h-full" style="width: 55px !important;">
							<div class="bg-gray-700 w-36 hover:bg-green-700 text-gray-100 text-lg font-medium p-2 mt-1 self-center" style="margin-left: -30px !important;"><?=$item['item_name'];?></div>
							<div class="self-center mt-1 items-center text-gray-950">
								<?=$item_quantity > 1000 ? number_format($item_quantity, '0', '.', ',') : $item_quantity;?> <?=$unit_name;?>
							</div>
							
							</figcaption>
				        </figure>
				      </div>
				  <?php

			//$position_counter++;
			//continue on a new row if the first row data  add up to 3
			//if($position_counter == $n_columns ) {

			//echo $tr; //close the row
			//echo '<tr>'; //open new row

			//$position_counter = 0; //reset it to 0
			//}
		endforeach; //for each item

		if($itemsHaveStockCount < 1) {
			//no item found under this cat, so we remove the cat name
			echo '<script type="text/javascript">
				$(function(e) {
					$("#category_'.$cat['category_id'].'").remove();
				})
			</script>';
		}
	} //end of if statement for item found or not

	echo '</div>';
endforeach; //for each category

?>
